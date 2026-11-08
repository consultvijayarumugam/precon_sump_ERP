/**
 * The number to put in a tel: link, in international form so it dials from any
 * phone. Indian numbers get +91 when it's missing:
 *   "98765 43210" -> "+919876543210", "098765 43210" -> "+919876543210",
 *   "0422 2345678" -> "+914222345678", "+44 20 7946 0958" -> "+442079460958".
 * Short local numbers are left as digits. Null if there's nothing to dial.
 */
export function telNumber(raw: string): string | null {
  const hadPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.length >= 10 ? `+${digits.slice(2)}` : null; // 0091... international prefix
  if (hadPlus) return digits.length >= 8 ? `+${digits}` : null;
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 11) digits = digits.slice(1); // trunk 0
  if (digits.length === 9 || digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return digits.length >= 3 ? digits : null;
}

/** "+919876543210" -> "+91 98765 43210"; anything else unchanged. */
export function displayPhone(tel: string): string {
  const indian = tel.match(/^\+91(\d{5})(\d{5})$/);
  return indian ? `+91 ${indian[1]} ${indian[2]}` : tel;
}
