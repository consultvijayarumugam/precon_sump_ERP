import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { IntakeModule } from '../intake/intake.module.js';
import { CheckInsService } from './check-ins.service.js';
import { DashboardsService } from './dashboards.service.js';
import { LeadActionsService } from './lead-actions.service.js';
import { CheckInsController, DashboardsController, LeadActionsController } from './workflow.controller.js';

/**
 * The sales + telecaller workflow: call logging, callbacks, qualification and
 * handover to sales (round-robin), GPS site check-ins, and the data behind the
 * telecaller, sales and master dashboards.
 */
@Module({
  imports: [AccessControlModule, IntakeModule],
  controllers: [LeadActionsController, DashboardsController, CheckInsController],
  providers: [LeadActionsService, DashboardsService, CheckInsService],
})
export class WorkflowModule {}
