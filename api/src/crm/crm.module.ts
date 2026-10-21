import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { FollowUpsController } from './follow-ups.controller.js';
import { FollowUpsService } from './follow-ups.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({
  imports: [AccessControlModule],
  controllers: [LeadsController, FollowUpsController],
  providers: [LeadsService, FollowUpsService],
})
export class CrmModule {}
