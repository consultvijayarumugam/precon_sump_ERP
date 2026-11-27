// What the role dashboards show on web, for the phone: reminders, pipeline by
// stage, and the full lead list. Mirrors GET /notifications/summary,
// GET /leads/summary and GET /leads.
import type { PipelineStage } from './sales.ts';
import type { LeadStatus, ProductInterest, StageRef } from './workflow.ts';

interface ReminderFollowUp {
  id: string;
  scheduledAt: string;
  note: string | null;
  lead: { id: string; name: string | null; phone: string };
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
  name: string | null;
  phone: string;
  city: string | null;
  source: string;
  status: LeadStatus;
  stage: StageRef | null;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  nextFollowUpAt: string | null;
  closedAt: string | null;
  /** Who has it now (null = nobody: no telecaller was taking leads when it arrived). */
  assignedTo: { id: string; fullName: string } | null;
}

/** The "who has it" line on a lead list row: you, someone else, or nobody (a warning). */
export function ownerLine(lead: Pick<LeadListItem, 'assignedTo'>, meId: string): { text: string; warn: boolean } {
  if (!lead.assignedTo) return { text: 'Not assigned to anyone', warn: true };
  if (lead.assignedTo.id === meId) return { text: 'Assigned to you', warn: false };
  return { text: `With ${lead.assignedTo.fullName}`, warn: false };
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

/**
 * The query string for one page of the lead list. `dates`: the date filter's
 * params (see leadDateParams in date-range.ts), so it combines with the stage and status filters.
 */
/**
 * How many leads each stage holds under the list's other filters (GET /leads/stage-counts):
 * search, dates and person, but not the stage itself.
 */
export function stageCountsQuery({ search, dates = [], assignedToId }: { search?: string; dates?: [string, string][]; assignedToId?: string }) {
  const params: [string, string][] = [];
  const term = search?.trim();
  if (term) params.push(['search', term]);
  params.push(...dates);
  if (assignedToId) params.push(['assignedToId', assignedToId]);
  return `/leads/stage-counts${params.length ? `?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : ''}`;
}

export interface StageCounts {
  total: number;
  stages: { stageId: string | null; count: number }[];
}

/** "RNR · 12" for a stage chip; just the name while counts load or when a count wouldn't match the list. */
export function chipLabel(name: string, counts: StageCounts | null, stageId: string | null): string {
  if (!counts) return name;
  const count = stageId === null ? counts.total : (counts.stages.find((c) => c.stageId === stageId)?.count ?? 0);
  return `${name} · ${count}`;
}

export function leadListQuery({ search, status, stageId, dates = [], page, pageSize = 30 }: { search?: string; status?: LeadStatus; stageId?: string; dates?: [string, string][]; page: number; pageSize?: number }) {
  const params: [string, string][] = [];
  const term = search?.trim();
  if (term) params.push(['search', term]);
  if (status) params.push(['status', status]);
  if (stageId) params.push(['stageId', stageId]);
  params.push(...dates);
  params.push(['page', String(page)], ['pageSize', String(pageSize)]);
  return `/leads?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
