// The salesperson's side of the workflow, mirroring GET /dashboards/sales
// (api/src/workflow/dashboards.service.ts) and web/src/lib/workflow.ts.
import type { LeadStatus, ProductInterest, StageRef } from './workflow.ts';

export interface SalesLead {
  id: string;
  name: string | null;
  phone: string;
  city: string | null;
  source: string;
  status: LeadStatus;
  stage: StageRef | null;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  qualifiedAt: string | null;
  closedAt: string | null;
  qualifiedBy: { id: string; fullName: string } | null;
  nextFollowUp: { id: string; scheduledAt: string; note: string | null } | null;
}

/** One "I'm at site" GPS reading on a lead. */
export interface CheckIn {
  id: string;
  customerName: string;
  notes: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  checkedInAt: string;
  person: { id: string; fullName: string };
  lead: { id: string; name: string | null; phone: string; status: LeadStatus } | null;
}

export interface SalesDashboardData {
  pipeline: { QUALIFIED: number; QUOTED: number; WON: number; LOST: number; wonThisMonth: number; lostThisMonth: number };
  /** Rupees as a decimal string; null when the user can't see revenue (no sales.read tag). */
  revenueThisMonth: string | null;
  handedToday: number;
  /** The sales-side pipeline stages in admin order, with my open leads in each. */
  stages: { id: string; name: string; isActive: boolean; isHandover: boolean; leads: number }[];
  open: SalesLead[];
  closedThisMonth: SalesLead[];
  visits: CheckIn[];
}

export type StageKind = 'ENTRY' | 'MIDDLE' | 'WON' | 'LOST';
export interface PipelineStage {
  id: string;
  name: string;
  kind: StageKind;
  phase: LeadStatus;
  isActive: boolean;
}

export type SalesBucket = 'overdue' | 'today' | 'none' | 'later';
export const SALES_BUCKET_ORDER: SalesBucket[] = ['overdue', 'today', 'none', 'later'];
export const SALES_BUCKET_LABELS: Record<SalesBucket, string> = {
  overdue: 'Overdue follow-ups',
  today: 'Follow-ups due today',
  none: 'No follow-up planned',
  later: 'Follow-ups later',
};

const endOfDay = (now: Date) => {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
};

/** Where an open lead sits in the salesperson's day, by its next follow-up. */
export function salesBucket(lead: Pick<SalesLead, 'nextFollowUp'>, now = new Date()): SalesBucket {
  if (!lead.nextFollowUp) return 'none';
  const at = new Date(lead.nextFollowUp.scheduledAt);
  if (at < now) return 'overdue';
  return at <= endOfDay(now) ? 'today' : 'later';
}

/**
 * The worklist: overdue follow-ups first, then today's, then leads with no
 * next step, then later ones. Within a bucket, soonest follow-up first; leads
 * with none, newest hand-over first.
 */
export function salesSections(leads: SalesLead[], now = new Date()) {
  const byBucket = new Map<SalesBucket, SalesLead[]>(SALES_BUCKET_ORDER.map((b) => [b, []]));
  for (const lead of leads) byBucket.get(salesBucket(lead, now))!.push(lead);
  const at = (l: SalesLead) => l.nextFollowUp?.scheduledAt ?? '';
  const handed = (l: SalesLead) => l.qualifiedAt ?? '';
  return SALES_BUCKET_ORDER.map((bucket) => ({
    bucket,
    title: SALES_BUCKET_LABELS[bucket],
    data: byBucket.get(bucket)!.sort((a, b) => (bucket === 'none' ? handed(b).localeCompare(handed(a)) : at(a).localeCompare(at(b)))),
  })).filter((s) => s.data.length > 0);
}

/** The numbers at the top of the salesperson's screen. */
export function salesCounts(data: SalesDashboardData, now = new Date()) {
  const buckets = data.open.map((l) => salesBucket(l, now));
  return {
    open: data.pipeline.QUALIFIED + data.pipeline.QUOTED,
    dueToday: buckets.filter((b) => b === 'today').length,
    overdue: buckets.filter((b) => b === 'overdue').length,
    wonThisMonth: data.pipeline.wonThisMonth,
  };
}

/** Stages a salesperson can move a lead to: the sales-side middle stages, Won and Lost (switched-off ones only if the lead is in it). */
export function salesStages(stages: PipelineStage[], currentId: string | null): PipelineStage[] {
  return stages.filter(
    (s) => (s.isActive || s.id === currentId) && (s.kind === 'WON' || s.kind === 'LOST' || (s.kind === 'MIDDLE' && (s.phase === 'QUALIFIED' || s.phase === 'QUOTED'))),
  );
}

/** "₹1,25,000" (Indian grouping, no paise). */
export function formatRupees(amount: string | number): string {
  const n = Math.round(Number(amount));
  const digits = String(Math.abs(n));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}₹${rest ? `${rest},${last3}` : last3}`;
}

/** A free OpenStreetMap link to a point (no Google Maps). */
export const osmLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

/**
 * The Pipeline tab: my open leads under each sales stage, in the admin's stage
 * order. Within a stage, overdue and soonest follow-ups first. Leads whose
 * stage isn't in the list (none set, or a stage since removed) come last.
 */
export function leadsByStage(stages: SalesDashboardData['stages'], leads: SalesLead[]) {
  const known = new Set(stages.map((s) => s.id));
  const order = (l: SalesLead) => l.nextFollowUp?.scheduledAt ?? '9999';
  const sorted = [...leads].sort((a, b) => order(a).localeCompare(order(b)));
  const groups = stages
    .map((s) => ({ key: s.id, title: s.name, isActive: s.isActive, data: sorted.filter((l) => l.stage?.id === s.id) }))
    .filter((g) => g.data.length > 0);
  const other = sorted.filter((l) => !l.stage || !known.has(l.stage.id));
  if (other.length) groups.push({ key: 'other', title: 'Other', isActive: true, data: other });
  return groups;
}
