import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { StockModule } from '../stock/stock.module.js';
import { FinanceReportsController, VendorsController } from './finance.controller.js';
import { FinanceReportsService } from './finance-reports.service.js';
import { SalesOrdersController } from './sales-orders.controller.js';
import { SalesOrdersService } from './sales-orders.service.js';
import { VendorsService } from './vendors.service.js';

@Module({
  imports: [AccessControlModule, StockModule],
  controllers: [SalesOrdersController, FinanceReportsController, VendorsController],
  providers: [SalesOrdersService, FinanceReportsService, VendorsService],
  exports: [SalesOrdersService],
})
export class FinanceModule {}
