import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../access-control/authenticated-user.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly accessControl: AccessControlService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        fullName: true,
        passwordHash: true,
        isActive: true,
        role: { select: { key: true, name: true } },
      },
    });

    // Same message for every failure so callers can't probe which emails exist.
    const passwordOk =
      user !== null && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !passwordOk || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id, jti: randomUUID() });
    const { exp } = this.jwt.decode<JwtPayload>(accessToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const access = await this.accessControl.getEffectiveAccess(user.id);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: new Date(exp * 1000).toISOString(),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        permissions: access.permissions,
        modules: access.modules,
      },
    };
  }

  /** Revokes the token used for this request; it is rejected from now on. */
  async logout(user: AuthenticatedUser) {
    await this.prisma.revokedToken.upsert({
      where: { jti: user.token.jti },
      create: {
        jti: user.token.jti,
        userId: user.id,
        expiresAt: user.token.expiresAt,
      },
      update: {},
    });
    // Housekeeping: drop revocations whose tokens have expired anyway.
    await this.prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
