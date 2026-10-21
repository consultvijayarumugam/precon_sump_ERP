import {
  Body,
  Controller,
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
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import {
  CompleteFollowUpDto,
  CreateFollowUpDto,
  ListFollowUpsQueryDto,
  UpdateFollowUpDto,
} from './dto/follow-up.dto.js';
import { FollowUpsService } from './follow-ups.service.js';

@ApiTags('crm: follow-ups')
@ApiBearerAuth()
@Controller()
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get('follow-ups')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Follow-ups on leads you can see; filter by state and date range (calendar)',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListFollowUpsQueryDto) {
    return this.followUps.list(user, query);
  }

  @Post('leads/:leadId/follow-ups')
  @RequirePermissions(PERMISSIONS.FOLLOWUPS_WRITE)
  @ApiOperation({ summary: 'Schedule a follow-up on a lead (needs followups.write)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    return this.followUps.create(user, leadId, dto);
  }

  @Patch('follow-ups/:id')
  @RequirePermissions(PERMISSIONS.FOLLOWUPS_WRITE)
  @ApiOperation({ summary: 'Reschedule or edit the note (needs followups.write)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFollowUpDto,
  ) {
    return this.followUps.update(user, id, dto);
  }

  @Post('follow-ups/:id/complete')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FOLLOWUPS_WRITE)
  @ApiOperation({ summary: 'Record the outcome; marks it done (needs followups.write)' })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteFollowUpDto,
  ) {
    return this.followUps.complete(user, id, dto);
  }

  @Post('follow-ups/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FOLLOWUPS_WRITE)
  @ApiOperation({ summary: 'Clear the outcome; back to pending (needs followups.write)' })
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.followUps.reopen(user, id);
  }
}
