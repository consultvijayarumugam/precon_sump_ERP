import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { DeviceCallsController } from './device-calls.controller.js';
import { DeviceCallsService } from './device-calls.service.js';

/** Call-log sync from the mobile app and the talk-time figures built from it. */
@Module({
  imports: [AccessControlModule],
  controllers: [DeviceCallsController],
  providers: [DeviceCallsService],
  exports: [DeviceCallsService],
})
export class DeviceCallsModule {}
