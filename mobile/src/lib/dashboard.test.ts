import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leadListQuery, pipelineRows, reminderItems, remindersEmpty, type ReminderSummary } from './dashboard.ts';
import type { PipelineStage } from './sales.ts';

const f = (id: string) => ({ id, scheduledAt: '2026-11-17T05:00:00Z', note: null, lead: { id: `l${id}`, name: id, phone: '9' } });

test('reminders: overdue first, flagged late, then the rest of today', () => {
  const s: ReminderSummary = { overdue: [f('a')], dueToday: [f('b'), f('c')], assignedToday: 0, handedToday: 0 };
  assert.deepEqual(reminderItems(s).map((r) => [r.id, r.late]), [['a', true], ['b', false], ['c', false]]);
  assert.equal(remindersEmpty(s), false);
  assert.equal(remindersEmpty({ overdue: [], dueToday: [], assignedToday: 0, handedToday: 0 }), true);
  assert.equal(remindersEmpty({ overdue: [], dueToday: [], assignedToday: 0, handedToday: 2 }), false);
});

test('pipeline rows follow stage order, keep switched-off stages only while they hold leads, and can be limited to one side', () => {
  const s = (id: string, phase: PipelineStage['phase'], isActive = true): PipelineStage => ({ id, name: id, kind: 'MIDDLE', phase, isActive });
  const stages = [s('new', 'NEW'), s('contacted', 'CONTACTED'), s('old', 'CONTACTED', false), s('qualified', 'QUALIFIED'), s('quoted', 'QUOTED'), s('gone', 'QUOTED', false)];
  const counts = { new: 4, qualified: 2, old: 1 };
  assert.deepEqual(pipelineRows(stages, counts).map((r) => [r.id, r.count]), [['new', 4], ['contacted', 0], ['old', 1], ['qualified', 2], ['quoted', 0]]);
  assert.deepEqual(pipelineRows(stages, counts, ['QUALIFIED', 'QUOTED']).map((r) => r.id), ['qualified', 'quoted']);
});

test('lead list query: only the filters in use, search trimmed and encoded', () => {
  assert.equal(leadListQuery({ page: 1 }), '/leads?page=1&pageSize=30');
  assert.equal(leadListQuery({ search: '  Ravi K ', status: 'WON', page: 2 }), '/leads?search=Ravi%20K&status=WON&page=2&pageSize=30');
  assert.equal(leadListQuery({ stageId: 'abc', page: 1, pageSize: 10 }), '/leads?stageId=abc&page=1&pageSize=10');
});
