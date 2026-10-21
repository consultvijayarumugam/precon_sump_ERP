import { Prisma } from '../generated/prisma/client.js';

/**
 * Money is stored as Decimal(12,2) and sent over the API as a string like
 * "125000.00" so no precision is lost. Business dates (order, due, paid on)
 * are DATE columns and travel as "YYYY-MM-DD".
 */

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export const ZERO = new Prisma.Decimal(0);

export const money = (value: Prisma.Decimal | null | undefined): string =>
  (value ?? ZERO).toFixed(2);

export const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/** "2026-10-21" -> Date at UTC midnight, which is how Postgres DATE round-trips. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Today's date in the business time zone (default India), as a DATE value. */
export function businessToday(): Date {
  const timeZone = process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata';
  // en-CA formats as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  return parseDateOnly(today);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/** First day of the business month containing `date`. */
export function startOfMonth(date: Date): Date {
  return parseDateOnly(`${dateOnly(date).slice(0, 7)}-01`);
}

export const formatOrderNumber = (n: number) => `SO-${String(n).padStart(4, '0')}`;
