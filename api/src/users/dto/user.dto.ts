import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ROLE_DEFINITIONS } from '../../access-control/permission-catalog.js';

const ROLE_KEYS = ROLE_DEFINITIONS.map((r) => r.key);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.replace(/[\s\-().]/g, '')) : value;

export class CreateUserDto {
  @ApiProperty({ example: 'Meena Raj' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'meena@precon.local' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be 10-15 digits' })
  phone?: string | null;

  @ApiProperty({ enum: ROLE_KEYS, description: "The role's preset decides all of this user's tags" })
  @IsIn(ROLE_KEYS)
  roleKey: string;

  @ApiProperty({ description: 'Initial password (at least 8 characters); share it with them privately' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be 10-15 digits' })
  phone?: string | null;

  @ApiPropertyOptional({
    enum: ROLE_KEYS,
    description: "Changing the role resets the user's tags to that role's preset (custom grants/revokes are cleared)",
  })
  @IsOptional()
  @IsIn(ROLE_KEYS)
  roleKey?: string;

  @ApiPropertyOptional({ description: 'false = cannot sign in' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Set a new password' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
