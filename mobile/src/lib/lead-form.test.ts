import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanPhone, emptyLead, leadChanges, leadFormErrors, leadPhone, newLeadBody, samePhone, type LeadFormValues } from './lead-form.ts';

const lead = (over: Partial<LeadFormValues> = {}): LeadFormValues => ({ ...emptyLead(), name: 'Ravi Kumar', phone: '98765 43210', ...over });

test('phones are cleaned to digits, keeping a leading +', () => {
  assert.equal(cleanPhone(' +91 98765-43210 '), '+919876543210');
  assert.equal(cleanPhone('(0422) 234 5678'), '04222345678');
});

test('an Indian mobile is sent as +91…, however it was typed (same rule as the server)', () => {
  for (const typed of ['9791006137', '+919791006137', '+91 97910 06137', '919791006137', '097910 06137', '0091 97910 06137']) {
    assert.equal(leadPhone(typed), '+919791006137', typed);
  }
  assert.equal(leadPhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(leadPhone('0422 2345678'), '04222345678');
  assert.equal(leadPhone('12345'), null);
  assert.equal(leadPhone('call me'), null);
  assert.ok(samePhone('9791006137', '+91 97910 06137'));
  assert.ok(!samePhone('9791006137', '9791006138'));
});

test('the phone is the only required field', () => {
  assert.deepEqual(leadFormErrors({ ...emptyLead(), phone: '97910 06137' }), {});
  assert.match(leadFormErrors(emptyLead()).phone!, /only thing needed/);
  assert.deepEqual(newLeadBody({ ...emptyLead(), phone: '97910 06137' }), {
    name: undefined, phone: '+919791006137', email: undefined, city: undefined, source: 'MANUAL', productInterest: undefined, sumpSizeLitres: undefined, notes: undefined,
  });
});

test('the form checks the same basics as the API', () => {
  assert.deepEqual(leadFormErrors(lead()), {});
  assert.deepEqual(leadFormErrors(lead({ name: '' })), {});
  assert.deepEqual(leadFormErrors(lead({ name: 'R' })), {});
  assert.ok(leadFormErrors(lead({ phone: '12345' })).phone);
  assert.ok(leadFormErrors(lead({ email: 'not-an-email' })).email);
  assert.deepEqual(leadFormErrors(lead({ email: 'ravi@example.com', phone: '+919876543210' })), {});
});

test('a new lead: trimmed, empty optionals left out, microbes have no size', () => {
  assert.deepEqual(newLeadBody(lead({ city: ' Erode ', productInterest: 'SUMP', sumpSizeLitres: 5000 })), {
    name: 'Ravi Kumar', phone: '+919876543210', email: undefined, city: 'Erode', source: 'MANUAL', productInterest: 'SUMP', sumpSizeLitres: 5000, notes: undefined,
  });
  assert.equal(newLeadBody(lead({ productInterest: 'MICROBES', sumpSizeLitres: 5000 })).sumpSizeLitres, undefined);
});

test('editing sends only what changed; clearing an optional field sends null', () => {
  const before = lead({ city: 'Erode', email: 'r@x.in', productInterest: 'SUMP', sumpSizeLitres: 5000 });
  assert.deepEqual(leadChanges(before, before), {});
  assert.deepEqual(leadChanges(before, { ...before, city: '', sumpSizeLitres: 8000 }), { city: null, sumpSizeLitres: 8000 });
  // The same number written another way isn't a change; a different one is sent in +91 form.
  assert.deepEqual(leadChanges(before, { ...before, phone: '+91 98765 43210' }), {});
  assert.deepEqual(leadChanges(before, { ...before, phone: '97910 06137' }), { phone: '+919791006137' });
  // Clearing the name is allowed now (the phone is shown instead).
  assert.deepEqual(leadChanges(before, { ...before, name: '' }), { name: null });
  assert.deepEqual(leadChanges(before, { ...before, productInterest: 'MICROBES' }), { productInterest: 'MICROBES', sumpSizeLitres: null });
});
