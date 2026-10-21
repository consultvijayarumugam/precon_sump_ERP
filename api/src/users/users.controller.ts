import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { SetPermissionOverridesDto } from './dto/set-permission-overrides.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'List users (needs users.read)' })
  findAll() {
    return this.users.findAll();
  }

  @Get(':id/permissions')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @ApiOperation({
    summary: "A user's role tags, overrides and effective tags (needs permissions.read)",
  })
  getPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getPermissionSummary(id);
  }

  @Put(':id/permissions')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_ASSIGN)
  @ApiOperation({
    summary: "Replace a user's grant/revoke tag overrides (needs permissions.assign)",
  })
  setPermissions(
    @CurrentUser() actingUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPermissionOverridesDto,
  ) {
    return this.users.setPermissionOverrides(actingUser.id, id, dto);
  }
}
