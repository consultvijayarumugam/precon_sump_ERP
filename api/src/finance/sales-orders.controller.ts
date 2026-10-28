import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import {
  CreateSalesOrderDto,
  ListSalesOrdersQueryDto,
  RecordPaymentDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto.js';
import { SalesOrdersService } from './sales-orders.service.js';
import { OperationsFeature } from '../features/features.js';

const SCOPE =
  'You see orders credited to you; with sales.read_all you see every order. ' +
  'Paid/balance fields appear only with payments.read.';

@OperationsFeature()
@ApiTags('finance: sales orders & payments')
@ApiBearerAuth()
@Controller()
export class SalesOrdersController {
  constructor(private readonly orders: SalesOrdersService) {}

  @Get('sales-orders')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  @ApiOperation({ summary: 'List sales orders (needs sales.read)', description: SCOPE })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSalesOrdersQueryDto) {
    return this.orders.list(user, query);
  }

  @Get('sales-orders/summary')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  @ApiOperation({ summary: 'This month\'s orders and value, and orders awaiting delivery', description: SCOPE })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.summary(user);
  }

  @Get('sales-orders/:id')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  @ApiOperation({ summary: 'One order (with payments if you hold payments.read)', description: SCOPE })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(user, id);
  }

  @Post('sales-orders')
  @RequirePermissions(PERMISSIONS.SALES_WRITE, PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Convert a WON lead into a sales order (needs sales.write + leads.read)',
    description: 'One order per lead. Revenue is credited to the lead\'s salesperson unless you hold sales.read_all.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalesOrderDto) {
    return this.orders.create(user, dto);
  }

  @Patch('sales-orders/:id')
  @RequirePermissions(PERMISSIONS.SALES_WRITE)
  @ApiOperation({ summary: 'Edit an order (needs sales.write)', description: SCOPE })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesOrderDto,
  ) {
    return this.orders.update(user, id, dto);
  }

  @Post('sales-orders/:id/deliver')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SALES_READ, PERMISSIONS.STOCK_WRITE)
  @ApiOperation({ summary: 'Mark delivered and reduce stock (needs sales.read + stock.write)' })
  deliver(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.deliver(user, id);
  }

  @Post('sales-orders/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SALES_WRITE)
  @ApiOperation({ summary: 'Cancel an undelivered order with no payments (needs sales.write)' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(user, id);
  }

  @Post('sales-orders/:id/payments')
  @RequirePermissions(PERMISSIONS.SALES_READ, PERMISSIONS.PAYMENTS_WRITE)
  @ApiOperation({ summary: 'Record a customer payment (needs payments.write)' })
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.orders.recordPayment(user, id, dto);
  }

  @Delete('payments/:paymentId')
  @RequirePermissions(PERMISSIONS.SALES_READ, PERMISSIONS.PAYMENTS_WRITE)
  @ApiOperation({ summary: 'Remove a payment recorded by mistake (needs payments.write)' })
  deletePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.orders.deletePayment(user, paymentId);
  }
}
