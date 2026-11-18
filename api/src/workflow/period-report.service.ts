import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { money } from '../finance/finance-utils.js';
import { Prisma, SalesOrderStatus } from '../generated/prisma/client.js';
import { LeadAssignmentService, ROTATIONS } from '../intake/lead-assignment.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { periodRange, rate, type PeriodRange } from './period-range.js';

export type PersonKind = 'telecaller' | 'sales';

/** One set of numbers for a period: the whole team, or one person. */
export interface PeriodMetrics {
  /** Team: leads that came in. Telecaller: leads they received. Sales: leads handed to them. */
  leadsIn: number;
  /** Calls logged with an outcome, and how many different leads they were to. */
  callsLogged: number;
  leadsCalled: number;
  /** Qualified and handed to sales (null for a salesperson). */
  qualified: number | null;
  /** Of the leads that came in during the period, the share qualified so far (null for a salesperson). */
  conversionRate: number | null;
  won: number;
  lost: number;
  /** won / (won + lost) in the period. */
  winRate: number | null;
  /** Order value (not cancelled) by order date; null when the viewer may not see it. */
  revenue: string | null;
  /** Follow-ups that came due in the period (up to now), and how many are done. */
  followUpsDue: number;
  followUpsDone: number;
  followUpCompliance: number | null;
  /** From the phones' call logs (mobile call tracking). */
  phoneCalls: number;
  connectedCalls: number;
  talkSeconds: number;
  siteVisits: number;
}

/**
 * Dashboard numbers for a chosen date range (Today, This week, This month,
 * Last month or custom). Admins (leads.read_all) get team totals, leads by
 * source and a row per telecaller and salesperson; everyone else only their
 * own numbers.
 */
@Injectable()
export class PeriodReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  async report(user: AuthenticatedUser, from?: string, to?: string) {
    const r = periodRange(from, to);
    const range = { from: r.from, to: r.to };
    if (!user.permissions.includes(PERMISSIONS.LEADS_READ_ALL)) {
      const kind: PersonKind = user.permissions.includes(PERMISSIONS.LEADS_RECEIVE_QUALIFIED) ? 'sales' : 'telecaller';
      const mine = await this.person(user.id, kind, r, user.permissions.includes(PERMISSIONS.SALES_READ));
      return { ...range, scope: 'self' as const, kind, totals: mine, bySource: null, people: null };
    }

    const seeRevenue = user.permissions.includes(PERMISSIONS.FINANCE_DASHBOARD) || user.permissions.includes(PERMISSIONS.SALES_READ_ALL);
    const [telecallers, sales] = await Promise.all([this.assignment.members(ROTATIONS.telecallers), this.assignment.members(ROTATIONS.sales)]);
    const [totals, bySource, telecallerRows, salesRows] = await Promise.all([
      this.team(r, seeRevenue),
      this.prisma.lead.groupBy({ by: ['source'], where: { createdAt: { gte: r.start, lt: r.end } }, _count: { _all: true } }),
      Promise.all(telecallers.map(async (t) => ({ id: t.id, fullName: t.fullName, kind: 'telecaller' as const, ...(await this.person(t.id, 'telecaller', r, false)) }))),
      Promise.all(sales.map(async (s) => ({ id: s.id, fullName: s.fullName, kind: 'sales' as const, ...(await this.person(s.id, 'sales', r, seeRevenue)) }))),
    ]);
    return {
      ...range,
      scope: 'team' as const,
      kind: null,
      totals,
      bySource: bySource.map((g) => ({ source: g.source, leads: g._count._all })).sort((a, b) => b.leads - a.leads),
      people: [...telecallerRows, ...salesRows],
    };
  }

  private async team(r: PeriodRange, seeRevenue: boolean): Promise<PeriodMetrics> {
    const created = { gte: r.start, lt: r.end };
    const [leadsIn, convertedIn, rest] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: created } }),
      this.prisma.lead.count({ where: { createdAt: created, qualifiedAt: { not: null } } }),
      this.common(r, {
        calls: {},
        qualified: { qualifiedAt: { gte: r.start, lt: r.end } },
        closed: {},
        followUps: { assignedToId: { not: null } },
        orders: seeRevenue ? {} : null,
        device: {},
        visits: {},
      }),
    ]);
    return { ...rest, leadsIn, conversionRate: rate(convertedIn, leadsIn) };
  }

  private async person(id: string, kind: PersonKind, r: PeriodRange, seeRevenue: boolean): Promise<PeriodMetrics> {
    const created = { gte: r.start, lt: r.end };
    const telecaller = kind === 'telecaller';
    const [leadsIn, convertedIn, rest] = await Promise.all([
      telecaller
        ? this.prisma.lead.count({ where: { telecallerId: id, createdAt: created } })
        : this.prisma.lead.count({ where: { assignedToId: id, qualifiedAt: created } }),
      telecaller ? this.prisma.lead.count({ where: { telecallerId: id, createdAt: created, qualifiedAt: { not: null } } }) : Promise.resolve(0),
      this.common(r, {
        calls: { callerId: id },
        qualified: telecaller ? { qualifiedById: id, qualifiedAt: created } : null,
        // A telecaller's wins are the leads they worked that sales went on to win.
        closed: telecaller ? { telecallerId: id } : { assignedToId: id },
        followUps: { assignedToId: id },
        orders: seeRevenue && !telecaller ? { salespersonId: id } : null,
        device: { userId: id },
        visits: { personId: id },
      }),
    ]);
    return { ...rest, leadsIn, conversionRate: telecaller ? rate(convertedIn, leadsIn) : null };
  }

  /** The counts that work the same way for the team and for one person, given who to filter on. */
  private async common(
    r: PeriodRange,
    f: {
      calls: Prisma.CallLogWhereInput;
      qualified: Prisma.LeadWhereInput | null;
      closed: Prisma.LeadWhereInput;
      followUps: Prisma.LeadWhereInput;
      orders: Prisma.SalesOrderWhereInput | null;
      device: Prisma.DeviceCallWhereInput;
      visits: Prisma.SiteVisitWhereInput;
    },
  ): Promise<Omit<PeriodMetrics, 'leadsIn' | 'conversionRate'>> {
    const span = { gte: r.start, lt: r.end };
    const due = { lead: f.followUps, scheduledAt: { gte: r.start, lt: r.dueUntil } };
    const [callsLogged, leadsCalled, qualified, won, lost, orders, followUpsDue, followUpsDone, device, connectedCalls, siteVisits] = await Promise.all([
      this.prisma.callLog.count({ where: { ...f.calls, calledAt: span } }),
      this.prisma.callLog.groupBy({ by: ['leadId'], where: { ...f.calls, calledAt: span } }),
      f.qualified ? this.prisma.lead.count({ where: f.qualified }) : Promise.resolve(null),
      this.prisma.lead.count({ where: { ...f.closed, status: 'WON', closedAt: span } }),
      this.prisma.lead.count({ where: { ...f.closed, status: 'LOST', closedAt: span } }),
      f.orders
        ? this.prisma.salesOrder.aggregate({
            where: { ...f.orders, status: { not: SalesOrderStatus.CANCELLED }, orderDate: { gte: r.fromDate, lte: r.toDate } },
            _sum: { totalAmount: true },
          })
        : Promise.resolve(null),
      this.prisma.followUp.count({ where: due }),
      this.prisma.followUp.count({ where: { ...due, completedAt: { not: null } } }),
      this.prisma.deviceCall.aggregate({ where: { ...f.device, startedAt: span }, _count: { _all: true }, _sum: { durationSeconds: true } }),
      this.prisma.deviceCall.count({ where: { ...f.device, startedAt: span, durationSeconds: { gt: 0 } } }),
      this.prisma.siteVisit.count({ where: { ...f.visits, checkedInAt: span } }),
    ]);
    return {
      callsLogged,
      leadsCalled: leadsCalled.length,
      qualified,
      won,
      lost,
      winRate: rate(won, won + lost),
      revenue: orders ? money(orders._sum.totalAmount) : null,
      followUpsDue,
      followUpsDone,
      followUpCompliance: rate(followUpsDone, followUpsDue),
      phoneCalls: device._count._all,
      connectedCalls,
      talkSeconds: device._sum.durationSeconds ?? 0,
      siteVisits,
    };
  }
}
