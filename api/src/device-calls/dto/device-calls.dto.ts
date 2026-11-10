import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeviceCallDirection } from '../../generated/prisma/client.js';

/** One entry from the phone's call log. Who made it comes from the login, never from here. */
export class DeviceCallDto {
  @ApiProperty({ example: '4821', description: "The phone's own id for this call log row" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  deviceCallId: string;

  @ApiProperty({ example: '+919876543210' })
  @Matches(/^\+?\d{3,15}$/, { message: 'phone must be 3-15 digits' })
  phone: string;

  @ApiProperty({ enum: DeviceCallDirection })
  @IsEnum(DeviceCallDirection)
  direction: DeviceCallDirection;

  @ApiProperty({ example: '2026-11-10T09:30:00.000Z' })
  @IsISO8601({ strict: true })
  startedAt: string;

  @ApiProperty({ example: 192, description: 'Seconds connected; 0 if not answered' })
  @IsInt()
  @Min(0)
  @Max(86_400)
  durationSeconds: number;

  @ApiPropertyOptional({ description: 'The lead the app matched. Ignored unless you can see it and the number is on it.' })
  @IsOptional()
  @IsUUID()
  leadId?: string;
}

export class SyncDeviceCallsDto {
  @ApiProperty({ type: [DeviceCallDto], description: 'Up to 200 calls per request' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DeviceCallDto)
  calls: DeviceCallDto[];
}
