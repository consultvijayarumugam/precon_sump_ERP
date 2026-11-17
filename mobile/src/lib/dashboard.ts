// What the role dashboards show on web, for the phone: reminders, pipeline by
// stage, and the full lead list. Mirrors GET /notifications/summary,
// GET /leads/summary and GET /leads.
import type { PipelineStage } from './sales.ts';
import type { LeadStatus, ProductInterest, StageRef } from './workflow.ts';

interface ReminderFollowUp {
  id: string;
  scheduledAt: string;
  note: string | null;
  lead: { id: string; name: string; phone: string };
}

/** "My reminders today" on the web dashboards. */
export interface ReminderSummary {
  overdue: ReminderFollowUp[];
  dueToday: ReminderFollowUp[];
  assignedToday: number;
  handedToday: number;
}

export interface LeadsSummary {
  totalLeads: number;
  openLeads: number;
  leadsByStatus: Record<LeadStatus, number>;
  /** Count per pipeline stage id ("none" for leads without a stage). */
  leadsByStage: Record<string, number>;
  overdueFollowUps: number;
  upcomingFollowUps: number;
}

export interface LeadListItem {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  source: string;
  status: LeadStatus;
  stage: StageRef | null;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  nextFollowUpAt: string | null;
  closedAt: string | null;
}

export interface LeadListPage {
  total: number;
  page: number;
  pageSize: number;
  items: LeadListItem[];
}

/** Reminders as one list: overdue first (late), then the rest of today, in time order. */
export function reminderItems(summary: ReminderSummary) {
  return [...summary.overdue.map((f) => ({ ...f, late: true })), ...summary.dueToday.map((f) => ({ ...f, late: false }))];
}

export const remindersEmpty = (s: ReminderSummary) => s.overdue.length + s.dueToday.length + s.assignedToday + s.handedToday === 0;

export interface PipelineRow {
  id: string;
  name: string;
  isActive: boolean;
  count: number;
}

/**
 * The user's leads per pipeline stage, in the admin's stage order. Switched-off
 * stages show only while they still hold leads, as on the web pipeline strip.
 * `phases` limits it to one side of the pipeline (sales: qualified and quoted).
 */
export function pipelineRows(stages: PipelineStage[], counts: Record<string, number>, phases?: LeadStatus[]): PipelineRow[] {
  return stages
    .filter((s) => !phases || phases.includes(s.phase))
    .map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, count: counts[s.id] ?? 0 }))
    .filter((r) => r.isActive || r.count > 0);
}

/** Filters on the lead list: status chips, as on the web Leads page. */
export const LEAD_FILTERS: { key: string; label: string; status?: LeadStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'NEW', label: 'New', status: 'NEW' },
  { key: 'CONTACTED', label: 'Contacted', status: 'CONTACTED' },
  { key: 'QUALIFIED', label: 'Qualified', status: 'QUALIFIED' },
  { key: 'QUOTED', label: 'Quoted', status: 'QUOTED' },
  { key: 'WON', label: 'Won', status: 'WON' },
  { key: 'LOST', label: 'Lost', status: 'LOST' },
];

/** The query string for one page of the lead list. */
export function leadListQuery({ search, status, stageId, page, pageSize = 30 }: { search?: string; status?: LeadStatus; stageId?: string; page: number; pageSize?: number }) {
  const params: [string, string][] = [];
  const term = search?.trim();
  if (term) params.push(['search', term]);
  if (status) params.push(['status', status]);
  if (stageId) params.push(['stageId', stageId]);
  params.push(['page', String(page)], ['pageSize', String(pageSize)]);
  return `/leads?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
