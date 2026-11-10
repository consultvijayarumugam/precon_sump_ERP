import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { leadScope } from '../crm/lead-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { businessPeriods } from '../workflow/business-periods.js';
import type { DeviceCallDto, SyncDeviceCallsDto } from './dto/device-calls.dto.js';
import { buildTalkTime, callSummary, phoneKey, TALK_PERIODS } from './talk-time.js';
import type { PeriodTotal, TalkPeriod } from './talk-time.js';

/** Phones with a wrong clock: anything further ahead than this is dropped, not counted. */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MAX_LEAD_NUMBERS = 5000;

/** Real calls read from telecallers' phones by the mobile app, and the talk-time built from them. */
@Injectable()
export class DeviceCallsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The numbers the app may look for in the call log: only leads this user can see. */
  async leadNumbers(user: AuthenticatedUser) {
    const leads = await this.prisma.lead.findMany({
      where: leadScope(user),
      orderBy: { createdAt: 'desc' },
      take: MAX_LEAD_NUMBERS,
      select: { id: true, phone: true },
    });
    return { leads };
  }

  /**
   * Stores calls against the logged-in user. Safe to send the same call again:
   * the database refuses a repeat, and only newly stored calls reach the lead's history.
   */
  async sync(user: AuthenticatedUser, dto: SyncDeviceCallsDto) {
    const latest = Date.now() + MAX_FUTURE_MS;
    const calls = dto.calls.filter((c) => new Date(c.startedAt).getTime() <= latest);
    const leadFor = await this.matchLeads(user, calls);

    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.deviceCall.createManyAndReturn({
        data: calls.map((c) => ({
          userId: user.id,
          leadId: leadFor(c),
          phone: c.phone,
          direction: c.direction,
          startedAt: new Date(c.startedAt),
          durationSeconds: c.durationSeconds,
          deviceCallId: c.deviceCallId,
        })),
        skipDuplicates: true,
        select: { leadId: true, direction: true, durationSeconds: true, startedAt: true },
      });

      const onLeads = stored.flatMap((c) => (c.leadId ? [{ ...c, leadId: c.leadId }] : []));
      if (onLeads.length > 0) {
        await tx.leadActivity.createMany({
          data: onLeads.map((c) => ({
            leadId: c.leadId,
            userId: user.id,
            type: 'CALL_SYNCED' as const,
            message: callSummary(c.direction, c.durationSeconds),
            createdAt: c.startedAt, // so it sits at the time of the call, not the time of the sync
          })),
        });
      }
      return {
        received: dto.calls.length,
        stored: stored.length,
        duplicates: calls.length - stored.length,
        rejected: dto.calls.length - calls.length,
        matchedToLeads: onLeads.length,
      };
    });
  }

  /**
   * Which lead each call belongs to. The server decides: a lead id from the app
   * only counts if this user can see that lead and the number is on it;
   * otherwise the number is looked up among the leads they can see.
   */
  private async matchLeads(user: AuthenticatedUser, calls: DeviceCallDto[]) {
    const keys = [...new Set(calls.map((c) => phoneKey(c.phone)))].filter((k) => k.length >= 3);
    const leads = keys.length
      ? await this.prisma.lead.findMany({
          where: { AND: [leadScope(user), { OR: keys.map((key) => ({ phone: { endsWith: key } })) }] },
          orderBy: { createdAt: 'asc' }, // the newest lead with a number wins below
          select: { id: true, phone: true },
        })
      : [];
    const byKey = new Map(leads.map((l) => [phoneKey(l.phone), l.id]));
    const allowed = new Map(leads.map((l) => [l.id, phoneKey(l.phone)]));

    return (call: DeviceCallDto): string | null => {
      const key = phoneKey(call.phone);
      if (call.leadId && allowed.get(call.leadId) === key) return call.leadId;
      return byKey.get(key) ?? null;
    };
  }

  /** A lead's real calls, newest first, for people who can see the lead. */
  async forLead(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { AND: [{ id: leadId }, leadScope(user)] }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.deviceCall.findMany({
      where: { leadId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: { id: true, direction: true, startedAt: true, durationSeconds: true, user: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * Talk-time per person for today, this week and this month. `people` are
   * always listed; anyone else with synced calls this month is added.
   */
  async talkTime(people: { id: string; fullName: string }[], p: ReturnType<typeof businessPeriods>) {
    const starts: Record<TalkPeriod, Date> = { today: p.todayStart, week: p.weekStart, month: p.monthStart };
    const totals = await Promise.all(TALK_PERIODS.map((period) => this.totalsSince(starts[period], p.todayEnd)));
    const byPeriod = { today: totals[0], week: totals[1], month: totals[2] };

    const known = new Set(people.map((person) => person.id));
    const otherIds = byPeriod.month.map((t) => t.userId).filter((id) => !known.has(id));
    const [others, latest] = await Promise.all([
      otherIds.length ? this.prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, fullName: true } }) : [],
      this.prisma.deviceCall.groupBy({ by: ['userId'], _max: { createdAt: true } }),
    ]);
    const lastSync = new Map(latest.flatMap((l) => (l._max.createdAt ? [[l.userId, l._max.createdAt] as const] : [])));
    return buildTalkTime([...people.map(({ id, fullName }) => ({ id, fullName })), ...others], byPeriod, lastSync);
  }

  private async totalsSince(from: Date, until: Date): Promise<PeriodTotal[]> {
    const startedAt = { gte: from, lt: until };
    const [all, connected] = await Promise.all([
      this.prisma.deviceCall.groupBy({ by: ['userId'], where: { startedAt }, _count: { _all: true }, _sum: { durationSeconds: true } }),
      this.prisma.deviceCall.groupBy({ by: ['userId'], where: { startedAt, durationSeconds: { gt: 0 } }, _count: { _all: true } }),
    ]);
    return all.map((row) => ({
      userId: row.userId,
      calls: row._count._all,
      connected: connected.find((c) => c.userId === row.userId)?._count._all ?? 0,
      talkSeconds: row._sum.durationSeconds ?? 0,
    }));
  }
}
