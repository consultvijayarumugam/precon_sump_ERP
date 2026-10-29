import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { CheckInsService } from './check-ins.service.js';
import { DashboardsService } from './dashboards.service.js';
import { ChangeSalespersonDto, CheckInDto, LogCallDto, NextCallbackDto, QualifyLeadDto } from './dto/workflow.dto.js';
import { LeadActionsService } from './lead-actions.service.js';

const SCOPE = 'Only leads you can see (404 otherwise).';

@ApiTags('crm: telecaller and sales actions')
@ApiBearerAuth()
@Controller()
export class LeadActionsController {
  constructor(
    private readonly actions: LeadActionsService,
    private readonly checkIns: CheckInsService,
  ) {}

  @Get('sales-team')
  @RequireAnyPermission(PERMISSIONS.LEADS_QUALIFY, PERMISSIONS.LEADS_WRITE)
  @ApiOperation({ summary: 'Salespeople who can receive qualified leads, and who the round-robin picks next' })
  salesTeam() {
    return this.actions.salesTeam();
  }

  @Post('leads/:id/calls')
  @RequirePermissions(PERMISSIONS.FOLLOWUPS_WRITE)
  @ApiOperation({
    summary: 'Log a call and its outcome (optionally set the next callback)',
    description:
      'Completes any pending callback on the lead. A first call moves New to Contacted; NOT_INTERESTED and WRONG_NUMBER close it as Lost. ' +
      SCOPE,
  })
  logCall(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LogCallDto) {
    return this.actions.logCall(user, id, dto);
  }

  @Put('leads/:id/salesperson')
  @RequireAnyPermission(PERMISSIONS.LEADS_QUALIFY, PERMISSIONS.LEADS_ASSIGN)
  @ApiOperation({
    summary: 'Change the salesperson on a handed-over lead (the telecaller who handled it, or leads.assign)',
    description: 'Only after handover (Qualified or later). Notifies the new salesperson and records it in the history.',
  })
  changeSalesperson(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeSalespersonDto) {
    return this.actions.changeSalesperson(user, id, dto.salesUserId);
  }

  @Get('leads/:id/visits')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Site visits (GPS check-ins) recorded on a lead. ' + SCOPE })
  visits(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkIns.forLead(user, id);
  }

  @Get('leads/:id/calls')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Call history of a lead, newest first. ' + SCOPE })
  callHistory(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.callHistory(user, id);
  }

  @Put('leads/:id/next-callback')
  @RequirePermissions(PERMISSIONS.FOLLOWUPS_WRITE)
  @ApiOperation({ summary: "Set or move the lead's next callback (reschedules the pending one, or adds one). " + SCOPE })
  setNextCallback(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NextCallbackDto) {
    return this.actions.setNextCallback(user, id, dto);
  }

  @Post('leads/:id/qualify')
  @HttpCode(200)
  @RequireAnyPermission(PERMISSIONS.LEADS_QUALIFY, PERMISSIONS.LEADS_WRITE)
  @ApiOperation({
    summary: 'Qualify a lead and hand it to sales',
    description:
      'Fills product/size/city/notes, sets status Qualified and assigns it to salesUserId, or the next salesperson in the sales ' +
      'round-robin (leads.receive_qualified holders who are switched on). With leads.qualify only: your own New/Contacted leads.',
  })
  qualify(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QualifyLeadDto) {
    return this.actions.qualify(user, id, dto);
  }
}

@ApiTags('dashboards')
@ApiBearerAuth()
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('telecaller')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Telecaller workbench: your New/Contacted leads in call order, and today’s counts',
    description: 'Order: overdue callbacks, callbacks due today, new (never called), called but no callback set, callbacks later.',
  })
  telecaller(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboards.telecaller(user);
  }

  @Get('sales')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Sales dashboard: your qualified → quoted → won/lost pipeline, follow-ups due, revenue, check-ins' })
  sales(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboards.sales(user);
  }

  @Get('master')
  @RequirePermissions(PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_ASSIGN)
  @ApiOperation({ summary: 'Master dashboard: per-person scorecards, accountability flags, today’s split, site-visit map' })
  master() {
    return this.dashboards.master();
  }
}

@ApiTags('operations: GPS check-ins')
@ApiBearerAuth()
@Controller('check-ins')
export class CheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.SITEVISIT_WRITE)
  @ApiOperation({
    summary: '"I\'m at site": store one GPS reading (lat/long + time) as a visit to one of your leads',
    description: 'Point-in-time only, from the browser; no tracking. leadId is required and must be a lead assigned to you.',
  })
  checkIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckInDto) {
    return this.checkIns.checkIn(user, dto);
  }

  @Get('leads')
  @RequirePermissions(PERMISSIONS.SITEVISIT_WRITE)
  @ApiOperation({ summary: 'Leads you can record a visit for: only those assigned to you (not lost)' })
  visitableLeads(@CurrentUser() user: AuthenticatedUser) {
    return this.checkIns.visitableLeads(user);
  }

  @Get('mine')
  @RequirePermissions(PERMISSIONS.SITEVISIT_READ)
  @ApiOperation({ summary: 'Your recent check-ins with location' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.checkIns.recent({ personId: user.id, take: 30 });
  }
}
