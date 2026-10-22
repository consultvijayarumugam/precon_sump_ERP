import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { DateRangeQueryDto, OverdueQueryDto } from './dto/sales-order.dto.js';
import {
  CreatePurchaseDto,
  CreateVendorDto,
  RecordVendorPaymentDto,
  UpdateVendorDto,
} from './dto/vendor.dto.js';
import { FinanceReportsService } from './finance-reports.service.js';
import { VendorsService } from './vendors.service.js';

@ApiTags('finance: reports')
@ApiBearerAuth()
@Controller('finance')
export class FinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.FINANCE_DASHBOARD)
  @ApiOperation({ summary: 'Company-wide revenue, receivables and payables (needs finance.dashboard)' })
  summary() {
    return this.reports.summary();
  }

  @Get('revenue-by-employee')
  @RequireAnyPermission(PERMISSIONS.FINANCE_DASHBOARD, PERMISSIONS.SALES_READ)
  @ApiOperation({
    summary: 'Order value and collections per salesperson in a date range',
    description:
      'finance.dashboard: every salesperson. sales.read only: just your own row. Filters on order date; cancelled orders excluded.',
  })
  revenueByEmployee(@CurrentUser() user: AuthenticatedUser, @Query() query: DateRangeQueryDto) {
    const ownOnly = !user.permissions.includes(PERMISSIONS.FINANCE_DASHBOARD);
    return this.reports.revenueByEmployee(query, ownOnly ? user.id : undefined);
  }

  @Get('overdue-balances')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ)
  @ApiOperation({ summary: 'Orders with a balance past their due date, company-wide (needs payments.read)' })
  overdue(@Query() query: OverdueQueryDto) {
    return this.reports.overdueBalances(query);
  }
}

@ApiTags('finance: vendors')
@ApiBearerAuth()
@Controller()
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get('vendors')
  @RequirePermissions(PERMISSIONS.VENDORS_READ)
  @ApiOperation({ summary: 'Vendors with outstanding and overdue payables (needs vendors.read)' })
  list() {
    return this.vendors.list();
  }

  @Get('vendors/:id')
  @RequirePermissions(PERMISSIONS.VENDORS_READ)
  @ApiOperation({ summary: 'Vendor with purchases (unpaid/overdue each) and payments' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.findOne(id);
  }

  @Post('vendors')
  @RequirePermissions(PERMISSIONS.VENDORS_WRITE)
  @ApiOperation({ summary: 'Add a vendor (needs vendors.write)' })
  create(@Body() dto: CreateVendorDto) {
    return this.vendors.create(dto);
  }

  @Patch('vendors/:id')
  @RequirePermissions(PERMISSIONS.VENDORS_WRITE)
  @ApiOperation({ summary: 'Edit a vendor (needs vendors.write)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorDto) {
    return this.vendors.update(id, dto);
  }

  @Post('vendors/:id/purchases')
  @RequirePermissions(PERMISSIONS.VENDORS_WRITE)
  @ApiOperation({ summary: 'Record a purchase/bill from this vendor (needs vendors.write)' })
  addPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.vendors.addPurchase(user.id, id, dto);
  }

  @Post('vendors/:id/payments')
  @RequirePermissions(PERMISSIONS.VENDORS_WRITE)
  @ApiOperation({ summary: 'Record a payment we made to this vendor (needs vendors.write)' })
  addPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordVendorPaymentDto,
  ) {
    return this.vendors.addPayment(user.id, id, dto);
  }

  @Delete('vendor-payments/:paymentId')
  @RequirePermissions(PERMISSIONS.VENDORS_WRITE)
  @ApiOperation({ summary: 'Remove a vendor payment recorded by mistake (needs vendors.write)' })
  deletePayment(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.vendors.deletePayment(paymentId);
  }
}
