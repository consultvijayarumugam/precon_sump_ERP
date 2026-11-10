import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { DeviceCallsService } from './device-calls.service.js';
import { SyncDeviceCallsDto } from './dto/device-calls.dto.js';

@ApiTags('crm: call-log sync (mobile app)')
@ApiBearerAuth()
@Controller()
export class DeviceCallsController {
  constructor(private readonly deviceCalls: DeviceCallsService) {}

  @Get('device-calls/lead-numbers')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Phone numbers of the leads you can see',
    description: 'The app only looks for these numbers in the phone call log; everything else stays on the phone.',
  })
  leadNumbers(@CurrentUser() user: AuthenticatedUser) {
    return this.deviceCalls.leadNumbers(user);
  }

  @Post('device-calls/sync')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({
    summary: 'Send real calls from your phone (up to 200 at a time)',
    description:
      'Always stored as your own calls: the user comes from your login. Sending the same call twice stores it once. ' +
      'A call is put on a lead only if you can see that lead and the number is on it.',
  })
  sync(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncDeviceCallsDto) {
    return this.deviceCalls.sync(user, dto);
  }

  @Get('leads/:id/device-calls')
  @RequirePermissions(PERMISSIONS.LEADS_READ)
  @ApiOperation({ summary: 'Real calls on a lead with their durations, newest first. Only leads you can see (404 otherwise).' })
  forLead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deviceCalls.forLead(user, id);
  }
}
