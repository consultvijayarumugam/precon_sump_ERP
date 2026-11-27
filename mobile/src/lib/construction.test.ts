import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breakdownRows, constructionChoices, constructionLabel, NOT_KNOWN } from './construction.ts';

const stages = [
  { id: 'p', key: 'planning', name: 'Planning', position: 10, isActive: true },
  { id: 'f', key: 'foundation', name: 'Foundation', position: 20, isActive: true },
  { id: 'r', key: 'roof', name: 'Roof', position: 30, isActive: false },
];

test('a lead with no construction stage reads "Not known"', () => {
  assert.equal(constructionLabel(null), NOT_KNOWN);
  assert.equal(constructionLabel(undefined), 'Not known');
  assert.equal(constructionLabel({ id: 'f', name: 'Foundation' }), 'Foundation');
});

test('the sheet offers Not known first, then switched-on stages (and the current one even if off)', () => {
  assert.deepEqual(constructionChoices(stages, null).map((c) => c.name), ['Not known', 'Planning', 'Foundation']);
  assert.deepEqual(constructionChoices(stages, 'r').map((c) => c.name), ['Not known', 'Planning', 'Foundation', 'Roof']);
  assert.equal(constructionChoices(stages, null)[0].id, null);
});

test('the breakdown lists Not known first; a switched-off stage only while it holds leads', () => {
  const rows = breakdownRows({
    notKnown: { name: 'Not known', leads: 140 },
    stages: [
      { id: 'p', name: 'Planning', isActive: true, leads: 2 },
      { id: 'f', name: 'Foundation', isActive: true, leads: 0 },
      { id: 'r', name: 'Roof', isActive: false, leads: 0 },
      { id: 'b', name: 'Basement', isActive: false, leads: 1 },
    ],
  });
  assert.deepEqual(rows.map((r) => `${r.label} ${r.count}`), ['Not known 140', 'Planning 2', 'Foundation 0', 'Basement 1']);
  assert.deepEqual(breakdownRows(null), []);
});
