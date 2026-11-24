import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { SUMP_SIZES_LITRES } from '../../stock/product-catalog.js';
import { normalizeLeadPhone } from '../intake-parsing.js';
import { IsLeadPhone } from '../lead-phone.validator.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

/** Body for POST /public/leads (external systems, API key). */
export class PublicCreateLeadDto {
  @ApiPropertyOptional({ example: 'Ravi Kumar', description: 'Optional: phone is the only required field' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ example: '+91 98765 43210', description: 'Required. Indian mobile with or without +91 (spaces, dashes fine), or 10-15 digits' })
  @Transform(({ value }) => (typeof value === 'string' ? (normalizeLeadPhone(value) ?? value) : value))
  @IsLeadPhone()
  phone: string;

  @ApiPropertyOptional({ enum: ['SUMP', 'MICROBES'], example: 'SUMP', description: 'Leave out if not known yet' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value))
  @IsIn(['SUMP', 'MICROBES'])
  product?: 'SUMP' | 'MICROBES';

  @ApiPropertyOptional({ enum: SUMP_SIZES_LITRES, example: 10000, description: 'Litres; only for SUMP' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsIn(SUMP_SIZES_LITRES as unknown as number[])
  sumpSizeLitres?: number;

  @ApiPropertyOptional({ example: 'Coimbatore' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: 'ravi@example.com' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Asked for a quote on the website' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    enum: ['API', 'WEBSITE', 'REFERRAL', 'OTHER'],
    default: 'API',
    description: 'How the lead found you; defaults to API',
  })
  @IsOptional()
  @Transform(upper)
  @IsIn(['API', 'WEBSITE', 'REFERRAL', 'OTHER'])
  source?: 'API' | 'WEBSITE' | 'REFERRAL' | 'OTHER';

  @ApiPropertyOptional({
    example: 'form-2026-10-22-0042',
    description: "Your own id for this submission. Sending the same id again is reported as a duplicate, not created twice.",
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  externalId?: string;
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Website contact form' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name: string;
}

export class ImportOptionsDto {
  @ApiPropertyOptional({
    enum: ['META', 'WHATSAPP', 'MANUAL', 'WEBSITE', 'REFERRAL', 'OTHER'],
    default: 'MANUAL',
    description: 'Source for rows that leave it blank (e.g. META for a Meta lead export)',
  })
  @IsOptional()
  @Transform(upper)
  @IsIn(['META', 'WHATSAPP', 'MANUAL', 'WEBSITE', 'REFERRAL', 'OTHER'])
  defaultSource?: 'META' | 'WHATSAPP' | 'MANUAL' | 'WEBSITE' | 'REFERRAL' | 'OTHER';

  @ApiPropertyOptional({
    type: String,
    example: '6f1c…,9a2b…',
    description:
      'The telecallers who share THIS upload by round-robin: comma-separated user ids (the Import page checklist). ' +
      "Empty = nobody ticked, which is refused. Leave the field out to use the global round-robin (everyone switched on). " +
      "It doesn't change anyone's on/off switch.",
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null
      ? undefined
      : (Array.isArray(value) ? value : String(value).split(',')).map((v: unknown) => String(v).trim()).filter(Boolean),
  )
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true, message: 'telecallerIds must be user ids' })
  telecallerIds?: string[];
}

export class DistributionQueryDto {
  @ApiPropertyOptional({ example: '2026-10-28', description: 'Business day (YYYY-MM-DD); default today' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

export class SetRotationDto {
  @ApiProperty({ description: 'true = receives round-robin leads; false = skipped' })
  @IsBoolean()
  enabled: boolean;
}

export class TemplateQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';
}
