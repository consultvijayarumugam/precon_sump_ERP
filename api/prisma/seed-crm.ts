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
  sumpSizeLitres?: number | null; // sumps only; null = not decided
  status: LeadStatus;
  notes?: string;
  owner: 'sales' | 'sales2' | null; // null = unassigned
  createdDaysAgo: number;
  followUps: SampleFollowUp[];
}

const SAMPLE_LEADS: SampleLead[] = [
  {
    name: 'Ramesh Kumar', phone: '9840012345', city: 'Coimbatore',
    source: 'META', productInterest: 'SUMP', sumpSizeLitres: 10000, status: 'NEW', owner: 'sales',
    notes: 'Came from the Facebook sump ad. Wants 10,000 L.', createdDaysAgo: 1,
    followUps: [{ scheduledAt: at(0, 16), note: 'First call: confirm capacity and site' }],
  },
  {
    name: 'Lakshmi Builders', phone: '9443056789', city: 'Tiruppur',
    source: 'REFERRAL', productInterest: 'SUMP', sumpSizeLitres: 6000, status: 'CONTACTED', owner: 'sales',
    notes: 'Referred by an existing customer. One 6,000 L sump for each of 3 villas.', createdDaysAgo: 6,
    followUps: [
      { scheduledAt: at(-5, 11), note: 'Intro call', outcome: 'CONNECTED' },
      { scheduledAt: at(-1, 12), note: 'Send sump brochure and price list' },
    ],
  },
  {
    name: 'Anitha Rajan', phone: '9787123456', city: 'Erode',
    source: 'WEBSITE', productInterest: 'SUMP', sumpSizeLitres: 5000, status: 'QUALIFIED', owner: 'sales',
    notes: 'New house, 5 occupants. Thinks 5,000 L is enough.', createdDaysAgo: 10,
    followUps: [
      { scheduledAt: at(-9, 10), note: 'Call back', outcome: 'NO_ANSWER' },
      { scheduledAt: at(-8, 17), note: 'Call back', outcome: 'INTERESTED' },
      { scheduledAt: at(2, 11), note: 'Share quotation for the 5,000 L sump' },
    ],
  },
  {
    name: 'Green Valley Apartments', phone: '9003334455', city: 'Coimbatore',
    source: 'MANUAL', productInterest: 'SUMP', sumpSizeLitres: 20000, status: 'QUOTED', owner: 'sales',
    notes: 'Association secretary: Mr. Prakash. Two 20,000 L sumps.', createdDaysAgo: 18,
    followUps: [
      { scheduledAt: at(-12, 15), note: 'Quote sent by email', outcome: 'QUOTE_SENT' },
      { scheduledAt: at(-3, 10), note: 'Check if committee approved quote' },
    ],
  },
  {
    name: 'Senthil Farms', phone: '9894567890', city: 'Pollachi',
    source: 'META', productInterest: 'MICROBES', status: 'WON', owner: 'sales',
    notes: 'Monthly microbes supply for the farm sump and septic system.', createdDaysAgo: 25,
    followUps: [{ scheduledAt: at(-20, 11), note: 'Confirmed order', outcome: 'CONNECTED' }],
  },
  {
    name: 'Meena Textiles', phone: '9566778899', city: 'Salem',
    source: 'WEBSITE', productInterest: 'SUMP', sumpSizeLitres: null, status: 'CONTACTED', owner: 'sales2',
    notes: 'Factory with 40 workers. Size not decided yet (12,000 or 15,000 L).', createdDaysAgo: 4,
    followUps: [
      { scheduledAt: at(-2, 11), note: 'Discuss capacity needs' },
      { scheduledAt: at(3, 15), note: 'Site visit planning call' },
    ],
  },
  {
    name: 'Karthik Constructions', phone: '9842211223', city: 'Namakkal',
    source: 'OTHER', productInterest: 'SUMP', sumpSizeLitres: 8000, status: 'QUALIFIED', owner: 'sales2',
    notes: 'Met at a builders expo. 8,000 L sumps for a row-house project.', createdDaysAgo: 9,
    followUps: [{ scheduledAt: at(0, 18), note: 'Confirm number of sumps for the project' }],
  },
  {
    name: 'Divya Hospital', phone: '9750099887', city: 'Salem',
    source: 'REFERRAL', productInterest: 'SUMP', sumpSizeLitres: 20000, status: 'WON', owner: 'sales2',
    notes: 'Two 20,000 L sumps for fire-fighting water.', createdDaysAgo: 30,
    followUps: [{ scheduledAt: at(-22, 12), note: 'Final negotiation', outcome: 'INTERESTED' }],
  },
  {
    name: 'Vignesh S', phone: '9361122334', city: 'Karur',
    source: 'META', productInterest: 'SUMP', sumpSizeLitres: 4000, status: 'LOST', owner: 'sales2',
    notes: 'Went with a cheaper local brick sump.', createdDaysAgo: 15,
    followUps: [{ scheduledAt: at(-10, 10), note: 'Follow up on quote', outcome: 'NOT_INTERESTED' }],
  },
  {
    name: 'Arun Prakash', phone: '9677889900', city: 'Coimbatore',
    source: 'META', productInterest: 'SUMP', sumpSizeLitres: 10000, status: 'NEW', owner: null,
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
        sumpSizeLitres: s.sumpSizeLitres ?? null,
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

/** Names for the Meta click-to-WhatsApp demo leads (name + phone only). */
const WHATSAPP_NAMES = [
  'Senthil Kumar', 'Revathi M', 'Karthik R', 'Anitha Selvam', 'Murugan P', 'Deepa Ravi', 'Vignesh S', 'Kalaivani',
  'Prakash N', 'Sangeetha', 'Rajesh Babu', 'Meena K', 'Saravanan', 'Divya Lakshmi', 'Gopal Krishnan', 'Nandhini',
  'Bala Murugan', 'Priyanka S', 'Arul Doss', 'Malathi', 'Suresh Kannan', 'Jayanthi', 'Mohan Raj', 'Uma Devi',
  'Ganesh V', 'Bhuvana',
];

/**
 * A day's worth of Meta click-to-WhatsApp leads, name and phone only, shared
 * round-robin across the telecallers exactly as the live intake does:
 * yesterday's batch (14) and this morning's (12). Runs with the CRM sample data.
 */
export async function seedWhatsAppLeads(prisma: PrismaClient) {
  if ((await prisma.lead.count({ where: { sourceDetail: { startsWith: 'Meta click-to-WhatsApp' } } })) > 0) {
    console.log('WhatsApp demo leads already exist; skipping.');
    return;
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@precon.local' }, select: { id: true } });
  // Rotation order = the order the live round-robin starts in (oldest account first).
  const telecallers = await prisma.user.findMany({
    where: { email: { in: ['telecaller@precon.local', 'telecaller2@precon.local', 'telecaller3@precon.local'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (telecallers.length === 0) return;

  const now = Date.now();
  const yesterday = Array.from({ length: 14 }, (_, i) => at(-1, 9).getTime() + i * 40 * 60 * 1000); // 09:00 to ~17:40
  const today = Array.from({ length: 12 }, (_, i) => now - (12 - i) * 3 * 60 * 1000); // the last 36 minutes
  const lastAssigned = new Map<string, Date>();

  const times = [...yesterday, ...today];
  for (const [i, time] of times.entries()) {
    const owner = telecallers[i % telecallers.length];
    const createdAt = new Date(time);
    const isYesterday = i < yesterday.length;
    await prisma.lead.create({
      data: {
        name: WHATSAPP_NAMES[i % WHATSAPP_NAMES.length],
        phone: `70100${String(10001 + i).padStart(5, '0')}`,
        source: 'META',
        productInterest: null, // not known yet: the telecaller qualifies it
        // Some of yesterday's are already being worked.
        status: isYesterday && i % 3 === 0 ? 'CONTACTED' : 'NEW',
        assignedToId: owner.id,
        autoAssigned: true,
        telecallerId: owner.id,
        createdById: admin.id,
        sourceDetail: 'Meta click-to-WhatsApp ad (demo)',
        createdAt,
      },
    });
    lastAssigned.set(owner.id, createdAt);
  }
  // Continue the rotation from where the demo batch left off.
  for (const [id, when] of lastAssigned) {
    await prisma.user.update({ where: { id }, data: { lastAutoAssignedAt: when, autoAssignEnabled: true } });
  }
  console.log(`Seeded ${times.length} Meta WhatsApp leads (name + phone) round-robin across ${telecallers.length} telecallers.`);
}
