import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRupees, leadsByStage, osmLink, salesBucket, salesCounts, salesSections, salesStages, type PipelineStage, type SalesDashboardData, type SalesLead } from './sales.ts';

const now = new Date(2026, 10, 17, 11, 0); // 17 Nov 2026, 11:00 local
const at = (h: number, dayOffset = 0) => new Date(2026, 10, 17 + dayOffset, h, 0).toISOString();
const lead = (id: string, followUp: string | null, qualifiedAt: string | null = null) =>
  ({ id, nextFollowUp: followUp ? { id: `f${id}`, scheduledAt: followUp, note: null } : null, qualifiedAt }) as SalesLead;

test('a lead is bucketed by its next follow-up', () => {
  assert.equal(salesBucket(lead('a', at(9)), now), 'overdue');
  assert.equal(salesBucket(lead('b', at(9, -3)), now), 'overdue');
  assert.equal(salesBucket(lead('c', at(18)), now), 'today');
  assert.equal(salesBucket(lead('d', at(10, 1)), now), 'later');
  assert.equal(salesBucket(lead('e', null), now), 'none');
});

test('the worklist puts overdue first, then today, then no next step, then later', () => {
  const sections = salesSections(
    [lead('later', at(10, 2)), lead('none-old', null, at(8, -5)), lead('today', at(17)), lead('overdue-new', at(10)), lead('overdue-old', at(9, -2)), lead('none-new', null, at(8, -1))],
    now,
  );
  assert.deepEqual(sections.map((s) => s.bucket), ['overdue', 'today', 'none', 'later']);
  assert.deepEqual(sections[0].data.map((l) => l.id), ['overdue-old', 'overdue-new']); // longest overdue first
  assert.deepEqual(sections[2].data.map((l) => l.id), ['none-new', 'none-old']); // newest hand-over first
  assert.equal(salesSections([], now).length, 0);
});

test('top counts: open pipeline, follow-ups due and overdue, won this month', () => {
  const data = {
    pipeline: { QUALIFIED: 4, QUOTED: 2, WON: 9, LOST: 1, wonThisMonth: 3, lostThisMonth: 0 },
    open: [lead('a', at(9)), lead('b', at(9, -1)), lead('c', at(15)), lead('d', null)],
  } as SalesDashboardData;
  assert.deepEqual(salesCounts(data, now), { open: 6, dueToday: 1, overdue: 2, wonThisMonth: 3 });
});

test('sales can move leads between their stages, Won and Lost only', () => {
  const s = (id: string, kind: PipelineStage['kind'], phase: PipelineStage['phase'], isActive = true) => ({ id, name: id, kind, phase, isActive });
  const stages = [s('new', 'ENTRY', 'NEW'), s('contacted', 'MIDDLE', 'CONTACTED'), s('qualified', 'MIDDLE', 'QUALIFIED'), s('site', 'MIDDLE', 'QUALIFIED', false), s('quoted', 'MIDDLE', 'QUOTED'), s('won', 'WON', 'WON'), s('lost', 'LOST', 'LOST')];
  assert.deepEqual(salesStages(stages, 'qualified').map((x) => x.id), ['qualified', 'quoted', 'won', 'lost']);
  assert.deepEqual(salesStages(stages, 'site').map((x) => x.id), ['qualified', 'site', 'quoted', 'won', 'lost']); // its own switched-off stage stays
});

test('rupees use Indian grouping', () => {
  assert.equal(formatRupees('0'), '₹0');
  assert.equal(formatRupees('950.40'), '₹950');
  assert.equal(formatRupees('125000.00'), '₹1,25,000');
  assert.equal(formatRupees(12345678), '₹1,23,45,678');
});

test('map links go to OpenStreetMap', () => {
  assert.equal(osmLink(13.05499, 80.27343), 'https://www.openstreetmap.org/?mlat=13.05499&mlon=80.27343#map=17/13.05499/80.27343');
});

test('the Pipeline tab groups my leads by stage in stage order, soonest follow-up first', () => {
  const stages = [
    { id: 's1', name: 'Site visit', isActive: true, isHandover: false, leads: 2 },
    { id: 's2', name: 'Quoted', isActive: true, isHandover: false, leads: 0 },
    { id: 's3', name: 'Negotiation', isActive: false, isHandover: false, leads: 1 },
  ];
  const withStage = (id: string, stageId: string | null, followUp: string | null) => ({ ...lead(id, followUp), stage: stageId ? { id: stageId, name: stageId, phase: 'QUALIFIED' } : null }) as SalesLead;
  const groups = leadsByStage(stages, [
    withStage('late', 's1', at(10, 2)),
    withStage('none', 's1', null),
    withStage('soon', 's1', at(9)),
    withStage('neg', 's3', null),
    withStage('lost-stage', 'gone', null),
    withStage('no-stage', null, null),
  ]);
  assert.deepEqual(groups.map((g) => g.title), ['Site visit', 'Negotiation', 'Other']); // empty stages left out
  assert.deepEqual(groups[0].data.map((l) => l.id), ['soon', 'late', 'none']);
  assert.deepEqual(groups[2].data.map((l) => l.id), ['lost-stage', 'no-stage']);
  assert.deepEqual(leadsByStage(stages, []), []);
});
