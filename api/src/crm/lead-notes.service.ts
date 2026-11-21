import { leadLabel } from './lead-label.js';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { recordActivity } from './lead-history.js';
import { leadScope } from './lead-scope.js';

export const NOTE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, fullName: true, role: { select: { key: true, name: true } } } },
} as const;

/** "Customer wants 5,000 L…" for history lines and notification bodies. */
export const preview = (text: string, max = 140) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * Who hears about a new note: the people connected to the lead (its
 * salesperson or current owner, and the telecaller who worked it), except the
 * author. Each person once.
 */
export function noteRecipients(lead: { assignedToId: string | null; telecallerId: string | null }, authorId: string): string[] {
  return [...new Set([lead.assignedToId, lead.telecallerId])].filter((id): id is string => Boolean(id) && id !== authorId);
}

/**
 * The lead's shared notes thread. Everyone who can see the lead sees every
 * note: the telecaller who worked it keeps seeing it after handover (lead
 * scope), so telecaller and salesperson can coordinate. Adds and edits are
 * recorded in the lead's change history.
 */
@Injectable()
export class LeadNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, leadId: string) {
    await this.lead(user, leadId);
    return this.prisma.leadNote.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' }, take: 500, select: NOTE_SELECT });
  }

  async add(user: AuthenticatedUser, leadId: string, body: string) {
    const lead = await this.lead(user, leadId);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.leadNote.create({ data: { leadId, authorId: user.id, body }, select: NOTE_SELECT });
      await recordActivity(tx, {
        leadId,
        userId: user.id,
        type: 'NOTES_EDITED',
        summary: `Note added: ${preview(body)}`,
        changes: [{ field: 'note', label: 'Shared note', from: null, to: body }],
      });
      const recipients = noteRecipients(lead, user.id);
      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map((userId) => ({
            userId,
            type: 'NOTE_ADDED' as const,
            leadId,
            title: `Note from ${user.fullName} on ${leadLabel(lead)}`,
            body: preview(body),
          })),
        });
      }
      return note;
    });
  }

  /** Only the note's author can change it (what someone else wrote stays theirs). */
  async edit(user: AuthenticatedUser, leadId: string, noteId: string, body: string) {
    await this.lead(user, leadId);
    const note = await this.prisma.leadNote.findFirst({ where: { id: noteId, leadId }, select: { authorId: true, body: true } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.authorId !== user.id) throw new ForbiddenException('You can only edit your own notes');
    if (note.body === body) return this.prisma.leadNote.findUniqueOrThrow({ where: { id: noteId }, select: NOTE_SELECT });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leadNote.update({ where: { id: noteId }, data: { body, editedAt: new Date() }, select: NOTE_SELECT });
      await recordActivity(tx, {
        leadId,
        userId: user.id,
        type: 'NOTES_EDITED',
        summary: `Note edited: ${preview(body)}`,
        changes: [{ field: 'note', label: 'Shared note', from: note.body, to: body }],
      });
      return updated;
    });
  }

  /** 404 (not 403) for leads outside the user's scope, so IDs can't be probed. */
  private async lead(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id: leadId }, leadScope(user)] },
      select: { id: true, name: true, phone: true, assignedToId: true, telecallerId: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }
}
