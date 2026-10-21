import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionEffect } from '../generated/prisma/client.js';

export interface EffectiveAccess {
  permissions: string[];
  modules: string[];
}

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  /** Effective tags = role tags + user GRANT overrides - user REVOKE overrides. */
  async getEffectiveAccess(userId: string): Promise<EffectiveAccess> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { key: true, module: true } } },
            },
          },
        },
        permissionOverrides: {
          select: {
            effect: true,
            permission: { select: { key: true, module: true } },
          },
        },
      },
    });

    const tags = new Map<string, string>(); // key -> module
    for (const { permission } of user.role.permissions) {
      tags.set(permission.key, permission.module);
    }
    for (const { effect, permission } of user.permissionOverrides) {
      if (effect === PermissionEffect.GRANT) {
        tags.set(permission.key, permission.module);
      } else {
        tags.delete(permission.key);
      }
    }

    return {
      permissions: [...tags.keys()].sort(),
      modules: [...new Set(tags.values())].sort(),
    };
  }

  /** Active users holding at least one of `tags`, for "assign to" pickers. */
  async activeUsersWithAnyTag(tags: string[]) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, role: { select: { key: true, name: true } } },
    });
    const result: typeof users = [];
    for (const user of users) {
      const { permissions } = await this.getEffectiveAccess(user.id);
      if (tags.some((t) => permissions.includes(t))) result.push(user);
    }
    return result;
  }
}
