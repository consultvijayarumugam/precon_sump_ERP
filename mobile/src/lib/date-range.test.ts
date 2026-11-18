import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customRange, inRange, leadDateNoun, leadDateParams, presetRange, rangeLabel } from './date-range.ts';

const now = new Date(2026, 10, 18, 15, 0); // Wed 18 Nov 2026

test('presets cover the same days as on the web (weeks start Monday)', () => {
  assert.deepEqual(presetRange('today', now), { preset: 'today', from: '2026-11-18', to: '2026-11-18' });
  assert.deepEqual(presetRange('week', now), { preset: 'week', from: '2026-11-16', to: '2026-11-22' });
  assert.deepEqual(presetRange('month', now), { preset: 'month', from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(presetRange('lastMonth', now), { preset: 'lastMonth', from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(presetRange('lastMonth', new Date(2027, 0, 9)), { preset: 'lastMonth', from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(presetRange('all', now), { preset: 'all' });
});

test('a custom range is put in order whichever end is picked first', () => {
  assert.deepEqual(customRange(new Date(2026, 9, 31), new Date(2026, 9, 1)), { preset: 'custom', from: '2026-10-01', to: '2026-10-31' });
  assert.equal(rangeLabel(presetRange('week', now)), 'This week');
  assert.equal(rangeLabel({ preset: 'all' }), 'All time');
  assert.match(rangeLabel(customRange(new Date(2026, 8, 1), new Date(2026, 8, 30))), /^1 Sep.* – 30 Sep.* 2026$/);
});

test('a lead counts when its day is inside the range (both ends inclusive)', () => {
  const month = presetRange('month', now);
  assert.ok(inRange(new Date(2026, 10, 1, 0, 5).toISOString(), month));
  assert.ok(inRange(new Date(2026, 10, 30, 23, 55).toISOString(), month));
  assert.ok(!inRange(new Date(2026, 9, 31, 23, 55).toISOString(), month));
  assert.ok(!inRange(null, month));
  assert.ok(inRange(null, { preset: 'all' }));
});

test('the lead list date filter combines with status: Won/Lost by close date, others by date added', () => {
  const r = presetRange('month', now);
  assert.deepEqual(leadDateParams(r), [['createdFrom', '2026-11-01'], ['createdTo', '2026-11-30']]);
  assert.deepEqual(leadDateParams(r, 'QUALIFIED'), [['createdFrom', '2026-11-01'], ['createdTo', '2026-11-30']]);
  assert.deepEqual(leadDateParams(r, 'WON'), [['wonFrom', '2026-11-01'], ['wonTo', '2026-11-30']]);
  assert.deepEqual(leadDateParams(r, 'LOST'), [['wonFrom', '2026-11-01'], ['wonTo', '2026-11-30']]);
  assert.deepEqual(leadDateParams({ preset: 'all' }, 'WON'), []);
  assert.equal(leadDateNoun('WON'), 'won');
  assert.equal(leadDateNoun(), 'added');
});
