// A lead's shared notes thread (GET /leads/:id/notes), as on the web lead page.

export interface LeadNote {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: { id: string; fullName: string; role: { key: string; name: string } };
}

/** "Seen by Tara (telecaller), Suresh (sales) and admins." — who shares this lead's notes. */
export function sharedWith(lead: { telecaller?: { fullName: string } | null; assignedTo: { fullName: string } | null; qualifiedAt?: string | null }): string {
  const people: string[] = [];
  if (lead.telecaller) people.push(`${lead.telecaller.fullName} (telecaller)`);
  if (lead.assignedTo && lead.assignedTo.fullName !== lead.telecaller?.fullName) people.push(`${lead.assignedTo.fullName} (${lead.qualifiedAt ? 'sales' : 'assigned'})`);
  if (people.length === 0) return 'Seen by everyone working this lead, and admins.';
  return `Seen by ${people.join(', ')} and admins.`;
}

/** What's wrong with a note before sending (null = fine), matching the API's 1-2000 characters. */
export function noteError(text: string): string | null {
  const t = text.trim();
  if (!t) return 'Write something first';
  if (t.length > 2000) return 'Keep it under 2,000 characters';
  return null;
}
