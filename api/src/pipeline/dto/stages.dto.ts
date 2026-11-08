import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

export class CreateStageDto {
  @ApiProperty({ example: 'Site visit done' })
  @Transform(trim)
  @IsString({ message: 'Give the stage a name' })
  @MinLength(2, { message: 'Give the stage a name (at least 2 characters)' })
  @MaxLength(40, { message: 'Keep the name under 40 characters' })
  name: string;

  @ApiPropertyOptional({ description: 'Put it right after this stage (New or a middle stage). Default: just before Won/Lost.' })
  @IsOptional()
  @IsUUID()
  afterStageId?: string;
}

export class UpdateStageDto {
  @ApiPropertyOptional({ example: 'Ready for sales' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Give the stage a name (at least 2 characters)' })
  @MaxLength(40, { message: 'Keep the name under 40 characters' })
  name?: string;

  @ApiPropertyOptional({ description: 'false = hidden from the stage picker; its leads stay where they are' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderStagesDto {
  @ApiProperty({ description: 'Every middle stage id, in the new order (New stays first, Won/Lost last)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  ids: string[];
}
