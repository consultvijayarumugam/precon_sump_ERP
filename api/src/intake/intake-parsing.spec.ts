import { normalizeIndianPhone, parseSource, phoneMatchKey } from './intake-parsing.js';

describe('normalizeIndianPhone', () => {
  it('turns every common way of writing an Indian mobile into +91XXXXXXXXXX', () => {
    for (const raw of ['9876543210', '98765 43210', '+91 98765 43210', '+91-98765-43210', '919876543210', '098765 43210', '0091 98765 43210', '(+91) 98765.43210']) {
      expect(normalizeIndianPhone(raw)).toBe('+919876543210');
    }
  });

  it('keeps a foreign number that starts with + and its country code', () => {
    expect(normalizeIndianPhone('+44 7911 123456')).toBe('+447911123456');
    expect(normalizeIndianPhone('+971 50 123 4567')).toBe('+971501234567');
  });

  it('refuses what is not a mobile number', () => {
    for (const raw of ['', '12345', '98765 4321', '1234567890', '+91 12345 67890', 'call 98765 43210', '98765432101234567', null, undefined]) {
      expect(normalizeIndianPhone(raw)).toBeNull();
    }
  });

  it('matches the duplicate key of the same number written differently', () => {
    expect(phoneMatchKey(normalizeIndianPhone('098765 43210')!)).toBe(phoneMatchKey('9876543210'));
  });
});

describe('parseSource', () => {
  it('knows WhatsApp', () => {
    expect(parseSource('WhatsApp', 'MANUAL')).toBe('WHATSAPP');
    expect(parseSource('whats app', 'MANUAL')).toBe('WHATSAPP');
  });
});
