/**
 * Sample installation / service / site-visit data (Phase 5, web part).
 * Dates are relative to today so there are always upcoming and overdue items.
 * Each part runs only when its table is empty.
 *
 * What you get:
 *  - Ravi Technician: a factory_supervisor (the role preset covers service work).
 *  - 3 completed installations (Divya Hospital, Kongu College, Senthil Farms)
 *    and 1 scheduled in 3 days (Sri Murugan Residency, not yet delivered).
 *  - 5 service jobs across statuses and priorities, with follow-ups; 2 overdue.
 *  - 5 site-visit tags and 4 site visits using them.
 */
import type {
  PrismaClient,
  ServiceFollowUpOutcome,
  ServiceJobPriority,
  ServiceJobStatus,
  ServiceJobType,
} from '../src/generated/prisma/client.js';

const DAY = 24 * 60 * 60 * 1000;
const IST_OFFSET_HOURS = 5.5;

function todayIST(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}
/** A DATE `offset` days from today. */
const day = (offset: number) => new Date(todayIST().getTime() + offset * DAY);
/** A moment `offset` days from today at `hour` o'clock India time. */
const at = (offset: number, hour: number) =>
  new Date(day(offset).getTime() + (hour - IST_OFFSET_HOURS) * 60 * 60 * 1000);

const TAGS = [
  { name: 'survey', color: 'sky', description: 'First look at the site before quoting' },
  { name: 'measurement', color: 'violet', description: 'Taking pit / plot measurements' },
  { name: 'complaint-visit', color: 'red', description: 'Visit to look at a customer complaint' },
  { name: 'installation-check', color: 'green', description: 'Checking a finished installation' },
  { name: 'soil-test', color: 'amber', description: 'Soil / water-table check for UG work' },
];

const INSTALLATIONS = [
  {
    customer: 'Divya Hospital', scheduledIn: -19, completedDaysAgo: 18, assignee: 'supervisor', team: 'Crew A',
    site: 'Divya Hospital, Omalur Main Road, Salem 636011',
    completionNotes: 'Two sumps placed and backfilled; water-tightness test passed.',
  },
  {
    customer: 'Kongu Engineering College', scheduledIn: -35, completedDaysAgo: 33, assignee: 'supervisor', team: 'Crew B',
    site: 'Kongu Engineering College, Perundurai, Erode 638060',
    completionNotes: '60 panels erected along the east boundary.',
  },
  {
    customer: 'Senthil Farms', scheduledIn: -15, completedDaysAgo: 14, assignee: 'tech', team: null,
    site: 'Senthil Farms, Pollachi–Udumalpet Road, Pollachi 642001',
    completionNotes: 'First microbe dosing done; farm staff shown how to dose monthly.',
  },
  {
    customer: 'Sri Murugan Residency', scheduledIn: 3, completedDaysAgo: null, assignee: 'supervisor', team: 'Crew A',
    site: 'Sri Murugan Residency, 12 Gandhi Nagar, Tiruppur 641603',
    completionNotes: null,
  },
] as const;

interface SampleJob {
  customer: string;
  type: ServiceJobType;
  priority: ServiceJobPriority;
  status: ServiceJobStatus;
  description: string;
  assignee: 'tech' | null;
  createdDaysAgo: number;
  resolvedDaysAgo?: number;
  resolutionNotes?: string;
  followUps: { offset: number; hour: number; note: string; outcome?: ServiceFollowUpOutcome }[];
}

const JOBS: SampleJob[] = [
  {
    customer: 'Divya Hospital', type: 'COMPLAINT', priority: 'HIGH', status: 'IN_PROGRESS', assignee: 'tech',
    description: 'Water seepage at the inlet pipe joint of sump 2.', createdDaysAgo: 6,
    followUps: [
      { offset: -5, hour: 11, note: 'Inspected on site; joint needs re-sealing.', outcome: 'SITE_VISITED' },
      { offset: -1, hour: 10, note: 'Return with sealant kit and re-seal the joint.' }, // overdue
    ],
  },
  {
    customer: 'Divya Hospital', type: 'MAINTENANCE', priority: 'URGENT', status: 'OPEN', assignee: null,
    description: 'Facilities team wants both sumps cleaned before the monsoon.', createdDaysAgo: 2,
    followUps: [{ offset: 1, hour: 11, note: 'Call facilities manager to fix a cleaning date.' }],
  },
  {
    customer: 'Kongu Engineering College', type: 'WARRANTY', priority: 'LOW', status: 'RESOLVED', assignee: 'tech',
    description: 'Two wall panels developed hairline cracks.', createdDaysAgo: 14,
    resolvedDaysAgo: 10, resolutionNotes: 'Replaced both panels under warranty.',
    followUps: [{ offset: -9, hour: 15, note: 'Checked with estate office after replacement.', outcome: 'CUSTOMER_SATISFIED' }],
  },
  {
    customer: 'Kongu Engineering College', type: 'MAINTENANCE', priority: 'MEDIUM', status: 'OPEN', assignee: 'tech',
    description: 'Annual alignment check of the compound wall.', createdDaysAgo: 5,
    followUps: [{ offset: -3, hour: 12, note: 'Fix a date for the check with the estate office.' }], // overdue
  },
  {
    customer: 'Senthil Farms', type: 'MAINTENANCE', priority: 'LOW', status: 'OPEN', assignee: 'tech',
    description: 'Quarterly check that microbe dosing is keeping the tank healthy.', createdDaysAgo: 3,
    followUps: [{ offset: 5, hour: 10, note: 'Call farm manager about dosing schedule.' }],
  },
];

const VISITS = [
  {
    daysAgo: 6, person: 'supervisor', customer: 'Sri Murugan Residency', installationOf: 'Sri Murugan Residency',
    site: '12 Gandhi Nagar, Tiruppur 641603', purpose: 'Site survey and pit measurement for the 5-user tank',
    notes: 'Pit 2.4 m × 1.8 m; truck access from the north gate.', tags: ['survey', 'measurement'],
  },
  {
    daysAgo: 5, person: 'tech', customer: 'Divya Hospital', installationOf: 'Divya Hospital',
    site: 'Omalur Main Road, Salem 636011', purpose: 'Inspect seepage complaint at sump 2',
    notes: 'Seepage at inlet joint only; tank walls fine.', tags: ['complaint-visit'],
  },
  {
    daysAgo: 2, person: 'supervisor', customer: 'Palani Hill Resorts', installationOf: null,
    site: 'Lake Road, Kodaikanal 624101', purpose: 'Pre-sale survey for a 10,000 L sump',
    notes: 'Rocky soil near the kitchen block; suggest the lawn side.', tags: ['survey', 'soil-test'],
  },
  {
    daysAgo: 32, person: 'supervisor', customer: 'Kongu Engineering College', installationOf: 'Kongu Engineering College',
    site: 'Perundurai, Erode 638060', purpose: 'Post-installation alignment check',
    notes: 'All panels plumb.', tags: ['installation-check'],
  },
] as const;

export async function seedServiceAndInstallations(prisma: PrismaClient) {
  const userId = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const adminId = await userId('admin@precon.local');
  const people = { supervisor: await userId('supervisor@precon.local'), tech: await userId('tech@precon.local') };

  // 2. Site-visit tags
  for (const t of TAGS) {
    await prisma.siteVisitTag.upsert({ where: { name: t.name }, create: t, update: {} });
  }

  // 3. Installations
  const installationIdByCustomer = new Map<string, string>();
  if ((await prisma.installation.count()) === 0) {
    for (const i of INSTALLATIONS) {
      const order = await prisma.salesOrder.findFirst({
        where: { customerName: i.customer },
        select: { id: true, status: true },
      });
      if (!order) {
        console.log(`  (skipping installation for "${i.customer}": no sales order)`);
        continue;
      }
      const completed = i.completedDaysAgo !== null;
      const inst = await prisma.installation.create({
        data: {
          salesOrderId: order.id,
          scheduledDate: day(i.scheduledIn),
          assignedToId: people[i.assignee],
          teamName: i.team,
          siteAddress: i.site,
          status: completed ? 'COMPLETED' : 'SCHEDULED',
          startedAt: completed ? at(-i.completedDaysAgo! - 1, 9) : null,
          completedAt: completed ? at(-i.completedDaysAgo!, 16) : null,
          completionNotes: i.completionNotes,
          createdById: adminId,
          createdAt: at(i.scheduledIn - 7, 10),
        },
        select: { id: true },
      });
      installationIdByCustomer.set(i.customer, inst.id);
    }
    console.log(`Seeded ${installationIdByCustomer.size} installations.`);
  } else {
    console.log('Installations already exist; skipping sample installations.');
    for (const inst of await prisma.installation.findMany({
      select: { id: true, salesOrder: { select: { customerName: true } } },
    })) {
      installationIdByCustomer.set(inst.salesOrder.customerName, inst.id);
    }
  }

  // 4. Service jobs + follow-ups
  if ((await prisma.serviceJob.count()) === 0) {
    let count = 0;
    for (const j of JOBS) {
      const installationId = installationIdByCustomer.get(j.customer);
      if (!installationId) continue;
      const creator = j.assignee ? people[j.assignee] : adminId;
      await prisma.serviceJob.create({
        data: {
          installationId,
          type: j.type,
          priority: j.priority,
          status: j.status,
          description: j.description,
          assignedToId: j.assignee ? people[j.assignee] : null,
          resolvedAt: j.resolvedDaysAgo !== undefined ? at(-j.resolvedDaysAgo, 17) : null,
          resolutionNotes: j.resolutionNotes,
          createdById: adminId,
          createdAt: at(-j.createdDaysAgo, 10),
          followUps: {
            create: j.followUps.map((f) => ({
              scheduledAt: at(f.offset, f.hour),
              note: f.note,
              outcome: f.outcome,
              completedAt: f.outcome ? at(f.offset, f.hour + 1) : null,
              createdById: creator,
            })),
          },
        },
      });
      count += 1;
    }
    console.log(`Seeded ${count} service jobs with follow-ups.`);
  } else {
    console.log('Service jobs already exist; skipping sample jobs.');
  }

  // 5. Site visits
  if ((await prisma.siteVisit.count()) === 0) {
    const tagIdByName = new Map(
      (await prisma.siteVisitTag.findMany({ select: { id: true, name: true } })).map((t) => [t.name, t.id]),
    );
    for (const v of VISITS) {
      await prisma.siteVisit.create({
        data: {
          visitDate: day(-v.daysAgo),
          personId: people[v.person],
          customerName: v.customer,
          siteAddress: v.site,
          purpose: v.purpose,
          notes: v.notes,
          installationId: v.installationOf ? installationIdByCustomer.get(v.installationOf) ?? null : null,
          tags: { connect: v.tags.map((name) => ({ id: tagIdByName.get(name)! })) },
          createdById: people[v.person],
          createdAt: at(-v.daysAgo, 18),
        },
      });
    }
    console.log(`Seeded ${TAGS.length} site-visit tags and ${VISITS.length} site visits.`);
  } else {
    console.log('Site visits already exist; skipping sample visits.');
  }
}
