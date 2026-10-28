import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

export class CreateTemplateDto {
  @ApiProperty({ example: 'Intro message' })
  @Transform(trim)
  @IsString({ message: 'Give the template a name' })
  @MinLength(2, { message: 'Give the template a name (at least 2 characters)' })
  @MaxLength(60, { message: 'Keep the name under 60 characters' })
  name: string;

  @ApiProperty({ example: 'Hi {first_name}, this is {my_name} from {company}. Thanks for your interest in our sumps!' })
  @Transform(trim)
  @IsString({ message: 'Write the message' })
  @MinLength(5, { message: 'Write the message (at least 5 characters)' })
  @MaxLength(1500, { message: 'Keep the message under 1,500 characters' })
  body: string;

  @ApiPropertyOptional({ description: 'Lower numbers show first', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}

export class StartWhatsAppDto {
  @ApiPropertyOptional({ description: 'Template to fill from the lead; leave out to send `message` (or nothing)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ description: 'Typed message when no template is used' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  message?: string;
}

export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ description: 'Include switched-off templates (templates.manage only)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  all?: boolean;
}
