import { businessDayRange } from '../intake/lead-assignment.service.js';

/** YYYY-MM-DD of an instant in the business time zone. */
export function businessDate(at: Date = new Date()): string {
  const timeZone = process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata';
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

/**
 * The periods the dashboards count over, as instants in the business time
 * zone: today, this week (from Monday) and this month. `monthStartDate` is the
 * month's first day as a DATE value, for date-only columns like order dates.
 */
export function businessPeriods(now: Date = new Date()) {
  const today = businessDate(now);
  const { start: todayStart, end: todayEnd } = businessDayRange(today);
  const day = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (day.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  const monday = new Date(day.getTime() - mondayOffset * 86_400_000).toISOString().slice(0, 10);
  const monthStartDay = `${today.slice(0, 7)}-01`;
  return {
    now,
    today,
    todayStart,
    todayEnd,
    weekStart: businessDayRange(monday).start,
    monthStart: businessDayRange(monthStartDay).start,
    monthStartDate: new Date(`${monthStartDay}T00:00:00Z`),
  };
}
