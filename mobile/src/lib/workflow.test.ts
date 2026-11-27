import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callbackPresets, canHandOver, defaultCallbackFor, toSections, productLabel, wasHandedOver, type WorklistItem } from './workflow.ts';

const item = (id: string, bucket: WorklistItem['bucket']) => ({ id, bucket }) as WorklistItem;

test('the worklist is in call order and skips empty buckets', () => {
  const sections = toSections([item('a', 'later'), item('b', 'new'), item('c', 'overdue'), item('d', 'today'), item('e', 'new')]);
  assert.deepEqual(sections.map((s) => s.bucket), ['overdue', 'today', 'new', 'later']);
  assert.deepEqual(sections[2].data.map((i) => i.id), ['b', 'e']);
});

test('"Today 6 pm" is only offered more than an hour before 6', () => {
  assert.ok(callbackPresets(new Date(2026, 10, 9, 10, 0)).some((p) => p.label === 'Today 6 pm'));
  assert.ok(!callbackPresets(new Date(2026, 10, 9, 17, 30)).some((p) => p.label === 'Today 6 pm'));
});

test('default callback follows the outcome', () => {
  const now = new Date(2026, 10, 9, 10, 0);
  assert.equal(defaultCallbackFor('NO_ANSWER', now)?.getHours(), 11);
  const tomorrow = defaultCallbackFor('CALL_BACK', now);
  assert.equal(tomorrow?.getDate(), 10);
  assert.equal(tomorrow?.getHours(), 11);
  assert.equal(defaultCallbackFor('INTERESTED', now), null);
  assert.equal(defaultCallbackFor('WRONG_NUMBER', now), null);
});

test('product labels', () => {
  assert.equal(productLabel({ productInterest: null }), null);
  assert.equal(productLabel({ productInterest: 'SUMP', sumpSizeLitres: 10000 }), 'Sump · 10,000 L');
  assert.equal(productLabel({ productInterest: 'MICROBES' }), 'Microbes');
});

test('"Qualify & hand over" is for the telecaller who has the lead, in any open stage', () => {
  const tara = 'tara';
  const lead = (status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'QUOTED' | 'WON' | 'LOST', owner = tara) => ({ status, assignedTo: { id: owner } });
  // A lead she marked Quote Shared (phase QUOTED) is still hers to hand over.
  for (const status of ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED'] as const) assert.equal(canHandOver(lead(status), tara, false), true);
  assert.equal(canHandOver(lead('WON'), tara, false), false);
  assert.equal(canHandOver(lead('LOST'), tara, false), false);
  assert.equal(canHandOver(lead('QUOTED', 'suresh'), tara, false), false); // already with sales
  assert.equal(canHandOver(lead('NEW', 'suresh'), 'suresh', true), false); // a salesperson's own lead
});

test('an admin can reassign the salesperson once a lead was handed over, whatever its stage', () => {
  assert.equal(wasHandedOver({ qualifiedAt: '2026-11-27T10:00:00Z' }), true);
  assert.equal(wasHandedOver({ qualifiedAt: null }), false);
  assert.equal(wasHandedOver({}), false);
});
