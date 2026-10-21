import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { businessToday, dateOnly, parseDateOnly } from '../finance/finance-utils.js';
import { LeaveStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecordAbsenceDto } from './dto/hr.dto.js';
import { isPaidLeave } from './hr-config.js';
import { LeaveService } from './leave.service.js';
import { parseMonth, WorkingCalendarService } from './working-calendar.service.js';

export type LopReason = 'UNPAID_LEAVE' | 'ABSENT_WITHOUT_APPROVAL';

/**
 * Monthly Loss-of-Pay summary (#19). Deliberately simple; it feeds payroll
 * later and is not payroll itself.
 *
 * For one employee and one month, looking only at WORKING days (not a weekly
 * off, not a company holiday):
 *
 *   workingDays          = working days in the month
 *   paidLeaveDays        = working days covered by APPROVED casual/sick leave
 *   unpaidLeaveDays      = working days covered by APPROVED unpaid leave
 *   absentWithoutApproval= recorded absences on working days NOT covered by
 *                          any approved leave
 *   lopDays              = unpaidLeaveDays + absentWithoutApproval
 *   presentEquivalent    = workingDays - paidLeaveDays - lopDays
 *                          (days assumed worked; real attendance comes later)
 *   paidDays             = workingDays - lopDays   (what payroll pays for)
 *
 * Pending leave is NOT counted either way; it is reported as pendingLeaveDays
 * so HR can decide it before closing the month. Rejected/cancelled leave
 * counts as nothing; if the person stayed away anyway, record an absence.
 */
@Injectable()
export class LopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: WorkingCalendarService,
    private readonly leave: LeaveService,
  ) {}

  async monthlySummary(month: string, userId?: string) {
    const range = parseMonth(month);
    const holidays = await this.calendar.holidaysBetween(range.start, range.end);
    const workingDays = this.calendar.workingDays(range.start, range.end, holidays);
    const working = new Set(workingDays);

    const [employees, leaves, absences] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, id: userId },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, role: { select: { name: true } } },
      }),
      this.prisma.leaveApplication.findMany({
        where: {
          userId,
          status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
          startDate: { lte: range.end },
          endDate: { gte: range.start },
        },
        select: { userId: true, type: true, status: true, startDate: true, endDate: true },
      }),
      this.prisma.absence.findMany({
        where: { userId, date: { gte: range.start, lte: range.end } },
        select: { id: true, userId: true, date: true, note: true },
      }),
    ]);

    const rows = employees.map((emp) => {
      const paidLeave = new Set<string>();
      const unpaidLeave = new Set<string>();
      const pending = new Set<string>();
      for (const l of leaves.filter((x) => x.userId === emp.id)) {
        for (const d of this.calendar.workingDays(l.startDate, l.endDate, holidays)) {
          if (!working.has(d)) continue; // outside this month
          if (l.status === 'PENDING') pending.add(d);
          else (isPaidLeave(l.type) ? paidLeave : unpaidLeave).add(d);
        }
      }
      const absent = absences
        .filter((a) => a.userId === emp.id)
        .map((a) => ({ ...a, date: dateOnly(a.date) }))
        .filter((a) => working.has(a.date) && !paidLeave.has(a.date) && !unpaidLeave.has(a.date));

      const lopDates = [
        ...[...unpaidLeave].map((date) => ({ date, reason: 'UNPAID_LEAVE' as LopReason, note: null as string | null })),
        ...absent.map((a) => ({ date: a.date, reason: 'ABSENT_WITHOUT_APPROVAL' as LopReason, note: a.note, absenceId: a.id })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      const lopDays = lopDates.length;
      return {
        employee: emp,
        workingDays: workingDays.length,
        paidLeaveDays: paidLeave.size,
        unpaidLeaveDays: unpaidLeave.size,
        absentWithoutApproval: absent.length,
        lopDays,
        presentEquivalent: workingDays.length - paidLeave.size - lopDays,
        paidDays: workingDays.length - lopDays,
        pendingLeaveDays: pending.size,
        lopDates,
      };
    });

    return {
      month: range.month,
      workingDays: workingDays.length,
      holidays: [...holidays.entries()].map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date)),
      rows,
      totals: {
        lopDays: rows.reduce((s, r) => s + r.lopDays, 0),
        employeesWithLop: rows.filter((r) => r.lopDays > 0).length,
        pendingLeaveDays: rows.reduce((s, r) => s + r.pendingLeaveDays, 0),
      },
    };
  }

  async mySummary(user: AuthenticatedUser, month: string) {
    const summary = await this.monthlySummary(month, user.id);
    return { ...summary, row: summary.rows[0] ?? null, rows: undefined };
  }

  // --- Absences (absent without approved leave) ------------------------------

  async listAbsences(month: string, userId?: string) {
    const range = parseMonth(month);
    const rows = await this.prisma.absence.findMany({
      where: { userId, date: { gte: range.start, lte: range.end } },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        note: true,
        createdAt: true,
        user: { select: { id: true, fullName: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
    });
    return rows.map((r) => ({ ...r, date: dateOnly(r.date) }));
  }

  async recordAbsence(recorder: AuthenticatedUser, dto: RecordAbsenceDto) {
    const date = parseDateOnly(dto.date);
    if (date > businessToday()) throw new BadRequestException('You can only record absences for today or earlier');
    const employee = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { isActive: true } });
    if (!employee?.isActive) throw new NotFoundException('Employee not found or inactive');
    const notWorking = await this.calendar.nonWorkingReason(date);
    if (notWorking) throw new BadRequestException(`${dto.date} is ${notWorking}, not a working day`);
    const covered = await this.leave.approvedLeaveOn(dto.userId, date);
    if (covered) {
      throw new BadRequestException(`They have approved ${covered.type.toLowerCase()} leave on ${dto.date}`);
    }
    const exists = await this.prisma.absence.findUnique({
      where: { userId_date: { userId: dto.userId, date } },
      select: { id: true },
    });
    if (exists) throw new ConflictException('An absence is already recorded for that day');

    const row = await this.prisma.absence.create({
      data: { userId: dto.userId, date, note: dto.note || null, recordedById: recorder.id },
      select: { id: true, date: true, note: true, user: { select: { id: true, fullName: true } } },
    });
    return { ...row, date: dateOnly(row.date) };
  }

  async deleteAbsence(id: string) {
    const found = await this.prisma.absence.count({ where: { id } });
    if (!found) throw new NotFoundException('Absence not found');
    await this.prisma.absence.delete({ where: { id } });
  }
}
