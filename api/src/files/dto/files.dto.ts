import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FileCategory } from '../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

/** The text fields sent with an upload (multipart/form-data, next to `file`). */
export class UploadFileDto {
  @ApiProperty({ example: 'Precon Sump brochure 2026' })
  @Transform(trim)
  @IsString({ message: 'Give the file a title' })
  @MinLength(2, { message: 'Give the file a title (at least 2 characters)' })
  @MaxLength(80, { message: 'Keep the title under 80 characters' })
  title: string;

  @ApiPropertyOptional({ enum: FileCategory, default: FileCategory.OTHER })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(FileCategory, { message: 'Pick a category from the list' })
  category?: FileCategory;
}

export class UpdateFileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Give the file a title (at least 2 characters)' })
  @MaxLength(80, { message: 'Keep the title under 80 characters' })
  title?: string;

  @ApiPropertyOptional({ enum: FileCategory })
  @IsOptional()
  @IsEnum(FileCategory, { message: 'Pick a category from the list' })
  category?: FileCategory;
}
