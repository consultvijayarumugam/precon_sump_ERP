// The lead form (new lead, edit details), with the API's rules
// (api/src/crm/dto/lead.dto.ts) checked on the phone first.
import type { ProductInterest } from './workflow.ts';

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  productInterest: ProductInterest | null;
  sumpSizeLitres: number | null;
  notes: string;
}

/** Sources someone can pick for a lead they enter by hand (API and Meta come in automatically). */
export const MANUAL_SOURCES = [
  { key: 'MANUAL', label: 'Walk-in / call' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'REFERRAL', label: 'Referral' },
  { key: 'WEBSITE', label: 'Website' },
  { key: 'OTHER', label: 'Other' },
];

export const emptyLead = (): LeadFormValues => ({ name: '', phone: '', email: '', city: '', source: 'MANUAL', productInterest: null, sumpSizeLitres: null, notes: '' });

/** Digits only, keeping a leading +: "+91 98765-43210" -> "+919876543210". */
export const cleanPhone = (phone: string) => phone.trim().replace(/(?!^\+)[^\d]/g, '');

/**
 * The server's phone rule (normalizeLeadPhone in api/src/intake/intake-parsing.ts):
 * an Indian mobile however typed -> "+919791006137"; another country with + kept;
 * other 10-15 digit numbers kept as digits. Null when it can't be a phone number.
 */
export function leadPhone(raw: string): string | null {
  const value = raw.trim();
  if (!/^[\s(]*\+?[\d\s\-().]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, '');
  const international = /^[\s(]*\+/.test(value) || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!international && digits.length === 11 && digits.startsWith('0') && /^0[6-9]/.test(digits)) digits = digits.slice(1);
  if (!international && digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  if (digits.length === 12 && /^91[6-9]/.test(digits)) return `+${digits}`;
  if (international && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  const plain = cleanPhone(value);
  return /^\+?\d{10,15}$/.test(plain) ? plain : null;
}

/** Same number? Compares the last 10 digits, so "9791006137" and "+91 97910 06137" match. */
export const samePhone = (a: string, b: string) => a.replace(/\D/g, '').slice(-10) === b.replace(/\D/g, '').slice(-10);

/** What's wrong, field by field (empty object = fine to save). */
export function leadFormErrors(v: LeadFormValues): Partial<Record<keyof LeadFormValues, string>> {
  const errors: Partial<Record<keyof LeadFormValues, string>> = {};
  // The phone is the only required field; a name is optional (the phone is shown until one is added).
  if (v.name.trim().length > 120) errors.name = 'Keep the name under 120 letters';
  if (!v.phone.trim()) errors.phone = 'Enter the phone number: it is the only thing needed';
  else if (!leadPhone(v.phone)) errors.phone = 'Enter a 10-digit mobile number (with or without +91)';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = 'That email doesn’t look right';
  if (v.city.trim().length > 80) errors.city = 'Keep the city under 80 letters';
  return errors;
}

/** The body for POST /leads. Microbes have no size. */
export function newLeadBody(v: LeadFormValues) {
  return {
    name: v.name.trim() || undefined,
    phone: leadPhone(v.phone) ?? cleanPhone(v.phone),
    email: v.email.trim() || undefined,
    city: v.city.trim() || undefined,
    source: v.source,
    productInterest: v.productInterest ?? undefined,
    sumpSizeLitres: v.productInterest === 'SUMP' ? (v.sumpSizeLitres ?? undefined) : undefined,
    notes: v.notes.trim() || undefined,
  };
}

/** The body for PATCH /leads/:id: only the fields that changed (null clears an optional one). */
export function leadChanges(before: LeadFormValues, after: LeadFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = (k: 'name' | 'email' | 'city' | 'notes', clearable: boolean) => {
    const a = after[k].trim();
    if (a !== before[k].trim()) out[k] = a || (clearable ? null : undefined);
  };
  text('name', true);
  if (!samePhone(after.phone, before.phone)) out.phone = leadPhone(after.phone) ?? cleanPhone(after.phone);
  text('email', true);
  text('city', true);
  text('notes', true);
  if (after.productInterest !== before.productInterest) out.productInterest = after.productInterest;
  const size = after.productInterest === 'SUMP' ? after.sumpSizeLitres : null;
  if (size !== (before.productInterest === 'SUMP' ? before.sumpSizeLitres : null)) out.sumpSizeLitres = size;
  return out;
}
