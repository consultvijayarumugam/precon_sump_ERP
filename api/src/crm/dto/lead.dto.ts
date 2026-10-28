import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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

/** "98765 43210" / "+91-98765-43210" -> "9876543210" / "+919876543210" */
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s\-().]/g, '') : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Treat "" from a cleared form field as "not set". */
const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export class CreateLeadDto {
  @ApiProperty({ example: 'Ramesh Kumar' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '+919876543210', description: '10-15 digits, optional +' })
  @Transform(normalizePhone)
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be 10-15 digits' })
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

  @ApiProperty({ enum: LeadSource })
  @IsEnum(LeadSource)
  source: LeadSource;

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

  @ApiPropertyOptional({ enum: LeadStatus, default: LeadStatus.NEW })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

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

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

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
