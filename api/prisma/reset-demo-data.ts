/**
 * Empties the DEMO business data so `npm run db:seed` can rebuild it from
 * scratch (leads, orders, stock, installations, service, vendors, HR...).
 * Keeps user accounts, roles, permission tags and the migration history.
 *
 *   CONFIRM_DEMO_RESET=yes npm run db:reset-demo
 *
 * Refuses to run in production, against a non-local database, or without the
 * confirmation flag. Never use this on real business data.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Child tables first is not required (CASCADE), but listing them all keeps it explicit.
const DEMO_TABLES = [
  'notifications',
  'lead_activities',
  'message_templates',
  'call_logs',
  'follow_ups',
  'payments',
  'stock_movements',
  'service_follow_ups',
  'service_jobs',
  '_SiteVisitToSiteVisitTag',
  'allowances',
  'site_visits',
  'site_visit_tags',
  'installations',
  'sales_orders',
  'leads',
  'products',
  'purchases',
  'vendor_payments',
  'vendors',
  'absences',
  'leave_applications',
  'holidays',
  'api_keys', // dev sample keys are re-created by the seed
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing: NODE_ENV=production');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing: DATABASE_URL host "${host}" is not local`);
  }
  if (process.env.CONFIRM_DEMO_RESET !== 'yes') {
    throw new Error('Refusing: set CONFIRM_DEMO_RESET=yes to confirm you want to wipe the demo data');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const list = DEMO_TABLES.map((t) => `"${t}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    console.log(`Emptied ${DEMO_TABLES.length} demo tables (users, roles and permissions kept).`);
    console.log('Now run: npm run db:seed');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
