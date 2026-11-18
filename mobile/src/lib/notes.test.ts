import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteError, sharedWith } from './notes.ts';

test('notes say who shares them: the telecaller and the salesperson', () => {
  assert.equal(sharedWith({ telecaller: { fullName: 'Tara' }, assignedTo: { fullName: 'Suresh' }, qualifiedAt: '2026-11-01' }), 'Seen by Tara (telecaller), Suresh (sales) and admins.');
  assert.equal(sharedWith({ telecaller: { fullName: 'Tara' }, assignedTo: { fullName: 'Tara' }, qualifiedAt: null }), 'Seen by Tara (telecaller) and admins.');
  assert.equal(sharedWith({ assignedTo: null }), 'Seen by everyone working this lead, and admins.');
});

test('a note needs some text, within the API limit', () => {
  assert.equal(noteError('   '), 'Write something first');
  assert.equal(noteError('x'.repeat(2001)), 'Keep it under 2,000 characters');
  assert.equal(noteError(' Call after 6 pm '), null);
});
