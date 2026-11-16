/**
 * First-time (and safe to re-run) setup of a PRODUCTION database. Unlike
 * `prisma db seed` it creates no demo users and no sample data:
 *   - syncs permission tags and roles to the catalog
 *   - adds the starter WhatsApp templates if there are none
 *   - creates the first admin from ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD,
 *     only if no user with that email exists (an existing password is never changed)
 *
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npx tsx prisma/bootstrap-production.ts
 * Run `npx prisma migrate deploy` first.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ROLES } from '../src/access-control/permission-catalog.js';
import { syncRolesAndPermissions } from './sync-access.js';
import { seedMessageTemplates } from './seed-templates.js';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const roleIdByKey = await syncRolesAndPermissions(prisma);
    console.log(`Synced ${roleIdByKey.size} roles and their permission tags.`);
    await seedMessageTemplates(prisma);

    if (!email) {
      console.log('ADMIN_EMAIL not set: no admin created.');
      return;
    }
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      console.log(`Admin ${email} already exists: left unchanged.`);
      return;
    }
    if (!fullName) throw new Error('ADMIN_NAME is not set');
    if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    await prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash: await bcrypt.hash(password, 12),
        roleId: roleIdByKey.get(ROLES.ADMIN)!,
      },
    });
    console.log(`Created admin ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
