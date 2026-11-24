import { existsSync } from 'node:fs';
import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { VoiceNoteDto } from './dto/voice-note.dto.js';
import { LeadVoiceNotesService } from './lead-voice-notes.service.js';
import { MAX_VOICE_NOTE_BYTES } from './voice-note-audio.js';

const SHARED =
  "Same visibility as shared notes: the lead's salesperson, the telecaller who worked it, and admins. 404 for leads you can't see.";

/** One recording per upload, held in memory (3 MB cap) so its bytes are checked before anything is written. */
@Injectable()
class VoiceNoteUploadInterceptor extends FileInterceptor('audio', { limits: { fileSize: MAX_VOICE_NOTE_BYTES, files: 1, fields: 3 } }) {
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new PayloadTooLargeException('That recording is too large (over 3 MB). Keep voice notes under 2 minutes.');
      throw error;
    }
  }
}

@ApiTags('crm: voice notes')
@ApiBearerAuth()
@Controller('leads/:id/voice-notes')
export class LeadVoiceNotesController {
  constructor(private readonly voiceNotes: LeadVoiceNotesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: "A lead's voice notes, oldest first (who recorded each, when, how long)", description: SHARED })
  list(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.voiceNotes.list(user, id);
  }

  @Post()
  @RequireAnyPermission(PERMISSIONS.LEADS_WRITE, PERMISSIONS.LEADS_QUALIFY)
  @UseInterceptors(VoiceNoteUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio', 'durationMs'],
      properties: { audio: { type: 'string', format: 'binary' }, durationMs: { type: 'integer', example: 42000 } },
    },
  })
  @ApiOperation({
    summary: 'Add a voice note (leads.write or leads.qualify)',
    description:
      `${SHARED} Multipart: audio (M4A/AAC, WebM/Opus or Ogg; up to 3 MB) and durationMs (up to 2 minutes). ` +
      'The change history records "Voice note added by <name>"; the other people on the lead get a notification.',
  })
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoiceNoteDto,
    @UploadedFile() audio?: { buffer: Buffer; size: number },
  ) {
    return this.voiceNotes.add(user, id, audio, dto.durationMs);
  }

  /** Needs the login token like every other call; never a public link. Supports range requests (seeking). */
  @Get(':noteId/audio')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'The recording itself, to play', description: SHARED })
  async audio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Res() res: Response,
  ) {
    const { absolutePath, mimeType, ext } = await this.voiceNotes.audio(user, id, noteId);
    if (!existsSync(absolutePath)) throw new NotFoundException('The recording file is missing');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="voice-note${ext}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(absolutePath);
  }
}
