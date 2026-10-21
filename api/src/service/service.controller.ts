import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import {
  CompleteInstallationDto,
  CompleteServiceFollowUpDto,
  CreateInstallationDto,
  CreateServiceFollowUpDto,
  CreateServiceJobDto,
  CreateSiteVisitDto,
  CreateSiteVisitTagDto,
  ListInstallationsQueryDto,
  ListServiceFollowUpsQueryDto,
  ListServiceJobsQueryDto,
  ListSiteVisitsQueryDto,
  UpdateInstallationDto,
  UpdateServiceFollowUpDto,
  UpdateServiceJobDto,
  UpdateSiteVisitDto,
  UpdateSiteVisitTagDto,
} from './dto/service.dto.js';
import { InstallationsService } from './installations.service.js';
import { ServiceJobsService } from './service-jobs.service.js';
import { SiteVisitsService } from './site-visits.service.js';

@ApiTags('service: installations')
@ApiBearerAuth()
@Controller('installations')
export class InstallationsController {
  constructor(private readonly installations: InstallationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_READ)
  @ApiOperation({ summary: 'Installation schedule; filter by status, date range, or assignedTo=me' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListInstallationsQueryDto) {
    return this.installations.list(user, query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_READ)
  @ApiOperation({ summary: 'Counts: scheduled this week, in progress, late, completed' })
  summary() {
    return this.installations.summary();
  }

  @Get('eligible-orders')
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_WRITE)
  @ApiOperation({ summary: 'Sales orders that can be scheduled (not cancelled, no installation yet)' })
  eligibleOrders() {
    return this.installations.eligibleOrders();
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_WRITE)
  @ApiOperation({ summary: 'People who can lead an installation (hold installations.write)' })
  assignees() {
    return this.installations.assignees();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_READ)
  @ApiOperation({ summary: 'One installation with its service jobs' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.installations.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_WRITE)
  @ApiOperation({ summary: 'Schedule an installation for a sales order (needs installations.write)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInstallationDto) {
    return this.installations.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_WRITE)
  @ApiOperation({ summary: 'Reschedule / reassign / edit (not once completed)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInstallationDto) {
    return this.installations.update(id, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_WRITE)
  @ApiOperation({ summary: 'SCHEDULED -> IN_PROGRESS' })
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.installations.start(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INSTALLATIONS_WRITE)
  @ApiOperation({
    summary: '-> COMPLETED; the customer becomes eligible for service jobs',
    description: 'If the order is not delivered yet it is delivered now (stock reduced), which also needs stock.write.',
  })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteInstallationDto,
  ) {
    return this.installations.complete(user, id, dto);
  }
}

const SERVICE_SCOPE =
  'You see jobs for customers you sold to and jobs assigned to you; with service.read_all, every job.';

@ApiTags('service: jobs & follow-ups')
@ApiBearerAuth()
@Controller()
export class ServiceJobsController {
  constructor(private readonly jobs: ServiceJobsService) {}

  @Get('service-jobs')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  @ApiOperation({ summary: 'Service jobs; filter by status, type, priority, assignedTo=me', description: SERVICE_SCOPE })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListServiceJobsQueryDto) {
    return this.jobs.list(user, query);
  }

  @Get('service-jobs/summary')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  @ApiOperation({ summary: 'Open / in-progress / urgent counts and service follow-ups due', description: SERVICE_SCOPE })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.jobs.summary(user);
  }

  @Get('service-jobs/eligible-installations')
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'Completed installations you can raise a job against' })
  eligible(@CurrentUser() user: AuthenticatedUser) {
    return this.jobs.eligibleInstallations(user);
  }

  @Get('service-jobs/assignees')
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'People who can be assigned service work (hold service.write)' })
  assignees() {
    return this.jobs.assignees();
  }

  @Get('service-jobs/:id')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  @ApiOperation({ summary: 'One service job with its follow-ups', description: SERVICE_SCOPE })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.findOne(user, id);
  }

  @Post('service-jobs')
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'Raise a service job on a completed installation (needs service.write)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateServiceJobDto) {
    return this.jobs.create(user, dto);
  }

  @Patch('service-jobs/:id')
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'Update type, priority, assignee, description, status (OPEN -> IN_PROGRESS -> RESOLVED)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceJobDto,
  ) {
    return this.jobs.update(user, id, dto);
  }

  @Get('service-follow-ups')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  @ApiOperation({ summary: 'Service follow-ups; state=pending|overdue|upcoming|completed, from/to, assignedTo=me' })
  listFollowUps(@CurrentUser() user: AuthenticatedUser, @Query() query: ListServiceFollowUpsQueryDto) {
    return this.jobs.listFollowUps(user, query);
  }

  @Post('service-jobs/:id/follow-ups')
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'Schedule a follow-up on a service job' })
  createFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateServiceFollowUpDto,
  ) {
    return this.jobs.createFollowUp(user, id, dto);
  }

  @Patch('service-follow-ups/:id')
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'Reschedule or edit the note' })
  updateFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceFollowUpDto,
  ) {
    return this.jobs.updateFollowUp(user, id, dto);
  }

  @Post('service-follow-ups/:id/complete')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'Record the outcome' })
  completeFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteServiceFollowUpDto,
  ) {
    return this.jobs.completeFollowUp(user, id, dto);
  }

  @Post('service-follow-ups/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SERVICE_WRITE)
  @ApiOperation({ summary: 'Undo a completion' })
  reopenFollowUp(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.reopenFollowUp(user, id);
  }
}

@ApiTags('service: site visits')
@ApiBearerAuth()
@Controller()
export class SiteVisitsController {
  constructor(private readonly visits: SiteVisitsService) {}

  @Get('site-visit-tags')
  @RequirePermissions(PERMISSIONS.SITEVISIT_READ)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'Site-visit tags (active only unless includeInactive=true)' })
  listTags(@Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean) {
    return this.visits.listTags(includeInactive ?? false);
  }

  @Post('site-visit-tags')
  @RequirePermissions(PERMISSIONS.SITEVISIT_MANAGE_TAGS)
  @ApiOperation({ summary: 'Add a site-visit tag (needs sitevisit.manage_tags)' })
  createTag(@Body() dto: CreateSiteVisitTagDto) {
    return this.visits.createTag(dto);
  }

  @Patch('site-visit-tags/:id')
  @RequirePermissions(PERMISSIONS.SITEVISIT_MANAGE_TAGS)
  @ApiOperation({ summary: 'Rename, recolour, or retire (isActive=false) a tag' })
  updateTag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSiteVisitTagDto) {
    return this.visits.updateTag(id, dto);
  }

  @Delete('site-visit-tags/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SITEVISIT_MANAGE_TAGS)
  @ApiOperation({ summary: 'Delete an unused tag (used tags must be retired instead)' })
  async deleteTag(@Param('id', ParseUUIDPipe) id: string) {
    await this.visits.deleteTag(id);
  }

  @Get('site-visits')
  @RequirePermissions(PERMISSIONS.SITEVISIT_READ)
  @ApiOperation({ summary: 'Site visits; filter by tagId, personId, from/to' })
  list(@Query() query: ListSiteVisitsQueryDto) {
    return this.visits.list(query);
  }

  @Get('site-visits/people')
  @RequirePermissions(PERMISSIONS.SITEVISIT_WRITE)
  @ApiOperation({ summary: 'Active users who can be recorded as the visitor' })
  people() {
    return this.visits.people();
  }

  @Get('site-visits/:id')
  @RequirePermissions(PERMISSIONS.SITEVISIT_READ)
  @ApiOperation({ summary: 'One site visit' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.visits.findOne(id);
  }

  @Post('site-visits')
  @RequirePermissions(PERMISSIONS.SITEVISIT_WRITE)
  @ApiOperation({ summary: 'Record a site visit with tags (needs sitevisit.write)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSiteVisitDto) {
    return this.visits.create(user, dto);
  }

  @Patch('site-visits/:id')
  @RequirePermissions(PERMISSIONS.SITEVISIT_WRITE)
  @ApiOperation({ summary: 'Edit a site visit, including its tags' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSiteVisitDto) {
    return this.visits.update(id, dto);
  }
}
