import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { LeadNotesService, noteRecipients, preview } from './lead-notes.service.js';

const person = (id: string, permissions: string[] = ['leads.read', 'leads.write']): AuthenticatedUser => ({
  id,
  email: `${id}@x.in`,
  fullName: id === 'sales' ? 'Suresh Sales' : 'Tara Telecaller',
  role: { key: id, name: id },
  permissions,
  modules: [],
  token: { jti: 'j', expiresAt: new Date() },
});
const LEAD = { id: 'lead-1', name: 'Ravi', assignedToId: 'sales', telecallerId: 'tele' };

/** Just enough Prisma for the notes service; records what was written. */
function fakeDb(existingNote?: { authorId: string; body: string }) {
  const written = { notes: [] as unknown[], activities: [] as { summary?: string; message: string; changes: unknown }[], notifications: [] as { userId: string; title: string }[] };
  const db = {
    lead: { findFirst: vi.fn(async () => LEAD) },
    leadNote: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => existingNote ?? null),
      findUniqueOrThrow: vi.fn(async () => ({ id: 'n1' })),
      create: vi.fn(async ({ data }: { data: unknown }) => (written.notes.push(data), { id: 'n1', ...(data as object) })),
      update: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'n1', ...(data as object) })),
    },
    leadActivity: { create: vi.fn(async ({ data }: { data: { message: string; changes: unknown } }) => written.activities.push(data)) },
    notification: { createMany: vi.fn(async ({ data }: { data: { userId: string; title: string }[] }) => written.notifications.push(...data)) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db, written };
}

describe('shared notes', () => {
  it('notify the other people on the lead, never the author', () => {
    expect(noteRecipients(LEAD, 'sales')).toEqual(['tele']);
    expect(noteRecipients(LEAD, 'tele')).toEqual(['sales']);
    expect(noteRecipients(LEAD, 'admin')).toEqual(['sales', 'tele']);
    expect(noteRecipients({ assignedToId: 'tele', telecallerId: 'tele' }, 'admin')).toEqual(['tele']); // once each
    expect(noteRecipients({ assignedToId: null, telecallerId: null }, 'admin')).toEqual([]);
  });

  it('previews long notes on one line', () => {
    expect(preview('a\n\nb')).toBe('a b');
    expect(preview('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });

  it('a salesperson’s note is logged in the history and reaches the telecaller', async () => {
    const { db, written } = fakeDb();
    await new LeadNotesService(db as never).add(person('sales'), 'lead-1', 'Wants 5,000 L; call after 6 pm');
    expect(written.notes).toEqual([{ leadId: 'lead-1', authorId: 'sales', body: 'Wants 5,000 L; call after 6 pm' }]);
    expect(written.activities[0].message).toBe('Note added: Wants 5,000 L; call after 6 pm');
    expect(written.notifications).toEqual([expect.objectContaining({ userId: 'tele', title: 'Note from Suresh Sales on Ravi' })]);
  });

  it('only the author can edit a note, and the history keeps old and new text', async () => {
    const { db, written } = fakeDb({ authorId: 'tele', body: 'old text' });
    const service = new LeadNotesService(db as never);
    await expect(service.edit(person('sales'), 'lead-1', 'n1', 'mine now')).rejects.toBeInstanceOf(ForbiddenException);
    await service.edit(person('tele', ['leads.read', 'leads.qualify']), 'lead-1', 'n1', 'new text');
    expect(written.activities[0].changes).toEqual([{ field: 'note', label: 'Shared note', from: 'old text', to: 'new text' }]);
  });

  it("is 404 for a lead you can't see", async () => {
    const { db } = fakeDb();
    db.lead.findFirst.mockResolvedValueOnce(null as never);
    await expect(new LeadNotesService(db as never).list(person('sales'), 'lead-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
