import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CompleteFollowUpDto,
  CreateFollowUpDto,
  ListFollowUpsQueryDto,
  UpdateFollowUpDto,
} from './dto/follow-up.dto.js';
import { FOLLOW_UP_SELECT, leadScope } from './lead-scope.js';

const FOLLOW_UP_WITH_LEAD_SELECT = {
  ...FOLLOW_UP_SELECT,
  lead: {
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      productInterest: true,
      sumpSizeLitres: true,
      assignedTo: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.FollowUpSelect;

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Powers the upcoming/overdue lists and the calendar. */
  list(user: AuthenticatedUser, query: ListFollowUpsQueryDto) {
    const now = new Date();
    const stateFilter: Record<string, Prisma.FollowUpWhereInput> = {
      pending: { completedAt: null },
      overdue: { completedAt: null, scheduledAt: { lt: now } },
      upcoming: { completedAt: null, scheduledAt: { gte: now } },
      completed: { completedAt: { not: null } },
    };

    return this.prisma.followUp.findMany({
      where: {
        AND: [
          { lead: leadScope(user) },
          query.assignedTo === 'me' ? { lead: { assignedToId: user.id } } : {},
          query.state ? stateFilter[query.state] : {},
          { scheduledAt: { gte: query.from, lt: query.to } },
        ],
      },
      // Completed ones newest first; everything else in the order they're due.
      orderBy: { scheduledAt: query.state === 'completed' ? 'desc' : 'asc' },
      take: 500,
      select: FOLLOW_UP_WITH_LEAD_SELECT,
    });
  }

  async create(user: AuthenticatedUser, leadId: string, dto: CreateFollowUpDto) {
    await this.ensureLeadInScope(user, leadId);
    return this.prisma.followUp.create({
      data: {
        leadId,
        scheduledAt: dto.scheduledAt,
        note: dto.note || null,
        createdById: user.id,
      },
      select: FOLLOW_UP_WITH_LEAD_SELECT,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateFollowUpDto) {
    await this.ensureFollowUpInScope(user, id);
    return this.prisma.followUp.update({
      where: { id },
      data: { scheduledAt: dto.scheduledAt, note: dto.note },
      select: FOLLOW_UP_WITH_LEAD_SELECT,
    });
  }

  async complete(user: AuthenticatedUser, id: string, dto: CompleteFollowUpDto) {
    await this.ensureFollowUpInScope(user, id);
    return this.prisma.followUp.update({
      where: { id },
      data: { outcome: dto.outcome, note: dto.note, completedAt: new Date() },
      select: FOLLOW_UP_WITH_LEAD_SELECT,
    });
  }

  /** Undo a completion (e.g. recorded by mistake). */
  async reopen(user: AuthenticatedUser, id: string) {
    await this.ensureFollowUpInScope(user, id);
    return this.prisma.followUp.update({
      where: { id },
      data: { outcome: null, completedAt: null },
      select: FOLLOW_UP_WITH_LEAD_SELECT,
    });
  }

  private async ensureLeadInScope(user: AuthenticatedUser, leadId: string) {
    const found = await this.prisma.lead.count({
      where: { AND: [{ id: leadId }, leadScope(user)] },
    });
    if (!found) throw new NotFoundException('Lead not found');
  }

  private async ensureFollowUpInScope(user: AuthenticatedUser, id: string) {
    const found = await this.prisma.followUp.count({
      where: { id, lead: leadScope(user) },
    });
    if (!found) throw new NotFoundException('Follow-up not found');
  }
}
