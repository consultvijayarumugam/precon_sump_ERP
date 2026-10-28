import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { LeadSource, LeadStatus, Prisma, SalesOrderStatus } from '../generated/prisma/client.js';
import { LeadAssignmentService, ROTATIONS, businessDayRange } from '../intake/lead-assignment.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { businessDate } from '../workflow/business-periods.js';

export type ColumnKind = 'text' | 'number' | 'percent' | 'money';
export interface Column {
  key: string;
  label: string;
  kind: ColumnKind;
}
type Cell = string | number | null;
export interface Report {
  key: ReportKey;
  title: string;
  description: string;
  scope: 'all' | 'own';
  from: string;
  to: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  totals: Record<string, Cell> | null;
}

export const REPORT_KEYS = ['leads-by-source', 'telecallers', 'pipeline', 'revenue', 'follow-ups'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

const TITLES: Record<ReportKey, { title: string; description: string }> = {
  'leads-by-source': { title: 'Leads by source', description: 'Leads created in the period, by where they came from, and how many went on to be qualified and won.' },
  telecallers: { title: 'Leads & conversion per telecaller', description: 'Leads each telecaller received in the period, calls made, and how many they qualified.' },
  pipeline: { title: 'Pipeline status breakdown', description: 'Where the leads created in the period stand now.' },
  revenue: { title: 'Revenue by salesperson', description: 'Order value (not cancelled) by order date, and leads won in the period.' },
  'follow-ups': { title: 'Follow-up compliance', description: 'Follow-ups that came due in the period (up to now): done, done within 24 hours, still open.' },
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  META: 'Meta (Facebook)',
  MANUAL: 'Manual',
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  OTHER: 'Other',
  API: 'External system (API)',
};
const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  QUOTED: 'Quoted',
  WON: 'Won',
  LOST: 'Lost',
};
const PAST_QUALIFIED: LeadStatus[] = ['QUALIFIED', 'QUOTED', 'WON'];
const DAY = 86_400_000;

const rate = (part: number, whole: number) => (whole ? part / whole : null);

/**
 * CRM reports with a date range, as tables, exportable to CSV and Excel.
 * reports.view_all sees everyone; reports.view sees only rows about you.
 * Revenue also needs a sales/finance tag (sales.read for your own,
 * sales.read_all or finance.dashboard for everyone's).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  /** The reports this user can open. */
  available(user: AuthenticatedUser) {
    return REPORT_KEYS.filter((k) => this.allowed(user, k)).map((key) => ({ key, ...TITLES[key], scope: this.scopeOf(user) }));
  }

  async run(user: AuthenticatedUser, key: string, range: { from?: string; to?: string }): Promise<Report> {
    if (!(REPORT_KEYS as readonly string[]).includes(key)) throw new NotFoundException('No such report');
    const k = key as ReportKey;
    if (!this.allowed(user, k)) throw new ForbiddenException('You are not allowed to see this report');
    const today = businessDate();
    const from = range.from ?? `${today.slice(0, 7)}-01`;
    const to = range.to ?? today;
    if (to < from) throw new BadRequestException('"to" is before "from"');
    const start = businessDayRange(from).start;
    const end = businessDayRange(to).end;
    if (end.getTime() - start.getTime() > 3 * 366 * DAY) throw new BadRequestException('Pick a range of at most 3 years');

    const scope = this.scopeOf(user);
    const ctx = { user, scope, start, end, from, to };
    const body =
      k === 'leads-by-source'
        ? await this.leadsBySource(ctx)
        : k === 'telecallers'
          ? await this.telecallers(ctx)
          : k === 'pipeline'
            ? await this.pipeline(ctx)
            : k === 'revenue'
              ? await this.revenue(ctx)
              : await this.followUps(ctx);
    return { key: k, ...TITLES[k], scope, from, to, ...body };
  }

  // --- Export ------------------------------------------------------------------------

  async export(report: Report, format: 'csv' | 'xlsx'): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    const fileName = `precon-${report.key}-${report.from}-to-${report.to}.${format}`;
    const rows = report.totals ? [...report.rows, report.totals] : report.rows;
    if (format === 'csv') {
      const escape = (v: Cell) => {
        const text = v === null ? '' : String(v);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const value = (c: Column, v: Cell) => (v === null ? null : c.kind === 'percent' ? Math.round(Number(v) * 1000) / 10 : v);
      const header = report.columns.map((c) => escape(c.kind === 'percent' ? `${c.label} (%)` : c.label)).join(',');
      const lines = rows.map((r) => report.columns.map((c) => escape(value(c, r[c.key] ?? null))).join(','));
      // BOM so Excel opens UTF-8 (₹, ·) correctly.
      return { body: Buffer.from('﻿' + [header, ...lines].join('\r\n') + '\r\n', 'utf8'), contentType: 'text/csv; charset=utf-8', fileName };
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(report.title.slice(0, 31));
    ws.addRow([report.title]).font = { bold: true, size: 14 };
    ws.addRow([`${report.from} to ${report.to}${report.scope === 'own' ? ' · your own data' : ''}`]);
    ws.addRow([]);
    const header = ws.addRow(report.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEFD' } }));
    for (const r of rows) {
      const row = ws.addRow(report.columns.map((c) => (c.kind === 'money' && r[c.key] !== null ? Number(r[c.key]) : r[c.key])));
      if (r === report.totals) row.font = { bold: true };
    }
    report.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(12, c.label.length + 4, i === 0 ? 24 : 0);
      if (c.kind === 'money') col.numFmt = '"₹"#,##0.00';
      if (c.kind === 'percent') col.numFmt = '0.0%';
    });
    return {
      body: Buffer.from(await wb.xlsx.writeBuffer()),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
    };
  }

  // --- The reports ------------------------------------------------------------------

  private async leadsBySource(ctx: Ctx) {
    const leads = await this.prisma.lead.findMany({
      where: { AND: [this.ownLeads(ctx), { createdAt: { gte: ctx.start, lt: ctx.end } }] },
      select: { source: true, status: true, qualifiedAt: true },
    });
    const rows = (Object.keys(SOURCE_LABELS) as LeadSource[])
      .map((source) => {
        const mine = leads.filter((l) => l.source === source);
        const qualified = mine.filter((l) => l.qualifiedAt || PAST_QUALIFIED.includes(l.status)).length;
        const won = mine.filter((l) => l.status === 'WON').length;
        return {
          source: SOURCE_LABELS[source],
          leads: mine.length,
          qualified,
          won,
          lost: mine.filter((l) => l.status === 'LOST').length,
          qualifiedRate: rate(qualified, mine.length),
          winRate: rate(won, mine.length),
        };
      })
      .filter((r) => r.leads > 0)
      .sort((a, b) => b.leads - a.leads);
    const sum = (k: 'leads' | 'qualified' | 'won' | 'lost') => rows.reduce((n, r) => n + r[k], 0);
    return {
      columns: [
        col('source', 'Source', 'text'),
        col('leads', 'Leads', 'number'),
        col('qualified', 'Qualified', 'number'),
        col('won', 'Won', 'number'),
        col('lost', 'Lost', 'number'),
        col('qualifiedRate', 'Qualified rate', 'percent'),
        col('winRate', 'Win rate', 'percent'),
      ],
      rows,
      totals: rows.length
        ? { source: 'Total', leads: sum('leads'), qualified: sum('qualified'), won: sum('won'), lost: sum('lost'), qualifiedRate: rate(sum('qualified'), sum('leads')), winRate: rate(sum('won'), sum('leads')) }
        : null,
    };
  }

  private async telecallers(ctx: Ctx) {
    const inRange = { gte: ctx.start, lt: ctx.end };
    let people: { id: string; fullName: string }[];
    if (ctx.scope === 'own') {
      people = [{ id: ctx.user.id, fullName: ctx.user.fullName }];
    } else {
      const members = await this.assignment.members(ROTATIONS.telecallers);
      const workedIds = (await this.prisma.lead.groupBy({ by: ['telecallerId'], where: { telecallerId: { not: null }, createdAt: inRange } })).map((g) => g.telecallerId!);
      const extra = workedIds.filter((id) => !members.some((m) => m.id === id));
      const extraUsers = extra.length ? await this.prisma.user.findMany({ where: { id: { in: extra } }, select: { id: true, fullName: true } }) : [];
      people = [...members.map((m) => ({ id: m.id, fullName: m.fullName })), ...extraUsers].sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    const rows = await Promise.all(
      people.map(async (p) => {
        const received = { telecallerId: p.id, createdAt: inRange };
        const [leads, calls, contacted, qualifiedFromReceived, qualified, lost] = await Promise.all([
          this.prisma.lead.count({ where: received }),
          this.prisma.callLog.count({ where: { callerId: p.id, calledAt: inRange } }),
          this.prisma.lead.count({ where: { ...received, calls: { some: {} } } }),
          this.prisma.lead.count({ where: { ...received, qualifiedAt: { not: null } } }),
          this.prisma.lead.count({ where: { qualifiedById: p.id, qualifiedAt: inRange } }),
          this.prisma.lead.count({ where: { ...received, status: 'LOST' } }),
        ]);
        return { telecaller: p.fullName, received: leads, calls, contacted, qualified, lost, contactRate: rate(contacted, leads), conversion: rate(qualifiedFromReceived, leads) };
      }),
    );
    const sum = (k: 'received' | 'calls' | 'contacted' | 'qualified' | 'lost') => rows.reduce((n, r) => n + r[k], 0);
    return {
      columns: [
        col('telecaller', 'Telecaller', 'text'),
        col('received', 'Leads received', 'number'),
        col('calls', 'Calls logged', 'number'),
        col('contacted', 'Leads called', 'number'),
        col('qualified', 'Qualified', 'number'),
        col('lost', 'Lost', 'number'),
        col('contactRate', 'Called rate', 'percent'),
        col('conversion', 'Conversion (of received)', 'percent'),
      ],
      rows,
      totals:
        rows.length > 1
          ? { telecaller: 'Total', received: sum('received'), calls: sum('calls'), contacted: sum('contacted'), qualified: sum('qualified'), lost: sum('lost'), contactRate: rate(sum('contacted'), sum('received')), conversion: null }
          : null,
    };
  }

  private async pipeline(ctx: Ctx) {
    const groups = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { AND: [this.ownLeads(ctx), { createdAt: { gte: ctx.start, lt: ctx.end } }] },
      _count: { _all: true },
    });
    const total = groups.reduce((n, g) => n + g._count._all, 0);
    const rows = (Object.keys(STATUS_LABELS) as LeadStatus[]).map((status) => {
      const count = groups.find((g) => g.status === status)?._count._all ?? 0;
      return { status: STATUS_LABELS[status], leads: count, share: rate(count, total) };
    });
    return {
      columns: [col('status', 'Status', 'text'), col('leads', 'Leads', 'number'), col('share', 'Share', 'percent')],
      rows,
      totals: { status: 'Total', leads: total, share: total ? 1 : null },
    };
  }

  private async revenue(ctx: Ctx) {
    const fromDate = new Date(`${ctx.from}T00:00:00Z`);
    const toDate = new Date(`${ctx.to}T00:00:00Z`);
    const own = ctx.scope === 'own' || !this.canSeeAllRevenue(ctx.user);
    const where: Prisma.SalesOrderWhereInput = {
      status: { not: SalesOrderStatus.CANCELLED },
      orderDate: { gte: fromDate, lte: toDate },
      ...(own ? { salespersonId: ctx.user.id } : {}),
    };
    const grouped = await this.prisma.salesOrder.groupBy({ by: ['salespersonId'], where, _sum: { totalAmount: true }, _count: { _all: true } });
    const ids = own ? [ctx.user.id] : grouped.map((g) => g.salespersonId);
    const [users, won] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }),
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { status: 'WON', closedAt: { gte: ctx.start, lt: ctx.end }, ...(own ? { assignedToId: ctx.user.id } : {}) },
        _count: { _all: true },
      }),
    ]);
    const rows = ids
      .map((id) => {
        const g = grouped.find((x) => x.salespersonId === id);
        const revenue = g?._sum.totalAmount ?? new Prisma.Decimal(0);
        const orders = g?._count._all ?? 0;
        return {
          salesperson: users.find((u) => u.id === id)?.fullName ?? 'Unknown',
          orders,
          revenue: revenue.toFixed(2),
          averageOrder: orders ? revenue.dividedBy(orders).toFixed(2) : null,
          wonLeads: won.find((w) => w.assignedToId === id)?._count._all ?? 0,
        };
      })
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));
    const totalRevenue = grouped.reduce((d, g) => d.plus(g._sum.totalAmount ?? 0), new Prisma.Decimal(0));
    const totalOrders = rows.reduce((n, r) => n + r.orders, 0);
    return {
      columns: [
        col('salesperson', 'Salesperson', 'text'),
        col('orders', 'Orders', 'number'),
        col('revenue', 'Revenue', 'money'),
        col('averageOrder', 'Average order', 'money'),
        col('wonLeads', 'Leads won', 'number'),
      ],
      rows,
      totals:
        rows.length > 1
          ? {
              salesperson: 'Total',
              orders: totalOrders,
              revenue: totalRevenue.toFixed(2),
              averageOrder: totalOrders ? totalRevenue.dividedBy(totalOrders).toFixed(2) : null,
              wonLeads: rows.reduce((n, r) => n + r.wonLeads, 0),
            }
          : null,
    };
  }

  private async followUps(ctx: Ctx) {
    const now = new Date();
    const until = ctx.end < now ? ctx.end : now;
    const followUps = await this.prisma.followUp.findMany({
      where: {
        scheduledAt: { gte: ctx.start, lt: until },
        lead: ctx.scope === 'own' ? { assignedToId: ctx.user.id } : { assignedToId: { not: null } },
      },
      select: { scheduledAt: true, completedAt: true, lead: { select: { assignedTo: { select: { id: true, fullName: true } } } } },
    });
    const byPerson = new Map<string, { person: string; due: number; done: number; onTime: number; open: number }>();
    if (ctx.scope === 'own') byPerson.set(ctx.user.id, { person: ctx.user.fullName, due: 0, done: 0, onTime: 0, open: 0 });
    for (const f of followUps) {
      const who = f.lead.assignedTo!;
      const row = byPerson.get(who.id) ?? { person: who.fullName, due: 0, done: 0, onTime: 0, open: 0 };
      row.due += 1;
      if (f.completedAt) {
        row.done += 1;
        if (f.completedAt.getTime() - f.scheduledAt.getTime() <= DAY) row.onTime += 1;
      } else row.open += 1;
      byPerson.set(who.id, row);
    }
    const rows = [...byPerson.values()]
      .map((r) => ({ ...r, compliance: rate(r.done, r.due), onTimeRate: rate(r.onTime, r.due) }))
      .sort((a, b) => a.person.localeCompare(b.person));
    const sum = (k: 'due' | 'done' | 'onTime' | 'open') => rows.reduce((n, r) => n + r[k], 0);
    return {
      columns: [
        col('person', 'Person', 'text'),
        col('due', 'Due', 'number'),
        col('done', 'Done', 'number'),
        col('onTime', 'Done within 24h', 'number'),
        col('open', 'Still open (overdue)', 'number'),
        col('compliance', 'Compliance', 'percent'),
        col('onTimeRate', 'On time', 'percent'),
      ],
      rows,
      totals:
        rows.length > 1
          ? { person: 'Total', due: sum('due'), done: sum('done'), onTime: sum('onTime'), open: sum('open'), compliance: rate(sum('done'), sum('due')), onTimeRate: rate(sum('onTime'), sum('due')) }
          : null,
    };
  }

  // --- Access ---------------------------------------------------------------------------

  private scopeOf(user: AuthenticatedUser): 'all' | 'own' {
    return user.permissions.includes(PERMISSIONS.REPORTS_VIEW_ALL) ? 'all' : 'own';
  }

  private allowed(user: AuthenticatedUser, key: ReportKey) {
    const p = user.permissions;
    if (!p.includes(PERMISSIONS.REPORTS_VIEW) && !p.includes(PERMISSIONS.REPORTS_VIEW_ALL)) return false;
    if (key === 'revenue') return this.scopeOf(user) === 'all' ? this.canSeeAllRevenue(user) || p.includes(PERMISSIONS.SALES_READ) : p.includes(PERMISSIONS.SALES_READ);
    return true;
  }

  private canSeeAllRevenue(user: AuthenticatedUser) {
    return user.permissions.includes(PERMISSIONS.FINANCE_DASHBOARD) || user.permissions.includes(PERMISSIONS.SALES_READ_ALL);
  }

  /** Leads that are "about" the user: assigned to them, received by them as telecaller, or qualified by them. */
  private ownLeads(ctx: Ctx): Prisma.LeadWhereInput {
    if (ctx.scope === 'all') return {};
    const id = ctx.user.id;
    return { OR: [{ assignedToId: id }, { telecallerId: id }, { qualifiedById: id }] };
  }
}

interface Ctx {
  user: AuthenticatedUser;
  scope: 'all' | 'own';
  start: Date;
  end: Date;
  from: string;
  to: string;
}

const col = (key: string, label: string, kind: ColumnKind): Column => ({ key, label, kind });
