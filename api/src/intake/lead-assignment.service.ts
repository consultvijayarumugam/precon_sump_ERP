import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service.js';
import { PERMISSIONS, type PermissionKey } from '../access-control/permission-catalog.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Any fixed number; serialises picks so two leads arriving together can't get the same telecaller. */
const ROTATION_LOCK_KEY = 71_830_001;

export interface Assignee {
  id: string;
  fullName: string;
}

/** The two rotations: telecallers get incoming leads, sales get the ones telecallers qualify. */
export const ROTATIONS = {
  telecallers: PERMISSIONS.LEADS_AUTO_ASSIGN,
  sales: PERMISSIONS.LEADS_RECEIVE_QUALIFIED,
} as const satisfies Record<string, PermissionKey>;

/**
 * Round-robin assignment of incoming leads (import, public API, Meta webhook),
 * and of qualified leads from telecallers to sales.
 *
 * The rotation is every active user who holds `leads.auto_assign` (the
 * telecaller preset) and whom the admin has left switched on. Each new lead
 * goes to the member who has waited longest since their last auto-assigned
 * lead, so with A, B and C it runs A, B, C, A, B, C... within one upload,
 * across uploads and API calls, and through the day. Someone newly added, or
 * switched back on after missing turns, has waited longest, so they're next.
 * The sales rotation works the same way with `leads.receive_qualified`.
 */
@Injectable()
export class LeadAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  /** Users who hold the rotation's tag, with their switch: the people the admin can turn on or off. */
  async members(tag: PermissionKey = ROTATIONS.telecallers) {
    const holders = await this.accessControl.activeUsersWithAnyTag([tag]);
    if (holders.length === 0) return [];
    return this.prisma.user.findMany({
      where: { id: { in: holders.map((h) => h.id) } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, email: true, autoAssignEnabled: true, lastAutoAssignedAt: true },
    });
  }

  /** Ids of the users currently receiving leads. Read once per batch and pass to `pickNext`. */
  async rotationIds(tag: PermissionKey = ROTATIONS.telecallers): Promise<string[]> {
    return (await this.members(tag)).filter((m) => m.autoAssignEnabled).map((m) => m.id);
  }

  /**
   * The next member of the rotation, marked as just assigned. Must run inside
   * the transaction that creates the lead. Returns null if the rotation is empty.
   */
  async pickNext(tx: Prisma.TransactionClient, rotationIds: string[]): Promise<Assignee | null> {
    if (rotationIds.length === 0) return null;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ROTATION_LOCK_KEY})::text AS locked`;
    const members = await tx.user.findMany({
      where: { id: { in: rotationIds }, isActive: true, autoAssignEnabled: true },
      orderBy: [{ lastAutoAssignedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      select: { id: true, fullName: true, lastAutoAssignedAt: true },
    });
    const next = members[0];
    if (!next) return null;
    // Strictly later than everyone else's stamp, so the order holds even within one millisecond.
    const latest = Math.max(0, ...members.map((m) => m.lastAutoAssignedAt?.getTime() ?? 0));
    await tx.user.update({ where: { id: next.id }, data: { lastAutoAssignedAt: new Date(Math.max(Date.now(), latest + 1)) } });
    return { id: next.id, fullName: next.fullName };
  }

  /** Turn someone's place in their rotation (telecallers or sales) on or off (admin). */
  async setEnabled(userId: string, enabled: boolean) {
    const [telecallers, sales] = await Promise.all([this.members(ROTATIONS.telecallers), this.members(ROTATIONS.sales)]);
    const member = [...telecallers, ...sales].find((m) => m.id === userId);
    if (!member) {
      const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) throw new NotFoundException('User not found');
      throw new BadRequestException(
        `This user holds neither ${PERMISSIONS.LEADS_AUTO_ASSIGN} nor ${PERMISSIONS.LEADS_RECEIVE_QUALIFIED}, so they can't be in a rotation. Grant one on their permissions first.`,
      );
    }
    await this.prisma.user.update({ where: { id: userId }, data: { autoAssignEnabled: enabled } });
    return { id: userId, autoAssignEnabled: enabled };
  }

  /**
   * How the leads created on one business day were distributed. Telecallers are
   * counted by who *received* the lead (telecallerId), so a lead they qualified
   * and handed to sales the same day still counts in their share.
   */
  async distribution(date: string) {
    const { start, end } = businessDayRange(date);
    const created = { gte: start, lt: end };
    const [total, toTelecallers, unassigned, received, byAssignee, members, salesMembers] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: created } }),
      this.prisma.lead.count({ where: { createdAt: created, telecallerId: { not: null } } }),
      this.prisma.lead.count({ where: { createdAt: created, assignedToId: null } }),
      this.prisma.lead.groupBy({ by: ['telecallerId'], where: { createdAt: created, telecallerId: { not: null } }, _count: { _all: true } }),
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { createdAt: created, assignedToId: { not: null }, telecallerId: null },
        _count: { _all: true },
      }),
      this.members(ROTATIONS.telecallers),
      this.members(ROTATIONS.sales),
    ]);
    const receivedBy = new Map(received.map((g) => [g.telecallerId!, g._count._all]));

    const nextOf = (list: typeof members) =>
      list.filter((m) => m.autoAssignEnabled).sort(
        (a, b) => (a.lastAutoAssignedAt?.getTime() ?? 0) - (b.lastAutoAssignedAt?.getTime() ?? 0),
      )[0];
    const nextUp = nextOf(members);
    const salesNext = nextOf(salesMembers);

    // Leads that day that never went through a telecaller (assigned straight to someone by hand).
    const otherIds = byAssignee.map((g) => g.assignedToId!).filter((id) => !members.some((m) => m.id === id));
    const otherUsers = otherIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, fullName: true, role: { select: { name: true } } } })
      : [];

    const rotationCounts = members.filter((m) => m.autoAssignEnabled).map((m) => receivedBy.get(m.id) ?? 0);
    return {
      date,
      total,
      // Leads that went to a telecaller (round-robin, or a telecaller named by hand).
      autoAssigned: toTelecallers,
      unassigned,
      // Largest minus smallest number received among those switched on.
      spread: rotationCounts.length ? Math.max(...rotationCounts) - Math.min(...rotationCounts) : 0,
      nextUp: nextUp ? { id: nextUp.id, fullName: nextUp.fullName } : null,
      members: members.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        autoAssignEnabled: m.autoAssignEnabled,
        lastAutoAssignedAt: m.lastAutoAssignedAt,
        leads: receivedBy.get(m.id) ?? 0,
      })),
      // Sales receiving qualified leads from telecallers (their own round-robin).
      sales: {
        nextUp: salesNext ? { id: salesNext.id, fullName: salesNext.fullName } : null,
        members: salesMembers.map((m) => ({
          id: m.id,
          fullName: m.fullName,
          email: m.email,
          autoAssignEnabled: m.autoAssignEnabled,
          lastAutoAssignedAt: m.lastAutoAssignedAt,
        })),
      },
      others: otherUsers.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        role: u.role.name,
        leads: byAssignee.find((g) => g.assignedToId === u.id)?._count._all ?? 0,
      })),
    };
  }
}

/** Start and end (as instants) of a YYYY-MM-DD day in the business time zone. */
export function businessDayRange(date: string): { start: Date; end: Date } {
  const timeZone = process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata';
  const midnightAt = (day: string) => {
    const utcMidnight = new Date(`${day}T00:00:00.000Z`);
    // What the zone's clock reads at UTC midnight tells us its offset on that day.
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(utcMidnight).map((p) => [p.type, p.value]),
    );
    const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    return new Date(utcMidnight.getTime() - (asLocal - utcMidnight.getTime()));
  };
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: midnightAt(date), end: midnightAt(next.toISOString().slice(0, 10)) };
}
