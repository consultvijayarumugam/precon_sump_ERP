import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { FollowUpOutcome, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CompleteFollowUpDto,
  CreateFollowUpDto,
  ListFollowUpsQueryDto,
  UpdateFollowUpDto,
} from './dto/follow-up.dto.js';
import { diff, recordActivity, when } from './lead-history.js';
import { FOLLOW_UP_SELECT, leadScope, ownedLeads } from './lead-scope.js';

const OUTCOME_WORDS: Record<FollowUpOutcome, string> = {
  CONNECTED: 'Connected',
  NO_ANSWER: 'No answer',
  CALL_BACK: 'Call back later',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  QUOTE_SENT: 'Quote sent',
  OTHER: 'Other',
};

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
          // Your own list: follow-ups on leads you're responsible for (a telecaller's
          // handed-over leads are the salesperson's to follow up).
          { lead: ownedLeads(user) },
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
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.create({
        data: {
          leadId,
          scheduledAt: dto.scheduledAt,
          note: dto.note || null,
          createdById: user.id,
        },
        select: FOLLOW_UP_WITH_LEAD_SELECT,
      });
      await recordActivity(tx, {
        leadId,
        userId: user.id,
        type: 'FOLLOW_UP_CREATED',
        summary: `Follow-up set for ${when(dto.scheduledAt)}${dto.note ? `: ${dto.note}` : ''}`,
        changes: [{ field: 'scheduledAt', label: 'Due', from: null, to: dto.scheduledAt.toISOString() }],
      });
      return followUp;
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateFollowUpDto) {
    const before = await this.ensureFollowUpInScope(user, id);
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.update({
        where: { id },
        data: { scheduledAt: dto.scheduledAt, note: dto.note },
        select: FOLLOW_UP_WITH_LEAD_SELECT,
      });
      const changes = diff(
        { scheduledAt: before.scheduledAt, note: before.note },
        { scheduledAt: dto.scheduledAt, note: dto.note },
      ).map((c) => ({ ...c, label: c.field === 'scheduledAt' ? 'Due' : 'Note' }));
      if (changes.length) {
        await recordActivity(tx, {
          leadId: before.leadId,
          userId: user.id,
          type: 'FOLLOW_UP_RESCHEDULED',
          summary: dto.scheduledAt ? `Follow-up moved: ${when(before.scheduledAt)} → ${when(dto.scheduledAt)}` : 'Follow-up note edited',
          changes,
        });
      }
      return followUp;
    });
  }

  async complete(user: AuthenticatedUser, id: string, dto: CompleteFollowUpDto) {
    const before = await this.ensureFollowUpInScope(user, id);
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.update({
        where: { id },
        data: { outcome: dto.outcome, note: dto.note, completedAt: new Date() },
        select: FOLLOW_UP_WITH_LEAD_SELECT,
      });
      await recordActivity(tx, {
        leadId: before.leadId,
        userId: user.id,
        type: 'FOLLOW_UP_COMPLETED',
        summary: `Follow-up (due ${when(before.scheduledAt)}) done: ${OUTCOME_WORDS[dto.outcome]}${dto.note ? ` · ${dto.note}` : ''}`,
        changes: [{ field: 'outcome', label: 'Outcome', from: null, to: dto.outcome }],
      });
      return followUp;
    });
  }

  /** Undo a completion (e.g. recorded by mistake). */
  async reopen(user: AuthenticatedUser, id: string) {
    const before = await this.ensureFollowUpInScope(user, id);
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.update({
        where: { id },
        data: { outcome: null, completedAt: null },
        select: FOLLOW_UP_WITH_LEAD_SELECT,
      });
      await recordActivity(tx, {
        leadId: before.leadId,
        userId: user.id,
        type: 'FOLLOW_UP_REOPENED',
        summary: `Follow-up (due ${when(before.scheduledAt)}) reopened`,
        changes: before.outcome ? [{ field: 'outcome', label: 'Outcome', from: before.outcome, to: null }] : undefined,
      });
      return followUp;
    });
  }

  private async ensureLeadInScope(user: AuthenticatedUser, leadId: string) {
    const found = await this.prisma.lead.count({
      where: { AND: [{ id: leadId }, leadScope(user)] },
    });
    if (!found) throw new NotFoundException('Lead not found');
  }

  private async ensureFollowUpInScope(user: AuthenticatedUser, id: string) {
    const found = await this.prisma.followUp.findFirst({
      where: { id, lead: leadScope(user) },
      select: { leadId: true, scheduledAt: true, note: true, outcome: true },
    });
    if (!found) throw new NotFoundException('Follow-up not found');
    return found;
  }
}
