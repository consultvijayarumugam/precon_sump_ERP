import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  InstallationStatus,
  ServiceFollowUpOutcome,
  ServiceJobPriority,
  ServiceJobStatus,
  ServiceJobType,
} from '../../generated/prisma/client.js';
import { IsDateOnly } from '../../finance/dto/common.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

// --- Installations (#12) ---------------------------------------------------

export class CreateInstallationDto {
  @ApiProperty({ description: 'A sales order that is not cancelled and has no installation yet' })
  @IsUUID()
  salesOrderId: string;

  @ApiProperty({ example: '2026-10-25' })
  @IsDateOnly()
  scheduledDate: string;

  @ApiPropertyOptional({ description: 'Person responsible (must hold installations.write)' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  assignedToId?: string | null;

  @ApiPropertyOptional({ example: 'Crew A (Farid + 3)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  teamName?: string | null;

  @ApiProperty({ example: '12, Gandhi Nagar, Tiruppur 641603' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  siteAddress: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateInstallationDto extends PartialType(OmitType(CreateInstallationDto, ['salesOrderId'] as const)) {}

export class CompleteInstallationDto {
  @ApiPropertyOptional({ example: 'Installed and water-tested; customer signed off' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  completionNotes?: string;
}

export class ListInstallationsQueryDto {
  @ApiPropertyOptional({ enum: InstallationStatus })
  @IsOptional()
  @IsEnum(InstallationStatus)
  status?: InstallationStatus;

  @ApiPropertyOptional({ description: 'scheduledDate >= from' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ description: 'scheduledDate <= to' })
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @ApiPropertyOptional({ enum: ['me'], description: 'Only installations assigned to you' })
  @IsOptional()
  @IsIn(['me'])
  assignedTo?: 'me';
}

// --- Service jobs (#4) -----------------------------------------------------

export class CreateServiceJobDto {
  @ApiProperty({ description: 'A COMPLETED installation' })
  @IsUUID()
  installationId: string;

  @ApiProperty({ enum: ServiceJobType })
  @IsEnum(ServiceJobType)
  type: ServiceJobType;

  @ApiPropertyOptional({ enum: ServiceJobPriority, default: ServiceJobPriority.MEDIUM })
  @IsOptional()
  @IsEnum(ServiceJobPriority)
  priority?: ServiceJobPriority;

  @ApiProperty({ example: 'Water seepage at the inlet pipe joint' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ description: 'Must hold service.write' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  assignedToId?: string | null;
}

export class UpdateServiceJobDto {
  @ApiPropertyOptional({ enum: ServiceJobType })
  @IsOptional()
  @IsEnum(ServiceJobType)
  type?: ServiceJobType;

  @ApiPropertyOptional({ enum: ServiceJobPriority })
  @IsOptional()
  @IsEnum(ServiceJobPriority)
  priority?: ServiceJobPriority;

  @ApiPropertyOptional({ enum: ServiceJobStatus, description: 'OPEN -> IN_PROGRESS -> RESOLVED' })
  @IsOptional()
  @IsEnum(ServiceJobStatus)
  status?: ServiceJobStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  assignedToId?: string | null;

  @ApiPropertyOptional({ description: 'What was done to fix it' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNotes?: string;
}

export class ListServiceJobsQueryDto {
  @ApiPropertyOptional({ enum: ServiceJobStatus })
  @IsOptional()
  @IsEnum(ServiceJobStatus)
  status?: ServiceJobStatus;

  @ApiPropertyOptional({ enum: ServiceJobType })
  @IsOptional()
  @IsEnum(ServiceJobType)
  type?: ServiceJobType;

  @ApiPropertyOptional({ enum: ServiceJobPriority })
  @IsOptional()
  @IsEnum(ServiceJobPriority)
  priority?: ServiceJobPriority;

  @ApiPropertyOptional({ enum: ['me'], description: 'Only jobs assigned to you' })
  @IsOptional()
  @IsIn(['me'])
  assignedTo?: 'me';
}

// --- Service follow-ups (#5) -----------------------------------------------

export class CreateServiceFollowUpDto {
  @ApiProperty({ example: '2026-10-25T10:30:00+05:30' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @ApiPropertyOptional({ example: 'Call to check the seepage has stopped' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateServiceFollowUpDto {
  @ApiPropertyOptional()
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

export class CompleteServiceFollowUpDto {
  @ApiProperty({ enum: ServiceFollowUpOutcome })
  @IsEnum(ServiceFollowUpOutcome)
  outcome: ServiceFollowUpOutcome;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export const SERVICE_FOLLOW_UP_STATES = ['pending', 'overdue', 'upcoming', 'completed'] as const;

export class ListServiceFollowUpsQueryDto {
  @ApiPropertyOptional({ enum: SERVICE_FOLLOW_UP_STATES })
  @IsOptional()
  @IsIn(SERVICE_FOLLOW_UP_STATES)
  state?: (typeof SERVICE_FOLLOW_UP_STATES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ enum: ['me'], description: 'Only follow-ups on jobs assigned to you' })
  @IsOptional()
  @IsIn(['me'])
  assignedTo?: 'me';
}

// --- Site visits (#18) -----------------------------------------------------

export const TAG_COLORS = ['slate', 'sky', 'green', 'amber', 'red', 'violet', 'pink', 'teal'] as const;

export class CreateSiteVisitTagDto {
  @ApiProperty({ example: 'soil-test', description: 'lowercase words joined by hyphens' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : value))
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'name must be lowercase words joined by hyphens' })
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @ApiPropertyOptional({ enum: TAG_COLORS, default: 'slate' })
  @IsOptional()
  @IsIn(TAG_COLORS)
  color?: (typeof TAG_COLORS)[number];
}

export class UpdateSiteVisitTagDto extends PartialType(CreateSiteVisitTagDto) {
  @ApiPropertyOptional({ description: 'false = retire: hidden from pickers, kept on old visits' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSiteVisitDto {
  @ApiProperty({ example: '2026-10-21' })
  @IsDateOnly()
  visitDate: string;

  @ApiPropertyOptional({ description: 'Who visited; defaults to you' })
  @IsOptional()
  @IsUUID()
  personId?: string;

  @ApiProperty({ example: 'Sri Murugan Residency' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customerName: string;

  @ApiProperty({ example: '12, Gandhi Nagar, Tiruppur' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  siteAddress: string;

  @ApiProperty({ example: 'Measure pit for 5-user bio-septic tank' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  purpose: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Link to an installation, if the visit is about one' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  installationId?: string | null;

  @ApiProperty({ type: [String], description: 'Site-visit tag ids (active tags)' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tagIds: string[];
}

export class UpdateSiteVisitDto extends PartialType(CreateSiteVisitDto) {}

export class ListSiteVisitsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  personId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateOnly()
  to?: string;
}
