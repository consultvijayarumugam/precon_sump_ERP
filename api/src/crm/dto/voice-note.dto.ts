import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_VOICE_NOTE_MS, VOICE_NOTE_GRACE_MS } from '../voice-note-audio.js';

export class VoiceNoteDto {
  @ApiProperty({ example: 42000, description: 'Length of the recording in milliseconds (up to 2 minutes)' })
  @Type(() => Number)
  @IsInt({ message: 'durationMs must be a whole number of milliseconds' })
  @Min(0)
  @Max(MAX_VOICE_NOTE_MS + VOICE_NOTE_GRACE_MS, { message: 'Voice notes can be up to 2 minutes long.' })
  durationMs: number;
}
