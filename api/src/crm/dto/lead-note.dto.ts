import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LeadNoteDto {
  @ApiProperty({ example: 'Customer wants the 5,000 L size; call after 6 pm.', maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Write something first' })
  @MaxLength(2000)
  body: string;
}
