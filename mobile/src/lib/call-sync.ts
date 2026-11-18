// The rules of call-log sync, with the phone and network passed in so they're tested without a device.

export type CallDirection = 'OUTGOING' | 'INCOMING' | 'MISSED' | 'REJECTED';

/** One row handed back by the native module (it has already dropped non-lead numbers). */
export interface RawCall {
  id: string;
  number: string;
  direction: CallDirection;
  startedAtMs: number;
  durationSeconds: number;
}

export interface CallLogRead {
  calls: RawCall[];
  truncated: boolean;
}

export interface LeadNumber {
  id: string;
  phone: string;
}

export interface CallUpload {
  deviceCallId: string;
  phone: string;
  direction: CallDirection;
  startedAt: string;
  durationSeconds: number;
  leadId: string;
}

/** An answered incoming call on an open lead that still needs an outcome (the server decides which). */
export interface OutcomePrompt {
  leadId: string;
  leadName: string;
  phone: string;
  startedAt: string;
  durationSeconds: number;
}

/** Kept on the phone, per user. */
export interface SyncState {
  /** When tracking first ran here: nothing older is ever read. */
  enabledAt: number;
  /** Everything up to here has reached the server. Only moves after the server confirms. */
  cursor: number;
  lastSyncAt: number | null;
  lastStored: number;
}

export interface SyncDeps {
  now: () => number;
  loadState: () => Promise<SyncState | null>;
  saveState: (state: SyncState) => Promise<void>;
  fetchLeads: () => Promise<LeadNumber[]>;
  readCalls: (sinceMs: number, numberKeys: string[], limit: number) => Promise<CallLogRead>;
  post: (calls: CallUpload[]) => Promise<{ stored: number; toLog?: OutcomePrompt[] }>;
  toE164: (raw: string) => string | null;
  /** Calls the server already has, this session, so they aren't sent again. */
  sent: Set<string>;
}

/**
 * Android writes a call to the log when it ends, dated when it started. So a
 * call in progress during a sync appears later with an older date: each read
 * looks back this far to catch it. The server ignores anything it already has.
 */
export const OVERLAP_MS = 2 * 60 * 60 * 1000;
export const READ_LIMIT = 1000;
export const BATCH_SIZE = 100;
const MAX_DURATION_SECONDS = 86_400;
const PHONE_PATTERN = /^\+?\d{3,15}$/;

/** Same rule as the native module and the API: the last 10 digits identify a number. */
export const phoneKey = (phone: string) => phone.replace(/\D/g, '').slice(-10);

export function leadsByKey(leads: LeadNumber[]) {
  const map = new Map<string, string>();
  for (const lead of leads) {
    const key = phoneKey(lead.phone);
    if (key.length >= 3 && !map.has(key)) map.set(key, lead.id); // leads arrive newest first
  }
  return map;
}

export const callKey = (call: { id: string; startedAtMs: number }) => `${call.id}@${call.startedAtMs}`;

/** Calls worth sending: on a lead, well-formed, and not sent already. */
export function toUploads(calls: RawCall[], leads: Map<string, string>, sent: Set<string>, toE164: SyncDeps['toE164']) {
  const seen = new Set<string>();
  const uploads: { key: string; upload: CallUpload }[] = [];
  for (const call of calls) {
    const key = callKey(call);
    const leadId = leads.get(phoneKey(call.number));
    const phone = toE164(call.number);
    if (!leadId || !phone || !PHONE_PATTERN.test(phone) || !Number.isFinite(call.startedAtMs) || sent.has(key) || seen.has(key)) continue;
    seen.add(key);
    uploads.push({
      key,
      upload: {
        deviceCallId: call.id,
        phone,
        direction: call.direction,
        startedAt: new Date(call.startedAtMs).toISOString(),
        durationSeconds: Math.min(Math.max(0, Math.round(call.durationSeconds) || 0), MAX_DURATION_SECONDS),
        leadId,
      },
    });
  }
  return uploads;
}

/**
 * One sync. Nothing is kept in a separate offline queue: the phone's call log
 * is the queue. If anything fails this throws and the cursor stays put, so the
 * same calls are read and sent next time.
 */
export async function runCallSync(deps: SyncDeps): Promise<{ first: boolean; found: number; stored: number; toLog: OutcomePrompt[] }> {
  const startedAt = deps.now();
  const state = await deps.loadState();
  if (!state) {
    await deps.saveState({ enabledAt: startedAt, cursor: startedAt, lastSyncAt: startedAt, lastStored: 0 });
    return { first: true, found: 0, stored: 0, toLog: [] };
  }

  const leads = leadsByKey(await deps.fetchLeads());
  const since = Math.max(state.enabledAt, state.cursor - OVERLAP_MS);
  const read = await deps.readCalls(since, [...leads.keys()], READ_LIMIT);
  const uploads = toUploads(read.calls, leads, deps.sent, deps.toE164);

  let stored = 0;
  const toLog: OutcomePrompt[] = [];
  for (let i = 0; i < uploads.length; i += BATCH_SIZE) {
    const batch = uploads.slice(i, i + BATCH_SIZE);
    const result = await deps.post(batch.map((u) => u.upload));
    stored += result.stored;
    toLog.push(...(result.toLog ?? [])); // an older server sends none
    for (const u of batch) deps.sent.add(u.key);
  }

  const reachedTo = read.truncated ? (read.calls.at(-1)?.startedAtMs ?? state.cursor) : startedAt;
  await deps.saveState({ ...state, cursor: Math.max(state.cursor, reachedTo), lastSyncAt: startedAt, lastStored: stored });
  return { first: false, found: read.calls.length, stored, toLog: latestPerLead(toLog) };
}

/** "Ravi called you at 3:40 pm, 18 Nov · you talked 3m 12s" (above the outcome form for an incoming call). */
export function incomingCallLine(name: string, call: { calledAt: string; durationSeconds: number }): string {
  const at = new Date(call.calledAt)
    .toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' })
    .replace(/\b(AM|PM)\b/gi, (m) => m.toLowerCase());
  return `${name} called you at ${at} · you talked ${formatDuration(call.durationSeconds)}`;
}

/** "3m 12s", "45s", "1h 02m" */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** One prompt per lead (its latest call), newest first: batches can each return one for the same lead. */
export function latestPerLead(prompts: OutcomePrompt[]): OutcomePrompt[] {
  const byLead = new Map<string, OutcomePrompt>();
  for (const p of prompts) {
    const seen = byLead.get(p.leadId);
    if (!seen || seen.startedAt < p.startedAt) byLead.set(p.leadId, p);
  }
  return [...byLead.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Prompts waiting on the phone plus new ones, without asking twice about the same call. */
export function mergePrompts(waiting: OutcomePrompt[], incoming: OutcomePrompt[]): OutcomePrompt[] {
  const key = (p: OutcomePrompt) => `${p.leadId}@${p.startedAt}`;
  const have = new Set(waiting.map(key));
  return latestPerLead([...waiting, ...incoming.filter((p) => !have.has(key(p)))]);
}
