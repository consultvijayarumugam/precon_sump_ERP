/**
 * The lead's change history (admin-only timeline): who did what, from -> to,
 * and when. Takes the Prisma client or a transaction so the entry commits with
 * the change it describes.
 */
import type { LeadActivityType, LeadStatus, Prisma, PrismaClient } from '../generated/prisma/client.js';

type Db = PrismaClient | Prisma.TransactionClient;

export const STATUS_WORDS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  QUOTED: 'Quoted',
  WON: 'Won',
  LOST: 'Lost',
};

export interface Change {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

export async function recordActivity(
  db: Db,
  entry: { leadId: string; userId: string; type: LeadActivityType; summary: string; changes?: Change[]; at?: Date },
) {
  await db.leadActivity.create({
    data: {
      leadId: entry.leadId,
      userId: entry.userId,
      type: entry.type,
      message: entry.summary.slice(0, 4000),
      changes: entry.changes && entry.changes.length ? (entry.changes as unknown as Prisma.InputJsonValue) : undefined,
      createdAt: entry.at,
    },
  });
}

const LABELS: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  city: 'City',
  source: 'Source',
  productInterest: 'Product',
  sumpSizeLitres: 'Sump size',
  status: 'Status',
  notes: 'Notes',
  assignedTo: 'Assigned to',
};

const show = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
};

/** The fields that differ between before and after (only keys present in `after`). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
  const changes: Change[] = [];
  for (const [field, value] of Object.entries(after)) {
    if (value === undefined) continue;
    const from = show(before[field]);
    const to = show(value);
    if (from !== to) changes.push({ field, label: LABELS[field] ?? field, from, to });
  }
  return changes;
}

/** "Status: New → Contacted; City: (empty) → Erode" */
export const describe = (changes: Change[]) =>
  changes.map((c) => (c.field === 'notes' ? 'Notes edited' : `${c.label}: ${c.from ?? '(empty)'} → ${c.to ?? '(empty)'}`)).join('; ');

/** "29 Oct, 11:00 am" in the business time zone, for summaries. */
export const when = (d: Date) =>
  d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata',
  });

