import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class QuickAddLeadDto {
  @ApiProperty({ example: '98765 43210', description: 'Indian mobile, with or without +91 (spaces and dashes are fine)' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional({ example: 'Ravi', description: 'Blank is fine: the telecaller fills it in on the call' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Hi, I want a 5000 litre sump. Price?', description: 'Their first WhatsApp message, pasted' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;
}
