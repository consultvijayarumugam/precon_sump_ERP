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
  const weekStart = businessDayRange(monday).start;
  const monthStart = businessDayRange(monthStartDay).start;
  // The month before, for "vs last month" (same day count, capped at that month's end).
  const prevMonthFirst = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1));
  const prevMonthLast = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 0));
  const dayOfMonth = day.getUTCDate();
  const prevSameDay = new Date(Date.UTC(prevMonthFirst.getUTCFullYear(), prevMonthFirst.getUTCMonth(), Math.min(dayOfMonth, prevMonthLast.getUTCDate())));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    now,
    today,
    todayStart,
    todayEnd,
    weekStart,
    monthStart,
    monthStartDate: new Date(`${monthStartDay}T00:00:00Z`),
    // Comparison periods: yesterday, last week and last month (as instants and DATE values).
    yesterdayStart: businessDayRange(iso(new Date(day.getTime() - 86_400_000))).start,
    prevWeekStart: new Date(weekStart.getTime() - 7 * 86_400_000),
    prevMonthStart: businessDayRange(iso(prevMonthFirst)).start,
    prevMonthStartDate: prevMonthFirst,
    /** Last month's same day-of-month (capped), as a DATE: "last month to date" ends here. */
    prevMonthSameDayDate: prevSameDay,
  };
}
