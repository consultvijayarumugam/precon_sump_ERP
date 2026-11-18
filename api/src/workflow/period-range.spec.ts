import { periodRange, rate } from './period-range.js';

// 18 Nov 2026, 15:00 in Kolkata (09:30 UTC).
const now = new Date('2026-11-18T09:30:00Z');

describe('periodRange', () => {
  it('defaults to this month so far', () => {
    const r = periodRange(undefined, undefined, now);
    expect(r.from).toBe('2026-11-01');
    expect(r.to).toBe('2026-11-18');
    // Business days start at midnight in Kolkata (UTC+5:30).
    expect(r.start.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-18T18:30:00.000Z');
  });

  it('counts follow-ups as due only up to now', () => {
    expect(periodRange('2026-11-18', '2026-11-18', now).dueUntil).toEqual(now);
    const past = periodRange('2026-10-01', '2026-10-31', now);
    expect(past.dueUntil).toEqual(past.end);
  });

  it('gives DATE values for order dates', () => {
    const r = periodRange('2026-10-01', '2026-10-31', now);
    expect(r.fromDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.toDate.toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('fills an open end sensibly', () => {
    expect(periodRange('2026-09-15', undefined, now).to).toBe('2026-11-18');
    expect(periodRange(undefined, '2026-10-20', now).from).toBe('2026-10-01');
  });

  it('rejects a backwards or huge range', () => {
    expect(() => periodRange('2026-11-10', '2026-11-01', now)).toThrow('before the start');
    expect(() => periodRange('2024-01-01', '2026-11-18', now)).toThrow('400 days');
  });
});

describe('rate', () => {
  it('is a share, or null when nothing was due', () => {
    expect(rate(3, 4)).toBe(0.75);
    expect(rate(0, 0)).toBeNull();
  });
});
