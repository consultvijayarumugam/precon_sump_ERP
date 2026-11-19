import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PipelineStage } from './sales.ts';
import { closedKind, stageChoices, stageFilters, stageRole } from './stages.ts';

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

test("custom stages show for the people who use them, in the admin's order", () => {
  assert.deepEqual(ids(stageChoices(STAGES, 'telecaller', 'New')), ['New', 'Interested', 'Lost']);
  assert.deepEqual(ids(stageChoices(STAGES, 'sales', 'Details Shared')), ['Details Shared', 'Quote Shared', 'Follow Up', 'RNR', 'Won', 'Lost']);
  assert.deepEqual(ids(stageChoices(STAGES, 'admin', null)), ['New', 'Interested', 'Details Shared', 'Quote Shared', 'Follow Up', 'RNR', 'Won', 'Lost']);
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
