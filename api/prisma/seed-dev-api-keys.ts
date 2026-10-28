/**
 * DEVELOPMENT ONLY: two sample API keys with fixed, published values so the
 * public create-lead API can be tried straight away. Never runs when
 * NODE_ENV=production, and only when no API keys exist yet.
 *
 *   Website contact form (dev sample)    -> active
 *   Old partner CRM (dev sample)         -> revoked (to see a rejected key)
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client.js';

export const DEV_SAMPLE_KEYS = [
  { name: 'Website contact form (dev sample)', key: 'precon_devsample_website_7f3c9a1e5b2d4f60', revoked: false },
  { name: 'Old partner CRM (dev sample)', key: 'precon_devsample_revoked_2b8e6d4a9c1f3e70', revoked: true },
];

export async function seedDevApiKeys(prisma: PrismaClient) {
  if (process.env.NODE_ENV === 'production') return;
  if ((await prisma.apiKey.count()) > 0) {
    console.log('API keys already exist; skipping dev sample keys.');
    return;
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@precon.local' }, select: { id: true } });
  for (const k of DEV_SAMPLE_KEYS) {
    await prisma.apiKey.create({
      data: {
        name: k.name,
        prefix: k.key.slice(0, 'precon_'.length + 7),
        keyHash: createHash('sha256').update(k.key, 'utf8').digest('hex'),
        revokedAt: k.revoked ? new Date() : null,
        createdById: admin.id,
      },
    });
  }
  console.log(`Seeded ${DEV_SAMPLE_KEYS.length} dev sample API keys (see README).`);
}
