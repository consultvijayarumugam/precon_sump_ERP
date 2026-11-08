import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeApiUrl } from './api-url.ts';

test('adds the scheme and API path when missing', () => {
  assert.equal(normalizeApiUrl('192.168.31.50:4000'), 'http://192.168.31.50:4000/api/v1');
  assert.equal(normalizeApiUrl(' https://crm.example.com/ '), 'https://crm.example.com/api/v1');
});

test('leaves a complete URL as it is, minus trailing slashes', () => {
  assert.equal(normalizeApiUrl('http://10.0.2.2:4000/api/v1/'), 'http://10.0.2.2:4000/api/v1');
});

test('refuses what cannot be a server address', () => {
  assert.equal(normalizeApiUrl(''), null);
  assert.equal(normalizeApiUrl('not a url'), null);
  assert.equal(normalizeApiUrl('ftp://example.com'), null);
  assert.equal(normalizeApiUrl('http://host:abc'), null);
});
