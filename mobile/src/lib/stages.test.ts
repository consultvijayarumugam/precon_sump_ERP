import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PipelineStage } from './sales.ts';
import { canMoveStage, closedKind, groupedChoices, moveEffect, stageChoices, stageFilters, stageRole, stageSide } from './stages.ts';

// The live server's stages (18 Nov): custom ones like Interested, Quote Shared and RNR.
const s = (id: string, kind: PipelineStage['kind'], phase: PipelineStage['phase'], isActive = true): PipelineStage => ({ id, name: id, kind, phase, isActive });
const STAGES = [
  s('New', 'ENTRY', 'NEW'),
  s('Interested', 'MIDDLE', 'CONTACTED'),
  s('Old step', 'MIDDLE', 'CONTACTED', false),
  s('Details Shared', 'MIDDLE', 'QUALIFIED'),
  s('Quote Shared', 'MIDDLE', 'QUOTED'),
  s('Follow Up', 'MIDDLE', 'QUOTED'),
  s('RNR', 'MIDDLE', 'QUOTED'),
  s('Won', 'WON', 'WON'),
  s('Lost', 'LOST', 'LOST'),
];
const ids = (list: PipelineStage[]) => list.map((x) => x.id);

test('who is moving the lead comes from their tags', () => {
  assert.equal(stageRole((t) => t === 'leads.read_all'), 'admin');
  assert.equal(stageRole((t) => t === 'leads.receive_qualified'), 'sales');
  assert.equal(stageRole(() => false), 'telecaller');
});

test("telecallers and sales are offered every active stage, in the admin's order, like admins", () => {
  const all = ['New', 'Interested', 'Details Shared', 'Quote Shared', 'Follow Up', 'RNR', 'Won', 'Lost'];
  assert.deepEqual(ids(stageChoices(STAGES, 'telecaller', 'New')), all);
  assert.deepEqual(ids(stageChoices(STAGES, 'sales', 'Details Shared')), all);
  assert.deepEqual(ids(stageChoices(STAGES, 'admin', null)), all);
});

test('the sides are only grouping: before the handover, the handover and after (with Won), and Lost', () => {
  assert.deepEqual(STAGES.map((x) => stageSide(x)), ['telecaller', 'telecaller', 'telecaller', 'sales', 'sales', 'sales', 'sales', 'sales', 'closed']);
  assert.deepEqual(
    groupedChoices(stageChoices(STAGES, 'telecaller', 'New')).map((g) => [g.label, ids(g.stages)]),
    [
      ['Telecaller side', ['New', 'Interested']],
      ['Sales side (after handover)', ['Details Shared', 'Quote Shared', 'Follow Up', 'RNR', 'Won']],
      ['Close', ['Lost']],
    ],
  );
});

test('the sheet says when a move hands the lead to sales or back to the telecaller', () => {
  const byName = (n: string) => STAGES.find((x) => x.id === n)!;
  assert.equal(moveEffect(byName('Quote Shared'), { ownerIsSales: false, handedOver: false }), 'handover');
  assert.equal(moveEffect(byName('Won'), { ownerIsSales: false, handedOver: false }), 'handover');
  assert.equal(moveEffect(byName('Interested'), { ownerIsSales: false, handedOver: false }), 'none');
  assert.equal(moveEffect(byName('Lost'), { ownerIsSales: false, handedOver: false }), 'none');
  assert.equal(moveEffect(byName('Interested'), { ownerIsSales: true, handedOver: true }), 'return');
  assert.equal(moveEffect(byName('RNR'), { ownerIsSales: true, handedOver: true }), 'none');
  assert.equal(moveEffect(byName('Interested'), { ownerIsSales: true, handedOver: false }), 'none'); // a salesperson's own walk-in
});

test("only the lead's owner (or an admin) gets Move stage; seeing a lead isn't enough", () => {
  assert.equal(canMoveStage('telecaller', 'tara', { assignedTo: { id: 'tara' } }), true);
  assert.equal(canMoveStage('telecaller', 'tara', { assignedTo: { id: 'suresh' } }), false); // handed over: Tara still sees it
  assert.equal(canMoveStage('sales', 'suresh', { assignedTo: { id: 'suresh' } }), true);
  assert.equal(canMoveStage('admin', 'asha', { assignedTo: { id: 'suresh' } }), true);
});

test('a switched-off stage is only offered to a lead already in it', () => {
  assert.ok(!ids(stageChoices(STAGES, 'telecaller', 'Interested')).includes('Old step'));
  assert.ok(ids(stageChoices(STAGES, 'telecaller', 'Old step')).includes('Old step'));
  assert.ok(!ids(stageFilters(STAGES)).includes('Old step'));
  assert.equal(stageFilters(STAGES).length, 8);
});

test('a brand-new stage from the web appears with no app change', () => {
  const withNew = [...STAGES.slice(0, 2), s('Site visit booked', 'MIDDLE', 'CONTACTED'), ...STAGES.slice(2)];
  assert.ok(ids(stageChoices(withNew, 'telecaller', 'New')).includes('Site visit booked'));
  assert.ok(ids(stageFilters(withNew)).includes('Site visit booked'));
});

test('Won and Lost filter by close date', () => {
  assert.equal(closedKind(s('Won', 'WON', 'WON')), 'WON');
  assert.equal(closedKind(s('Lost', 'LOST', 'LOST')), 'LOST');
  assert.equal(closedKind(s('RNR', 'MIDDLE', 'QUOTED')), undefined);
  assert.equal(closedKind(null), undefined);
});
