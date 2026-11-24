import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { storageDir } from '../files/files.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { recordActivity } from './lead-history.js';
import { leadLabel } from './lead-label.js';
import { noteRecipients } from './lead-notes.service.js';
import { leadScope } from './lead-scope.js';
import { detectAudio, formatDuration, MAX_VOICE_NOTE_MS, voiceNoteProblem } from './voice-note-audio.js';

/**
 * Where recordings live: next to the file library, in the same uploads volume
 * (production: /app/storage/voice-notes), so the nightly backup of that volume
 * includes them. Never served publicly.
 */
export const voiceNoteDir = () => path.resolve(process.env.VOICE_NOTE_DIR || path.join(path.dirname(storageDir()), 'voice-notes'));

export const VOICE_NOTE_SELECT = {
  id: true,
  mimeType: true,
  sizeBytes: true,
  durationMs: true,
  createdAt: true,
  author: { select: { id: true, fullName: true, role: { select: { key: true, name: true } } } },
} as const;

/**
 * Voice notes on a lead: recorded audio, no transcription. Same visibility as
 * the shared notes: everyone who can see the lead (its salesperson, the
 * telecaller who worked it, admins) can list and play them; a 404 for anyone else.
 */
@Injectable()
export class LeadVoiceNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, leadId: string) {
    await this.lead(user, leadId);
    return this.prisma.leadVoiceNote.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' }, take: 200, select: VOICE_NOTE_SELECT });
  }

  async add(user: AuthenticatedUser, leadId: string, file: { buffer: Buffer; size: number } | undefined, durationMs: number) {
    const lead = await this.lead(user, leadId);
    const problem = voiceNoteProblem(file, durationMs);
    if (problem || !file) throw new BadRequestException(problem);
    const type = detectAudio(file.buffer)!;
    const duration = Math.min(Math.round(durationMs), MAX_VOICE_NOTE_MS);

    const storedName = `${randomBytes(24).toString('base64url')}.${type.ext}`; // unguessable
    await mkdir(voiceNoteDir(), { recursive: true });
    const absolute = path.join(voiceNoteDir(), storedName);
    await writeFile(absolute, file.buffer, { flag: 'wx', mode: 0o640 });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const note = await tx.leadVoiceNote.create({
          data: { leadId, authorId: user.id, storedName, mimeType: type.mimeType, sizeBytes: file.size, durationMs: duration },
          select: VOICE_NOTE_SELECT,
        });
        await recordActivity(tx, {
          leadId,
          userId: user.id,
          type: 'VOICE_NOTE',
          summary: `Voice note added by ${user.fullName} (${formatDuration(duration)})`,
        });
        const recipients = noteRecipients(lead, user.id);
        if (recipients.length) {
          await tx.notification.createMany({
            data: recipients.map((userId) => ({
              userId,
              type: 'NOTE_ADDED' as const,
              leadId,
              title: `Voice note from ${user.fullName} on ${leadLabel(lead)}`,
              body: `${formatDuration(duration)} recording. Open the lead to play it.`,
            })),
          });
        }
        return note;
      });
    } catch (error) {
      await rm(absolute, { force: true }); // nothing saved, so don't keep the file
      throw error;
    }
  }

  /** The recording on disk, for someone who can see the lead. */
  async audio(user: AuthenticatedUser, leadId: string, noteId: string) {
    await this.lead(user, leadId);
    const note = await this.prisma.leadVoiceNote.findFirst({ where: { id: noteId, leadId }, select: { storedName: true, mimeType: true } });
    if (!note) throw new NotFoundException('Voice note not found');
    return { absolutePath: path.join(voiceNoteDir(), note.storedName), mimeType: note.mimeType, ext: path.extname(note.storedName) };
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
