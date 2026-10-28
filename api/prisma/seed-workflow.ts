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
  const adminLeadOwner = await userId('admin@precon.local');
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

  // --- 4b. A few WhatsApp messages already started from the app (shown in each lead's history) ---
  const templates = await prisma.messageTemplate.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, body: true } });
  let messages = 0;
  if (templates.length > 0) {
    const worked = whatsapp.filter((_, i) => ['callback', 'qualified'].includes(stages[i]?.kind ?? ''));
    for (const [i, lead] of worked.slice(0, 6).entries()) {
      const sender = await prisma.user.findUniqueOrThrow({ where: { id: lead.assignedToId! }, select: { id: true, fullName: true } });
      const template = templates[i % 2]; // intro / follow-up
      const leadName = (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { name: true } })).name;
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: sender.id,
          type: 'WHATSAPP',
          templateId: template.id,
          templateName: template.name,
          message: template.body
            .replace(/\{first_name\}/g, leadName.split(' ')[0])
            .replace(/\{name\}/g, leadName)
            .replace(/\{my_name\}/g, sender.fullName)
            .replace(/\{company\}/g, 'Precon')
            .replace(/\{product\}/g, 'sump')
            .replace(/\{city\}/g, ''),
          createdAt: new Date(Math.min(now - MIN, lead.createdAt.getTime() + 10 * MIN)),
        },
      });
      messages += 1;
    }
  }

  // --- 4c. History for the reports: leads from 5 to 13 weeks ago, already worked through ---
  const NAMES = ['Kumaresan', 'Sharmila', 'Balaji Traders', 'Revathy', 'Murali', 'Sri Vari Homes', 'Ilango', 'Pavithra', 'Rajendran',
    'Kongu Builders', 'Saranya', 'Velmurugan'];
  const SOURCES = ['META', 'META', 'WEBSITE', 'REFERRAL', 'META', 'OTHER', 'MANUAL', 'META'] as const;
  const salesIds = [sales.sales, sales.sales2];
  let history = 0;
  for (let i = 0; i < 36; i += 1) {
    const created = new Date(now - (35 + Math.round((i * 56) / 36)) * DAY + (i % 7) * HOUR);
    const telecallerId = telecallerIds[i % 3];
    // Outcome mix: a third lost at the telecaller stage, the rest qualified and then quoted / won / lost by sales.
    const kind = i % 6;
    const lostEarly = kind === 0 || kind === 3;
    const qualifiedAt = new Date(created.getTime() + (2 + (i % 3)) * HOUR);
    const salesStatus = kind === 1 ? 'WON' : kind === 2 ? 'QUOTED' : kind === 4 ? 'LOST' : 'QUALIFIED';
    const lead = await prisma.lead.create({
      data: {
        name: `${NAMES[i % NAMES.length]} ${String.fromCharCode(65 + (i % 26))}.`,
        phone: `70300${String(10001 + i).padStart(5, '0')}`,
        source: SOURCES[i % SOURCES.length],
        city: ['Coimbatore', 'Tiruppur', 'Erode', 'Salem', 'Karur'][i % 5],
        productInterest: lostEarly ? null : i % 4 === 0 ? 'MICROBES' : 'SUMP',
        sumpSizeLitres: lostEarly || i % 4 === 0 ? null : [5000, 6000, 8000, 10000, 12000][i % 5],
        status: lostEarly ? 'LOST' : salesStatus,
        closedAt: lostEarly ? new Date(created.getTime() + HOUR) : salesStatus === 'WON' || salesStatus === 'LOST' ? new Date(created.getTime() + 9 * DAY) : null,
        assignedToId: lostEarly ? telecallerId : salesIds[i % 2],
        autoAssigned: true,
        telecallerId,
        qualifiedAt: lostEarly ? null : qualifiedAt,
        qualifiedById: lostEarly ? null : telecallerId,
        createdById: adminLeadOwner,
        sourceDetail: 'Meta click-to-WhatsApp ad (history)',
        createdAt: created,
      },
    });
    await prisma.callLog.create({
      data: { leadId: lead.id, callerId: telecallerId, outcome: lostEarly ? (i % 2 ? 'WRONG_NUMBER' : 'NOT_INTERESTED') : 'INTERESTED', calledAt: new Date(created.getTime() + HOUR) },
    });
    calls += 1;
    if (!lostEarly) {
      // A sales follow-up 1-2 days later: most done the same day, some a day late, a few never.
      const due = new Date(qualifiedAt.getTime() + (1 + (i % 2)) * DAY);
      const late = i % 5 === 0;
      const missed = i % 7 === 0 && salesStatus === 'QUALIFIED';
      await prisma.followUp.create({
        data: {
          leadId: lead.id,
          scheduledAt: due,
          note: 'Call to quote',
          createdById: telecallerId,
          completedAt: missed ? null : new Date(due.getTime() + (late ? 30 : 2) * HOUR),
          outcome: missed ? null : salesStatus === 'LOST' ? 'NOT_INTERESTED' : 'QUOTE_SENT',
        },
      });
    }
    history += 1;
  }

  // --- 4d. Bell notifications for recent assignments and handovers (yesterday's are read) ---
  let notes = 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const recent = await prisma.lead.findMany({
    where: { createdAt: { gte: new Date(now - 2 * DAY) }, telecallerId: { not: null } },
    select: { id: true, name: true, createdAt: true, telecallerId: true, assignedToId: true, qualifiedAt: true, qualifiedById: true, qualifiedBy: { select: { fullName: true } } },
  });
  for (const l of recent) {
    const old = l.createdAt < startOfToday;
    await prisma.notification.create({
      data: {
        userId: l.telecallerId!,
        type: 'LEAD_ASSIGNED',
        leadId: l.id,
        title: `New lead: ${l.name}`,
        body: 'Round-robin · Meta click-to-WhatsApp ad',
        createdAt: l.createdAt,
        readAt: old ? new Date(l.createdAt.getTime() + 30 * MIN) : null,
      },
    });
    notes += 1;
    if (l.qualifiedAt && l.assignedToId && l.qualifiedBy) {
      await prisma.notification.create({
        data: {
          userId: l.assignedToId,
          type: 'LEAD_HANDED_OVER',
          leadId: l.id,
          title: `Qualified lead from ${l.qualifiedBy.fullName}: ${l.name}`,
          body: 'Handed over to you. Call to quote.',
          createdAt: l.qualifiedAt,
          readAt: l.qualifiedAt < startOfToday ? new Date(l.qualifiedAt.getTime() + HOUR) : null,
        },
      });
      notes += 1;
    }
  }

  // --- 5. Sales round-robin starts with Suresh ---
  await prisma.user.update({ where: { id: sales.sales }, data: { lastAutoAssignedAt: new Date(now - 2 * DAY), autoAssignEnabled: true } });
  await prisma.user.update({ where: { id: sales.sales2 }, data: { lastAutoAssignedAt: new Date(now - DAY), autoAssignEnabled: true } });

  console.log(`Seeded the telecaller/sales workflow: ${calls} call logs, ${salesLeads.length} sales leads attributed, ${visits} GPS check-ins, ${messages} WhatsApp messages, ${history} older leads for the reports, ${notes} notifications.`);
}
