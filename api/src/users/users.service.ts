import { leadLabel } from '../crm/lead-label.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { recordActivity } from '../crm/lead-history.js';
import { LeadAssignmentService, ROTATIONS } from '../intake/lead-assignment.service.js';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { PermissionEffect, Prisma, type UserAuditAction } from '../generated/prisma/client.js';
import { SetPermissionOverridesDto } from './dto/set-permission-overrides.dto.js';
import { CreateUserDto, DeactivateUserDto, UpdateUserDto } from './dto/user.dto.js';
import { ATTACHED_DATA_COUNT, attachedData, LAST_ADMIN_MESSAGE, OPEN_LEAD_STATUSES, shareOutGap, wouldRemoveLastAdmin } from './user-removal.js';

type Tx = Prisma.TransactionClient;
type Actor = Pick<AuthenticatedUser, 'id' | 'fullName'>;

/** One lock for every change that could remove an admin, so two at once can't leave none. */
const ADMIN_LOCK = 771_204_001;

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  role: { select: { key: true, name: true } },
  _count: { select: { permissionOverrides: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: USER_SELECT });
    return users.map(({ _count, ...u }) => ({ ...u, customTagCount: _count.permissionOverrides }));
  }

  /** New user: their tags come entirely from the chosen role's preset. */
  async create(actor: Actor, dto: CreateUserDto) {
    const clash = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (clash) throw new ConflictException('A user with that email already exists');
    const role = await this.roleByKey(dto.roleKey);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        roleId: role.id,
        passwordHash: await bcrypt.hash(dto.password, 12),
      },
      select: { id: true },
    });
    await this.audit(this.prisma, actor, { id: user.id, fullName: dto.fullName, email: dto.email }, 'CREATED', `Created as ${role.name} by ${actor.fullName}`, { role: role.name });
    return this.findOneRow(user.id);
  }

  /**
   * Edit a user. Changing the role resets their tags to the new role's preset:
   * any custom grants/revokes are cleared, so the role alone describes them.
   * Switching someone off here only works when they hold no open leads (the
   * Deactivate flow hands those over first); the last active admin can't be
   * switched off or moved to another role.
   */
  async update(actor: Actor, userId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, isActive: true, role: { select: { key: true, name: true } } },
    });
    if (!existing) throw new NotFoundException('User not found');
    const roleChanging = dto.roleKey !== undefined && dto.roleKey !== existing.role.key;
    const deactivating = dto.isActive === false && existing.isActive;
    const reactivating = dto.isActive === true && !existing.isActive;
    if (actor.id === userId && (roleChanging || dto.isActive === false)) {
      throw new BadRequestException("You can't change your own role or deactivate yourself; ask another admin");
    }
    const role = roleChanging ? await this.roleByKey(dto.roleKey!) : null;
    if (deactivating) {
      const open = await this.openLeadCount(this.prisma, userId);
      if (open > 0) {
        throw new BadRequestException(
          `${existing.fullName} still has ${open} open lead${open === 1 ? '' : 's'}. Use Remove on the Users page to hand them to someone else first.`,
        );
      }
    }
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;

    await this.prisma.$transaction(async (tx) => {
      if ((roleChanging && existing.role.key === 'admin') || deactivating) await this.assertAdminRemains(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: {
          fullName: dto.fullName,
          phone: dto.phone === undefined ? undefined : dto.phone,
          isActive: dto.isActive,
          roleId: role?.id,
          passwordHash,
        },
      });
      if (role) {
        await tx.userPermission.deleteMany({ where: { userId } });
        await this.audit(tx, actor, existing, 'ROLE_CHANGED', `Role changed by ${actor.fullName}: ${existing.role.name} → ${role.name}`, { from: existing.role.name, to: role.name });
      }
      if (deactivating) await this.audit(tx, actor, existing, 'DEACTIVATED', `Deactivated by ${actor.fullName}`, { leadsReassigned: 0 });
      if (reactivating) await this.audit(tx, actor, existing, 'REACTIVATED', `Reactivated by ${actor.fullName}`);
    });
    return this.findOneRow(userId);
  }

  /**
   * What removing this user would involve, for the Remove dialog: their open
   * leads (which must be handed over before deactivating), every kind of
   * record attached to them (any at all means deactivate, never delete), who
   * can take the leads, and whether the last-admin rule blocks it.
   */
  async removalCheck(actor: Actor, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, isActive: true, role: { select: { key: true, name: true } }, _count: { select: ATTACHED_DATA_COUNT } },
    });
    if (!user) throw new NotFoundException('User not found');
    const [byStatus, otherAdmins, assignees, unqualified, rotations] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['status'], where: { assignedToId: userId, status: { in: OPEN_LEAD_STATUSES } }, orderBy: { status: 'asc' }, _count: { _all: true } }),
      this.otherActiveAdmins(this.prisma, userId),
      this.leadOwners(userId),
      this.prisma.lead.count({ where: { assignedToId: userId, status: { in: OPEN_LEAD_STATUSES }, qualifiedAt: null } }),
      this.rotations(userId),
    ]);
    const openLeadsByStatus = Object.fromEntries(byStatus.map((r) => [r.status, (r._count as { _all: number })._all]));
    const openLeads = Object.values(openLeadsByStatus).reduce((a, b) => a + b, 0);
    const data = attachedData(user._count as Record<string, number>);
    const lastAdmin = wouldRemoveLastAdmin({ isActive: user.isActive, roleKey: user.role.key }, otherAdmins);
    const isSelf = actor.id === userId;
    const qualified = openLeads - unqualified;
    const shareOut = {
      telecaller: { leads: unqualified, people: rotations.telecallers.map((m) => m.fullName) },
      sales: { leads: qualified, people: rotations.sales.map((m) => m.fullName) },
      // Why share-out can't be used (a rotation it needs has nobody switched on), or null.
      blocked: shareOutGap(unqualified, rotations.telecallers.length, qualified, rotations.sales.length),
    };
    return {
      user: { id: user.id, fullName: user.fullName, email: user.email, isActive: user.isActive, role: user.role },
      shareOut,
      isSelf,
      lastAdmin,
      openLeads,
      openLeadsByStatus,
      data,
      canDeactivate: user.isActive && !isSelf && !lastAdmin,
      canDelete: data.length === 0 && !isSelf && !lastAdmin,
      assignees,
    };
  }

  /**
   * Deactivate: they can't sign in (existing sessions stop on their next
   * request) and get no more round-robin leads; everything they did stays.
   * Open leads must go to someone first: pass `reassignToId` and they move in
   * the same step, each with a history entry and a notification. On an
   * already-inactive user this just hands over leads they still hold.
   */
  async deactivate(actor: Actor, userId: string, dto: DeactivateUserDto) {
    if (actor.id === userId) throw new BadRequestException("You can't deactivate yourself; ask another admin");
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, isActive: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (dto.shareOut && dto.reassignToId) throw new BadRequestException('Pick one person or share out by round-robin, not both');
    const target = dto.reassignToId ? await this.validLeadOwner(dto.reassignToId, userId) : null;
    const rotations = dto.shareOut ? await this.rotations(userId) : null;

    const moved = await this.prisma.$transaction(async (tx) => {
      if (user.isActive) await this.assertAdminRemains(tx, userId);
      const leads = await tx.lead.findMany({
        where: { assignedToId: userId, status: { in: OPEN_LEAD_STATUSES } },
        select: { id: true, name: true, phone: true, qualifiedAt: true },
      });
      if (leads.length > 0 && !target && !rotations) {
        throw new BadRequestException(
          `${user.fullName} has ${leads.length} open lead${leads.length === 1 ? '' : 's'}. Pick who should take ${leads.length === 1 ? 'it' : 'them'}, or share them out by round-robin, before deactivating.`,
        );
      }
      let summary = '';
      let shared: Record<string, number> | null = null;
      if (leads.length > 0 && target) {
        await this.handOver(tx, actor, user, leads.map((lead) => ({ lead, to: target })), target.fullName);
        summary = target.fullName;
      }
      if (leads.length > 0 && rotations) {
        const unqualified = leads.filter((l) => !l.qualifiedAt);
        const gap = shareOutGap(unqualified.length, rotations.telecallers.length, leads.length - unqualified.length, rotations.sales.length);
        if (gap) throw new BadRequestException(gap);
        const telecallerIds = rotations.telecallers.map((m) => m.id);
        const salesIds = rotations.sales.map((m) => m.id);
        const moves: { lead: (typeof leads)[number]; to: { id: string; fullName: string; telecaller: boolean } }[] = [];
        for (const lead of leads) {
          const telecallerTurn = !lead.qualifiedAt;
          const next = await this.assignment.pickNext(tx, telecallerTurn ? telecallerIds : salesIds);
          if (!next) throw new BadRequestException('Nobody in the round-robin could take a lead; pick one person instead.');
          moves.push({ lead, to: { ...next, telecaller: telecallerTurn } });
        }
        summary = 'the round-robin';
        shared = await this.handOver(tx, actor, user, moves, summary);
      }
      if (user.isActive) {
        await tx.user.update({ where: { id: userId }, data: { isActive: false } });
        await this.audit(
          tx,
          actor,
          user,
          'DEACTIVATED',
          `Deactivated by ${actor.fullName}${leads.length ? `; ${leads.length} open lead${leads.length === 1 ? '' : 's'} ${rotations ? 'shared out by round-robin' : `handed to ${summary}`}` : ''}`,
          { leadsReassigned: leads.length, to: target?.fullName ?? null, shareOut: Boolean(rotations) },
        );
      }
      return { count: leads.length, shared };
    });
    return { ...(await this.findOneRow(userId)), leadsReassigned: moved.count, reassignedTo: moved.count && target ? target : null, sharedOut: moved.shared };
  }

  /** Undo a deactivation: they can sign in again and rejoin any round-robin they're switched on for. */
  async reactivate(actor: Actor, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, email: true, isActive: true } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isActive) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { isActive: true } });
        await this.audit(tx, actor, user, 'REACTIVATED', `Reactivated by ${actor.fullName}`);
      });
    }
    return this.findOneRow(userId);
  }

  /**
   * Permanent delete, only for an account nothing points at (made by mistake,
   * never used). Anyone with leads, calls, visits, history, etc. can only be
   * deactivated, so the records about them still say who did what.
   */
  async remove(actor: Actor, userId: string) {
    if (actor.id === userId) throw new BadRequestException("You can't delete yourself; ask another admin");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertAdminRemains(tx, userId);
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, fullName: true, email: true, role: { select: { name: true } }, _count: { select: ATTACHED_DATA_COUNT } },
        });
        if (!user) throw new NotFoundException('User not found');
        const data = attachedData(user._count as Record<string, number>);
        if (data.length > 0) throw new ConflictException(this.hasDataMessage(user.fullName, data));
        await tx.user.delete({ where: { id: userId } });
        await this.audit(tx, actor, { id: null, fullName: user.fullName, email: user.email }, 'DELETED', `Deleted permanently by ${actor.fullName} (had no data)`, { role: user.role.name });
        return { id: userId, deleted: true };
      });
    } catch (err) {
      // A record we don't count still points at them: keep the account.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException('This user has records attached, so they can only be deactivated.');
      }
      throw err;
    }
  }

  /** A user's account history (created, role changes, deactivated, leads handed over…), newest first. */
  async history(userId: string) {
    return this.prisma.userAuditEvent.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, action: true, message: true, details: true, actorName: true, createdAt: true },
    });
  }

  /** Recent account changes across all users, including deleted ones (they keep their name as text). */
  async recentHistory() {
    return this.prisma.userAuditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, action: true, message: true, details: true, actorName: true, targetName: true, targetEmail: true, targetUserId: true, createdAt: true },
    });
  }

  // --- helpers ---------------------------------------------------------------

  private hasDataMessage(name: string, data: { label: string; count: number }[]) {
    const list = data.slice(0, 4).map((d) => `${d.count} ${d.label}`).join(', ');
    return `${name} can't be deleted because they have ${list}${data.length > 4 ? ' and more' : ''}. Deactivate them instead; their history stays.`;
  }

  /** Blocks the change if it would leave no active admin. Call inside the transaction. */
  private async assertAdminRemains(tx: Tx, userId: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${ADMIN_LOCK}::bigint)`;
    const target = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, role: { select: { key: true } } } });
    if (!target) throw new NotFoundException('User not found');
    if (wouldRemoveLastAdmin({ isActive: target.isActive, roleKey: target.role.key }, await this.otherActiveAdmins(tx, userId))) {
      throw new BadRequestException(LAST_ADMIN_MESSAGE);
    }
  }

  private otherActiveAdmins(db: Tx, userId: string) {
    return db.user.count({ where: { isActive: true, role: { key: 'admin' }, id: { not: userId } } });
  }

  private openLeadCount(db: Tx, userId: string) {
    return db.lead.count({ where: { assignedToId: userId, status: { in: OPEN_LEAD_STATUSES } } });
  }

  /** Active users (other than `exceptId`) who can hold leads: they have the leads.read tag. */
  private async leadOwners(exceptId: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, id: { not: exceptId } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, role: { select: { key: true, name: true } } },
    });
    const result: (typeof users[number] & { telecaller: boolean })[] = [];
    for (const u of users) {
      const { permissions } = await this.accessControl.getEffectiveAccess(u.id);
      if (permissions.includes(PERMISSIONS.LEADS_READ)) result.push({ ...u, telecaller: permissions.includes(PERMISSIONS.LEADS_AUTO_ASSIGN) });
    }
    return result;
  }

  private async validLeadOwner(id: string, leavingId: string) {
    if (id === leavingId) throw new BadRequestException('Pick someone other than the person being deactivated');
    const owner = (await this.leadOwners(leavingId)).find((u) => u.id === id);
    if (!owner) throw new BadRequestException('The new owner must be an active user who can work leads');
    return owner;
  }

  /**
   * Moves open leads to their new owners: one history entry and one
   * notification per lead, plus an account-history line. Returns how many
   * each person got, e.g. { Tara: 3, Kavya: 2 }.
   */
  private async handOver(
    tx: Tx,
    actor: Actor,
    from: { id: string; fullName: string; email: string },
    moves: { lead: { id: string; name: string | null; phone: string; qualifiedAt: Date | null }; to: { id: string; fullName: string; telecaller: boolean } }[],
    toWords: string,
  ) {
    const byOwner = new Map<string, { to: (typeof moves)[number]['to']; leads: (typeof moves)[number]['lead'][] }>();
    for (const m of moves) {
      const group = byOwner.get(m.to.id) ?? { to: m.to, leads: [] };
      group.leads.push(m.lead);
      byOwner.set(m.to.id, group);
    }
    for (const { to, leads } of byOwner.values()) {
      const ids = leads.map((l) => l.id);
      await tx.lead.updateMany({ where: { id: { in: ids } }, data: { assignedToId: to.id, autoAssigned: false } });
      // A telecaller now working leads that weren't handed to sales yet: count them on their scorecard.
      if (to.telecaller) {
        const unqualified = leads.filter((l) => !l.qualifiedAt).map((l) => l.id);
        if (unqualified.length) await tx.lead.updateMany({ where: { id: { in: unqualified } }, data: { telecallerId: to.id } });
      }
      for (const lead of leads) {
        await recordActivity(tx, {
          leadId: lead.id,
          userId: actor.id,
          type: 'ASSIGNED',
          summary: `Reassigned by ${actor.fullName} when ${from.fullName} was deactivated: ${from.fullName} → ${to.fullName}`,
          changes: [{ field: 'assignedTo', label: 'Assigned to', from: from.fullName, to: to.fullName }],
        });
      }
      if (to.id !== actor.id) {
        await tx.notification.createMany({
          data: leads.map((l) => ({
            userId: to.id,
            type: 'LEAD_ASSIGNED' as const,
            leadId: l.id,
            title: `New lead: ${leadLabel(l)}`,
            body: `Reassigned to you by ${actor.fullName} (was ${from.fullName})`,
          })),
        });
      }
    }
    const split = Object.fromEntries([...byOwner.values()].map((g) => [g.to.fullName, g.leads.length]));
    const n = moves.length;
    const who = byOwner.size > 1 ? `${toWords}: ${Object.entries(split).map(([name, c]) => `${name} ${c}`).join(', ')}` : [...byOwner.values()][0].to.fullName;
    await this.audit(tx, actor, from, 'LEADS_REASSIGNED', `${n} open lead${n === 1 ? '' : 's'} handed to ${who} by ${actor.fullName}`, { leads: n, split });
    return split;
  }

  /** Who is switched on in each round-robin now, leaving out `exceptId`. */
  private async rotations(exceptId: string) {
    const [telecallers, sales] = await Promise.all([this.assignment.members(ROTATIONS.telecallers), this.assignment.members(ROTATIONS.sales)]);
    const on = (list: typeof telecallers) => list.filter((m) => m.autoAssignEnabled && m.id !== exceptId);
    return { telecallers: on(telecallers), sales: on(sales) };
  }

  private async audit(
    db: Tx,
    actor: Actor,
    target: { id: string | null; fullName: string; email: string },
    action: UserAuditAction,
    message: string,
    details?: Record<string, unknown>,
  ) {
    await db.userAuditEvent.create({
      data: {
        targetUserId: target.id,
        targetName: target.fullName,
        targetEmail: target.email,
        actorId: actor.id,
        actorName: actor.fullName,
        action,
        message,
        details: details as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async findOneRow(id: string) {
    const { _count, ...u } = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: USER_SELECT });
    return { ...u, customTagCount: _count.permissionOverrides };
  }

  private async roleByKey(key: string) {
    const role = await this.prisma.role.findUnique({ where: { key }, select: { id: true, name: true } });
    if (!role) throw new BadRequestException(`Unknown role: ${key}`);
    return role;
  }

  async getPermissionSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: {
          select: {
            key: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
        permissionOverrides: {
          select: { effect: true, permission: { select: { key: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const overrides = (effect: PermissionEffect) =>
      user.permissionOverrides
        .filter((o) => o.effect === effect)
        .map((o) => o.permission.key)
        .sort();

    return {
      userId: user.id,
      email: user.email,
      role: user.role.key,
      rolePermissions: user.role.permissions.map((p) => p.permission.key).sort(),
      granted: overrides(PermissionEffect.GRANT),
      revoked: overrides(PermissionEffect.REVOKE),
      effective: await this.accessControl.getEffectiveAccess(user.id),
    };
  }

  /** Replaces all of a user's grant/revoke overrides in one go. */
  async setPermissionOverrides(
    actingUserId: string,
    userId: string,
    dto: SetPermissionOverridesDto,
  ) {
    if (actingUserId === userId) {
      throw new BadRequestException(
        'You cannot change your own permission tags; ask another admin',
      );
    }
    const overlap = dto.grant.filter((k) => dto.revoke.includes(k));
    if (overlap.length > 0) {
      throw new BadRequestException(
        `Tag(s) both granted and revoked: ${overlap.join(', ')}`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: { select: { key: true } } } });
    if (!user) throw new NotFoundException('User not found');
    // Taking user management away from the only admin would lock everyone out of Admin.
    const adminTags: string[] = [PERMISSIONS.USERS_MANAGE, PERMISSIONS.PERMISSIONS_ASSIGN];
    if (dto.revoke.some((k) => adminTags.includes(k)) && wouldRemoveLastAdmin({ isActive: user.isActive, roleKey: user.role.key }, await this.otherActiveAdmins(this.prisma, userId))) {
      throw new BadRequestException(LAST_ADMIN_MESSAGE);
    }

    const requestedKeys = [...dto.grant, ...dto.revoke];
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: requestedKeys } },
      select: { id: true, key: true },
    });
    const idByKey = new Map(permissions.map((p) => [p.key, p.id]));
    const unknown = requestedKeys.filter((k) => !idByKey.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown tag(s): ${unknown.join(', ')}`);
    }

    const rows = [
      ...dto.grant.map((key) => ({ key, effect: PermissionEffect.GRANT })),
      ...dto.revoke.map((key) => ({ key, effect: PermissionEffect.REVOKE })),
    ].map(({ key, effect }) => ({
      userId,
      permissionId: idByKey.get(key)!,
      effect,
    }));

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId } }),
      this.prisma.userPermission.createMany({ data: rows }),
    ]);

    return this.getPermissionSummary(userId);
  }
}
