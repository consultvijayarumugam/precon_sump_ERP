import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
  RequireAnyPermission,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AllowancesService } from './allowances.service.js';
import {
  AllowanceSummaryQueryDto,
  ApplyLeaveDto,
  CalendarQueryDto,
  CreateAllowanceDto,
  HolidayDto,
  HolidayQueryDto,
  LeaveDecisionDto,
  LinkableQueryDto,
  ListAllowancesQueryDto,
  ListLeaveQueryDto,
  MonthQueryDto,
  RecordAbsenceDto,
  UpdateHolidayDto,
  YearQueryDto,
} from './dto/hr.dto.js';
import { HolidaysService } from './holidays.service.js';
import { LeaveService } from './leave.service.js';
import { LopService } from './lop.service.js';
import { OperationsFeature } from '../features/features.js';

@OperationsFeature()
@ApiTags('hr: leave')
@ApiBearerAuth()
@Controller('leave')
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly lop: LopService,
  ) {}

  @Get('mine')
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  @ApiOperation({ summary: 'Your leave applications for a year (with working-day counts)' })
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: YearQueryDto) {
    return this.leave.listMine(user, query.year);
  }

  @Get('balance')
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  @ApiOperation({ summary: 'Paid leave balance for a year: yours, or userId= with leave.approve' })
  balance(@CurrentUser() user: AuthenticatedUser, @Query() query: YearQueryDto) {
    if (query.userId && query.userId !== user.id && !user.permissions.includes(PERMISSIONS.LEAVE_APPROVE)) {
      throw new ForbiddenException(`Missing permission tag(s): ${PERMISSIONS.LEAVE_APPROVE}`);
    }
    return this.leave.balance(query.userId ?? user.id, query.year);
  }

  @Get('lop/mine')
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  @ApiOperation({ summary: 'Your LOP summary for a month' })
  myLop(@CurrentUser() user: AuthenticatedUser, @Query() query: MonthQueryDto) {
    return this.lop.mySummary(user, query.month);
  }

  @Get('calendar')
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({
    summary: 'Team calendar: holidays + who is on approved leave (≤ ~2 months)',
    description: 'Leave type only shown to approvers and the person themselves; approvers also see pending.',
  })
  calendar(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarQueryDto) {
    return this.leave.teamCalendar(user, query.from, query.to);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  @ApiOperation({ summary: 'Apply for leave (casual and sick are checked against your balance)' })
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyLeaveDto) {
    return this.leave.apply(user, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  @ApiOperation({ summary: 'Withdraw your own leave (pending, or approved and not yet started)' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.cancel(user, id);
  }

  @Get('applications')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: "Everyone's applications (pending first); filter by status, userId, from/to" })
  applications(@Query() query: ListLeaveQueryDto) {
    return this.leave.listAll(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Approve a pending application (not your own)' })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeaveDecisionDto) {
    return this.leave.decide(user, id, 'APPROVED', dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Reject a pending application with a reason (not your own)' })
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeaveDecisionDto) {
    return this.leave.decide(user, id, 'REJECTED', dto.note);
  }
}

@OperationsFeature()
@ApiTags('hr: holidays')
@ApiBearerAuth()
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({ summary: 'Company holidays for a year' })
  list(@Query() query: HolidayQueryDto) {
    return this.holidays.list(query.year);
  }

  @Get('upcoming')
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({ summary: 'Next 3 holidays' })
  upcoming() {
    return this.holidays.upcoming();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.HOLIDAYS_MANAGE)
  @ApiOperation({ summary: 'Add a holiday (needs holidays.manage)' })
  create(@Body() dto: HolidayDto) {
    return this.holidays.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.HOLIDAYS_MANAGE)
  @ApiOperation({ summary: 'Rename or move a holiday' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHolidayDto) {
    return this.holidays.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.HOLIDAYS_MANAGE)
  @ApiOperation({ summary: 'Remove a holiday' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.holidays.remove(id);
  }
}

@OperationsFeature()
@ApiTags('hr: LOP & absences')
@ApiBearerAuth()
@Controller('lop')
export class LopController {
  constructor(private readonly lop: LopService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({
    summary: 'Monthly LOP summary for every active employee (needs leave.approve)',
    description:
      'Working days, paid leave, unpaid leave, absences without approval, LOP, present-equivalent and paid days. See lop.service.ts for the rules.',
  })
  summary(@Query() query: MonthQueryDto) {
    return this.lop.monthlySummary(query.month, query.userId);
  }

  @Get('absences')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Recorded absences without approval in a month' })
  absences(@Query() query: MonthQueryDto) {
    return this.lop.listAbsences(query.month, query.userId);
  }

  @Post('absences')
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Record a working day someone was away without approved leave (counts as LOP)' })
  recordAbsence(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordAbsenceDto) {
    return this.lop.recordAbsence(user, dto);
  }

  @Delete('absences/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Remove an absence recorded by mistake' })
  async deleteAbsence(@Param('id', ParseUUIDPipe) id: string) {
    await this.lop.deleteAbsence(id);
  }
}

@OperationsFeature()
@ApiTags('hr: allowances')
@ApiBearerAuth()
@Controller('allowances')
export class AllowancesController {
  constructor(private readonly allowances: AllowancesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ALLOWANCES_READ)
  @ApiOperation({ summary: 'Allowances: yours, or everyone\'s with allowances.manage. Filter by month, userId, status' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListAllowancesQueryDto) {
    return this.allowances.list(user, query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.ALLOWANCES_READ)
  @ApiOperation({ summary: 'Monthly approved/pending totals per employee (yours, or all with allowances.manage)' })
  summary(@CurrentUser() user: AuthenticatedUser, @Query() query: AllowanceSummaryQueryDto) {
    return this.allowances.monthlySummary(user, query.month);
  }

  @Get('linkable')
  @RequireAnyPermission(PERMISSIONS.ALLOWANCES_CLAIM, PERMISSIONS.ALLOWANCES_MANAGE)
  @ApiOperation({ summary: "Recent site visits / installations an allowance can be linked to (the employee's own)" })
  linkable(@CurrentUser() user: AuthenticatedUser, @Query() query: LinkableQueryDto) {
    return this.allowances.linkable(user, query.userId);
  }

  @Post()
  @RequireAnyPermission(PERMISSIONS.ALLOWANCES_CLAIM, PERMISSIONS.ALLOWANCES_MANAGE)
  @ApiOperation({
    summary: 'Claim your own allowance (pending), or add one for anyone with allowances.manage (approved)',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAllowanceDto) {
    return this.allowances.create(user, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ALLOWANCES_MANAGE)
  @ApiOperation({ summary: 'Approve a pending claim' })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeaveDecisionDto) {
    return this.allowances.decide(user, id, 'APPROVED', dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ALLOWANCES_MANAGE)
  @ApiOperation({ summary: 'Reject a pending claim with a reason' })
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeaveDecisionDto) {
    return this.allowances.decide(user, id, 'REJECTED', dto.note);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireAnyPermission(PERMISSIONS.ALLOWANCES_CLAIM, PERMISSIONS.ALLOWANCES_MANAGE)
  @ApiOperation({ summary: 'Withdraw your pending claim, or remove any entry with allowances.manage' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.allowances.remove(user, id);
  }
}

@OperationsFeature()
@ApiTags('hr: employees')
@ApiBearerAuth()
@Controller('hr')
export class HrController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('employees')
  @RequireAnyPermission(PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.ALLOWANCES_MANAGE)
  @ApiOperation({ summary: 'Active employees, for pickers (needs leave.approve or allowances.manage)' })
  employees() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, role: { select: { name: true } } },
    });
  }
}
