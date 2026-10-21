import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessPolicy } from './access-policy.decorators.js';
import { PermissionsGuard } from './permissions.guard.js';

function contextFor(policy: AccessPolicy | undefined, permissions: string[]) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(policy);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), context };
}

describe('PermissionsGuard', () => {
  it('allows when the user holds every required tag', () => {
    const { guard, context } = contextFor(
      { type: 'permissions', permissions: ['users.read'] },
      ['users.read', 'permissions.read'],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses and names the missing tags', () => {
    const { guard, context } = contextFor(
      { type: 'permissions', permissions: ['users.read', 'permissions.assign'] },
      ['users.read'],
    );
    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Missing permission tag(s): permissions.assign'),
    );
  });

  it('any-of policy allows with one matching tag and refuses with none', () => {
    const ok = contextFor({ type: 'anyPermission', permissions: ['leave.approve', 'allowances.manage'] }, ['allowances.manage']);
    expect(ok.guard.canActivate(ok.context)).toBe(true);
    const no = contextFor({ type: 'anyPermission', permissions: ['leave.approve', 'allowances.manage'] }, ['leave.apply']);
    expect(() => no.guard.canActivate(no.context)).toThrow(ForbiddenException);
  });

  it('does not check tags on authenticated-only routes', () => {
    const { guard, context } = contextFor({ type: 'authenticated' }, []);
    expect(guard.canActivate(context)).toBe(true);
  });
});
