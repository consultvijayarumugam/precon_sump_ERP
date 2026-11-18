// Pure helpers for call-log sync and talk-time reporting (no database, so they're unit tested).
import type { DeviceCallDirection } from '../generated/prisma/client.js';

/**
 * The part of a phone number that identifies it however it was written: the
 * last 10 digits. "+91 98765 43210", "09876543210" and "9876543210" all match.
 */
export const phoneKey = (phone: string) => phone.replace(/\D/g, '').slice(-10);

/** "3m 12s", "45s", "1h 02m" */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

const DIRECTION_WORDS: Record<DeviceCallDirection, string> = {
  OUTGOING: 'Outgoing call',
  INCOMING: 'Incoming call',
  MISSED: 'Missed call',
  REJECTED: 'Rejected call',
};

/** The line on the lead's history. */
export function callSummary(direction: DeviceCallDirection, durationSeconds: number): string {
  const words = DIRECTION_WORDS[direction];
  if (durationSeconds > 0) return `${words}, ${formatDuration(durationSeconds)} (from phone call log)`;
  return direction === 'OUTGOING' ? `${words}, not answered (from phone call log)` : `${words} (from phone call log)`;
}

export const TALK_PERIODS = ['today', 'week', 'month'] as const;
export type TalkPeriod = (typeof TALK_PERIODS)[number];

export interface TalkStats {
  /** Every synced call, answered or not. */
  calls: number;
  /** Calls that actually connected (duration above 0). */
  connected: number;
  /** Effective talk-time: the sum of the durations. */
  talkSeconds: number;
}

export interface PeriodTotal {
  userId: string;
  calls: number;
  connected: number;
  talkSeconds: number;
}

export interface TalkTimeRow extends Record<TalkPeriod, TalkStats> {
  id: string;
  fullName: string;
  /** When this person's phone last sent a new call. Null = it never has. */
  lastSyncAt: Date | null;
}

const emptyStats = (): TalkStats => ({ calls: 0, connected: 0, talkSeconds: 0 });

/** One row per person, including people with no calls, most talk-time this month first. */
export function buildTalkTime(
  people: { id: string; fullName: string }[],
  totals: Record<TalkPeriod, PeriodTotal[]>,
  lastSync: Map<string, Date>,
) {
  const rows = people.map((person) => {
    const row: TalkTimeRow = {
      id: person.id,
      fullName: person.fullName,
      today: emptyStats(),
      week: emptyStats(),
      month: emptyStats(),
      lastSyncAt: lastSync.get(person.id) ?? null,
    };
    for (const period of TALK_PERIODS) {
      const found = totals[period].find((t) => t.userId === person.id);
      if (found) row[period] = { calls: found.calls, connected: found.connected, talkSeconds: found.talkSeconds };
    }
    return row;
  });
  rows.sort((a, b) => b.month.talkSeconds - a.month.talkSeconds || a.fullName.localeCompare(b.fullName));

  const sum = (period: TalkPeriod): TalkStats =>
    rows.reduce(
      (all, r) => ({
        calls: all.calls + r[period].calls,
        connected: all.connected + r[period].connected,
        talkSeconds: all.talkSeconds + r[period].talkSeconds,
      }),
      emptyStats(),
    );
  return { rows, totals: { today: sum('today'), week: sum('week'), month: sum('month') } };
}

/** Answered incoming calls older than this don't ask for an outcome any more (the app was closed for days). */
export const PROMPT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export interface OutcomePrompt {
  leadId: string;
  leadName: string;
  phone: string;
  startedAt: Date;
  durationSeconds: number;
}

/**
 * Which newly synced calls should ask "How did the call go?" on the phone:
 * answered incoming calls on an open lead, from the last two days, that the
 * person hasn't already logged an outcome for since the call started. One per
 * lead (the latest call), newest first.
 */
export function outcomePrompts(
  stored: { leadId: string | null; direction: DeviceCallDirection; durationSeconds: number; startedAt: Date }[],
  openLeads: Map<string, { name: string; phone: string }>,
  lastLoggedAt: Map<string, Date>,
  now: Date,
): OutcomePrompt[] {
  const latest = new Map<string, OutcomePrompt>();
  for (const call of stored) {
    if (call.direction !== 'INCOMING' || call.durationSeconds <= 0 || !call.leadId) continue;
    if (now.getTime() - call.startedAt.getTime() > PROMPT_WINDOW_MS) continue;
    const lead = openLeads.get(call.leadId);
    if (!lead) continue;
    const logged = lastLoggedAt.get(call.leadId);
    if (logged && logged >= call.startedAt) continue;
    const seen = latest.get(call.leadId);
    if (!seen || seen.startedAt < call.startedAt) {
      latest.set(call.leadId, { leadId: call.leadId, leadName: lead.name, phone: lead.phone, startedAt: call.startedAt, durationSeconds: call.durationSeconds });
    }
  }
  return [...latest.values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}
