import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateOnly } from '../../finance/dto/common.dto.js';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  LeadSource,
  LeadStatus,
  ProductInterest,
} from '../../generated/prisma/client.js';
import { SUMP_SIZES_LITRES } from '../../stock/product-catalog.js';
import { normalizeLeadPhone } from '../../intake/intake-parsing.js';
import { IsLeadPhone } from '../../intake/lead-phone.validator.js';

/** Any Indian mobile -> "+919876543210" (see normalizeLeadPhone); junk is left as typed so validation rejects it. */
const normalizePhone = ({ value }: { value: unknown }) => (typeof value === 'string' ? (normalizeLeadPhone(value) ?? value) : value);

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Treat "" from a cleared form field as "not set". */
const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

/** Phone is the ONLY required field: enquiries often arrive as just a WhatsApp number. */
export class CreateLeadDto {
  @ApiPropertyOptional({ example: 'Ramesh Kumar', nullable: true, description: 'Optional; screens show the phone until a name is added' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @ApiProperty({ example: '9791006137', description: 'Required. An Indian mobile with or without +91 (stored as +919791006137), or 10-15 digits' })
  @Transform(normalizePhone)
  @IsLeadPhone()
  phone: string;

  @ApiPropertyOptional({ example: 'ramesh@example.com' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ example: 'Coimbatore' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.MANUAL })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ enum: ProductInterest, nullable: true, description: 'Null or left out = not known yet' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsEnum(ProductInterest)
  productInterest?: ProductInterest | null;

  @ApiPropertyOptional({
    enum: SUMP_SIZES_LITRES,
    description: 'Sump size in litres the customer is interested in, if known. Ignored for microbes.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsIn(SUMP_SIZES_LITRES as unknown as number[])
  sumpSizeLitres?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Salesperson to assign (needs leads.assign). Null = unassigned.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  assignedToId?: string | null;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @ApiPropertyOptional({ description: 'Pipeline stage to move the lead into (see /pipeline-stages). Wins over status. Only a label: it never changes who owns the lead. New leads always start in New.' })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiPropertyOptional({ enum: LeadStatus, description: 'Older way to move a lead: goes to the matching stage' })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Construction stage (see /construction-stages); null = Not known. Only a label: never changes who has the lead.',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  constructionStageId?: string | null;
}

export class ListLeadsQueryDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ enum: ProductInterest })
  @IsOptional()
  @IsEnum(ProductInterest)
  productInterest?: ProductInterest;

  @ApiPropertyOptional({ description: 'Filter by salesperson (within your scope)' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Only leads with this lead status (pipeline stage)' })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiPropertyOptional({ description: "Only leads at this construction stage; 'none' = Not known" })
  @IsOptional()
  @Matches(/^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, { message: "constructionStageId must be a construction stage id or 'none'" })
  constructionStageId?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Won on or after this day (closedAt, business time zone)' })
  @IsOptional()
  @IsDateOnly()
  wonFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Won on or before this day (inclusive)' })
  @IsOptional()
  @IsDateOnly()
  wonTo?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Added on or after this day (createdAt, business time zone)' })
  @IsOptional()
  @IsDateOnly()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Added on or before this day (inclusive)' })
  @IsOptional()
  @IsDateOnly()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Matches name, phone or city' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}
