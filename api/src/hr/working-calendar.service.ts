import { BadRequestException, Injectable } from '@nestjs/common';
import { addDays, dateOnly, parseDateOnly } from '../finance/finance-utils.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { weeklyOffDays } from './hr-config.js';

export interface MonthRange {
  month: string; // "2026-10"
  start: Date; // first day (DATE)
  end: Date; // last day (DATE)
}

/** "2026-10" -> first and last day of that month. */
export function parseMonth(month: string): MonthRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('month must be YYYY-MM');
  const start = parseDateOnly(`${month}-01`);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { month, start, end: addDays(next, -1) };
}

/** Every calendar day from `from` to `to` inclusive, as "YYYY-MM-DD". */
export function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(dateOnly(d));
  return days;
}

/**
 * Knows which days are working days: not a weekly off and not a company
 * holiday. All leave and LOP day counts go through here.
 */
@Injectable()
export class WorkingCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async holidaysBetween(from: Date, to: Date): Promise<Map<string, string>> {
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, name: true },
    });
    return new Map(rows.map((h) => [dateOnly(h.date), h.name]));
  }

  /** Working days between two dates (inclusive), given the holidays in that span. */
  workingDays(from: Date, to: Date, holidays: Map<string, string>): string[] {
    const offs = weeklyOffDays();
    return eachDay(from, to).filter(
      (d) => !offs.includes(parseDateOnly(d).getUTCDay()) && !holidays.has(d),
    );
  }

  async workingDaysBetween(from: Date, to: Date): Promise<string[]> {
    return this.workingDays(from, to, await this.holidaysBetween(from, to));
  }

  /** Why a date is not a working day, or null if it is one. */
  async nonWorkingReason(date: Date): Promise<string | null> {
    if (weeklyOffDays().includes(date.getUTCDay())) return 'a weekly off day';
    const holiday = await this.prisma.holiday.findUnique({ where: { date }, select: { name: true } });
    return holiday ? `a company holiday (${holiday.name})` : null;
  }
}
