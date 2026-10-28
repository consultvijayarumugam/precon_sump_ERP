import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export const API_KEY_PREFIX = 'precon_';

/** SHA-256 of the full key. Keys are long random secrets, so a fast hash is enough. */
export const hashApiKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');

/** First characters of a key, safe to show in lists ("precon_3f9a1c2"). */
export const displayPrefix = (key: string) => key.slice(0, API_KEY_PREFIX.length + 7);

const KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, fullName: true } },
} as const;

/**
 * API keys for the public create-lead API (#21). Only a hash is stored; the
 * full key is returned once, at creation, and can't be shown again.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.apiKey.findMany({ orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], select: KEY_SELECT });
  }

  async create(userId: string, name: string) {
    const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
    const row = await this.prisma.apiKey.create({
      data: { name, prefix: displayPrefix(key), keyHash: hashApiKey(key), createdById: userId },
      select: KEY_SELECT,
    });
    return { ...row, key }; // the only time the full key leaves the server
  }

  async revoke(id: string) {
    const existing = await this.prisma.apiKey.findUnique({ where: { id }, select: { revokedAt: true } });
    if (!existing) throw new NotFoundException('API key not found');
    if (existing.revokedAt) throw new BadRequestException('This key is already revoked');
    return this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() }, select: KEY_SELECT });
  }

  /** The active key matching a presented secret, or null. Records when it was last used. */
  async verify(presented: string) {
    if (!presented.startsWith(API_KEY_PREFIX) || presented.length < 20 || presented.length > 200) return null;
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(presented) },
      select: { id: true, name: true, revokedAt: true, createdById: true },
    });
    if (!key || key.revokedAt) return null;
    await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return { id: key.id, name: key.name, createdById: key.createdById };
  }
}
