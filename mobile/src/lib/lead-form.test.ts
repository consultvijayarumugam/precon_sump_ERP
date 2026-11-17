import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanPhone, emptyLead, leadChanges, leadFormErrors, newLeadBody, type LeadFormValues } from './lead-form.ts';

const lead = (over: Partial<LeadFormValues> = {}): LeadFormValues => ({ ...emptyLead(), name: 'Ravi Kumar', phone: '98765 43210', ...over });

test('phones are cleaned to digits, keeping a leading +', () => {
  assert.equal(cleanPhone(' +91 98765-43210 '), '+919876543210');
  assert.equal(cleanPhone('(0422) 234 5678'), '04222345678');
});

test('the form checks the same basics as the API', () => {
  assert.deepEqual(leadFormErrors(lead()), {});
  assert.ok(leadFormErrors(lead({ name: 'R' })).name);
  assert.ok(leadFormErrors(lead({ phone: '12345' })).phone);
  assert.ok(leadFormErrors(lead({ email: 'not-an-email' })).email);
  assert.deepEqual(leadFormErrors(lead({ email: 'ravi@example.com', phone: '+919876543210' })), {});
});

test('a new lead: trimmed, empty optionals left out, microbes have no size', () => {
  assert.deepEqual(newLeadBody(lead({ city: ' Erode ', productInterest: 'SUMP', sumpSizeLitres: 5000 })), {
    name: 'Ravi Kumar', phone: '9876543210', email: undefined, city: 'Erode', source: 'MANUAL', productInterest: 'SUMP', sumpSizeLitres: 5000, notes: undefined,
  });
  assert.equal(newLeadBody(lead({ productInterest: 'MICROBES', sumpSizeLitres: 5000 })).sumpSizeLitres, undefined);
});

test('editing sends only what changed; clearing an optional field sends null', () => {
  const before = lead({ city: 'Erode', email: 'r@x.in', productInterest: 'SUMP', sumpSizeLitres: 5000 });
  assert.deepEqual(leadChanges(before, before), {});
  assert.deepEqual(leadChanges(before, { ...before, city: '', sumpSizeLitres: 8000 }), { city: null, sumpSizeLitres: 8000 });
  assert.deepEqual(leadChanges(before, { ...before, phone: '+91 98765 43210' }), { phone: '+919876543210' });
  assert.deepEqual(leadChanges(before, { ...before, productInterest: 'MICROBES' }), { productInterest: 'MICROBES', sumpSizeLitres: null });
});
