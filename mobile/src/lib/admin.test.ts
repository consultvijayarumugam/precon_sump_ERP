import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attentionLink, formatCell } from './admin.ts';

test("a 'needs attention' line opens that person's leads with the same filters as the web", () => {
  assert.deepEqual(attentionLink({ href: '/leads?assignedToId=u1&status=NEW', person: 'Tara', personId: 'u1' }), {
    pathname: '/leads',
    params: { assignedToId: 'u1', title: 'Tara', status: 'NEW' },
  });
  assert.deepEqual(attentionLink({ href: '/leads?assignedToId=u2', person: 'Suresh', personId: 'u2' }).params, { assignedToId: 'u2', title: 'Suresh' });
  assert.equal(attentionLink({ href: '/leads', person: 'X', personId: 'u3' }).params.assignedToId, 'u3');
});

test('report cells read naturally', () => {
  assert.equal(formatCell('money', '125000.00'), '₹1,25,000');
  assert.equal(formatCell('percent', 0.754), '75%');
  assert.equal(formatCell('number', 1234), '1,234');
  assert.equal(formatCell('text', 'Website'), 'Website');
  assert.equal(formatCell('number', null), '–');
});
