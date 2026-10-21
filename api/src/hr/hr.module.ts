import { Module } from '@nestjs/common';
import { AllowancesService } from './allowances.service.js';
import {
  AllowancesController,
  HolidaysController,
  HrController,
  LeaveController,
  LopController,
} from './hr.controller.js';
import { HolidaysService } from './holidays.service.js';
import { LeaveService } from './leave.service.js';
import { LopService } from './lop.service.js';
import { WorkingCalendarService } from './working-calendar.service.js';

@Module({
  controllers: [LeaveController, HolidaysController, LopController, AllowancesController, HrController],
  providers: [WorkingCalendarService, LeaveService, HolidaysService, LopService, AllowancesService],
})
export class HrModule {}
