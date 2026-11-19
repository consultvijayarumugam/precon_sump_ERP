import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byDay, calendarPath, dayKey, followUpsPath, monthGrid } from './followups.ts';

test('a month grid starts on Monday, has whole weeks, and marks the month own days', () => {
  const nov = monthGrid(2026, 10); // November 2026 starts on a Sunday
  assert.ok(nov.every((w) => w.length === 7));
  assert.equal(dayKey(nov[0][0].date), '2026-10-26'); // the Monday before
  assert.equal(nov[0][6].inMonth, true);
  assert.equal(dayKey(nov[0][6].date), '2026-11-01');
  const last = nov[nov.length - 1];
  assert.equal(dayKey(last[6].date), '2026-12-06');
  assert.equal(nov.flat().filter((d) => d.inMonth).length, 30);

  const feb = monthGrid(2027, 1); // 1 Feb 2027 is a Monday, 28 days: exactly 4 weeks
  assert.equal(feb.length, 4);
  assert.equal(dayKey(feb[0][0].date), '2027-02-01');
});

test('follow-ups are grouped by local day, in time order', () => {
  const at = (d: number, h: number) => new Date(2026, 10, d, h).toISOString();
  const groups = byDay([{ id: 'b', scheduledAt: at(17, 15) }, { id: 'c', scheduledAt: at(18, 9) }, { id: 'a', scheduledAt: at(17, 10) }]);
  assert.deepEqual([...groups.keys()], ['2026-11-17', '2026-11-18']);
  assert.deepEqual(groups.get('2026-11-17')!.map((f) => f.id), ['a', 'b']);
});

test('requests: my follow-ups by state, and the whole visible calendar range', () => {
  assert.equal(followUpsPath('overdue'), '/follow-ups?state=overdue&assignedTo=me');
  const path = calendarPath(monthGrid(2026, 10));
  assert.ok(path.startsWith('/follow-ups?from='));
  assert.ok(path.endsWith('&assignedTo=me'));
  const params = new URLSearchParams(path.split('?')[1]);
  assert.equal(dayKey(new Date(params.get('from')!)), '2026-10-26');
  assert.equal(dayKey(new Date(params.get('to')!)), '2026-12-07'); // the day after the last cell
});

test('follow-ups can be narrowed to the days they were due', () => {
  assert.equal(followUpsPath('completed', { preset: 'week', from: '2026-11-16', to: '2026-11-22' }), '/follow-ups?state=completed&assignedTo=me&fromDate=2026-11-16&toDate=2026-11-22');
  assert.equal(followUpsPath('overdue', { preset: 'all' }), '/follow-ups?state=overdue&assignedTo=me');
});

test("an admin's follow-ups and calendar cover the whole team", () => {
  assert.equal(followUpsPath('overdue', undefined, true), '/follow-ups?state=overdue');
  const weeks = monthGrid(2026, 10);
  assert.ok(!calendarPath(weeks, true).includes('assignedTo'));
  assert.ok(calendarPath(weeks).endsWith('&assignedTo=me'));
});
