import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasOffset, fitScene } from './scene.ts';

test('the login scene scales to the phone width, capped on tablets', () => {
  assert.deepEqual(fitScene(360), { scale: 0.9, height: 144 });
  assert.deepEqual(fitScene(400), { scale: 1, height: 160 });
  assert.deepEqual(fitScene(1200), { scale: 1.6, height: 256 });
  assert.deepEqual(fitScene(0), { scale: 0, height: 0 });
});

test('the canvas is centred so that scaling about its middle fills the box', () => {
  // A 360 x 144 box: the 400 x 160 canvas sits 20 px left and 8 px up, then shrinks by 0.9 about its centre.
  assert.deepEqual(canvasOffset(360, 144), { left: -20, top: -8 });
  assert.deepEqual(canvasOffset(400, 160), { left: 0, top: 0 });
});
