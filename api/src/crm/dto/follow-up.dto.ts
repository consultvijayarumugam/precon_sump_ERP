import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FollowUpOutcome } from '../../generated/prisma/client.js';

export class CreateFollowUpDto {
  @ApiProperty({ example: '2026-10-25T10:30:00+05:30' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @ApiPropertyOptional({ example: 'Call to confirm sump size' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateFollowUpDto {
  @ApiPropertyOptional({ description: 'Reschedule' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CompleteFollowUpDto {
  @ApiProperty({ enum: FollowUpOutcome })
  @IsEnum(FollowUpOutcome)
  outcome: FollowUpOutcome;

  @ApiPropertyOptional({ description: 'Replaces the note, e.g. what was discussed' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export const FOLLOW_UP_STATES = ['pending', 'overdue', 'upcoming', 'completed'] as const;
export type FollowUpState = (typeof FOLLOW_UP_STATES)[number];

export class ListFollowUpsQueryDto {
  @ApiPropertyOptional({
    enum: FOLLOW_UP_STATES,
    description:
      'pending = no outcome yet; overdue = pending and in the past; upcoming = pending and in the future',
  })
  @IsOptional()
  @IsIn(FOLLOW_UP_STATES)
  state?: FollowUpState;

  @ApiPropertyOptional({ description: 'scheduledAt >= from (ISO date-time)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'scheduledAt < to (ISO date-time)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({
    description: "'me' = only follow-ups on leads assigned to you, even if you can see all",
    enum: ['me'],
  })
  @IsOptional()
  @IsIn(['me'])
  assignedTo?: 'me';
}
