import assert from 'node:assert/strict';
import { test } from 'node:test';
import { telNumber } from './phone.ts';

test('Indian mobiles get +91 however they were typed', () => {
  for (const typed of ['9876543210', '98765 43210', '098765 43210', '+91 98765 43210', '91 98765 43210', '0091 98765 43210']) {
    assert.equal(telNumber(typed), '+919876543210', typed);
  }
});

test('landlines, other countries, short numbers, nothing to dial', () => {
  assert.equal(telNumber('0422 2345678'), '+914222345678');
  assert.equal(telNumber('+44 20 7946 0958'), '+442079460958');
  assert.equal(telNumber('1800'), '1800');
  assert.equal(telNumber('n/a'), null);
});
