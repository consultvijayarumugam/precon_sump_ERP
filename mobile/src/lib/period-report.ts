// GET /dashboards/period: the dashboard numbers for a chosen date range.

export interface PeriodMetrics {
  leadsIn: number;
  callsLogged: number;
  leadsCalled: number;
  qualified: number | null;
  conversionRate: number | null;
  won: number;
  lost: number;
  winRate: number | null;
  revenue: string | null;
  followUpsDue: number;
  followUpsDone: number;
  followUpCompliance: number | null;
  phoneCalls: number;
  connectedCalls: number;
  talkSeconds: number;
  siteVisits: number;
}

export interface PeriodPerson extends PeriodMetrics {
  id: string;
  fullName: string;
  kind: 'telecaller' | 'sales';
}

export interface PeriodReportData {
  from: string;
  to: string;
  scope: 'team' | 'self';
  kind: 'telecaller' | 'sales' | null;
  totals: PeriodMetrics;
  bySource: { source: string; leads: number }[] | null;
  people: PeriodPerson[] | null;
}

export interface Tile {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

/** 0.754 -> '75%'; nothing due -> '–'. */
export const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);

/** '3h 05m', '12m 30s', '45s'; '–' for none. */
export function talk(seconds: number): string {
  if (seconds <= 0) return '–';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** '₹1,25,000' (whole rupees, Indian grouping). */
export const rupees = (amount: string | number) => `₹${Math.round(Number(amount)).toLocaleString('en-IN')}`;

const n = (x: number) => x.toLocaleString('en-IN');

/**
 * The figures to show for a period, by who's looking: the team (admin), a
 * telecaller, or a salesperson. Revenue only when the server sent it and
 * operations (sales orders) are on.
 */
export function periodTiles(report: Pick<PeriodReportData, 'scope' | 'kind' | 'totals'>, opts: { showRevenue: boolean }): Tile[] {
  const t = report.totals;
  const followUps: Tile = { key: 'followUps', label: 'Follow-ups done on time', value: pct(t.followUpCompliance), hint: `${n(t.followUpsDone)} of ${n(t.followUpsDue)} due` };
  const calls: Tile = { key: 'calls', label: 'Calls logged', value: n(t.callsLogged), hint: `${n(t.leadsCalled)} leads called` };
  const talkTime: Tile = { key: 'talk', label: 'Talk-time', value: talk(t.talkSeconds), hint: `${n(t.connectedCalls)} of ${n(t.phoneCalls)} phone calls connected` };
  const won: Tile = { key: 'won', label: 'Won', value: n(t.won), hint: `${n(t.lost)} lost · win rate ${pct(t.winRate)}` };
  const revenue: Tile[] = opts.showRevenue && t.revenue !== null ? [{ key: 'revenue', label: 'Revenue', value: rupees(t.revenue), hint: 'Order value, not cancelled' }] : [];

  if (report.scope === 'team') {
    return [
      { key: 'leads', label: 'New leads', value: n(t.leadsIn) },
      calls,
      { key: 'qualified', label: 'Qualified for sales', value: n(t.qualified ?? 0), hint: `${pct(t.conversionRate)} of new leads` },
      won,
      ...revenue,
      followUps,
      talkTime,
      { key: 'visits', label: 'Site visits', value: n(t.siteVisits) },
    ];
  }
  if (report.kind === 'telecaller') {
    return [
      { key: 'leads', label: 'Leads received', value: n(t.leadsIn) },
      calls,
      { key: 'qualified', label: 'Qualified & handed over', value: n(t.qualified ?? 0), hint: `${pct(t.conversionRate)} of leads received` },
      { ...won, label: 'Won by sales', hint: `From leads you worked · ${n(t.lost)} lost` },
      followUps,
      talkTime,
    ];
  }
  return [
    { key: 'leads', label: 'Leads handed to me', value: n(t.leadsIn) },
    won,
    ...revenue,
    followUps,
    calls,
    talkTime,
    { key: 'visits', label: 'Site visits', value: n(t.siteVisits) },
  ];
}
