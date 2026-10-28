/**
 * Demo data for the telecaller → sales workflow, layered on the CRM and
 * finance samples. Times are relative to "now" so the screens always show
 * overdue, due-today and new work:
 *
 *   - Telecaller leads at every stage: called with callbacks overdue / today /
 *     tomorrow, never called, closed as lost, qualified and handed to sales.
 *     Tara and Kavya keep up; Arjun is slipping (uncalled leads from yesterday),
 *     so the master dashboard has someone to flag.
 *   - Every lead sales holds is attributed to the telecaller who qualified it,
 *     with a few calls of history, so scorecards and conversion have numbers.
 *   - GPS check-ins by both salespeople around Coimbatore, Tiruppur, Erode and Salem.
 *
 * Runs once (skips when any call log exists).
 */
import type { CallOutcome, PrismaClient } from '../src/generated/prisma/client.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Tomorrow (local time) at the given hour. */
function tomorrowAt(hour: number): Date {
  const d = new Date(Date.now() + DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
}

type Stage =
  | { kind: 'new' }
  | { kind: 'callback'; calls: CallOutcome[]; callbackAt: Date }
  | { kind: 'called'; calls: CallOutcome[] } // called, no callback set yet
  | { kind: 'lost'; calls: CallOutcome[] }
  | { kind: 'qualified'; calls: CallOutcome[]; to: 'sales' | 'sales2'; salesFollowUpAt: Date | null; city: string; size: number | null };

export async function seedWorkflow(prisma: PrismaClient) {
  if ((await prisma.callLog.count()) > 0) {
    console.log('Call logs already exist; skipping workflow demo data.');
    return;
  }
  const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const tc = {
    tara: await userId('telecaller@precon.local'),
    kavya: await userId('telecaller2@precon.local'),
    arjun: await userId('telecaller3@precon.local'),
  };
  const sales = { sales: await userId('sales@precon.local'), sales2: await userId('sales2@precon.local') };
  const now = Date.now();

  // --- 1. The Meta WhatsApp leads (yesterday's 14, then today's 12), in creation order ---
  const whatsapp = await prisma.lead.findMany({
    where: { sourceDetail: 'Meta click-to-WhatsApp ad (demo)' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, assignedToId: true },
  });
  // Index = position in that list. Owners rotate Tara, Kavya, Arjun (0, 1, 2, 0, ...).
  const stages: Record<number, Stage> = {
    // Yesterday: Tara (0, 3, 6, 9, 12)
    0: { kind: 'qualified', calls: ['NO_ANSWER', 'INTERESTED'], to: 'sales', salesFollowUpAt: new Date(now - 2 * HOUR), city: 'Coimbatore', size: 10000 },
    3: { kind: 'callback', calls: ['CALL_BACK'], callbackAt: new Date(now - 90 * MIN) },
    6: { kind: 'callback', calls: ['NO_ANSWER'], callbackAt: new Date(now + 2 * HOUR) },
    9: { kind: 'lost', calls: ['NOT_INTERESTED'] },
    12: { kind: 'qualified', calls: ['INTERESTED'], to: 'sales2', salesFollowUpAt: new Date(now + 3 * HOUR), city: 'Salem', size: 6000 },
    // Yesterday: Kavya (1, 4, 7, 10, 13)
    1: { kind: 'qualified', calls: ['INTERESTED'], to: 'sales2', salesFollowUpAt: tomorrowAt(11), city: 'Erode', size: 8000 },
    4: { kind: 'callback', calls: ['CALL_BACK'], callbackAt: tomorrowAt(11) },
    7: { kind: 'callback', calls: ['NO_ANSWER', 'BUSY'], callbackAt: new Date(now - 3 * HOUR) },
    10: { kind: 'lost', calls: ['WRONG_NUMBER'] },
    13: { kind: 'callback', calls: ['NO_ANSWER'], callbackAt: new Date(now + 4 * HOUR) },
    // Yesterday: Arjun (2, 5, 8, 11): one call, an overdue callback, three never called
    2: { kind: 'callback', calls: ['NO_ANSWER'], callbackAt: new Date(now - 16 * HOUR) },
    5: { kind: 'new' },
    8: { kind: 'new' },
    11: { kind: 'new' },
    // Today (14..25): Arjun 14, 17, 20, 23 untouched; Tara and Kavya have started
    15: { kind: 'callback', calls: ['NO_ANSWER'], callbackAt: new Date(now + HOUR) },
    18: { kind: 'qualified', calls: ['INTERESTED'], to: 'sales', salesFollowUpAt: null, city: 'Tiruppur', size: null },
    16: { kind: 'callback', calls: ['CALL_BACK'], callbackAt: new Date(now + 3 * HOUR) },
    19: { kind: 'called', calls: ['NO_ANSWER'] },
  };

  let calls = 0;
  for (const [index, lead] of whatsapp.entries()) {
    const stage = stages[index] ?? { kind: 'new' };
    if (stage.kind === 'new' || !lead.assignedToId) continue;
    const telecallerId = lead.assignedToId;
    // Calls spaced after the lead arrived, never in the future.
    const callTimes = stage.calls.map((_, i) =>
      new Date(Math.min(now - MIN, lead.createdAt.getTime() + (i + 1) * (lead.createdAt.getTime() > now - 2 * HOUR ? 4 * MIN : 75 * MIN))),
    );
    for (const [i, outcome] of stage.calls.entries()) {
      await prisma.callLog.create({ data: { leadId: lead.id, callerId: telecallerId, outcome, calledAt: callTimes[i] } });
      calls += 1;
    }
    const lastCall = callTimes[callTimes.length - 1];
    const telecallerName = (await prisma.user.findUniqueOrThrow({ where: { id: telecallerId }, select: { fullName: true } })).fullName;

    if (stage.kind === 'callback') {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CONTACTED' } });
      await prisma.followUp.create({
        data: { leadId: lead.id, scheduledAt: stage.callbackAt, note: 'Callback', createdById: telecallerId },
      });
    } else if (stage.kind === 'called') {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CONTACTED' } });
    } else if (stage.kind === 'lost') {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'LOST', closedAt: lastCall } });
    } else if (stage.kind === 'qualified') {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'QUALIFIED',
          productInterest: 'SUMP',
          sumpSizeLitres: stage.size,
          city: stage.city,
          notes: `Qualified by ${telecallerName}: building a new house, wants a quote this week.`,
          assignedToId: sales[stage.to],
          autoAssigned: true,
          qualifiedAt: new Date(lastCall.getTime() + MIN),
          qualifiedById: telecallerId,
          telecallerId,
        },
      });
      if (stage.salesFollowUpAt) {
        await prisma.followUp.create({
          data: {
            leadId: lead.id,
            scheduledAt: stage.salesFollowUpAt,
            note: `Qualified lead from ${telecallerName}: call to quote`,
            createdById: telecallerId,
          },
        });
      }
    }
  }

  // --- 2. Leads sales already hold came through a telecaller too ---
  const telecallerIds = [tc.tara, tc.kavya, tc.arjun];
  const salesLeads = await prisma.lead.findMany({
    where: { assignedToId: { in: Object.values(sales) }, telecallerId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, createdAt: true, closedAt: true },
  });
  for (const [i, lead] of salesLeads.entries()) {
    const telecallerId = telecallerIds[i % telecallerIds.length];
    const qualifiedAt = new Date(Math.min(lead.createdAt.getTime() + 6 * HOUR, (lead.closedAt?.getTime() ?? now) - HOUR, now - HOUR));
    // A sales lead is past the telecaller stage: anything still New/Contacted was handed over as Qualified.
    const status = lead.status === 'NEW' || lead.status === 'CONTACTED' ? 'QUALIFIED' : lead.status;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status, telecallerId, qualifiedById: telecallerId, qualifiedAt },
    });
    for (const [j, outcome] of (['NO_ANSWER', 'INTERESTED'] as CallOutcome[]).entries()) {
      await prisma.callLog.create({
        data: { leadId: lead.id, callerId: telecallerId, outcome, calledAt: new Date(qualifiedAt.getTime() - (2 - j) * 40 * MIN) },
      });
      calls += 1;
    }
  }

  // --- 3. A busy week: earlier attempts on leads each telecaller already worked (adds to "this week") ---
  const weekCalls: [string, number][] = [[tc.tara, 9], [tc.kavya, 7], [tc.arjun, 2]];
  for (const [callerId, n] of weekCalls) {
    const worked = whatsapp.filter((l, i) => l.assignedToId === callerId && i < 14 && (stages[i]?.kind ?? 'new') !== 'new');
    for (let i = 0; i < n && worked.length > 0; i += 1) {
      const lead = worked[i % worked.length];
      const at = new Date(Math.min(now - 2 * HOUR, lead.createdAt.getTime() + (20 + i * 7) * MIN));
      await prisma.callLog.create({ data: { leadId: lead.id, callerId, outcome: i % 2 ? 'BUSY' : 'NO_ANSWER', calledAt: at } });
      calls += 1;
    }
  }

  // --- 4. GPS site check-ins by sales (one reading each, shown on the OSM map) ---
  const leadByName = async (name: string) => prisma.lead.findFirst({ where: { name }, select: { id: true, name: true, city: true, assignedToId: true } });
  const checkIns: { lead: string; lat: number; lng: number; hoursAgo: number; accuracy: number; note: string }[] = [
    { lead: 'Green Valley Apartments', lat: 11.0247, lng: 76.9619, hoursAgo: 2, accuracy: 14, note: 'Checked both sump pits with the association secretary.' },
    { lead: 'Anitha Rajan', lat: 11.3428, lng: 77.7275, hoursAgo: 26, accuracy: 22, note: 'Measured the plot; 5,000 L fits beside the gate.' },
    { lead: 'Lakshmi Builders', lat: 11.1102, lng: 77.3389, hoursAgo: 50, accuracy: 35, note: 'Villa site, three pits marked.' },
    { lead: 'Ramesh Kumar', lat: 11.0012, lng: 76.9701, hoursAgo: 74, accuracy: 18, note: 'Existing tank to be replaced.' },
    { lead: 'Karthik Constructions', lat: 11.2194, lng: 78.1673, hoursAgo: 5, accuracy: 25, note: 'Row-house project; 8 sumps.' },
    { lead: 'Meena Textiles', lat: 11.6572, lng: 78.1524, hoursAgo: 30, accuracy: 40, note: 'Factory compound, near the borewell.' },
  ];
  let visits = 0;
  for (const c of checkIns) {
    const lead = await leadByName(c.lead);
    if (!lead?.assignedToId) continue;
    const at = new Date(now - c.hoursAgo * HOUR);
    await prisma.siteVisit.create({
      data: {
        visitDate: new Date(`${at.toISOString().slice(0, 10)}T00:00:00Z`),
        personId: lead.assignedToId,
        createdById: lead.assignedToId,
        customerName: lead.name,
        siteAddress: `${lead.city ?? 'Site'} (GPS ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`,
        purpose: 'Site visit (GPS check-in)',
        notes: c.note,
        leadId: lead.id,
        latitude: c.lat,
        longitude: c.lng,
        accuracyMeters: c.accuracy,
        checkedInAt: at,
      },
    });
    visits += 1;
  }

  // --- 5. Sales round-robin starts with Suresh ---
  await prisma.user.update({ where: { id: sales.sales }, data: { lastAutoAssignedAt: new Date(now - 2 * DAY), autoAssignEnabled: true } });
  await prisma.user.update({ where: { id: sales.sales2 }, data: { lastAutoAssignedAt: new Date(now - DAY), autoAssignEnabled: true } });

  console.log(`Seeded the telecaller/sales workflow: ${calls} call logs, ${salesLeads.length} sales leads attributed, ${visits} GPS check-ins.`);
}
