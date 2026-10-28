import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';
import {
  CurrentUser,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { StockMovementReason } from '../generated/prisma/client.js';
import { StockService } from './stock.service.js';
import { OperationsFeature } from '../features/features.js';

const MANUAL_REASONS = [StockMovementReason.PRODUCTION, StockMovementReason.ADJUSTMENT] as const;

class StockMovementDto {
  @ApiProperty({ example: 5, description: '+ adds stock, - removes it' })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  @Min(-100000)
  @Max(100000)
  change: number;

  @ApiProperty({ enum: MANUAL_REASONS, description: 'Deliveries are recorded automatically' })
  @IsIn(MANUAL_REASONS)
  reason: (typeof MANUAL_REASONS)[number];

  @ApiPropertyOptional({ example: 'Batch 42 cured and passed QC' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'nos' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  lowStockThreshold?: number;
}

class MovementsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;
}

@OperationsFeature()
@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Finished-goods stock with low-stock flags (needs stock.read)' })
  list() {
    return this.stock.list();
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Latest 50 stock movements, optionally for one product' })
  movements(@Query() query: MovementsQueryDto) {
    return this.stock.movements(query.productId);
  }

  @Post(':productId/movements')
  @RequirePermissions(PERMISSIONS.STOCK_WRITE)
  @ApiOperation({ summary: 'Add production or adjust stock (needs stock.write)' })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: StockMovementDto,
  ) {
    return this.stock.recordManualMovement(user.id, productId, dto);
  }

  @Patch(':productId')
  @RequirePermissions(PERMISSIONS.STOCK_WRITE)
  @ApiOperation({ summary: 'Change name, unit or low-stock threshold (needs stock.write)' })
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.stock.updateSettings(productId, dto);
  }
}
