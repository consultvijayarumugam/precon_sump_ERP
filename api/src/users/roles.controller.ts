import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../access-control/access-policy.decorators.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('roles & permissions')
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('roles')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @ApiOperation({ summary: 'Roles and their default tags (needs permissions.read)' })
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { key: 'asc' },
      select: {
        key: true,
        name: true,
        description: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    return roles.map(({ permissions, _count, ...role }) => ({
      ...role,
      userCount: _count.users,
      permissions: permissions.map((p) => p.permission.key).sort(),
    }));
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @ApiOperation({ summary: 'All permission tags (needs permissions.read)' })
  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
      select: { key: true, module: true, description: true },
    });
  }
}
