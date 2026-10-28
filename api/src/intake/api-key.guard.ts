import { applyDecorators, CanActivate, ExecutionContext, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ApiKeyPolicy } from '../access-control/access-policy.decorators.js';
import { ApiKeysService } from './api-keys.service.js';

export interface ApiKeyCaller {
  id: string;
  name: string;
  createdById: string;
}

/** Checks the X-API-Key header against stored (hashed) keys; revoked or unknown keys get 401. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiKey?: ApiKeyCaller }>();
    const presented = req.headers['x-api-key'];
    if (typeof presented !== 'string' || !presented) {
      throw new UnauthorizedException('Missing API key: send it in the X-API-Key header');
    }
    const key = await this.apiKeys.verify(presented.trim());
    if (!key) throw new UnauthorizedException('Invalid or revoked API key');
    req.apiKey = key;
    return true;
  }
}

/** Rate-limits per API key (or per IP when no key is sent), not per server. */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const key = headers['x-api-key'];
    if (typeof key === 'string' && key) return `key:${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
    return `ip:${typeof req.ip === 'string' ? req.ip : 'unknown'}`;
  }
}

/**
 * Marks a route as "called by an external system with an API key": sets the
 * access policy, rate-limits, then checks the key. Always use this (never the
 * bare policy) so an API-key route can't end up without the key check.
 */
export const ApiKeyAuth = () =>
  applyDecorators(
    ApiKeyPolicy(),
    UseGuards(ApiKeyThrottlerGuard, ApiKeyGuard),
    ApiHeader({ name: 'X-API-Key', required: true, description: 'API key from Admin → API keys' }),
    ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked API key' }),
    ApiTooManyRequestsResponse({ description: 'Rate limit exceeded; retry after the Retry-After header' }),
  );
