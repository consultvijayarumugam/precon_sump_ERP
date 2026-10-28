/**
 * Seeds roles, permission tags, demo users (one per role, two salespeople),
 * sample CRM leads with follow-ups, finance/stock data, and installations,
 * service jobs, site visits, and HR (holidays, leave, absences, allowances).
 * Safe to re-run: it syncs roles/tags to the catalog, only creates demo users
 * that don't exist yet (existing passwords are left alone), and only adds
 * sample leads when the leads table is empty.
 *
 *   npx prisma db seed
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
  ROLES,
  type RoleKey,
} from '../src/access-control/permission-catalog.js';
import { seedSampleLeads, seedWhatsAppLeads } from './seed-crm.js';
import { seedFinanceAndStock } from './seed-finance.js';
import { seedServiceAndInstallations } from './seed-service.js';
import { seedHr } from './seed-hr.js';
import { seedDevApiKeys } from './seed-dev-api-keys.js';
import { seedWorkflow } from './seed-workflow.js';
import { seedMessageTemplates } from './seed-templates.js';

const DEMO_USERS: { email: string; fullName: string; phone: string; role: RoleKey }[] = [
  { email: 'admin@precon.local', fullName: 'Asha Admin', phone: '9000000001', role: ROLES.ADMIN },
  { email: 'sales@precon.local', fullName: 'Suresh Sales', phone: '9000000002', role: ROLES.SALES },
  { email: 'sales2@precon.local', fullName: 'Priya Sales', phone: '9000000005', role: ROLES.SALES },
  { email: 'telecaller@precon.local', fullName: 'Tara Telecaller', phone: '9000000003', role: ROLES.TELECALLER },
  // Three telecallers share incoming leads round-robin.
  { email: 'telecaller2@precon.local', fullName: 'Kavya Telecaller', phone: '9000000007', role: ROLES.TELECALLER },
  { email: 'telecaller3@precon.local', fullName: 'Arjun Telecaller', phone: '9000000008', role: ROLES.TELECALLER },
  { email: 'supervisor@precon.local', fullName: 'Farid Supervisor', phone: '9000000004', role: ROLES.FACTORY_SUPERVISOR },
  // Service technician: a factory supervisor (that role's preset includes service jobs).
  { email: 'tech@precon.local', fullName: 'Ravi Technician', phone: '9000000006', role: ROLES.FACTORY_SUPERVISOR },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const seedPassword = process.env.SEED_USER_PASSWORD;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  if (!seedPassword) throw new Error('SEED_USER_PASSWORD is not set');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    // 1. Permission tags
    for (const p of PERMISSION_DEFINITIONS) {
      await prisma.permission.upsert({
        where: { key: p.key },
        create: p,
        update: { module: p.module, description: p.description },
      });
    }
    const permissionIdByKey = new Map(
      (await prisma.permission.findMany({ select: { id: true, key: true } })).map(
        (p) => [p.key, p.id],
      ),
    );

    // 2. Roles and their default tags (synced exactly to the catalog)
    const roleIdByKey = new Map<string, string>();
    for (const r of ROLE_DEFINITIONS) {
      const role = await prisma.role.upsert({
        where: { key: r.key },
        create: { key: r.key, name: r.name, description: r.description },
        update: { name: r.name, description: r.description },
      });
      roleIdByKey.set(r.key, role.id);

      await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
        prisma.rolePermission.createMany({
          data: r.defaultPermissions.map((key) => ({
            roleId: role.id,
            permissionId: permissionIdByKey.get(key)!,
          })),
        }),
      ]);
    }

    // 3. Demo users, one per role
    const passwordHash = await bcrypt.hash(seedPassword, 12);
    for (const u of DEMO_USERS) {
      await prisma.user.upsert({
        where: { email: u.email },
        create: {
          email: u.email,
          fullName: u.fullName,
          phone: u.phone,
          passwordHash,
          roleId: roleIdByKey.get(u.role)!,
        },
        update: {},
      });
    }

    console.log(
      `Seeded ${PERMISSION_DEFINITIONS.length} permission tags, ${ROLE_DEFINITIONS.length} roles, ${DEMO_USERS.length} demo users:`,
    );
    for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(20)} ${u.email}`);

    // Demo users follow their role preset exactly: clear any per-user tag overrides.
    await prisma.userPermission.deleteMany({
      where: { user: { email: { in: DEMO_USERS.map((u) => u.email) } } },
    });

    // 4. Sample CRM data
    await seedSampleLeads(prisma);
    await seedWhatsAppLeads(prisma);

    // 5. Sample finance + stock data
    await seedFinanceAndStock(prisma);

    // 6. Sample installations, service jobs and site visits
    await seedServiceAndInstallations(prisma);

    // 7. Sample HR data: holidays, leave, absences, allowances
    await seedHr(prisma);

    // 7b. WhatsApp message templates (admin edits them later)
    await seedMessageTemplates(prisma);

    // 8. Telecaller → sales workflow: call logs, handovers, GPS check-ins (needs the leads above)
    await seedWorkflow(prisma);

    // 9. Dev-only sample API keys (skipped when NODE_ENV=production)
    await seedDevApiKeys(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
