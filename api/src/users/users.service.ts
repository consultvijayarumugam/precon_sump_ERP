import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { PermissionEffect } from '../generated/prisma/client.js';
import { SetPermissionOverridesDto } from './dto/set-permission-overrides.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        role: { select: { key: true, name: true } },
      },
    });
  }

  async getPermissionSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: {
          select: {
            key: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
        permissionOverrides: {
          select: { effect: true, permission: { select: { key: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const overrides = (effect: PermissionEffect) =>
      user.permissionOverrides
        .filter((o) => o.effect === effect)
        .map((o) => o.permission.key)
        .sort();

    return {
      userId: user.id,
      email: user.email,
      role: user.role.key,
      rolePermissions: user.role.permissions.map((p) => p.permission.key).sort(),
      granted: overrides(PermissionEffect.GRANT),
      revoked: overrides(PermissionEffect.REVOKE),
      effective: await this.accessControl.getEffectiveAccess(user.id),
    };
  }

  /** Replaces all of a user's grant/revoke overrides in one go. */
  async setPermissionOverrides(
    actingUserId: string,
    userId: string,
    dto: SetPermissionOverridesDto,
  ) {
    if (actingUserId === userId) {
      throw new BadRequestException(
        'You cannot change your own permission tags; ask another admin',
      );
    }
    const overlap = dto.grant.filter((k) => dto.revoke.includes(k));
    if (overlap.length > 0) {
      throw new BadRequestException(
        `Tag(s) both granted and revoked: ${overlap.join(', ')}`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const requestedKeys = [...dto.grant, ...dto.revoke];
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: requestedKeys } },
      select: { id: true, key: true },
    });
    const idByKey = new Map(permissions.map((p) => [p.key, p.id]));
    const unknown = requestedKeys.filter((k) => !idByKey.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown tag(s): ${unknown.join(', ')}`);
    }

    const rows = [
      ...dto.grant.map((key) => ({ key, effect: PermissionEffect.GRANT })),
      ...dto.revoke.map((key) => ({ key, effect: PermissionEffect.REVOKE })),
    ].map(({ key, effect }) => ({
      userId,
      permissionId: idByKey.get(key)!,
      effect,
    }));

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId } }),
      this.prisma.userPermission.createMany({ data: rows }),
    ]);

    return this.getPermissionSummary(userId);
  }
}
