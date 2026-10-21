import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessControlService } from './access-control.service.js';
import { ACCESS_POLICY_KEY, AccessPolicy } from './access-policy.decorators.js';
import type { AuthenticatedUser, JwtPayload } from './authenticated-user.js';

/**
 * Global guard #1: works out who is calling.
 * - Routes without an access policy are refused (deny by default).
 * - @Public routes skip authentication.
 * - Everything else needs a valid, non-logged-out Bearer token for an active user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(
      ACCESS_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!policy) {
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} has no access policy; refusing.`,
      );
      throw new ForbiddenException('This endpoint has no access policy');
    }
    if (policy.type === 'public') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const revoked = await this.prisma.revokedToken.findUnique({
      where: { jti: payload.jti },
      select: { jti: true },
    });
    if (revoked) throw new UnauthorizedException('Token has been logged out');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        role: { select: { key: true, name: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    const access = await this.accessControl.getEffectiveAccess(user.id);
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      permissions: access.permissions,
      modules: access.modules,
      token: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) },
    };
    (request as Request & { user: AuthenticatedUser }).user =
      authenticatedUser;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
