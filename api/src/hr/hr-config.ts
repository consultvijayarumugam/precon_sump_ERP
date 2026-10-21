/**
 * HR rules in one place. Change them here (or via env), not in the services.
 *
 * WORKING DAYS: every day except the weekly off day(s) and company holidays.
 *   Default weekly off is Sunday (Mon–Sat working, common for factories here).
 *   Override with WEEKLY_OFF_DAYS, comma-separated JS weekday numbers
 *   (0 = Sunday … 6 = Saturday), e.g. WEEKLY_OFF_DAYS=0,6 for a 5-day week.
 *
 * PAID LEAVE PER CALENDAR YEAR: casual 12, sick 6. Unpaid leave has no limit,
 *   but every unpaid day is Loss of Pay. Unused leave does not carry over, and
 *   everyone gets the full amount regardless of joining date (keep it simple).
 */
import { LeaveType } from '../generated/prisma/client.js';

export const PAID_LEAVE_PER_YEAR: Record<Exclude<LeaveType, 'UNPAID'>, number> = {
  CASUAL: 12,
  SICK: 6,
};

export const isPaidLeave = (type: LeaveType): type is 'CASUAL' | 'SICK' => type !== 'UNPAID';

/** Longest single application, in calendar days, to catch typos like a wrong year. */
export const MAX_LEAVE_SPAN_DAYS = 60;

export function weeklyOffDays(): number[] {
  const raw = process.env.WEEKLY_OFF_DAYS ?? '0';
  return raw
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}
