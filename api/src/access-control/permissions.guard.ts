import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_POLICY_KEY, AccessPolicy } from './access-policy.decorators.js';
import type { AuthenticatedUser } from './authenticated-user.js';

/**
 * Global guard #2 (runs after JwtAuthGuard): checks the caller holds every
 * permission tag the route asks for via @RequirePermissions(...).
 * It checks tags, never role names, so admin can reshape access per user.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(
      ACCESS_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (policy?.type !== 'permissions' && policy?.type !== 'anyPermission') return true;

    const user = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>().user;
    if (!user) throw new ForbiddenException();

    if (policy.type === 'anyPermission') {
      if (policy.permissions.some((p) => user.permissions.includes(p))) return true;
      throw new ForbiddenException(
        `Needs one of these permission tags: ${policy.permissions.join(', ')}`,
      );
    }

    const missing = policy.permissions.filter(
      (p) => !user.permissions.includes(p),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing permission tag(s): ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
