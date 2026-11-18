import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { IsDateOnly } from '../../finance/dto/common.dto.js';
import { CallOutcome } from '../../generated/prisma/client.js';
import { SUMP_SIZES_LITRES } from '../../stock/product-catalog.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

export class LogCallDto {
  @ApiProperty({ enum: CallOutcome, description: 'NOT_INTERESTED and WRONG_NUMBER close the lead as Lost' })
  @IsEnum(CallOutcome)
  outcome: CallOutcome;

  @ApiPropertyOptional({ example: 'Asked to call after 6 pm' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: '2026-10-29T18:00:00+05:30', description: 'Schedule the next callback in the same step' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Date)
  @IsDate()
  nextCallbackAt?: Date;

  @ApiPropertyOptional({
    example: '2026-11-18T15:40:00+05:30',
    description: 'When the call happened, if not now (an incoming call found in the phone\'s call log). Up to 7 days back.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Date)
  @IsDate()
  calledAt?: Date;

  @ApiPropertyOptional({ description: 'The customer called in (from the phone\'s call log)' })
  @IsOptional()
  @IsBoolean()
  incoming?: boolean;
}

export class NextCallbackDto {
  @ApiProperty({ example: '2026-10-29T11:00:00+05:30' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class QualifyLeadDto {
  @ApiProperty({ enum: ['SUMP', 'MICROBES'] })
  @IsIn(['SUMP', 'MICROBES'])
  productInterest: 'SUMP' | 'MICROBES';

  @ApiPropertyOptional({ enum: SUMP_SIZES_LITRES, description: 'Sump only; leave out if not decided' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsIn(SUMP_SIZES_LITRES as unknown as number[])
  sumpSizeLitres?: number;

  @ApiPropertyOptional({ example: 'Erode' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: 'Building a new house, needs it in 3 weeks' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Salesperson to hand to. Leave out for the next one in the sales round-robin.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  salesUserId?: string;

  @ApiPropertyOptional({ example: '2026-10-30T11:00:00+05:30', description: 'Puts a follow-up on the salesperson’s list' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Date)
  @IsDate()
  salesFollowUpAt?: Date;
}

export class CheckInDto {
  @ApiProperty({ example: 11.0168 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 76.9558 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 18, description: 'Reported GPS accuracy in metres' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  accuracyMeters?: number;

  @ApiProperty({ description: 'The lead this visit is for: one of the leads assigned to you' })
  @IsUUID('all', { message: 'Pick the lead you are visiting' })
  leadId: string;

  @ApiPropertyOptional({ example: 'Measured pit, customer wants 10,000 L' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ChangeSalespersonDto {
  @ApiProperty({ description: 'The salesperson to give the lead to (must hold leads.receive_qualified)' })
  @IsUUID()
  salesUserId: string;
}

export class PeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01', description: 'First day (business time zone). Default: the 1st of this month' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Last day, inclusive. Default: today' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}
