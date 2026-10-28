import { Module } from '@nestjs/common';
import { IntakeModule } from '../intake/intake.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** CRM reports with date ranges and CSV / Excel export, scoped by tag. */
@Module({
  imports: [IntakeModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
