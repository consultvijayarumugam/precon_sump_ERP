/**
 * Sample leads and follow-ups for demoing the CRM (Phase 2).
 * Dates are relative to "now" so there are always overdue, today and
 * upcoming follow-ups. Runs only when the leads table is empty.
 */
import type {
  FollowUpOutcome,
  LeadSource,
  LeadStatus,
  PrismaClient,
  ProductInterest,
} from '../src/generated/prisma/client.js';

const DAY = 24 * 60 * 60 * 1000;

/** `daysFromNow` days away at the given local hour (e.g. -2 at 11 = two days ago, 11:00). */
function at(daysFromNow: number, hour: number): Date {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
}

interface SampleFollowUp {
  scheduledAt: Date;
  note: string;
  outcome?: FollowUpOutcome;
}

interface SampleLead {
  name: string;
  phone: string;
  city: string;
  source: LeadSource;
  productInterest: ProductInterest;
  status: LeadStatus;
  notes?: string;
  owner: 'sales' | 'sales2' | null; // null = unassigned
  createdDaysAgo: number;
  followUps: SampleFollowUp[];
}

const SAMPLE_LEADS: SampleLead[] = [
  {
    name: 'Ramesh Kumar', phone: '9840012345', city: 'Coimbatore',
    source: 'META', productInterest: 'UG_SUMP', status: 'NEW', owner: 'sales',
    notes: 'Came from the Facebook sump ad. Wants 10,000 L.', createdDaysAgo: 1,
    followUps: [{ scheduledAt: at(0, 16), note: 'First call: confirm capacity and site' }],
  },
  {
    name: 'Lakshmi Builders', phone: '9443056789', city: 'Tiruppur',
    source: 'REFERRAL', productInterest: 'PRECAST', status: 'CONTACTED', owner: 'sales',
    notes: 'Referred by an existing customer. Compound wall panels for 3 villas.', createdDaysAgo: 6,
    followUps: [
      { scheduledAt: at(-5, 11), note: 'Intro call', outcome: 'CONNECTED' },
      { scheduledAt: at(-1, 12), note: 'Send panel brochure and price list' },
    ],
  },
  {
    name: 'Anitha Rajan', phone: '9787123456', city: 'Erode',
    source: 'WEBSITE', productInterest: 'BIO_SEPTIC_TANK', status: 'QUALIFIED', owner: 'sales',
    notes: 'New house, 5 occupants. Prefers FRP bio-septic.', createdDaysAgo: 10,
    followUps: [
      { scheduledAt: at(-9, 10), note: 'Call back', outcome: 'NO_ANSWER' },
      { scheduledAt: at(-8, 17), note: 'Call back', outcome: 'INTERESTED' },
      { scheduledAt: at(2, 11), note: 'Share quotation for 5-user tank' },
    ],
  },
  {
    name: 'Green Valley Apartments', phone: '9003334455', city: 'Coimbatore',
    source: 'MANUAL', productInterest: 'UG_SUMP', status: 'QUOTED', owner: 'sales',
    notes: 'Association secretary: Mr. Prakash. Two 25,000 L sumps.', createdDaysAgo: 18,
    followUps: [
      { scheduledAt: at(-12, 15), note: 'Quote sent by email', outcome: 'QUOTE_SENT' },
      { scheduledAt: at(-3, 10), note: 'Check if committee approved quote' },
    ],
  },
  {
    name: 'Senthil Farms', phone: '9894567890', city: 'Pollachi',
    source: 'META', productInterest: 'MICROBES', status: 'WON', owner: 'sales',
    notes: 'Monthly microbes supply for farm septic system.', createdDaysAgo: 25,
    followUps: [{ scheduledAt: at(-20, 11), note: 'Confirmed order', outcome: 'CONNECTED' }],
  },
  {
    name: 'Meena Textiles', phone: '9566778899', city: 'Salem',
    source: 'WEBSITE', productInterest: 'BIO_SEPTIC_TANK', status: 'CONTACTED', owner: 'sales2',
    notes: 'Factory toilet block, 40 workers.', createdDaysAgo: 4,
    followUps: [
      { scheduledAt: at(-2, 11), note: 'Discuss capacity needs' },
      { scheduledAt: at(3, 15), note: 'Site visit planning call' },
    ],
  },
  {
    name: 'Karthik Constructions', phone: '9842211223', city: 'Namakkal',
    source: 'OTHER', productInterest: 'PRECAST', status: 'QUALIFIED', owner: 'sales2',
    notes: 'Met at a builders expo. Needs precast drains.', createdDaysAgo: 9,
    followUps: [{ scheduledAt: at(0, 18), note: 'Confirm drain lengths' }],
  },
  {
    name: 'Divya Hospital', phone: '9750099887', city: 'Salem',
    source: 'REFERRAL', productInterest: 'UG_SUMP', status: 'WON', owner: 'sales2',
    notes: '50,000 L fire-fighting sump.', createdDaysAgo: 30,
    followUps: [{ scheduledAt: at(-22, 12), note: 'Final negotiation', outcome: 'INTERESTED' }],
  },
  {
    name: 'Vignesh S', phone: '9361122334', city: 'Karur',
    source: 'META', productInterest: 'BIO_SEPTIC_TANK', status: 'LOST', owner: 'sales2',
    notes: 'Went with a cheaper local brick tank.', createdDaysAgo: 15,
    followUps: [{ scheduledAt: at(-10, 10), note: 'Follow up on quote', outcome: 'NOT_INTERESTED' }],
  },
  {
    name: 'Arun Prakash', phone: '9677889900', city: 'Coimbatore',
    source: 'META', productInterest: 'UG_SUMP', status: 'NEW', owner: null,
    notes: 'Unassigned. Admin should assign to a salesperson.', createdDaysAgo: 0,
    followUps: [],
  },
];

export async function seedSampleLeads(prisma: PrismaClient) {
  if ((await prisma.lead.count()) > 0) {
    console.log('Leads already exist; skipping sample CRM data.');
    return;
  }

  const userByEmail = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const adminId = await userByEmail('admin@precon.local');
  const ownerIds = {
    sales: await userByEmail('sales@precon.local'),
    sales2: await userByEmail('sales2@precon.local'),
  };

  let followUpCount = 0;
  for (const s of SAMPLE_LEADS) {
    const ownerId = s.owner ? ownerIds[s.owner] : null;
    const createdAt = at(-s.createdDaysAgo, 9);
    const closed = s.status === 'WON' || s.status === 'LOST';

    await prisma.lead.create({
      data: {
        name: s.name,
        phone: s.phone,
        city: s.city,
        source: s.source,
        productInterest: s.productInterest,
        status: s.status,
        notes: s.notes,
        assignedToId: ownerId,
        createdById: adminId,
        createdAt,
        closedAt: closed ? at(-Math.max(s.createdDaysAgo - 5, 1), 15) : null,
        followUps: {
          create: s.followUps.map((f) => ({
            scheduledAt: f.scheduledAt,
            note: f.note,
            outcome: f.outcome,
            completedAt: f.outcome ? f.scheduledAt : null,
            createdById: ownerId ?? adminId,
          })),
        },
      },
    });
    followUpCount += s.followUps.length;
  }
  console.log(`Seeded ${SAMPLE_LEADS.length} sample leads with ${followUpCount} follow-ups.`);
}
