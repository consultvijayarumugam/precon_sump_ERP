import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callKey, formatDuration, leadsByKey, OVERLAP_MS, phoneKey, runCallSync, toUploads, type CallUpload, type RawCall, type SyncDeps, type SyncState } from './call-sync.ts';
import { telNumber } from './phone.ts';

const NOW = 1_800_000_000_000;
const raw = (id: string, overrides: Partial<RawCall> = {}): RawCall => ({ id, number: '09876543210', direction: 'OUTGOING', startedAtMs: NOW - 60_000, durationSeconds: 95, ...overrides });
const LEADS = [{ id: 'lead-1', phone: '+919876543210' }];

function harness(state: SyncState | null, calls: RawCall[] = [], overrides: Partial<SyncDeps> = {}) {
  const log = { state, posted: [] as CallUpload[][], reads: [] as { since: number; keys: string[] }[] };
  const deps: SyncDeps = {
    now: () => NOW,
    loadState: async () => log.state,
    saveState: async (s) => {
      log.state = s;
    },
    fetchLeads: async () => LEADS,
    readCalls: async (since, keys) => {
      log.reads.push({ since, keys });
      return { calls, truncated: false };
    },
    post: async (batch) => {
      log.posted.push(batch);
      return { stored: batch.length };
    },
    toE164: telNumber,
    sent: new Set(),
    ...overrides,
  };
  return { deps, log };
}
const existing = (cursor: number): SyncState => ({ enabledAt: NOW - 30 * OVERLAP_MS, cursor, lastSyncAt: cursor, lastStored: 0 });

test('a number matches however it is written', () => {
  for (const n of ['+91 98765 43210', '09876543210', '919876543210', '9876543210']) assert.equal(phoneKey(n), '9876543210');
});

test('the first sync only starts the clock: no past calls are read', async () => {
  const { deps, log } = harness(null, [raw('1')]);
  assert.deepEqual(await runCallSync(deps), { first: true, found: 0, stored: 0 });
  assert.equal(log.reads.length, 0);
  assert.deepEqual(log.state, { enabledAt: NOW, cursor: NOW, lastSyncAt: NOW, lastStored: 0 });
});

test('only lead numbers are asked for, and only calls since the last sync (with the overlap)', async () => {
  const { deps, log } = harness(existing(NOW - 1000));
  await runCallSync(deps);
  assert.deepEqual(log.reads, [{ since: NOW - 1000 - OVERLAP_MS, keys: ['9876543210'] }]);
});

test('nothing older than when tracking was turned on is ever read', async () => {
  const { deps, log } = harness({ enabledAt: NOW - 5000, cursor: NOW - 1000, lastSyncAt: null, lastStored: 0 });
  await runCallSync(deps);
  assert.equal(log.reads[0].since, NOW - 5000);
});

test('a call is sent with its lead, duration and +91 number, and the cursor moves on', async () => {
  const { deps, log } = harness(existing(NOW - 1000), [raw('7')]);
  assert.deepEqual(await runCallSync(deps), { first: false, found: 1, stored: 1 });
  assert.deepEqual(log.posted[0], [{ deviceCallId: '7', phone: '+919876543210', direction: 'OUTGOING', startedAt: new Date(NOW - 60_000).toISOString(), durationSeconds: 95, leadId: 'lead-1' }]);
  assert.equal(log.state?.cursor, NOW);
});

test('a call already sent this session is not sent again', async () => {
  const call = raw('7');
  const { deps, log } = harness(existing(NOW - 1000), [call], { sent: new Set([callKey(call)]) });
  await runCallSync(deps);
  assert.equal(log.posted.length, 0);
});

test('offline, when the lead list cannot be fetched: the cursor stays and the next sync sends the call', async () => {
  const { deps, log } = harness(existing(NOW - 1000), [raw('7')], {
    fetchLeads: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(runCallSync(deps));
  assert.equal(log.state?.cursor, NOW - 1000);

  deps.fetchLeads = async () => LEADS;
  await runCallSync(deps);
  assert.equal(log.posted.flat().length, 1);
  assert.equal(log.state?.cursor, NOW);
});

test('a failed upload leaves the cursor alone, and a part-sent list resumes without resending', async () => {
  const calls = Array.from({ length: 150 }, (_, i) => raw(String(i)));
  let attempts = 0;
  const { deps, log } = harness(existing(NOW - 1000), calls);
  const post = deps.post;
  deps.post = async (batch) => {
    if (++attempts === 2) throw new Error('offline');
    return post(batch);
  };
  await assert.rejects(runCallSync(deps));
  assert.equal(log.state?.cursor, NOW - 1000);
  assert.equal(log.posted.flat().length, 100);

  await runCallSync(deps);
  assert.equal(log.posted.flat().length, 150);
  assert.equal(new Set(log.posted.flat().map((c) => c.deviceCallId)).size, 150);
});

test('a truncated read only moves the cursor as far as what was read', async () => {
  const calls = [raw('1', { startedAtMs: NOW - 9000 }), raw('2', { startedAtMs: NOW - 8000 })];
  const { deps, log } = harness(existing(NOW - 10_000), [], { readCalls: async () => ({ calls, truncated: true }) });
  await runCallSync(deps);
  assert.equal(log.state?.cursor, NOW - 8000);
});

test('the cursor never moves backwards', async () => {
  const { deps, log } = harness(existing(NOW + 5000));
  await runCallSync(deps);
  assert.equal(log.state?.cursor, NOW + 5000);
});

test('a number with no lead is never sent, even if it reaches this code', () => {
  const leads = leadsByKey(LEADS);
  assert.deepEqual(toUploads([raw('9', { number: '+919000000000' })], leads, new Set(), telNumber), []);
});

test('odd values are cleaned up rather than failing the whole sync', () => {
  const leads = leadsByKey(LEADS);
  const [long, negative] = toUploads([raw('1', { durationSeconds: 999_999 }), raw('2', { durationSeconds: -5 })], leads, new Set(), telNumber);
  assert.equal(long.upload.durationSeconds, 86_400);
  assert.equal(negative.upload.durationSeconds, 0);
  assert.deepEqual(toUploads([raw('3', { startedAtMs: Number.NaN })], leads, new Set(), telNumber), []);
});

test('the same call twice in one read is sent once', () => {
  const call = raw('1');
  assert.equal(toUploads([call, call], leadsByKey(LEADS), new Set(), telNumber).length, 1);
});

test('durations read naturally', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(192), '3m 12s');
  assert.equal(formatDuration(3725), '1h 02m');
});
