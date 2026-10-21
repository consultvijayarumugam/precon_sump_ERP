import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AllowanceStatus, AllowanceType, LeaveStatus, LeaveType } from '../../generated/prisma/client.js';
import { IsAmount, IsDateOnly } from '../../finance/dto/common.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const IsMonth = () => Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' });

// --- Leave (#19) -------------------------------------------------------------

export class ApplyLeaveDto {
  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  type: LeaveType;

  @ApiProperty({ example: '2026-10-29' })
  @IsDateOnly()
  startDate: string;

  @ApiProperty({ example: '2026-10-30', description: 'Inclusive; same as startDate for one day' })
  @IsDateOnly()
  endDate: string;

  @ApiProperty({ example: "Cousin's wedding in Madurai" })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class LeaveDecisionDto {
  @ApiPropertyOptional({ description: 'Required when rejecting' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListLeaveQueryDto {
  @ApiPropertyOptional({ enum: LeaveStatus })
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Leave that overlaps from..to' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export class YearQueryDto {
  @ApiPropertyOptional({ example: 2026, description: 'Defaults to this year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: "Someone else's (needs leave.approve)" })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class CalendarQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateOnly()
  from: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateOnly()
  to: string;
}

// --- Holidays (#16) ----------------------------------------------------------

export class HolidayDto {
  @ApiProperty({ example: '2026-11-09' })
  @IsDateOnly()
  date: string;

  @ApiProperty({ example: 'Deepavali' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}

export class UpdateHolidayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateOnly()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;
}

export class HolidayQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

// --- Absences / LOP (#19) ----------------------------------------------------

export class RecordAbsenceDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ example: '2026-10-08' })
  @IsDateOnly()
  date: string;

  @ApiPropertyOptional({ example: 'Did not report; no leave applied' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MonthQueryDto {
  @ApiProperty({ example: '2026-10' })
  @IsMonth()
  month: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}

// --- Allowances (#8) ---------------------------------------------------------

export class CreateAllowanceDto {
  @ApiPropertyOptional({ description: 'Who it is for; someone else needs allowances.manage. Defaults to you.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ enum: AllowanceType })
  @IsEnum(AllowanceType)
  type: AllowanceType;

  @ApiProperty({ example: 350 })
  @IsAmount()
  amount: number;

  @ApiProperty({ example: '2026-10-20' })
  @IsDateOnly()
  date: string;

  @ApiProperty({ example: 'Bus + auto to Divya Hospital, Salem' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  siteVisitId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  installationId?: string | null;
}

export class ListAllowancesQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @IsMonth()
  month?: string;

  @ApiPropertyOptional({ description: "Someone else's (needs allowances.manage)" })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: AllowanceStatus })
  @IsOptional()
  @IsEnum(AllowanceStatus)
  status?: AllowanceStatus;
}

export class AllowanceSummaryQueryDto {
  @ApiProperty({ example: '2026-10' })
  @IsMonth()
  month: string;
}

export class LinkableQueryDto {
  @ApiPropertyOptional({ description: "Someone else's work (needs allowances.manage)" })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
