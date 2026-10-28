import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { IsDateOnly } from '../../finance/dto/common.dto.js';

export class ReportQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'First day (business time zone). Default: 1st of this month' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Last day, inclusive. Default: today' })
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], description: 'Download instead of JSON' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';
}
