import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { InstallationsService } from './installations.service.js';
import { InstallationsController, ServiceJobsController, SiteVisitsController } from './service.controller.js';
import { ServiceJobsService } from './service-jobs.service.js';
import { SiteVisitsService } from './site-visits.service.js';

@Module({
  imports: [AccessControlModule, FinanceModule],
  controllers: [InstallationsController, ServiceJobsController, SiteVisitsController],
  providers: [InstallationsService, ServiceJobsService, SiteVisitsService],
})
export class ServiceModule {}
