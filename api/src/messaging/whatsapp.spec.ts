import { renderTemplate, waLink, waPhone } from './whatsapp.js';

describe('waPhone (wa.me number format)', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['98765 43210', '919876543210'],
    ['098765-43210', '919876543210'],
    ['+919876543210', '919876543210'],
    ['91 98765 43210', '919876543210'],
    ['0091 98765 43210', '919876543210'],
    ['+44 20 7946 0958', '442079460958'],
  ])('%s -> %s', (raw, expected) => {
    expect(waPhone(raw)).toBe(expected);
  });

  it.each(['12345', '0422 2345678', '1234567890', ''])('rejects %s', (raw) => {
    expect(waPhone(raw)).toBeNull();
  });
});

describe('renderTemplate', () => {
  const values = { name: 'Ravi Kumar', first_name: 'Ravi', city: 'Erode', product: 'Sump · 10,000 L', my_name: 'Tara', company: 'Precon' };

  it('fills placeholders in any case and spacing', () => {
    expect(renderTemplate('Hi {first_name}, this is {My_Name} from { company }.', values)).toBe('Hi Ravi, this is Tara from Precon.');
  });

  it('leaves unknown placeholders visible and tidies blanks', () => {
    expect(renderTemplate('Hello {name} {city}! About {prodcut}', { ...values, city: '' })).toBe('Hello Ravi Kumar! About {prodcut}');
  });

  it('builds a wa.me link with the message encoded', () => {
    expect(waLink('98765 43210', 'Hi Ravi & co')).toBe('https://wa.me/919876543210?text=Hi%20Ravi%20%26%20co');
    expect(waLink('9876543210', '')).toBe('https://wa.me/919876543210');
    expect(() => waLink('123', 'x')).toThrow();
  });
});
