import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, Matches, Max, Min } from 'class-validator';

/** A calendar date "YYYY-MM-DD" (no time, no zone). */
export const IsDateOnly = () =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property must be YYYY-MM-DD' }),
    IsISO8601({ strict: true }, { message: '$property must be a real date' }),
  );

/** Rupee amount > 0 with at most 2 decimals. */
export const IsAmount = () =>
  applyDecorators(
    Type(() => Number),
    IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }),
    Min(0.01),
    Max(9_999_999_999.99),
  );

export const AmountProperty = (description?: string) =>
  ApiProperty({ example: 25000, description: description ?? 'Rupees, up to 2 decimals' });

export const DateProperty = (example = '2026-10-21', required = true) =>
  required ? ApiProperty({ example }) : ApiPropertyOptional({ example });
