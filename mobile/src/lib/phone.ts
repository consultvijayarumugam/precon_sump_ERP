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

/** "+919876543210" -> "+91 98765 43210"; anything else unchanged. */
export function displayPhone(tel: string): string {
  const indian = tel.match(/^\+91(\d{5})(\d{5})$/);
  return indian ? `+91 ${indian[1]} ${indian[2]}` : tel;
}

/**
 * How a lead is shown everywhere: its name, or its phone number while it has
 * none (many enquiries arrive as just a WhatsApp number). "9791006137" and
 * "+919791006137" both show as "+91 97910 06137".
 */
export function leadLabel(lead: { name?: string | null; phone: string }): string {
  const name = lead.name?.trim();
  return name || displayPhone(telNumber(lead.phone) ?? lead.phone);
}

/** True when the lead has no name yet, so its label is the phone (rows then skip repeating the number). */
export const isUnnamed = (lead: { name?: string | null }) => !lead.name?.trim();
