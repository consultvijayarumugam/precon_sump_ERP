// Follow-ups (the web Follow-ups page and calendar) and the notification feed,
// mirroring GET /follow-ups, POST /follow-ups/:id/complete, GET /notifications.
import type { LeadStatus, ProductInterest, StageRef } from './workflow.ts';
import type { DateRange } from './date-range.ts';

export type FollowUpOutcome = 'CONNECTED' | 'NO_ANSWER' | 'CALL_BACK' | 'INTERESTED' | 'NOT_INTERESTED' | 'QUOTE_SENT' | 'OTHER';

export const FOLLOW_UP_OUTCOMES: FollowUpOutcome[] = ['CONNECTED', 'INTERESTED', 'QUOTE_SENT', 'CALL_BACK', 'NO_ANSWER', 'NOT_INTERESTED', 'OTHER'];

export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  CONNECTED: 'Spoke to them',
  INTERESTED: 'Interested',
  QUOTE_SENT: 'Quote sent',
  CALL_BACK: 'Call back later',
  NO_ANSWER: 'No answer',
  NOT_INTERESTED: 'Not interested',
  OTHER: 'Other',
};

export interface FollowUpWithLead {
  id: string;
  scheduledAt: string;
  note: string | null;
  outcome: FollowUpOutcome | null;
  completedAt: string | null;
  createdBy: { id: string; fullName: string };
  lead: {
    id: string;
    name: string;
    phone: string;
    status: LeadStatus;
    stage: StageRef | null;
    productInterest: ProductInterest | null;
    sumpSizeLitres: number | null;
    assignedTo: { id: string; fullName: string } | null;
  };
}

export type FollowUpTab = 'overdue' | 'upcoming' | 'completed';
export const FOLLOW_UP_TABS: { key: FollowUpTab; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Done' },
];

/** My follow-ups in one state (only leads assigned to me, as on the web page's "mine"). */
export const followUpsPath = (state: FollowUpTab, range?: DateRange, team = false) => {
  const days = range && range.preset !== 'all' ? `${range.from ? `&fromDate=${range.from}` : ''}${range.to ? `&toDate=${range.to}` : ''}` : '';
  // `team` (admin): everyone's; otherwise only follow-ups on leads assigned to me.
  return `/follow-ups?state=${state}${team ? '' : '&assignedTo=me'}${days}`;
};

/** Local calendar day as YYYY-MM-DD (the phone is on India time). */
export function dayKey(at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The weeks shown for a month, Monday first, padded with the neighbouring
 * months' days so every row has 7. `inMonth` marks the month's own days.
 */
export function monthGrid(year: number, month: number): { date: Date; inMonth: boolean }[][] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // days before the 1st, Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(year, month, 1 - offset + w * 7 + d);
      return { date, inMonth: date.getMonth() === month };
    }),
  );
}

/** Follow-ups grouped by their local day, each day in time order. */
export function byDay<T extends { scheduledAt: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
    const key = dayKey(new Date(item.scheduledAt));
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

/** The calendar's request: every follow-up from the grid's first day to the day after its last. */
export function calendarPath(weeks: { date: Date }[][], team = false) {
  const from = weeks[0][0].date;
  const lastDay = weeks[weeks.length - 1][6].date;
  const to = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
  return `/follow-ups?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${team ? '' : '&assignedTo=me'}`;
}

export interface NotificationItem {
  id: string;
  type: 'LEAD_ASSIGNED' | 'LEAD_HANDED_OVER' | 'FOLLOW_UP_DUE' | 'NOTE_ADDED';
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  lead: { id: string; name: string; phone: string } | null;
  followUp: { id: string; scheduledAt: string; note: string | null } | null;
  overdue?: boolean;
}

export interface NotificationFeed {
  unread: number;
  reminders: NotificationItem[];
  updates: NotificationItem[];
}
