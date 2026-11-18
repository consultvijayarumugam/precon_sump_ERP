// Connects the sync rules (lib/call-sync.ts) to the phone, the server and storage.
import * as SecureStore from 'expo-secure-store';
import { checkCallPermission } from './call-permission';
import { readCallLog } from './call-log-native';
import { CallUpload, LeadNumber, mergePrompts, OutcomePrompt, runCallSync, SyncState } from './lib/call-sync';
import { telNumber } from './lib/phone';
import type { RequestOptions } from './api';

type Api = <T>(path: string, options?: RequestOptions) => Promise<T>;

export type SyncResult = { status: 'done'; stored: number; found: number; toLog: OutcomePrompt[] } | { status: 'off' } | { status: 'failed'; message: string };

const stateKey = (userId: string) => `precon.callSync.${userId}`;
const sentByUser = new Map<string, Set<string>>();
let running: Promise<SyncResult> | null = null;
let callPlaced = false;

export async function getSyncState(userId: string): Promise<SyncState | null> {
  try {
    const saved = await SecureStore.getItemAsync(stateKey(userId));
    return saved ? (JSON.parse(saved) as SyncState) : null;
  } catch {
    return null;
  }
}

async function run(api: Api, userId: string): Promise<SyncResult> {
  if ((await checkCallPermission()) !== 'granted') {
    // Forget the position, so turning tracking back on never reads the time it was off.
    await SecureStore.deleteItemAsync(stateKey(userId)).catch(() => undefined);
    return { status: 'off' };
  }
  let sent = sentByUser.get(userId);
  if (!sent) sentByUser.set(userId, (sent = new Set()));
  try {
    const result = await runCallSync({
      now: Date.now,
      loadState: () => getSyncState(userId),
      saveState: (state) => SecureStore.setItemAsync(stateKey(userId), JSON.stringify(state)),
      fetchLeads: async () => (await api<{ leads: LeadNumber[] }>('/device-calls/lead-numbers')).leads,
      readCalls: readCallLog,
      post: (calls: CallUpload[]) => api<{ stored: number; toLog?: OutcomePrompt[] }>('/device-calls/sync', { method: 'POST', body: { calls } }),
      toE164: telNumber,
      sent,
    });
    if (result.toLog.length) await addPrompts(userId, result.toLog);
    return { status: 'done', stored: result.stored, found: result.found, toLog: result.toLog };
  } catch (err) {
    return { status: 'failed', message: err instanceof Error ? err.message : 'Could not sync calls.' };
  }
}

/** Sends new calls. Never throws, and overlapping requests share one run. */
export function syncCalls(api: Api, userId: string): Promise<SyncResult> {
  running ??= run(api, userId).finally(() => {
    running = null;
  });
  return running;
}

/** Called when the app opens the dialer, so the return to the app knows to look for the finished call. */
export function markCallPlaced() {
  callPlaced = true;
}

export function consumeCallPlaced() {
  const placed = callPlaced;
  callPlaced = false;
  return placed;
}

// --- Incoming calls waiting for "How did the call go?" ------------------------
// Kept on the phone per user, so closing the app before answering doesn't lose
// one (the server only reports each call once, when it's first synced).

const MAX_PROMPTS = 10;
const promptsKey = (userId: string) => `precon.callPrompts.${userId}`;
const promptListeners = new Set<() => void>();

export async function getPrompts(userId: string): Promise<OutcomePrompt[]> {
  try {
    const saved = await SecureStore.getItemAsync(promptsKey(userId));
    return saved ? (JSON.parse(saved) as OutcomePrompt[]) : [];
  } catch {
    return [];
  }
}

async function savePrompts(userId: string, prompts: OutcomePrompt[]) {
  await SecureStore.setItemAsync(promptsKey(userId), JSON.stringify(prompts.slice(0, MAX_PROMPTS))).catch(() => undefined);
  for (const listener of promptListeners) listener();
}

async function addPrompts(userId: string, incoming: OutcomePrompt[]) {
  await savePrompts(userId, mergePrompts(await getPrompts(userId), incoming));
}

/** Done with one (logged, or skipped). */
export async function removePrompt(userId: string, prompt: OutcomePrompt) {
  const left = (await getPrompts(userId)).filter((p) => !(p.leadId === prompt.leadId && p.startedAt === prompt.startedAt));
  await savePrompts(userId, left);
}

export function onPromptsChanged(listener: () => void) {
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
  };
}
