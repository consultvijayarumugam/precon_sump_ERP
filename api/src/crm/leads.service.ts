import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { LeadStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { notifyLeadAssigned } from '../notifications/notify.js';
import { describe, diff, recordActivity, STATUS_WORDS } from './lead-history.js';
import { CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/lead.dto.js';
import {
  canAssignLeads,
  FOLLOW_UP_SELECT,
  LEAD_SELECT,
  leadScope,
} from './lead-scope.js';

const CLOSED_STATUSES: LeadStatus[] = [LeadStatus.WON, LeadStatus.LOST];

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async list(user: AuthenticatedUser, query: ListLeadsQueryDto) {
    const where: Prisma.LeadWhereInput = {
      AND: [
        leadScope(user),
        {
          status: query.status,
          source: query.source,
          productInterest: query.productInterest,
          assignedToId: query.assignedToId,
        },
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search.replace(/[\s\-]/g, '') } },
                { city: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    // Won leads are listed by when they closed; everything else by newest first.
    const orderBy: Prisma.LeadOrderByWithRelationInput[] =
      query.status === LeadStatus.WON
        ? [{ closedAt: 'desc' }]
        : [{ createdAt: 'desc' }];

    const [total, leads] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          ...LEAD_SELECT,
          followUps: {
            where: { completedAt: null },
            orderBy: { scheduledAt: 'asc' },
            take: 1,
            select: { id: true, scheduledAt: true },
          },
        },
      }),
    ]);

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: leads.map(({ followUps, ...lead }) => ({
        ...lead,
        nextFollowUpAt: followUps[0]?.scheduledAt ?? null,
      })),
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id }, leadScope(user)] },
      select: {
        ...LEAD_SELECT,
        followUps: { orderBy: { scheduledAt: 'desc' }, select: FOLLOW_UP_SELECT },
      },
    });
    // 404 (not 403) for out-of-scope leads, so IDs can't be probed.
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async create(user: AuthenticatedUser, dto: CreateLeadDto) {
    let assignedToId: string | null;
    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId !== user.id) this.requireAssignPermission(user);
      assignedToId = dto.assignedToId;
    } else {
      // Without leads.assign you can only create leads for yourself.
      assignedToId = canAssignLeads(user) ? null : user.id;
    }
    if (assignedToId) await this.ensureAssignable(assignedToId);

    const status = dto.status ?? LeadStatus.NEW;
    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        city: dto.city || null,
        source: dto.source,
        productInterest: dto.productInterest ?? null,
        // A size only makes sense for a sump.
        sumpSizeLitres: dto.productInterest === 'SUMP' ? (dto.sumpSizeLitres ?? null) : null,
        status,
        notes: dto.notes || null,
        closedAt: CLOSED_STATUSES.includes(status) ? new Date() : null,
        assignedToId,
        createdById: user.id,
      },
      select: { id: true, assignedTo: { select: { fullName: true } } },
    });
    await recordActivity(this.prisma, { leadId: lead.id, userId: user.id, type: 'CREATED', summary: `Lead created by hand (${STATUS_WORDS[status]})` });
    if (assignedToId) {
      await recordActivity(this.prisma, {
        leadId: lead.id,
        userId: user.id,
        type: 'ASSIGNED',
        summary: `Assigned to ${lead.assignedTo?.fullName}`,
        changes: [{ field: 'assignedTo', label: 'Assigned to', from: null, to: lead.assignedTo?.fullName ?? null }],
      });
      await notifyLeadAssigned(this.prisma, { userId: assignedToId, leadId: lead.id, leadName: dto.name, actorId: user.id, how: `Assigned by ${user.fullName}` });
    }
    return this.findOne(user, lead.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateLeadDto) {
    // leads.qualify without leads.write (telecallers): leads they're connected to
    // (assigned, or worked before handing to sales), but not their phone or source
    // (the phone is what duplicate checks match on; the source records where the lead came from).
    const qualifyOnly = !user.permissions.includes(PERMISSIONS.LEADS_WRITE);
    const existing = await this.prisma.lead.findFirst({
      where: { AND: [{ id }, leadScope(user)] },
      select: {
        status: true,
        assignedToId: true,
        assignedTo: { select: { fullName: true } },
        name: true,
        phone: true,
        email: true,
        city: true,
        source: true,
        productInterest: true,
        sumpSizeLitres: true,
        notes: true,
        salesOrder: { select: { status: true } },
      },
    });
    if (!existing) throw new NotFoundException('Lead not found');
    if (qualifyOnly && dto.phone !== undefined && dto.phone !== existing.phone) {
      throw new ForbiddenException("You can't change a lead's phone number; ask an admin");
    }
    if (qualifyOnly && dto.source !== undefined && dto.source !== existing.source) {
      throw new ForbiddenException("You can't change a lead's source; ask an admin");
    }
    if (
      dto.status &&
      dto.status !== LeadStatus.WON &&
      existing.salesOrder &&
      existing.salesOrder.status !== 'CANCELLED'
    ) {
      throw new BadRequestException(
        'This lead has a sales order; cancel the order before moving the lead out of Won',
      );
    }

    const data: Prisma.LeadUncheckedUpdateInput = {
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      city: dto.city === undefined ? undefined : dto.city || null,
      source: dto.source,
      productInterest: dto.productInterest,
      notes: dto.notes === undefined ? undefined : dto.notes || null,
    };
    // Sump size: switching to microbes (or back to "not known") clears it; otherwise set it when given.
    if (dto.productInterest === 'MICROBES' || dto.productInterest === null) data.sumpSizeLitres = null;
    else if (dto.sumpSizeLitres !== undefined) data.sumpSizeLitres = dto.sumpSizeLitres;

    if (dto.assignedToId !== undefined && dto.assignedToId !== existing.assignedToId) {
      this.requireAssignPermission(user);
      const targetTags = dto.assignedToId ? await this.ensureAssignable(dto.assignedToId) : [];
      data.assignedToId = dto.assignedToId;
      data.autoAssigned = false; // now a manual assignment
      // Moved to a telecaller by hand: they're now the one working it (for their scorecard).
      if (targetTags.includes(PERMISSIONS.LEADS_AUTO_ASSIGN)) data.telecallerId = dto.assignedToId;
    }

    if (dto.status && dto.status !== existing.status) {
      data.status = dto.status;
      const wasClosed = CLOSED_STATUSES.includes(existing.status);
      const isClosed = CLOSED_STATUSES.includes(dto.status);
      if (isClosed) data.closedAt = new Date();
      else if (wasClosed) data.closedAt = null; // reopened
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const after = await tx.lead.update({ where: { id }, data, select: { name: true, assignedTo: { select: { fullName: true } } } });
      // History: one entry per kind of change, with from -> to.
      const fields = diff(existing, {
        name: data.name,
        phone: data.phone,
        email: data.email,
        city: data.city,
        source: data.source,
        productInterest: data.productInterest,
        sumpSizeLitres: data.sumpSizeLitres,
      });
      if (fields.length) await recordActivity(tx, { leadId: id, userId: user.id, type: 'FIELD_CHANGED', summary: describe(fields), changes: fields });
      const notes = diff(existing, { notes: data.notes });
      if (notes.length) await recordActivity(tx, { leadId: id, userId: user.id, type: 'NOTES_EDITED', summary: 'Notes edited', changes: notes });
      if (data.status && data.status !== existing.status) {
        const to = data.status as LeadStatus;
        await recordActivity(tx, {
          leadId: id,
          userId: user.id,
          type: 'STATUS_CHANGED',
          summary: `Status: ${STATUS_WORDS[existing.status]} → ${STATUS_WORDS[to]}`,
          changes: [{ field: 'status', label: 'Status', from: existing.status, to }],
        });
      }
      if (data.assignedToId !== undefined) {
        const from = existing.assignedTo?.fullName ?? null;
        const toName = after.assignedTo?.fullName ?? null;
        await recordActivity(tx, {
          leadId: id,
          userId: user.id,
          type: 'ASSIGNED',
          summary: `Assigned to ${toName ?? 'nobody'}${from ? ` (was ${from})` : ''}`,
          changes: [{ field: 'assignedTo', label: 'Assigned to', from, to: toName }],
        });
      }
      return after;
    });
    if (typeof data.assignedToId === 'string') {
      await notifyLeadAssigned(this.prisma, { userId: data.assignedToId, leadId: id, leadName: updated.name, actorId: user.id, how: `Assigned by ${user.fullName}` });
    }

    // If the change moved the lead out of this user's scope, they can no longer read it.
    const visible = await this.prisma.lead.count({
      where: { AND: [{ id }, leadScope(user)] },
    });
    return visible ? this.findOne(user, id) : { id, movedOutOfScope: true };
  }

  /** The lead's full change history, newest first (admin-only: leads.audit). */
  async history(user: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.count({ where: { AND: [{ id }, leadScope(user)] } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        type: true,
        message: true,
        templateName: true,
        changes: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, role: { select: { name: true } } } },
      },
    });
  }

  /** Active users who can work leads (hold leads.read), for the assign dropdown. */
  async listAssignees() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, role: { select: { key: true, name: true } } },
    });
    const result: typeof users = [];
    for (const u of users) {
      const { permissions } = await this.accessControl.getEffectiveAccess(u.id);
      if (permissions.includes(PERMISSIONS.LEADS_READ)) result.push(u);
    }
    return result;
  }

  /** Counts for the dashboard, within the user's lead scope. */
  async summary(user: AuthenticatedUser) {
    const scope = leadScope(user);
    const now = new Date();
    const pendingInScope: Prisma.FollowUpWhereInput = {
      completedAt: null,
      lead: scope,
    };

    const [byStatus, overdueFollowUps, upcomingFollowUps] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({
        by: ['status'],
        where: scope,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.followUp.count({
        where: { ...pendingInScope, scheduledAt: { lt: now } },
      }),
      this.prisma.followUp.count({
        where: { ...pendingInScope, scheduledAt: { gte: now } },
      }),
    ]);

    const leadsByStatus = Object.fromEntries(
      Object.values(LeadStatus).map((s) => [s, 0]),
    ) as Record<LeadStatus, number>;
    for (const row of byStatus) {
      leadsByStatus[row.status] = (row._count as { _all: number })._all;
    }

    return {
      totalLeads: Object.values(leadsByStatus).reduce((a, b) => a + b, 0),
      openLeads: Object.entries(leadsByStatus)
        .filter(([s]) => !CLOSED_STATUSES.includes(s as LeadStatus))
        .reduce((a, [, n]) => a + n, 0),
      leadsByStatus,
      overdueFollowUps,
      upcomingFollowUps,
    };
  }

  private requireAssignPermission(user: AuthenticatedUser) {
    if (!canAssignLeads(user)) {
      throw new ForbiddenException(
        `Missing permission tag(s): ${PERMISSIONS.LEADS_ASSIGN}`,
      );
    }
  }

  /** Throws unless the user can hold leads; returns their tags. */
  private async ensureAssignable(userId: string): Promise<string[]> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    if (!target?.isActive) {
      throw new BadRequestException('Assignee not found or inactive');
    }
    const { permissions } = await this.accessControl.getEffectiveAccess(userId);
    if (!permissions.includes(PERMISSIONS.LEADS_READ)) {
      throw new BadRequestException(
        `Assignee must hold the ${PERMISSIONS.LEADS_READ} tag`,
      );
    }
    return permissions;
  }
}
