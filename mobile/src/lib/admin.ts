// The admin's phone screens: the master dashboard (GET /dashboards/master) and reports (GET /reports).
import type { ConstructionBreakdown } from './construction.ts';

export interface AttentionFlag {
  severity: 'high' | 'medium';
  personId: string;
  person: string;
  role: 'Telecaller' | 'Sales';
  message: string;
  count: number;
  /** The web's link, e.g. "/leads?assignedToId=…&status=NEW". */
  href: string;
}

/** The parts of the master dashboard the phone shows. */
export interface MasterSummary {
  /** All open leads per construction stage (older servers don't send it). */
  overview?: { pipeline?: { construction?: ConstructionBreakdown } };
  team: { incomingToday: number; callsToday: number; notCalled: number; overdue: number; qualifiedToday: number; wonMonth: number };
  flags: AttentionFlag[];
}

/** A "needs attention" line opens that person's leads (with the web link's filters), titled with their name. */
export function attentionLink(flag: Pick<AttentionFlag, 'href' | 'person' | 'personId'>) {
  const query = new URLSearchParams(flag.href.split('?')[1] ?? '');
  const params: Record<string, string> = { assignedToId: query.get('assignedToId') ?? flag.personId, title: flag.person };
  const status = query.get('status');
  if (status) params.status = status;
  return { pathname: '/leads' as const, params };
}

// --- Reports -----------------------------------------------------------------

export type ColumnKind = 'text' | 'number' | 'money' | 'percent';
export interface ReportColumn {
  key: string;
  label: string;
  kind: ColumnKind;
}
export interface ReportInfo {
  key: string;
  title: string;
  description: string;
  scope: 'all' | 'own';
}
export interface ReportData extends ReportInfo {
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null> | null;
}

/** One report cell as text: "₹1,25,000", "75%", "12", "–". */
export function formatCell(kind: ColumnKind, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '–';
  if (kind === 'money') return `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;
  if (kind === 'percent') return `${Math.round(Number(value) * 100)}%`;
  if (kind === 'number') return Number(value).toLocaleString('en-IN');
  return String(value);
}
