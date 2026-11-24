import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequirePermissions,
} from '../access-control/access-policy.decorators.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { SetPermissionOverridesDto } from './dto/set-permission-overrides.dto.js';
import { CreateUserDto, DeactivateUserDto, SetImportAccessDto, UpdateUserDto } from './dto/user.dto.js';
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
  create(@CurrentUser() actingUser: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(actingUser, dto);
  }

  @Get('import-access')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @ApiOperation({ summary: 'Who can import leads (leads.import): active non-admin users, from their role or granted (needs permissions.read)' })
  importAccess() {
    return this.users.importAccess();
  }

  @Put(':id/import-access')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_ASSIGN)
  @ApiOperation({
    summary: 'Let one user import leads or not: {enabled} (needs permissions.assign)',
    description: "Grants or revokes leads.import for that user only; their other custom tags stay. Admins always have it.",
  })
  setImportAccess(
    @CurrentUser() actingUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetImportAccessDto,
  ) {
    return this.users.setImportAccess(actingUser, id, dto.enabled);
  }

  @Get('history')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Recent account changes across all users: created, role changed, deactivated, leads handed over, deleted (needs users.read)' })
  recentHistory() {
    return this.users.recentHistory();
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
    return this.users.update(actingUser, id, dto);
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: "One user's account history, newest first (needs users.read)" })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.history(id);
  }

  @Get(':id/removal')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({
    summary: 'What removing this user involves: open leads, attached data, who can take the leads, and whether delete is allowed (needs users.manage)',
  })
  removalCheck(@CurrentUser() actingUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.removalCheck(actingUser, id);
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({
    summary: 'Deactivate a user, handing their open leads to reassignToId first (needs users.manage)',
    description: "They can't sign in and get no more round-robin leads; all their history stays. Required: reassignToId when they hold open leads. The last active admin can't be deactivated.",
  })
  deactivate(@CurrentUser() actingUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeactivateUserDto) {
    return this.users.deactivate(actingUser, id, dto);
  }

  @Post(':id/reactivate')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({ summary: 'Let a deactivated user sign in again (needs users.manage)' })
  reactivate(@CurrentUser() actingUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.reactivate(actingUser, id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @ApiOperation({
    summary: 'Permanently delete a user who has no data (needs users.manage)',
    description: 'Only for accounts nothing points at (no leads, calls, visits, follow-ups, history...). Anyone else: deactivate instead. 409 if they have data.',
  })
  remove(@CurrentUser() actingUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.remove(actingUser, id);
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
