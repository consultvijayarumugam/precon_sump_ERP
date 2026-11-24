import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, micNextStep, playLabel, recordingProblem, secondsLeft } from './voice-notes.ts';

test('durations read as m:ss', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(42_000), '0:42');
  assert.equal(formatDuration(65_400), '1:05');
  assert.equal(formatDuration(120_000), '2:00');
});

test('countdown to the 2-minute cap', () => {
  assert.equal(secondsLeft(0), 120);
  assert.equal(secondsLeft(110_100), 10);
  assert.equal(secondsLeft(125_000), 0);
});

test('mic permission: record if allowed, explain before asking, never re-ask once blocked', () => {
  assert.equal(micNextStep({ granted: true, canAskAgain: true }), 'record');
  assert.equal(micNextStep({ granted: false, canAskAgain: true }), 'explain');
  assert.equal(micNextStep({ granted: false, canAskAgain: false }), 'blocked');
  assert.equal(micNextStep(null), 'explain');
});

test('a recording must exist and be more than a tap', () => {
  assert.equal(recordingProblem(5_000, 'file:///cache/a.m4a'), null);
  assert.match(recordingProblem(200, 'file:///cache/a.m4a')!, /too short/);
  assert.match(recordingProblem(5_000, null)!, /typed note/);
});

test('the play button tells a screen reader whose note it is and how long', () => {
  assert.equal(playLabel({ durationMs: 42_000 }, 'Suresh Sales', false), 'Play voice note from Suresh Sales, 0:42 long');
  assert.equal(playLabel({ durationMs: 42_000 }, 'You', true), 'Pause voice note from You, 0:42 long');
});
