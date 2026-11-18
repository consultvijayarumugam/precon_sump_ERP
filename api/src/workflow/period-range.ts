import { BadRequestException } from '@nestjs/common';
import { businessDayRange } from '../intake/lead-assignment.service.js';
import { businessDate } from './business-periods.js';

/**
 * The days a dashboard reports on (both ends inclusive, business time zone),
 * as the instants and DATE values the queries need. Default: this month so far.
 */
export interface PeriodRange {
  from: string;
  to: string;
  /** First instant of `from`. */
  start: Date;
  /** First instant after `to`. */
  end: Date;
  /** Follow-ups count as "due" only up to now: the rest of today (or the future) isn't late yet. */
  dueUntil: Date;
  /** For DATE columns (order dates): `from` and `to` at UTC midnight. */
  fromDate: Date;
  toDate: Date;
}

const MAX_DAYS = 400;

export function periodRange(from?: string, to?: string, now = new Date()): PeriodRange {
  const today = businessDate(now);
  const f = from ?? `${(to ?? today).slice(0, 7)}-01`;
  const t = to ?? (from && from > today ? from : today);
  if (t < f) throw new BadRequestException('The end date is before the start date');
  const days = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_DAYS) throw new BadRequestException(`Pick ${MAX_DAYS} days or fewer`);
  const start = businessDayRange(f).start;
  const end = businessDayRange(t).end;
  return {
    from: f,
    to: t,
    start,
    end,
    dueUntil: end < now ? end : now,
    fromDate: new Date(`${f}T00:00:00Z`),
    toDate: new Date(`${t}T00:00:00Z`),
  };
}

/** done / due as a share (null when nothing was due, so it shows "–" rather than 0%). */
export const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);
