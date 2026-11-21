// How a lead is named in text the server writes (notifications, history,
// reports, exports, WhatsApp messages): its name, or its phone number while
// it has none. Many enquiries arrive as just a WhatsApp number.

/** "+919791006137" -> "+91 97910 06137"; "9791006137" -> "97910 06137"; anything else as stored. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+91') && digits.length === 12) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (/^\d{10}$/.test(phone)) return `${phone.slice(0, 5)} ${phone.slice(5)}`;
  return phone;
}

/** The lead's name, or its phone number when it has no name yet. */
export function leadLabel(lead: { name: string | null; phone: string }): string {
  const name = lead.name?.trim();
  return name ? name : formatPhone(lead.phone);
}
