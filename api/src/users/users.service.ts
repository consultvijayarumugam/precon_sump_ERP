import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { PermissionEffect } from '../generated/prisma/client.js';
import { SetPermissionOverridesDto } from './dto/set-permission-overrides.dto.js';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  role: { select: { key: true, name: true } },
  _count: { select: { permissionOverrides: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: USER_SELECT });
    return users.map(({ _count, ...u }) => ({ ...u, customTagCount: _count.permissionOverrides }));
  }

  /** New user: their tags come entirely from the chosen role's preset. */
  async create(dto: CreateUserDto) {
    const clash = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (clash) throw new ConflictException('A user with that email already exists');
    const role = await this.roleByKey(dto.roleKey);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        roleId: role.id,
        passwordHash: await bcrypt.hash(dto.password, 12),
      },
      select: { id: true },
    });
    return this.findOneRow(user.id);
  }

  /**
   * Edit a user. Changing the role resets their tags to the new role's preset:
   * any custom grants/revokes are cleared, so the role alone describes them.
   */
  async update(actingUserId: string, userId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: { select: { key: true } } },
    });
    if (!existing) throw new NotFoundException('User not found');
    const roleChanging = dto.roleKey !== undefined && dto.roleKey !== existing.role.key;
    if (actingUserId === userId && (roleChanging || dto.isActive === false)) {
      throw new BadRequestException("You can't change your own role or deactivate yourself; ask another admin");
    }
    const role = roleChanging ? await this.roleByKey(dto.roleKey!) : null;
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          fullName: dto.fullName,
          phone: dto.phone === undefined ? undefined : dto.phone,
          isActive: dto.isActive,
          roleId: role?.id,
          passwordHash,
        },
      });
      if (role) await tx.userPermission.deleteMany({ where: { userId } });
    });
    return this.findOneRow(userId);
  }

  private async findOneRow(id: string) {
    const { _count, ...u } = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: USER_SELECT });
    return { ...u, customTagCount: _count.permissionOverrides };
  }

  private async roleByKey(key: string) {
    const role = await this.prisma.role.findUnique({ where: { key }, select: { id: true } });
    if (!role) throw new BadRequestException(`Unknown role: ${key}`);
    return role;
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
