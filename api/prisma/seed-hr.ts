/**
 * Sample HR data: company holidays, leave applications in every status,
 * absences without approval (so some people have LOP), and allowances.
 * Leave/absence dates are relative to today and nudged onto working days.
 * Each part runs only when its table is empty (holidays are upserted by date).
 *
 * Holiday dates are a SAMPLE Tamil Nadu list for 2026. Check them against the
 * official list before relying on them.
 */
import type {
  AllowanceStatus,
  AllowanceType,
  LeaveStatus,
  LeaveType,
  PrismaClient,
} from '../src/generated/prisma/client.js';
import { Prisma } from '../src/generated/prisma/client.js';

const DAY = 24 * 60 * 60 * 1000;
const WEEKLY_OFF = (process.env.WEEKLY_OFF_DAYS ?? '0').split(',').map(Number);

function today(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

const HOLIDAYS_2026: [string, string][] = [
  ['2026-01-01', "New Year's Day"],
  ['2026-01-15', 'Pongal'],
  ['2026-01-16', 'Thiruvalluvar Day'],
  ['2026-01-26', 'Republic Day'],
  ['2026-04-14', 'Tamil New Year'],
  ['2026-05-01', 'May Day'],
  ['2026-08-15', 'Independence Day'],
  ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-10-19', 'Ayudha Pooja'],
  ['2026-10-20', 'Vijayadashami'],
  ['2026-11-09', 'Deepavali'],
  ['2026-12-25', 'Christmas'],
];

/** Same-every-year holidays, used if seeding in a year other than 2026. */
const FIXED_HOLIDAYS: [string, string][] = [
  ['01-01', "New Year's Day"],
  ['01-26', 'Republic Day'],
  ['05-01', 'May Day'],
  ['08-15', 'Independence Day'],
  ['10-02', 'Gandhi Jayanti'],
  ['12-25', 'Christmas'],
];

type Person = 'sales' | 'sales2' | 'telecaller' | 'supervisor' | 'tech';

const LEAVE: { who: Person; type: LeaveType; status: LeaveStatus; offset: number; days: number; reason: string; note?: string }[] = [
  { who: 'sales', type: 'CASUAL', status: 'APPROVED', offset: -40, days: 2, reason: 'Family function in Erode' },
  { who: 'sales', type: 'SICK', status: 'APPROVED', offset: -13, days: 1, reason: 'Fever' },
  { who: 'sales', type: 'CASUAL', status: 'PENDING', offset: 8, days: 2, reason: "Cousin's wedding in Madurai" },
  { who: 'sales2', type: 'UNPAID', status: 'APPROVED', offset: -8, days: 2, reason: 'Personal work out of station' },
  {
    who: 'sales2', type: 'CASUAL', status: 'REJECTED', offset: 5, days: 2, reason: 'Family trip',
    note: 'Month-end deliveries need you; please pick another week',
  },
  { who: 'telecaller', type: 'CASUAL', status: 'PENDING', offset: 12, days: 1, reason: 'Bank work' },
  { who: 'supervisor', type: 'CASUAL', status: 'APPROVED', offset: 2, days: 2, reason: 'Village temple festival' },
  { who: 'supervisor', type: 'SICK', status: 'CANCELLED', offset: -20, days: 1, reason: 'Back pain (came in after all)' },
  { who: 'tech', type: 'UNPAID', status: 'APPROVED', offset: -6, days: 1, reason: 'Travelling to native place' },
];

const ABSENCES: { who: Person; offset: number; note: string }[] = [
  { who: 'telecaller', offset: -12, note: 'Did not report; no leave applied' },
  { who: 'tech', offset: -10, note: 'Absent without informing the supervisor' },
];

export async function seedHr(prisma: PrismaClient) {
  const idOf = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const adminId = await idOf('admin@precon.local');
  const people: Record<Person, string> = {
    sales: await idOf('sales@precon.local'),
    sales2: await idOf('sales2@precon.local'),
    telecaller: await idOf('telecaller@precon.local'),
    supervisor: await idOf('supervisor@precon.local'),
    tech: await idOf('tech@precon.local'),
  };

  // 1. Holidays (this year)
  const year = today().getUTCFullYear();
  const holidays = year === 2026 ? HOLIDAYS_2026 : FIXED_HOLIDAYS.map(([md, n]) => [`${year}-${md}`, n] as [string, string]);
  for (const [date, name] of holidays) {
    await prisma.holiday.upsert({ where: { date: new Date(`${date}T00:00:00Z`) }, create: { date: new Date(`${date}T00:00:00Z`), name }, update: {} });
  }
  const holidaySet = new Set((await prisma.holiday.findMany({ select: { date: true } })).map((h) => iso(h.date)));
  const isWorking = (d: Date) => !WEEKLY_OFF.includes(d.getUTCDay()) && !holidaySet.has(iso(d));
  /** `offset` days from today, moved forward to the next working day. */
  const workingDay = (offset: number) => {
    let d = addDays(today(), offset);
    while (!isWorking(d)) d = addDays(d, 1);
    return d;
  };
  /** Last day of a run of `n` working days starting at `start`. */
  const endAfter = (start: Date, n: number) => {
    let d = start;
    for (let left = n - 1; left > 0; ) {
      d = addDays(d, 1);
      if (isWorking(d)) left -= 1;
    }
    return d;
  };

  // 2. Leave applications + absences
  if ((await prisma.leaveApplication.count()) === 0) {
    for (const l of LEAVE) {
      const start = workingDay(l.offset);
      const decided = l.status === 'APPROVED' || l.status === 'REJECTED';
      await prisma.leaveApplication.create({
        data: {
          userId: people[l.who],
          type: l.type,
          status: l.status,
          startDate: start,
          endDate: endAfter(start, l.days),
          reason: l.reason,
          decidedById: decided ? adminId : null,
          decidedAt: decided ? new Date() : null,
          decisionNote: l.note ?? null,
          createdAt: addDays(start, -7 < l.offset ? -3 : -7),
        },
      });
    }
    for (const a of ABSENCES) {
      await prisma.absence.create({
        data: { userId: people[a.who], date: workingDay(a.offset), note: a.note, recordedById: adminId },
      });
    }
    console.log(`Seeded ${holidays.length} holidays, ${LEAVE.length} leave applications, ${ABSENCES.length} absences.`);
  } else {
    console.log('Leave applications already exist; skipping sample leave.');
  }

  // 3. Allowances, linked to real site visits / installations where it makes sense
  if ((await prisma.allowance.count()) === 0) {
    const visit = (customer: string) =>
      prisma.siteVisit.findFirst({ where: { customerName: customer }, select: { id: true, visitDate: true } });
    const installation = (customer: string) =>
      prisma.installation.findFirst({ where: { salesOrder: { customerName: customer } }, select: { id: true, completedAt: true } });
    const divyaVisit = await visit('Divya Hospital');
    const muruganVisit = await visit('Sri Murugan Residency');
    const palaniVisit = await visit('Palani Hill Resorts');
    const senthilInst = await installation('Senthil Farms');

    const entries: {
      who: Person; type: AllowanceType; amount: number; date: Date; description: string;
      status: AllowanceStatus; note?: string; siteVisitId?: string; installationId?: string;
    }[] = [
      { who: 'tech', type: 'SITE', amount: 500, date: divyaVisit?.visitDate ?? addDays(today(), -5), description: 'Site allowance: seepage inspection at Divya Hospital, Salem', status: 'APPROVED', siteVisitId: divyaVisit?.id },
      { who: 'tech', type: 'TRAVEL', amount: 350, date: senthilInst?.completedAt ? new Date(`${iso(senthilInst.completedAt)}T00:00:00Z`) : addDays(today(), -14), description: 'Bus to Pollachi for microbe commissioning', status: 'APPROVED', installationId: senthilInst?.id },
      { who: 'tech', type: 'FOOD', amount: 150, date: today(), description: 'Lunch at Salem site', status: 'PENDING' },
      { who: 'supervisor', type: 'TRAVEL', amount: 800, date: muruganVisit?.visitDate ?? addDays(today(), -6), description: 'Van fuel for Tiruppur survey', status: 'APPROVED', siteVisitId: muruganVisit?.id },
      { who: 'supervisor', type: 'SITE', amount: 600, date: palaniVisit?.visitDate ?? addDays(today(), -2), description: 'Hill-station site allowance, Kodaikanal survey', status: 'PENDING', siteVisitId: palaniVisit?.id },
      { who: 'sales', type: 'TRAVEL', amount: 420, date: addDays(today(), -4), description: 'Auto + bus for client meetings, Coimbatore', status: 'APPROVED' },
      { who: 'sales', type: 'FOOD', amount: 120, date: addDays(today(), -1), description: 'Lunch during Tiruppur client visits', status: 'PENDING' },
      { who: 'sales', type: 'FOOD', amount: 900, date: addDays(today(), -9), description: 'Team dinner', status: 'REJECTED', note: 'Not covered by the allowance policy' },
      { who: 'sales2', type: 'TRAVEL', amount: 1200, date: addDays(today(), -35), description: 'Salem to Kodaikanal client visit', status: 'APPROVED' },
    ];
    for (const e of entries) {
      const decided = e.status !== 'PENDING';
      await prisma.allowance.create({
        data: {
          userId: people[e.who],
          type: e.type,
          amount: new Prisma.Decimal(e.amount),
          date: e.date,
          description: e.description,
          siteVisitId: e.siteVisitId ?? null,
          installationId: e.installationId ?? null,
          status: e.status,
          submittedById: people[e.who],
          decidedById: decided ? adminId : null,
          decidedAt: decided ? new Date() : null,
          decisionNote: e.note ?? null,
        },
      });
    }
    console.log(`Seeded ${entries.length} allowance entries.`);
  } else {
    console.log('Allowances already exist; skipping sample allowances.');
  }
}
