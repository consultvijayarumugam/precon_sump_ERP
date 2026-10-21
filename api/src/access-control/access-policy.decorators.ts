import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { PermissionKey } from './permission-catalog.js';
import type { AuthenticatedUser } from './authenticated-user.js';

/**
 * Every route must declare exactly one access policy. A route with none is
 * rejected by the guards (deny by default), so a forgotten decorator can never
 * leave an endpoint open.
 */
export const ACCESS_POLICY_KEY = 'accessPolicy';

export type AccessPolicy =
  | { type: 'public' }
  | { type: 'authenticated' }
  | { type: 'permissions'; permissions: PermissionKey[] }
  | { type: 'anyPermission'; permissions: PermissionKey[] };

/** No login needed (e.g. login itself, health check). */
export const Public = () =>
  SetMetadata(ACCESS_POLICY_KEY, { type: 'public' } satisfies AccessPolicy);

/** Any logged-in, active user (e.g. "who am I", logout). */
export const AuthenticatedOnly = () =>
  SetMetadata(ACCESS_POLICY_KEY, {
    type: 'authenticated',
  } satisfies AccessPolicy);

/** Logged-in user must hold ALL of the listed permission tags. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(ACCESS_POLICY_KEY, {
    type: 'permissions',
    permissions,
  } satisfies AccessPolicy);

/** Logged-in user must hold AT LEAST ONE of the listed permission tags. */
export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(ACCESS_POLICY_KEY, {
    type: 'anyPermission',
    permissions,
  } satisfies AccessPolicy);

/** Injects the user the auth guard attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest().user,
);
