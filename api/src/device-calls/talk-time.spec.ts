import { buildTalkTime, callSummary, formatDuration, outcomePrompts, phoneKey } from './talk-time.js';

describe('phoneKey', () => {
  it('matches a number however it was written', () => {
    const key = '9876543210';
    expect(phoneKey('+91 98765 43210')).toBe(key);
    expect(phoneKey('09876543210')).toBe(key);
    expect(phoneKey('919876543210')).toBe(key);
    expect(phoneKey('98765-43210')).toBe(key);
  });
});

describe('formatDuration', () => {
  it('reads naturally at each size', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(192)).toBe('3m 12s');
    expect(formatDuration(3725)).toBe('1h 02m');
  });
});

describe('callSummary', () => {
  it('shows the duration of a connected call and says when it was not answered', () => {
    expect(callSummary('OUTGOING', 192)).toBe('Outgoing call, 3m 12s (from phone call log)');
    expect(callSummary('OUTGOING', 0)).toBe('Outgoing call, not answered (from phone call log)');
    expect(callSummary('MISSED', 0)).toBe('Missed call (from phone call log)');
  });
});

describe('buildTalkTime', () => {
  const people = [
    { id: 'a', fullName: 'Asha' },
    { id: 'b', fullName: 'Bala' },
    { id: 'c', fullName: 'Chitra' },
  ];
  const at = new Date('2026-11-10T09:00:00Z');
  const result = buildTalkTime(
    people,
    {
      today: [{ userId: 'b', calls: 2, connected: 1, talkSeconds: 60 }],
      week: [{ userId: 'b', calls: 5, connected: 3, talkSeconds: 300 }],
      month: [
        { userId: 'b', calls: 9, connected: 6, talkSeconds: 900 },
        { userId: 'a', calls: 1, connected: 1, talkSeconds: 30 },
      ],
    },
    new Map([['b', at]]),
  );

  it('includes people with no calls, with zeros and no sync time', () => {
    const chitra = result.rows.find((r) => r.id === 'c');
    expect(chitra?.month).toEqual({ calls: 0, connected: 0, talkSeconds: 0 });
    expect(chitra?.lastSyncAt).toBeNull();
  });

  it('keeps each period separate and ranks by talk-time this month', () => {
    expect(result.rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(result.rows[0].today.talkSeconds).toBe(60);
    expect(result.rows[0].week.calls).toBe(5);
    expect(result.rows[0].lastSyncAt).toBe(at);
  });

  it('adds up team totals per period', () => {
    expect(result.totals.month).toEqual({ calls: 10, connected: 7, talkSeconds: 930 });
    expect(result.totals.today).toEqual({ calls: 2, connected: 1, talkSeconds: 60 });
  });
});

describe('outcomePrompts', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
  const call = (leadId: string | null, direction: 'INCOMING' | 'OUTGOING' | 'MISSED', durationSeconds: number, minutesAgo: number) => ({ leadId, direction, durationSeconds, startedAt: at(minutesAgo) });
  const open = new Map([
    ['ravi', { name: 'Ravi', phone: '9876543210' }],
    ['meena', { name: 'Meena', phone: '9566778899' }],
  ]);

  it('asks about answered incoming calls on open leads, latest per lead, newest first', () => {
    const prompts = outcomePrompts(
      [call('ravi', 'INCOMING', 120, 90), call('ravi', 'INCOMING', 45, 30), call('meena', 'INCOMING', 200, 60)],
      open,
      new Map(),
      now,
    );
    expect(prompts.map((p) => [p.leadName, p.durationSeconds])).toEqual([['Ravi', 45], ['Meena', 200]]);
  });

  it('skips outgoing, missed and unanswered calls, closed or unknown leads, and old calls', () => {
    const prompts = outcomePrompts(
      [
        call('ravi', 'OUTGOING', 120, 10), // the app already asks after the user's own Call
        call('ravi', 'MISSED', 0, 10),
        call('ravi', 'INCOMING', 0, 10), // rang, not answered
        call('won-lead', 'INCOMING', 60, 10), // not in openLeads (won/lost or out of scope)
        call(null, 'INCOMING', 60, 10),
        call('meena', 'INCOMING', 60, 3 * 24 * 60), // three days ago
      ],
      open,
      new Map(),
      now,
    );
    expect(prompts).toEqual([]);
  });

  it("doesn't ask again once an outcome was logged after the call started", () => {
    const logged = new Map([['ravi', at(5)]]);
    expect(outcomePrompts([call('ravi', 'INCOMING', 60, 20)], open, logged, now)).toEqual([]);
    expect(outcomePrompts([call('ravi', 'INCOMING', 60, 2)], open, logged, now)).toHaveLength(1); // a newer call
  });
});
