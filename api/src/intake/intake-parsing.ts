/**
 * Turning loosely formatted outside input (spreadsheets, partner systems,
 * Meta lead forms) into clean lead fields. Shared by import, the public API
 * and the Meta webhook so they all accept and reject the same things.
 */
import { LeadSource, ProductInterest } from '../generated/prisma/client.js';
import { SUMP_SIZES_LITRES } from '../stock/product-catalog.js';

/** A loosely typed input value as trimmed text (objects become ''). */
const text = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim() : typeof raw === 'number' || typeof raw === 'bigint' ? String(raw) : '';

/** "+91 98765-43210" or "p:+919876543210" -> "+919876543210"; null if it isn't 10-15 digits. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const value = typeof raw === 'number' ? String(Math.round(raw)) : text(raw);
  // Meta's lead exports write phones as "p:+919876543210".
  const cleaned = value.replace(/^p:/i, '').replace(/[\s\-().]/g, '');
  return /^\+?\d{10,15}$/.test(cleaned) ? cleaned : null;
}

/**
 * An Indian mobile number however it was typed or pasted, as +91XXXXXXXXXX:
 * "98765 43210", "+91 98765-43210", "919876543210", "098765 43210" and
 * "0091 98765 43210" all become "+919876543210". A number that starts with +
 * and another country code is kept (8-15 digits). Null for anything else,
 * including text mixed into the number.
 */
export function normalizeIndianPhone(raw: unknown): string | null {
  const value = text(raw);
  if (!/^[\s(]*\+?[\d\s\-().]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, '');
  const international = /^[\s(]*\+/.test(value) || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!international && digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // trunk 0
  if (!international && digits.length === 10) digits = `91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return /^91[6-9]/.test(digits) ? `+${digits}` : null;
  if (international && !digits.startsWith('91') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * The part of a phone number used to spot duplicates: its last 10 digits, so
 * "+919876543210", "919876543210" and "9876543210" are the same person.
 */
export const phoneMatchKey = (phone: string) => phone.replace(/\D/g, '').slice(-10);

/** "Sump", "sumps", "SUMP" -> SUMP; "Microbes"/"microbe" -> MICROBES. */
export function parseProduct(raw: unknown): ProductInterest | null {
  const t = text(raw).toLowerCase();
  if (/^sumps?$/.test(t)) return 'SUMP';
  if (/^microbes?$/.test(t)) return 'MICROBES';
  return null;
}

/**
 * "10000", "10,000", "10000 L", "10,000 litres" -> 10000, if it's a valid
 * sump size. Returns undefined for blank, null for an invalid size.
 */
export function parseSumpSize(raw: unknown): number | null | undefined {
  if (text(raw) === '') return undefined;
  const digits = text(raw).replace(/[,\s]/g, '').match(/^(\d+)(l|ltr|ltrs|litre|litres|liter|liters)?$/i);
  const size = digits ? Number(digits[1]) : NaN;
  return (SUMP_SIZES_LITRES as readonly number[]).includes(size) ? size : null;
}

/** Spreadsheet source labels -> LeadSource. Blank -> fallback. */
export function parseSource(raw: unknown, fallback: LeadSource): LeadSource | null {
  const t = text(raw).toLowerCase().replace(/[()]/g, '');
  if (!t) return fallback;
  if (['meta', 'facebook', 'meta facebook', 'fb', 'instagram'].includes(t)) return 'META';
  if (['manual', 'walk-in', 'walk in', 'phone', 'call'].includes(t)) return 'MANUAL';
  if (['website', 'web', 'site'].includes(t)) return 'WEBSITE';
  if (['referral', 'reference'].includes(t)) return 'REFERRAL';
  if (['other', 'others'].includes(t)) return 'OTHER';
  if (['api'].includes(t)) return 'API';
  if (['whatsapp', 'whats app', 'wa'].includes(t)) return 'WHATSAPP';
  return null;
}

export const VALID_SOURCES_TEXT = 'Meta, WhatsApp, Manual, Website, Referral or Other';
export const VALID_SIZES_TEXT = SUMP_SIZES_LITRES.join(', ');
