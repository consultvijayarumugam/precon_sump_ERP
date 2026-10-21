import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { businessToday, dateOnly, daysBetween, parseDateOnly } from '../finance/finance-utils.js';
import { LeaveStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApplyLeaveDto, ListLeaveQueryDto } from './dto/hr.dto.js';
import { isPaidLeave, MAX_LEAVE_SPAN_DAYS, PAID_LEAVE_PER_YEAR } from './hr-config.js';
import { WorkingCalendarService } from './working-calendar.service.js';

const LEAVE_SELECT = {
  id: true,
  type: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  user: { select: { id: true, fullName: true, role: { select: { name: true } } } },
  decidedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.LeaveApplicationSelect;

type LeaveRow = Prisma.LeaveApplicationGetPayload<{ select: typeof LEAVE_SELECT }>;

const ACTIVE: LeaveStatus[] = [LeaveStatus.PENDING, LeaveStatus.APPROVED];

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: WorkingCalendarService,
  ) {}

  /** Adds the computed working-day count (and the dates) to each application. */
  private async withDays(rows: LeaveRow[]) {
    if (rows.length === 0) return [];
    const from = new Date(Math.min(...rows.map((r) => r.startDate.getTime())));
    const to = new Date(Math.max(...rows.map((r) => r.endDate.getTime())));
    const holidays = await this.calendar.holidaysBetween(from, to);
    return rows.map((r) => {
      const days = this.calendar.workingDays(r.startDate, r.endDate, holidays);
      return {
        ...r,
        startDate: dateOnly(r.startDate),
        endDate: dateOnly(r.endDate),
        days: days.length,
        workingDates: days,
      };
    });
  }

  async listMine(user: AuthenticatedUser, year?: number) {
    const y = year ?? businessToday().getUTCFullYear();
    const rows = await this.prisma.leaveApplication.findMany({
      where: { userId: user.id, startDate: { lte: parseDateOnly(`${y}-12-31`) }, endDate: { gte: parseDateOnly(`${y}-01-01`) } },
      orderBy: { startDate: 'desc' },
      select: LEAVE_SELECT,
    });
    return this.withDays(rows);
  }

  /** All applications (approvers). Pending first, then most recent. */
  async listAll(query: ListLeaveQueryDto) {
    const rows = await this.prisma.leaveApplication.findMany({
      where: {
        status: query.status,
        userId: query.userId,
        endDate: query.from ? { gte: parseDateOnly(query.from) } : undefined,
        startDate: query.to ? { lte: parseDateOnly(query.to) } : undefined,
      },
      orderBy: { startDate: 'desc' },
      take: 500,
      select: LEAVE_SELECT,
    });
    const withDays = await this.withDays(rows);
    return withDays.sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING'));
  }

  /**
   * Paid leave balance for a calendar year. Taken = approved working days;
   * pending days are shown separately and held back when applying.
   */
  async balance(userId: string, year?: number) {
    const y = year ?? businessToday().getUTCFullYear();
    const yearStart = parseDateOnly(`${y}-01-01`);
    const yearEnd = parseDateOnly(`${y}-12-31`);
    const rows = await this.prisma.leaveApplication.findMany({
      where: { userId, status: { in: ACTIVE }, startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
      select: { type: true, status: true, startDate: true, endDate: true },
    });
    const holidays = await this.calendar.holidaysBetween(yearStart, yearEnd);

    const tally = { CASUAL: { approved: 0, pending: 0 }, SICK: { approved: 0, pending: 0 }, UNPAID: { approved: 0, pending: 0 } };
    for (const r of rows) {
      const from = r.startDate < yearStart ? yearStart : r.startDate;
      const to = r.endDate > yearEnd ? yearEnd : r.endDate;
      const days = this.calendar.workingDays(from, to, holidays).length;
      tally[r.type][r.status === 'APPROVED' ? 'approved' : 'pending'] += days;
    }

    return {
      year: y,
      paid: (['CASUAL', 'SICK'] as const).map((type) => ({
        type,
        entitlement: PAID_LEAVE_PER_YEAR[type],
        taken: tally[type].approved,
        pending: tally[type].pending,
        remaining: PAID_LEAVE_PER_YEAR[type] - tally[type].approved,
        available: PAID_LEAVE_PER_YEAR[type] - tally[type].approved - tally[type].pending,
      })),
      unpaid: { taken: tally.UNPAID.approved, pending: tally.UNPAID.pending },
    };
  }

  async apply(user: AuthenticatedUser, dto: ApplyLeaveDto) {
    const start = parseDateOnly(dto.startDate);
    const end = parseDateOnly(dto.endDate);
    if (end < start) throw new BadRequestException('endDate is before startDate');
    if (daysBetween(start, end) + 1 > MAX_LEAVE_SPAN_DAYS) {
      throw new BadRequestException(`A single application can cover at most ${MAX_LEAVE_SPAN_DAYS} days`);
    }
    const days = await this.calendar.workingDaysBetween(start, end);
    if (days.length === 0) {
      throw new BadRequestException('Those dates are all weekly offs or company holidays; no leave needed');
    }

    const overlap = await this.prisma.leaveApplication.findFirst({
      where: { userId: user.id, status: { in: ACTIVE }, startDate: { lte: end }, endDate: { gte: start } },
      select: { startDate: true, endDate: true, status: true },
    });
    if (overlap) {
      throw new ConflictException(
        `You already have ${overlap.status.toLowerCase()} leave from ${dateOnly(overlap.startDate)} to ${dateOnly(overlap.endDate)}`,
      );
    }
    if (isPaidLeave(dto.type)) await this.ensureBalance(user.id, dto.type, days, 'available');

    const row = await this.prisma.leaveApplication.create({
      data: { userId: user.id, type: dto.type, startDate: start, endDate: end, reason: dto.reason },
      select: LEAVE_SELECT,
    });
    return (await this.withDays([row]))[0];
  }

  /** Withdraw your own leave: pending any time, approved only before it starts. */
  async cancel(user: AuthenticatedUser, id: string) {
    const leave = await this.prisma.leaveApplication.findFirst({
      where: { id, userId: user.id },
      select: { status: true, startDate: true },
    });
    if (!leave) throw new NotFoundException('Leave application not found');
    const startedOrPast = leave.startDate <= businessToday();
    if (leave.status === LeaveStatus.APPROVED && startedOrPast) {
      throw new BadRequestException('Approved leave that has already started cannot be cancelled; ask HR');
    }
    if (!ACTIVE.includes(leave.status)) {
      throw new BadRequestException(`This application is already ${leave.status.toLowerCase()}`);
    }
    const row = await this.prisma.leaveApplication.update({
      where: { id },
      data: { status: LeaveStatus.CANCELLED },
      select: LEAVE_SELECT,
    });
    return (await this.withDays([row]))[0];
  }

  async decide(approver: AuthenticatedUser, id: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    const leave = await this.prisma.leaveApplication.findUnique({
      where: { id },
      select: { userId: true, status: true, type: true, startDate: true, endDate: true },
    });
    if (!leave) throw new NotFoundException('Leave application not found');
    if (leave.userId === approver.id) {
      throw new ForbiddenException('You cannot approve or reject your own leave; ask another approver');
    }
    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequestException(`Only pending applications can be decided (this one is ${leave.status.toLowerCase()})`);
    }
    if (decision === 'REJECTED' && !note) throw new BadRequestException('Give a reason when rejecting');
    if (decision === 'APPROVED' && isPaidLeave(leave.type)) {
      const days = await this.calendar.workingDaysBetween(leave.startDate, leave.endDate);
      await this.ensureBalance(leave.userId, leave.type, days, 'remaining');
    }

    const row = await this.prisma.leaveApplication.update({
      where: { id },
      data: { status: decision, decidedById: approver.id, decidedAt: new Date(), decisionNote: note || null },
      select: LEAVE_SELECT,
    });
    return (await this.withDays([row]))[0];
  }

  /**
   * Team calendar (#16): holidays + approved leave in a range, so everyone
   * can see who is off. Leave type is shown only to approvers and the person
   * themselves (sick leave is private). Approvers also see pending requests.
   */
  async teamCalendar(user: AuthenticatedUser, fromStr: string, toStr: string) {
    const from = parseDateOnly(fromStr);
    const to = parseDateOnly(toStr);
    if (to < from) throw new BadRequestException('"to" is before "from"');
    if (daysBetween(from, to) > 62) throw new BadRequestException('Ask for at most about two months at a time');

    const isApprover = user.permissions.includes(PERMISSIONS.LEAVE_APPROVE);
    const [holidays, rows] = await Promise.all([
      this.calendar.holidaysBetween(from, to),
      this.prisma.leaveApplication.findMany({
        where: {
          status: { in: isApprover ? ACTIVE : [LeaveStatus.APPROVED] },
          startDate: { lte: to },
          endDate: { gte: from },
        },
        orderBy: { startDate: 'asc' },
        select: LEAVE_SELECT,
      }),
    ]);
    const leave = await this.withDays(rows);
    return {
      from: fromStr,
      to: toStr,
      holidays: [...holidays.entries()].map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date)),
      leave: leave.map((l) => {
        const showType = isApprover || l.user.id === user.id;
        return {
          id: l.id,
          user: { id: l.user.id, fullName: l.user.fullName },
          startDate: l.startDate,
          endDate: l.endDate,
          status: l.status,
          workingDates: l.workingDates.filter((d) => d >= fromStr && d <= toStr),
          type: showType ? l.type : null,
        };
      }),
    };
  }

  private async ensureBalance(
    userId: string,
    type: 'CASUAL' | 'SICK',
    days: string[],
    against: 'available' | 'remaining',
  ) {
    // Count requested days per year so leave across New Year uses each year's balance.
    const perYear = new Map<number, number>();
    for (const d of days) perYear.set(Number(d.slice(0, 4)), (perYear.get(Number(d.slice(0, 4))) ?? 0) + 1);
    for (const [year, requested] of perYear) {
      const bal = (await this.balance(userId, year)).paid.find((p) => p.type === type)!;
      // When approving, this application's own days are among the pending ones.
      const left = against === 'available' ? bal.available : bal.remaining;
      if (requested > left) {
        throw new BadRequestException(
          `Only ${Math.max(left, 0)} ${type.toLowerCase()} day(s) left in ${year}, but ${requested} requested. Apply the extra days as unpaid leave.`,
        );
      }
    }
  }

  /** Approved leave (any type) covering a date, for absence checks. */
  approvedLeaveOn(userId: string, date: Date) {
    return this.prisma.leaveApplication.findFirst({
      where: { userId, status: LeaveStatus.APPROVED, startDate: { lte: date }, endDate: { gte: date } },
      select: { type: true },
    });
  }
}

