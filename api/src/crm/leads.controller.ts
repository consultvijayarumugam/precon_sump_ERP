import {
  Body,
  Controller,
  Get,
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
import { CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/lead.dto.js';
import { LeadsService } from './leads.service.js';

const SCOPE_NOTE =
  'You see leads assigned to you; with leads.read_all you see every lead.';

@ApiTags('crm: leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'List leads with filters (needs leads.read). Use status=WON for closed/won leads.',
    description: SCOPE_NOTE,
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListLeadsQueryDto) {
    return this.leads.list(user, query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Dashboard counts: leads by status, overdue/upcoming follow-ups',
    description: SCOPE_NOTE,
  })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.leads.summary(user);
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.LEADS_ASSIGN)
  @ApiOperation({ summary: 'Users a lead can be assigned to (needs leads.assign)' })
  assignees() {
    return this.leads.listAssignees();
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.LEADS_AUDIT)
  @ApiOperation({
    summary: "A lead's full change history (admin): who changed what, from and to, when",
    description: 'Status, assignment and handover, field and notes edits, follow-ups, calls, WhatsApp, site visits.',
  })
  history(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.history(user, id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'One lead with all its follow-ups', description: SCOPE_NOTE })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leads.findOne(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.LEADS_WRITE)
  @ApiOperation({
    summary: 'Create a lead (needs leads.write)',
    description:
      'Without leads.assign the lead is assigned to you and assignedToId is not allowed.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(PERMISSIONS.LEADS_WRITE, PERMISSIONS.LEADS_QUALIFY)
  @ApiOperation({
    summary: 'Edit a lead or move it through the pipeline (leads.write, or leads.qualify for your own leads)',
    description:
      'Changing assignedToId also needs leads.assign. With leads.qualify but not leads.write you can only edit leads ' +
      'assigned to you, and not their phone or source. ' + SCOPE_NOTE,
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(user, id, dto);
  }
}
