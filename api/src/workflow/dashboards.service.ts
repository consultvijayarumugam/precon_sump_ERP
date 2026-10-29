import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { money } from '../finance/finance-utils.js';
import { LeadStatus, Prisma, SalesOrderStatus } from '../generated/prisma/client.js';
import { LeadAssignmentService, ROTATIONS } from '../intake/lead-assignment.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { businessDate, businessPeriods } from './business-periods.js';
import { CheckInsService } from './check-ins.service.js';
import { TELECALLER_STAGES } from './lead-actions.service.js';

const SALES_OPEN: LeadStatus[] = ['QUALIFIED', 'QUOTED'];
const SALES_STAGES: LeadStatus[] = ['QUALIFIED', 'QUOTED', 'WON', 'LOST'];

/** Worklist order: who to call first. */
export const WORKLIST_BUCKETS = ['overdue', 'today', 'new', 'no_next_step', 'later'] as const;
export type WorklistBucket = (typeof WORKLIST_BUCKETS)[number];

const WORKLIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  city: true,
  status: true,
  source: true,
  sourceDetail: true,
  productInterest: true,
  sumpSizeLitres: true,
  notes: true,
  createdAt: true,
  followUps: {
    where: { completedAt: null },
    orderBy: { scheduledAt: 'asc' },
    take: 1,
    select: { id: true, scheduledAt: true, note: true },
  },
  calls: { orderBy: { calledAt: 'desc' }, take: 1, select: { outcome: true, note: true, calledAt: true } },
  _count: { select: { calls: true } },
} satisfies Prisma.LeadSelect;

const SALES_LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  city: true,
  status: true,
  productInterest: true,
  sumpSizeLitres: true,
  qualifiedAt: true,
  closedAt: true,
  qualifiedBy: { select: { id: true, fullName: true } },
  followUps: {
    where: { completedAt: null },
    orderBy: { scheduledAt: 'asc' },
    take: 1,
    select: { id: true, scheduledAt: true, note: true },
  },
} satisfies Prisma.LeadSelect;

/** Data for the three role landing pages: telecaller workbench, sales, and master (admin). */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignment: LeadAssignmentService,
    private readonly checkIns: CheckInsService,
  ) {}

  // --- Telecaller workbench ------------------------------------------------------

  async telecaller(user: AuthenticatedUser) {
    const p = businessPeriods();
    const leads = await this.prisma.lead.findMany({
      where: { assignedToId: user.id, status: { in: TELECALLER_STAGES } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: WORKLIST_SELECT,
    });

    const items = leads.map(({ followUps, calls, _count, ...lead }) => {
      const next = followUps[0] ?? null;
      const bucket: WorklistBucket = next
        ? next.scheduledAt < p.now
          ? 'overdue'
          : next.scheduledAt < p.todayEnd
            ? 'today'
            : 'later'
        : _count.calls === 0
          ? 'new'
          : 'no_next_step';
      return { ...lead, bucket, nextCallback: next, lastCall: calls[0] ?? null, callCount: _count.calls };
    });
    const rank = (b: WorklistBucket) => WORKLIST_BUCKETS.indexOf(b);
    const when = (i: (typeof items)[number]) =>
      i.nextCallback?.scheduledAt.getTime() ?? i.lastCall?.calledAt.getTime() ?? i.createdAt.getTime();
    items.sort((a, b) => rank(a.bucket) - rank(b.bucket) || when(a) - when(b));

    const mine: Prisma.LeadWhereInput = { OR: [{ telecallerId: user.id }, { assignedToId: user.id }] };
    const [newToday, callsToday, callsThisWeek, qualifiedToday, qualifiedThisWeek] = await Promise.all([
      this.prisma.lead.count({ where: { AND: [mine, { createdAt: { gte: p.todayStart, lt: p.todayEnd } }] } }),
      this.prisma.callLog.count({ where: { callerId: user.id, calledAt: { gte: p.todayStart } } }),
      this.prisma.callLog.count({ where: { callerId: user.id, calledAt: { gte: p.weekStart } } }),
      this.prisma.lead.count({ where: { qualifiedById: user.id, qualifiedAt: { gte: p.todayStart } } }),
      this.prisma.lead.count({ where: { qualifiedById: user.id, qualifiedAt: { gte: p.weekStart } } }),
    ]);
    const count = (b: WorklistBucket) => items.filter((i) => i.bucket === b).length;
    return {
      counts: {
        newToday,
        callbacksDueToday: count('today'),
        overdue: count('overdue'),
        callsToday,
        callsThisWeek,
        qualifiedToday,
        qualifiedThisWeek,
        notCalledYet: count('new'),
      },
      items,
    };
  }

  // --- Sales ---------------------------------------------------------------------

  async sales(user: AuthenticatedUser) {
    const p = businessPeriods();
    const mine = { assignedToId: user.id };
    const [byStatus, wonThisMonth, lostThisMonth, open, closedThisMonth, followUps, handedToday, revenue, visits] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['status'], where: { ...mine, status: { in: SALES_STAGES } }, _count: { _all: true } }),
      this.prisma.lead.count({ where: { ...mine, status: 'WON', closedAt: { gte: p.monthStart } } }),
      this.prisma.lead.count({ where: { ...mine, status: 'LOST', closedAt: { gte: p.monthStart } } }),
      this.prisma.lead.findMany({
        where: { ...mine, status: { in: SALES_OPEN } },
        orderBy: [{ qualifiedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 100,
        select: SALES_LEAD_SELECT,
      }),
      this.prisma.lead.findMany({
        where: { ...mine, status: { in: ['WON', 'LOST'] }, closedAt: { gte: p.monthStart } },
        orderBy: { closedAt: 'desc' },
        take: 20,
        select: SALES_LEAD_SELECT,
      }),
      this.prisma.followUp.findMany({
        where: { completedAt: null, scheduledAt: { lt: p.todayEnd }, lead: mine },
        orderBy: { scheduledAt: 'asc' },
        take: 50,
        select: {
          id: true,
          scheduledAt: true,
          note: true,
          lead: { select: { id: true, name: true, phone: true, status: true, city: true } },
        },
      }),
      this.prisma.lead.count({ where: { ...mine, qualifiedAt: { gte: p.todayStart } } }),
      user.permissions.includes(PERMISSIONS.SALES_READ) ? this.revenueSince(p.monthStartDate, user.id) : Promise.resolve(null),
      this.checkIns.recent({ personId: user.id, take: 20 }),
    ]);

    const stageCount = (s: LeadStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    return {
      pipeline: {
        QUALIFIED: stageCount('QUALIFIED'),
        QUOTED: stageCount('QUOTED'),
        WON: stageCount('WON'),
        LOST: stageCount('LOST'),
        wonThisMonth,
        lostThisMonth,
      },
      revenueThisMonth: revenue,
      handedToday,
      open: open.map(this.withNextFollowUp),
      closedThisMonth: closedThisMonth.map(this.withNextFollowUp),
      followUps: followUps.map((f) => ({ ...f, overdue: f.scheduledAt < p.now })),
      visits,
    };
  }

  // --- Master (admin) --------------------------------------------------------------

  async master() {
    const p = businessPeriods();
    const [distribution, telecallers, salesTeam] = await Promise.all([
      this.assignment.distribution(p.today),
      this.assignment.members(ROTATIONS.telecallers),
      this.assignment.members(ROTATIONS.sales),
    ]);

    const telecallerRows = await Promise.all(
      telecallers.map(async (t) => {
        const assigned = { assignedToId: t.id, status: { in: TELECALLER_STAGES } };
        const [active, notCalled, oldestNotCalled, overdueCallbacks, callsToday, callsWeek, receivedMonth, convertedMonth, qualifiedMonth] =
          await Promise.all([
            this.prisma.lead.count({ where: assigned }),
            this.prisma.lead.count({ where: { assignedToId: t.id, status: 'NEW', calls: { none: {} } } }),
            this.prisma.lead.findFirst({
              where: { assignedToId: t.id, status: 'NEW', calls: { none: {} } },
              orderBy: { createdAt: 'asc' },
              select: { createdAt: true },
            }),
            this.prisma.lead.count({ where: { ...assigned, followUps: { some: { completedAt: null, scheduledAt: { lt: p.now } } } } }),
            this.prisma.callLog.count({ where: { callerId: t.id, calledAt: { gte: p.todayStart } } }),
            this.prisma.callLog.count({ where: { callerId: t.id, calledAt: { gte: p.weekStart } } }),
            this.prisma.lead.count({ where: { telecallerId: t.id, createdAt: { gte: p.monthStart } } }),
            this.prisma.lead.count({ where: { telecallerId: t.id, createdAt: { gte: p.monthStart }, qualifiedAt: { not: null } } }),
            this.prisma.lead.count({ where: { qualifiedById: t.id, qualifiedAt: { gte: p.monthStart } } }),
          ]);
        return {
          id: t.id,
          fullName: t.fullName,
          inRotation: t.autoAssignEnabled,
          receivedToday: distribution.members.find((m) => m.id === t.id)?.leads ?? 0,
          active,
          notCalled,
          oldestNotCalledAt: oldestNotCalled?.createdAt ?? null,
          overdueCallbacks,
          callsToday,
          callsWeek,
          receivedMonth,
          qualifiedMonth,
          // Of the leads this telecaller received this month, the share qualified so far.
          conversionRate: receivedMonth ? convertedMonth / receivedMonth : null,
        };
      }),
    );

    const salesRows = await Promise.all(
      salesTeam.map(async (s) => {
        const mine = { assignedToId: s.id };
        const dueSoFar = { lead: mine, scheduledAt: { gte: p.monthStart, lt: p.now } };
        const [receivedMonth, open, wonMonth, revenueMonth, followUpsOverdue, dueMonth, doneMonth, noNextStep] = await Promise.all([
          this.prisma.lead.count({ where: { ...mine, qualifiedAt: { gte: p.monthStart } } }),
          this.prisma.lead.count({ where: { ...mine, status: { in: SALES_OPEN } } }),
          this.prisma.lead.count({ where: { ...mine, status: 'WON', closedAt: { gte: p.monthStart } } }),
          this.revenueSince(p.monthStartDate, s.id),
          this.prisma.followUp.count({ where: { lead: mine, completedAt: null, scheduledAt: { lt: p.now } } }),
          this.prisma.followUp.count({ where: dueSoFar }),
          this.prisma.followUp.count({ where: { ...dueSoFar, completedAt: { not: null } } }),
          this.prisma.lead.count({ where: { ...mine, status: { in: SALES_OPEN }, followUps: { none: { completedAt: null } } } }),
        ]);
        return {
          id: s.id,
          fullName: s.fullName,
          inRotation: s.autoAssignEnabled,
          receivedMonth,
          open,
          wonMonth,
          revenueMonth,
          followUpsOverdue,
          noNextStep,
          // Follow-ups that came due this month (up to now) that have been done.
          followUpCompliance: dueMonth ? doneMonth / dueMonth : null,
        };
      }),
    );

    const flags = this.accountabilityFlags(telecallerRows, salesRows, p.now);
    const [qualifiedToday, visits] = await Promise.all([
      this.prisma.lead.count({ where: { qualifiedAt: { gte: p.todayStart } } }),
      this.checkIns.recent({ since: new Date(p.now.getTime() - 30 * 86_400_000), take: 100 }),
    ]);
    const revenueMonth = salesRows.reduce((sum, r) => sum + Number(r.revenueMonth), 0);
    return {
      today: distribution,
      team: {
        incomingToday: distribution.total,
        callsToday: telecallerRows.reduce((n, r) => n + r.callsToday, 0),
        notCalled: telecallerRows.reduce((n, r) => n + r.notCalled, 0),
        overdue:
          telecallerRows.reduce((n, r) => n + r.overdueCallbacks, 0) + salesRows.reduce((n, r) => n + r.followUpsOverdue, 0),
        qualifiedToday,
        wonMonth: salesRows.reduce((n, r) => n + r.wonMonth, 0),
        revenueMonth: revenueMonth.toFixed(2),
      },
      telecallers: telecallerRows,
      sales: salesRows,
      flags,
      visits,
      overview: await this.ceoOverview(p, {
        callsToday: telecallerRows.reduce((n, r) => n + r.callsToday, 0),
        revenueMonth,
        wonMonth: salesRows.reduce((n, r) => n + r.wonMonth, 0),
      }),
    };
  }

  /**
   * The owner's morning view: lead flow (today / week vs last week, by source,
   * last 14 days), team activity (vs yesterday), pipeline by stage and revenue
   * (month to date vs the same days last month). Read-only counts.
   */
  private async ceoOverview(p: ReturnType<typeof businessPeriods>, already: { callsToday: number; revenueMonth: number; wonMonth: number }) {
    const DAY = 86_400_000;
    const sinceYesterday = { gte: p.yesterdayStart, lt: p.todayStart };
    // Yesterday up to this time of day: a fair comparison for a day still in progress.
    const yesterdaySoFar = { gte: p.yesterdayStart, lte: new Date(p.now.getTime() - DAY) };
    const weekSoFar = { gte: p.weekStart, lte: p.now };
    // Last week up to the same moment, so a Tuesday morning compares with last Tuesday morning.
    const lastWeekSoFar = { gte: p.prevWeekStart, lte: new Date(p.now.getTime() - 7 * DAY) };
    const trendFrom = new Date(p.todayStart.getTime() - 13 * DAY);
    const lastMonthSameSpan = { gte: p.prevMonthStart, lte: new Date(p.prevMonthStart.getTime() + (p.now.getTime() - p.monthStart.getTime())) };

    const [
      todayLeads, yesterdayLeads, weekLeads, lastWeekLeads, sourcesWeek, sourcesLastWeek, recent,
      callsYesterday, callsYesterdaySoFar, workedToday, workedYesterday, dueMonth, doneMonth,
      byStage, qualifiedYesterday, wonLastMonth, revenueLastMonth, revenueLastMonthFull,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: { gte: p.todayStart, lt: p.todayEnd } } }),
      this.prisma.lead.count({ where: { createdAt: sinceYesterday } }),
      this.prisma.lead.count({ where: { createdAt: weekSoFar } }),
      this.prisma.lead.count({ where: { createdAt: lastWeekSoFar } }),
      this.prisma.lead.groupBy({ by: ['source'], where: { createdAt: weekSoFar }, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['source'], where: { createdAt: lastWeekSoFar }, _count: { _all: true } }),
      this.prisma.lead.findMany({ where: { createdAt: { gte: trendFrom, lt: p.todayEnd } }, select: { createdAt: true } }),
      this.prisma.callLog.count({ where: { calledAt: sinceYesterday } }),
      this.prisma.callLog.count({ where: { calledAt: yesterdaySoFar } }),
      this.prisma.callLog.groupBy({ by: ['leadId'], where: { calledAt: { gte: p.todayStart } } }),
      this.prisma.callLog.groupBy({ by: ['leadId'], where: { calledAt: sinceYesterday } }),
      this.prisma.followUp.count({ where: { scheduledAt: { gte: p.monthStart, lt: p.now }, lead: { assignedToId: { not: null } } } }),
      this.prisma.followUp.count({ where: { scheduledAt: { gte: p.monthStart, lt: p.now }, completedAt: { not: null }, lead: { assignedToId: { not: null } } } }),
      this.prisma.lead.groupBy({ by: ['status'], where: { status: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'] } }, _count: { _all: true } }),
      this.prisma.lead.count({ where: { qualifiedAt: sinceYesterday } }),
      this.prisma.lead.count({ where: { status: 'WON', closedAt: lastMonthSameSpan } }),
      this.prisma.salesOrder.aggregate({
        where: { status: { not: SalesOrderStatus.CANCELLED }, orderDate: { gte: p.prevMonthStartDate, lte: p.prevMonthSameDayDate } },
        _sum: { totalAmount: true },
      }),
      this.prisma.salesOrder.aggregate({
        where: { status: { not: SalesOrderStatus.CANCELLED }, orderDate: { gte: p.prevMonthStartDate, lt: p.monthStartDate } },
        _sum: { totalAmount: true },
      }),
    ]);

    // Leads per business day for the last 14 days (oldest first), zero-filled.
    const days = Array.from({ length: 14 }, (_, i) => businessDate(new Date(p.todayStart.getTime() - (13 - i) * DAY + 12 * 3_600_000)));
    const perDay = new Map(days.map((d) => [d, 0]));
    for (const l of recent) {
      const d = businessDate(l.createdAt);
      if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1);
    }
    const count = (rows: { source: string; _count: { _all: number } }[], source: string) => rows.find((r) => r.source === source)?._count._all ?? 0;
    const sources = [...new Set([...sourcesWeek, ...sourcesLastWeek].map((r) => r.source))]
      .map((source) => ({ source, thisWeek: count(sourcesWeek, source), lastWeek: count(sourcesLastWeek, source) }))
      .sort((a, b) => b.thisWeek - a.thisWeek || b.lastWeek - a.lastWeek);
    const stage = (s: string) => byStage.find((g) => g.status === s)?._count._all ?? 0;

    return {
      leadFlow: {
        today: todayLeads,
        yesterday: yesterdayLeads,
        thisWeek: weekLeads,
        lastWeekSameTime: lastWeekLeads,
        bySource: sources,
        daily: days.map((date) => ({ date, leads: perDay.get(date) ?? 0 })),
      },
      activity: {
        callsToday: already.callsToday,
        callsYesterday,
        callsYesterdaySoFar,
        leadsWorkedToday: workedToday.length,
        leadsWorkedYesterday: workedYesterday.length,
        followUpsDueMonth: dueMonth,
        followUpsDoneMonth: doneMonth,
        followUpCompliance: dueMonth ? doneMonth / dueMonth : null,
      },
      pipeline: {
        active: stage('NEW') + stage('CONTACTED') + stage('QUALIFIED') + stage('QUOTED'),
        stages: (['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'] as const).map((status) => ({ status, leads: stage(status) })),
        qualifiedYesterday,
      },
      revenue: {
        monthToDate: already.revenueMonth.toFixed(2),
        lastMonthSameDays: money(revenueLastMonth._sum.totalAmount),
        lastMonthTotal: money(revenueLastMonthFull._sum.totalAmount),
        wonMonthToDate: already.wonMonth,
        wonLastMonthSameDays: wonLastMonth,
      },
    };
  }

  /** Who is slipping, worst first: the manager's daily reminder list. */
  private accountabilityFlags(
    telecallers: { id: string; fullName: string; notCalled: number; oldestNotCalledAt: Date | null; overdueCallbacks: number }[],
    sales: { id: string; fullName: string; followUpsOverdue: number; noNextStep: number }[],
    now: Date,
  ) {
    type Flag = { severity: 'high' | 'medium'; personId: string; person: string; role: 'Telecaller' | 'Sales'; message: string; count: number; href: string };
    const flags: Flag[] = [];
    const hours = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 3_600_000);
    for (const t of telecallers) {
      if (t.notCalled > 0) {
        const age = t.oldestNotCalledAt ? hours(t.oldestNotCalledAt) : 0;
        flags.push({
          severity: age >= 4 ? 'high' : 'medium',
          personId: t.id,
          person: t.fullName,
          role: 'Telecaller',
          count: t.notCalled,
          message: `${t.notCalled} new lead${t.notCalled === 1 ? '' : 's'} not called yet${age >= 1 ? ` (oldest waiting ${age >= 24 ? `${Math.floor(age / 24)}d` : `${age}h`})` : ''}`,
          href: `/leads?assignedToId=${t.id}&status=NEW`,
        });
      }
      if (t.overdueCallbacks > 0) {
        flags.push({
          severity: t.overdueCallbacks >= 3 ? 'high' : 'medium',
          personId: t.id,
          person: t.fullName,
          role: 'Telecaller',
          count: t.overdueCallbacks,
          message: `${t.overdueCallbacks} callback${t.overdueCallbacks === 1 ? '' : 's'} overdue`,
          href: `/leads?assignedToId=${t.id}`,
        });
      }
    }
    for (const s of sales) {
      if (s.followUpsOverdue > 0) {
        flags.push({
          severity: 'high',
          personId: s.id,
          person: s.fullName,
          role: 'Sales',
          count: s.followUpsOverdue,
          message: `${s.followUpsOverdue} follow-up${s.followUpsOverdue === 1 ? '' : 's'} overdue`,
          href: `/leads?assignedToId=${s.id}`,
        });
      }
      if (s.noNextStep > 0) {
        flags.push({
          severity: 'medium',
          personId: s.id,
          person: s.fullName,
          role: 'Sales',
          count: s.noNextStep,
          message: `${s.noNextStep} open lead${s.noNextStep === 1 ? '' : 's'} with no follow-up planned`,
          href: `/leads?assignedToId=${s.id}`,
        });
      }
    }
    return flags.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'high' ? -1 : 1));
  }

  /** Order value (not cancelled) credited to a salesperson since a date, as a money string. */
  private async revenueSince(fromDate: Date, salespersonId: string) {
    const sum = await this.prisma.salesOrder.aggregate({
      where: { salespersonId, status: { not: SalesOrderStatus.CANCELLED }, orderDate: { gte: fromDate } },
      _sum: { totalAmount: true },
    });
    return money(sum._sum.totalAmount);
  }

  private withNextFollowUp = <T extends { followUps: { id: string; scheduledAt: Date; note: string | null }[] }>({ followUps, ...lead }: T) => ({
    ...lead,
    nextFollowUp: followUps[0] ?? null,
  });
}
