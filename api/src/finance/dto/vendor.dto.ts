import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMode, VendorCategory } from '../../generated/prisma/client.js';
import { AmountProperty, DateProperty, IsAmount, IsDateOnly } from './common.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value !== '' ? value.replace(/[\s\-().]/g, '') : emptyToNull({ value });

export class CreateVendorDto {
  @ApiProperty({ example: 'Ramco Cement Dealers' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: VendorCategory })
  @IsEnum(VendorCategory)
  category: VendorCategory;

  @ApiPropertyOptional({ example: 'Mr. Selvam' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  contactPerson?: string | null;

  @ApiPropertyOptional({ example: '9842012345' })
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be 10-15 digits' })
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateVendorDto extends PartialType(CreateVendorDto) {}

export class CreatePurchaseDto {
  @ApiProperty({ example: 'OPC 53 cement, 200 bags' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  item: string;

  @ApiPropertyOptional({ example: 'INV-1042' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceNumber?: string;

  @AmountProperty()
  @IsAmount()
  amount: number;

  @DateProperty()
  @IsDateOnly()
  purchaseDate: string;

  @DateProperty('2026-11-20')
  @IsDateOnly()
  dueDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RecordVendorPaymentDto {
  @AmountProperty()
  @IsAmount()
  amount: number;

  @DateProperty()
  @IsDateOnly()
  paidOn: string;

  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  mode: PaymentMode;

  @ApiPropertyOptional()
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
