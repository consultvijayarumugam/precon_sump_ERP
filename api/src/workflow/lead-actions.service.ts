import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { leadScope } from '../crm/lead-scope.js';
import { CallOutcome, FollowUpOutcome, LeadStatus, Prisma } from '../generated/prisma/client.js';
import { LeadAssignmentService, ROTATIONS } from '../intake/lead-assignment.service.js';
import { notifyLeadHandedOver } from '../notifications/notify.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LogCallDto, NextCallbackDto, QualifyLeadDto } from './dto/workflow.dto.js';

/** Outcomes that end the lead: it's closed as Lost and leaves the worklist. */
export const CLOSING_OUTCOMES: CallOutcome[] = ['NOT_INTERESTED', 'WRONG_NUMBER'];

/** How a call outcome reads on the follow-up it completes. */
const FOLLOW_UP_OUTCOME: Record<CallOutcome, FollowUpOutcome> = {
  NO_ANSWER: 'NO_ANSWER',
  BUSY: 'NO_ANSWER',
  CALL_BACK: 'CALL_BACK',
  INTERESTED: 'INTERESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  WRONG_NUMBER: 'OTHER',
};

const OUTCOME_TEXT: Record<CallOutcome, string> = {
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  CALL_BACK: 'Call back',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  WRONG_NUMBER: 'Wrong number',
};

/** Stages a telecaller works: before qualification. */
export const TELECALLER_STAGES: LeadStatus[] = ['NEW', 'CONTACTED'];

/**
 * The telecaller's quick actions (also open to sales on their own leads):
 * log a call, set the next callback, and qualify + hand over to sales.
 * Callbacks are ordinary follow-ups, so the follow-up list and calendar show them.
 */
@Injectable()
export class LeadActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  /**
   * Records a call. Any pending callback on the lead counts as done (with this
   * outcome); a new one can be set in the same step. A first call moves New to
   * Contacted; "not interested" and "wrong number" close the lead as Lost.
   */
  async logCall(user: AuthenticatedUser, leadId: string, dto: LogCallDto) {
    const lead = await this.leadInScope(user, leadId);
    const now = new Date();
    if (dto.nextCallbackAt && dto.nextCallbackAt <= now) throw new BadRequestException('The next callback must be in the future');
    const closes = CLOSING_OUTCOMES.includes(dto.outcome);
    if (closes && dto.nextCallbackAt) throw new BadRequestException(`"${OUTCOME_TEXT[dto.outcome]}" closes the lead, so no callback is needed`);

    const status: LeadStatus | undefined =
      closes && lead.status !== 'WON' ? 'LOST' : lead.status === 'NEW' ? 'CONTACTED' : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.callLog.create({ data: { leadId, callerId: user.id, outcome: dto.outcome, note: dto.note || null, calledAt: now } });
      await tx.followUp.updateMany({
        where: { leadId, completedAt: null },
        data: { completedAt: now, outcome: FOLLOW_UP_OUTCOME[dto.outcome] },
      });
      if (dto.nextCallbackAt) {
        await tx.followUp.create({
          data: { leadId, scheduledAt: dto.nextCallbackAt, note: dto.note ? `Callback: ${dto.note}` : 'Callback', createdById: user.id },
        });
      }
      if (status && status !== lead.status) {
        await tx.lead.update({ where: { id: leadId }, data: { status, closedAt: status === 'LOST' ? now : undefined } });
      }
    });
    return { leadId, status: status ?? lead.status, outcome: dto.outcome };
  }

  /** Sets (or moves) the lead's next callback: reschedules the earliest pending one, or adds one. */
  async setNextCallback(user: AuthenticatedUser, leadId: string, dto: NextCallbackDto) {
    await this.leadInScope(user, leadId);
    if (dto.scheduledAt <= new Date()) throw new BadRequestException('The callback must be in the future');
    const pending = await this.prisma.followUp.findFirst({
      where: { leadId, completedAt: null },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true },
    });
    const followUp = pending
      ? await this.prisma.followUp.update({
          where: { id: pending.id },
          data: { scheduledAt: dto.scheduledAt, note: dto.note || undefined },
          select: { id: true, scheduledAt: true, note: true },
        })
      : await this.prisma.followUp.create({
          data: { leadId, scheduledAt: dto.scheduledAt, note: dto.note || 'Callback', createdById: user.id },
          select: { id: true, scheduledAt: true, note: true },
        });
    return followUp;
  }

  /** Salespeople who can receive qualified leads, and who the round-robin would pick next. */
  async salesTeam() {
    const members = await this.assignment.members(ROTATIONS.sales);
    const enabled = members.filter((m) => m.autoAssignEnabled);
    const next = [...enabled].sort((a, b) => (a.lastAutoAssignedAt?.getTime() ?? 0) - (b.lastAutoAssignedAt?.getTime() ?? 0))[0];
    return {
      nextUp: next ? { id: next.id, fullName: next.fullName } : null,
      members: members.map((m) => ({ id: m.id, fullName: m.fullName, inRotation: m.autoAssignEnabled })),
    };
  }

  /**
   * Telecaller → sales handover. Fills in what the call found out, marks the
   * lead Qualified and assigns it to a salesperson (chosen, or next in the
   * sales round-robin). The telecaller's open callbacks close; an optional
   * follow-up goes on the salesperson's list. The lead leaves the worklist.
   */
  async qualify(user: AuthenticatedUser, leadId: string, dto: QualifyLeadDto) {
    const lead = await this.leadInScope(user, leadId, { ownOnlyWithoutWrite: true });
    if (!TELECALLER_STAGES.includes(lead.status)) {
      throw new BadRequestException(`This lead is already ${lead.status.toLowerCase()}; only New or Contacted leads can be qualified`);
    }
    if (dto.productInterest === 'MICROBES' && dto.sumpSizeLitres) throw new BadRequestException('Microbes have no size');
    if (dto.salesFollowUpAt && dto.salesFollowUpAt <= new Date()) throw new BadRequestException('The sales follow-up must be in the future');

    const team = await this.assignment.members(ROTATIONS.sales);
    if (dto.salesUserId && !team.some((m) => m.id === dto.salesUserId)) {
      throw new BadRequestException(`That person can't receive qualified leads (needs the ${PERMISSIONS.LEADS_RECEIVE_QUALIFIED} tag)`);
    }
    const rotation = team.filter((m) => m.autoAssignEnabled).map((m) => m.id);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const picked = dto.salesUserId ? null : await this.assignment.pickNext(tx, rotation);
      const salesId = dto.salesUserId ?? picked?.id;
      if (!salesId) {
        throw new BadRequestException('No salesperson is switched on to receive leads. Pick one, or ask an admin to switch someone on.');
      }
      const sales = await tx.user.findUniqueOrThrow({ where: { id: salesId }, select: { id: true, fullName: true } });
      const stamp = `Qualified by ${user.fullName} on ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata' })}`;
      const notes = [lead.notes, dto.notes ? `${stamp}: ${dto.notes}` : `${stamp}.`].filter(Boolean).join('\n\n');

      await tx.followUp.updateMany({
        where: { leadId, completedAt: null },
        data: { completedAt: now, outcome: 'INTERESTED' },
      });
      if (dto.salesFollowUpAt) {
        await tx.followUp.create({
          data: { leadId, scheduledAt: dto.salesFollowUpAt, note: `Qualified lead from ${user.fullName}: call to quote`, createdById: user.id },
        });
      }
      await tx.lead.update({
        where: { id: leadId },
        data: {
          status: 'QUALIFIED',
          productInterest: dto.productInterest,
          sumpSizeLitres: dto.productInterest === 'SUMP' ? (dto.sumpSizeLitres ?? null) : null,
          city: dto.city === undefined ? undefined : dto.city || null,
          notes,
          assignedToId: sales.id,
          autoAssigned: Boolean(picked),
          qualifiedAt: now,
          qualifiedById: user.id,
          // Keep who worked it; if nobody was recorded, it's the person qualifying.
          telecallerId: lead.telecallerId ?? user.id,
        },
      });
      const leadName = (await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { name: true } })).name;
      await notifyLeadHandedOver(tx, { userId: sales.id, leadId, leadName, fromName: user.fullName, actorId: user.id });
      return { leadId, status: 'QUALIFIED' as const, handedTo: sales, roundRobin: Boolean(picked) };
    });
  }

  /** Every call logged on a lead, newest first. */
  async callHistory(user: AuthenticatedUser, leadId: string) {
    await this.leadInScope(user, leadId);
    return this.prisma.callLog.findMany({
      where: { leadId },
      orderBy: { calledAt: 'desc' },
      take: 100,
      select: { id: true, outcome: true, note: true, calledAt: true, caller: { select: { id: true, fullName: true } } },
    });
  }

  /** The lead, if the user may act on it (404 otherwise, like the rest of the CRM). */
  private async leadInScope(user: AuthenticatedUser, leadId: string, opts: { ownOnlyWithoutWrite?: boolean } = {}) {
    const ownOnly = opts.ownOnlyWithoutWrite && !user.permissions.includes(PERMISSIONS.LEADS_WRITE);
    const where: Prisma.LeadWhereInput = { AND: [{ id: leadId }, leadScope(user), ownOnly ? { assignedToId: user.id } : {}] };
    const lead = await this.prisma.lead.findFirst({
      where,
      select: { id: true, status: true, notes: true, telecallerId: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }
}
