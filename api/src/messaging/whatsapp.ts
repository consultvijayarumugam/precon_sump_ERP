/**
 * WhatsApp quick-contact helpers: the wa.me number format and filling a
 * message template from a lead. Pure functions, unit-tested.
 */

/** Placeholders a template can use, with what they fill in. */
export const PLACEHOLDERS = {
  name: "Customer's full name",
  first_name: "Customer's first name",
  city: 'City (blank if not known)',
  product: 'Product interest, e.g. "Sump · 10,000 L" (blank if not known)',
  my_name: 'Your name (the person sending)',
  company: 'Company name (COMPANY_NAME, default "Precon")',
} as const;
export type Placeholder = keyof typeof PLACEHOLDERS;

/**
 * Phone number as wa.me wants it: country code + number, digits only.
 * Indian numbers get 91 when it's missing:
 *   "98765 43210" -> "919876543210", "098765 43210" -> "919876543210",
 *   "+91 98765 43210" -> "919876543210", "+44 20 7946 0958" -> "442079460958".
 * Returns null if it can't be a WhatsApp number.
 */
export function waPhone(raw: string): string | null {
  const hadPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2); // 0091... international prefix
  if (!hadPlus && digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // trunk 0
  if (digits.length === 10) return /^[6-9]/.test(digits) ? `91${digits}` : null; // Indian mobile
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** The wa.me link that opens a chat with the message typed in. */
export function waLink(phone: string, message: string): string {
  const number = waPhone(phone);
  if (!number) throw new Error(`"${phone}" isn't a valid WhatsApp number`);
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

/**
 * Fills {placeholders} (any case, spaces allowed: { Name }). Unknown ones are
 * left as typed, so a typo is visible rather than silently dropped. Empty
 * values (common: many leads are just a phone number) drop out cleanly: a
 * missing name gives "Hi," / "Dear Sir/Madam,", and a missing city or product
 * takes the words that only made sense with it ("in", "for your").
 */
export function renderTemplate(body: string, values: Partial<Record<Placeholder, string | null | undefined>>): string {
  const noName = !(values.name ?? '').trim();
  /** A known placeholder with nothing to fill in (an unknown one is left visible, never removed). */
  const isEmpty = (key: string) => {
    const k = key.toLowerCase() as Placeholder;
    return k in PLACEHOLDERS && !(values[k] ?? '').trim();
  };
  return body
    // No name yet (an enquiry that's just a number): "Dear {name}," reads "Dear Sir/Madam,";
    // "Hi {first_name}," reads "Hi,". Elsewhere an empty name simply drops out.
    .replace(/\b(dear)\s+\{\s*(?:first_name|name)\s*\}/gi, (match, word: string) => (noName ? `${word} Sir/Madam` : match))
    // An empty place ("in {city} are included") takes its preposition with it.
    .replace(/\b(?:in|at|near|from)\s+\{\s*([a-z_]+)\s*\}/gi, (match, key: string) => (isEmpty(key) ? '' : match))
    // An empty value ending a phrase ("the quotation for your {product}.") takes its little lead-in words with it.
    .replace(/(?:\b(?:for|of|to|your|our|the|a)\s+)+\{\s*([a-z_]+)\s*\}(?=\s*(?:[.,!?;:]|$))/gim, (match, key: string) => (isEmpty(key) ? '' : match))
    .replace(/\{\s*([a-z_]+)\s*\}/gi, (match, key: string) => {
      const k = key.toLowerCase() as Placeholder;
      return k in PLACEHOLDERS ? (values[k] ?? '').trim() : match;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1')
    .trim();
}
