import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { FollowUpsController } from './follow-ups.controller.js';
import { FollowUpsService } from './follow-ups.service.js';
import { LeadNotesController } from './lead-notes.controller.js';
import { LeadNotesService } from './lead-notes.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({
  imports: [AccessControlModule],
  controllers: [LeadsController, LeadNotesController, FollowUpsController],
  providers: [LeadsService, LeadNotesService, FollowUpsService],
})
export class CrmModule {}
