/**
 * The number to put in a tel: link, in international form so it dials from any
 * phone (same rules as web/src/lib/phone.ts). Indian numbers get +91 when it's
 * missing. Short local numbers stay as digits. Null if there's nothing to dial.
 */
export function telNumber(raw: string): string | null {
  const hadPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.length >= 10 ? `+${digits.slice(2)}` : null; // 0091... international prefix
  if (hadPlus) return digits.length >= 8 ? `+${digits}` : null;
  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) digits = digits.slice(1); // trunk 0
  if (digits.length === 9 || digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return digits.length >= 3 ? digits : null;
}
