// Connects the sync rules (lib/call-sync.ts) to the phone, the server and storage.
import * as SecureStore from 'expo-secure-store';
import { checkCallPermission } from './call-permission';
import { readCallLog } from './call-log-native';
import { CallUpload, LeadNumber, runCallSync, SyncState } from './lib/call-sync';
import { telNumber } from './lib/phone';
import type { RequestOptions } from './api';

type Api = <T>(path: string, options?: RequestOptions) => Promise<T>;

export type SyncResult = { status: 'done'; stored: number; found: number } | { status: 'off' } | { status: 'failed'; message: string };

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
      post: (calls: CallUpload[]) => api<{ stored: number }>('/device-calls/sync', { method: 'POST', body: { calls } }),
      toE164: telNumber,
      sent,
    });
    return { status: 'done', stored: result.stored, found: result.found };
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
