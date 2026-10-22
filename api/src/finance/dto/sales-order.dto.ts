import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PaymentMode,
  ProductInterest,
  SalesOrderStatus,
} from '../../generated/prisma/client.js';
import { SUMP_SIZES_LITRES } from '../../stock/product-catalog.js';
import { AmountProperty, DateProperty, IsAmount, IsDateOnly } from './common.dto.js';

export class CreateSalesOrderDto {
  @ApiProperty({ description: 'A WON lead you can see, with no order yet' })
  @IsUUID()
  leadId: string;

  @ApiPropertyOptional({ enum: ProductInterest, description: "Defaults to the lead's product interest" })
  @IsOptional()
  @IsEnum(ProductInterest)
  product?: ProductInterest;

  @ApiPropertyOptional({
    enum: SUMP_SIZES_LITRES,
    description: "Sump size in litres (required for a sump; defaults to the lead's size). Not used for microbes.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(SUMP_SIZES_LITRES as unknown as number[])
  sizeLitres?: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity: number;

  @AmountProperty('Order value in rupees')
  @IsAmount()
  totalAmount: number;

  @DateProperty('2026-10-21', false)
  @IsOptional()
  @IsDateOnly()
  orderDate?: string;

  @DateProperty('2026-11-20', false)
  @IsOptional()
  @IsDateOnly()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: "Who gets the revenue credit. Defaults to the lead's salesperson; setting someone else needs sales.read_all.",
  })
  @IsOptional()
  @IsUUID()
  salespersonId?: string;
}

export class UpdateSalesOrderDto {
  @ApiPropertyOptional({ enum: ProductInterest, description: 'Only before delivery' })
  @IsOptional()
  @IsEnum(ProductInterest)
  product?: ProductInterest;

  @ApiPropertyOptional({
    enum: SUMP_SIZES_LITRES,
    description: "Sump size in litres (only before delivery). Not used for microbes.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(SUMP_SIZES_LITRES as unknown as number[])
  sizeLitres?: number;

  @ApiPropertyOptional({ description: 'Only before delivery' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity?: number;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsAmount()
  totalAmount?: number;

  @DateProperty('2026-10-21', false)
  @IsOptional()
  @IsDateOnly()
  orderDate?: string;

  @DateProperty('2026-11-20', false)
  @IsOptional()
  @IsDateOnly()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Needs sales.read_all' })
  @IsOptional()
  @IsUUID()
  salespersonId?: string;
}

export class ListSalesOrdersQueryDto {
  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @ApiPropertyOptional({ description: 'orderDate >= from' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ description: 'orderDate <= to' })
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

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

export class RecordPaymentDto {
  @AmountProperty()
  @IsAmount()
  amount: number;

  @DateProperty()
  @IsDateOnly()
  paidOn: string;

  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  mode: PaymentMode;

  @ApiPropertyOptional({ description: 'UTR / cheque number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

export const OVERDUE_SORTS = ['oldest', 'largest'] as const;

export class OverdueQueryDto {
  @ApiPropertyOptional({ enum: OVERDUE_SORTS, default: 'oldest' })
  @IsOptional()
  @IsIn(OVERDUE_SORTS)
  sort: (typeof OVERDUE_SORTS)[number] = 'oldest';
}
