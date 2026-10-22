import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { SetPermissionOverridesDto } from './dto/set-permission-overrides.dto.js';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';
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

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: "Create a user with a role; their tags are that role's preset (needs users.manage)" })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({
    summary: 'Edit name/phone/active/password or change role (needs users.manage)',
    description: "Changing the role resets the user's tags to the new role's preset. You can't change your own role or deactivate yourself.",
  })
  update(
    @CurrentUser() actingUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actingUser.id, id, dto);
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
