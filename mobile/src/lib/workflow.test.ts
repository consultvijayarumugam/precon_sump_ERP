import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callbackPresets, defaultCallbackFor, toSections, productLabel, type WorklistItem } from './workflow.ts';

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
