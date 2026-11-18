// Date ranges for the lists' date filter and the dashboards' "results for a
// period", as on the web: presets (Today ... All time) or a custom from/to.
import type { LeadStatus } from './workflow.ts';

/** Both ends are calendar days (YYYY-MM-DD, inclusive); none = all time. */
export interface DateRange {
  preset: PresetKey | 'custom';
  from?: string;
  to?: string;
}

export type PresetKey = 'today' | 'week' | 'month' | 'lastMonth' | 'all';

export const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  lastMonth: 'Last month',
  all: 'All time',
};

/** The lists' filter offers All time; a dashboard always covers some period. */
export const LIST_PRESETS: PresetKey[] = ['all', 'today', 'week', 'month', 'lastMonth'];
export const DASHBOARD_PRESETS: PresetKey[] = ['today', 'week', 'month', 'lastMonth'];

export const ALL_TIME: DateRange = { preset: 'all' };

/** YYYY-MM-DD of a date in the phone's local time. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The days a preset covers (weeks start on Monday). */
export function presetRange(key: PresetKey, now = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case 'today':
      return { preset: key, from: dayKey(now), to: dayKey(now) };
    case 'week': {
      const monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
      return { preset: key, from: dayKey(monday), to: dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
    }
    case 'month':
      return { preset: key, from: dayKey(new Date(y, m, 1)), to: dayKey(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { preset: key, from: dayKey(new Date(y, m - 1, 1)), to: dayKey(new Date(y, m, 0)) };
    default:
      return ALL_TIME;
  }
}

/** A custom range from two picked days, in order (they may be picked backwards). */
export function customRange(a: Date, b: Date): DateRange {
  const [from, to] = [dayKey(a), dayKey(b)].sort();
  return { preset: 'custom', from, to };
}

const fmt = (k: string, year: boolean) =>
  new Date(`${k}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });

/** "This month", "Today", "1 Sep – 30 Sep 2026", "All time". */
export function rangeLabel(r: DateRange): string {
  if (r.preset !== 'custom') return PRESET_LABELS[r.preset];
  if (!r.from || !r.to) return 'All time';
  if (r.from === r.to) return fmt(r.from, true);
  return `${fmt(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4))} – ${fmt(r.to, true)}`;
}

/** Whether an instant falls on one of the range's days (local time). No date = only in "all time". */
export function inRange(at: string | null | undefined, r: DateRange): boolean {
  if (r.preset === 'all') return true;
  if (!at) return false;
  const day = dayKey(new Date(at));
  return (!r.from || day >= r.from) && (!r.to || day <= r.to);
}

/**
 * The lead list's date filter, combined with its status filter: Won and Lost
 * leads by the day they closed, everything else by the day it was added.
 */
export function leadDateParams(r: DateRange, status?: LeadStatus): [string, string][] {
  if (r.preset === 'all') return [];
  const closed = status === 'WON' || status === 'LOST';
  const params: [string, string][] = [];
  if (r.from) params.push([closed ? 'wonFrom' : 'createdFrom', r.from]);
  if (r.to) params.push([closed ? 'wonTo' : 'createdTo', r.to]);
  return params;
}

/** What the date filter means on the lead list, for its label. */
export const leadDateNoun = (status?: LeadStatus) => (status === 'WON' ? 'won' : status === 'LOST' ? 'closed' : 'added');
