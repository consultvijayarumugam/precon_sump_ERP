import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import {
  addDays,
  businessToday,
  dateOnly,
  Decimal,
  formatOrderNumber,
  money,
  parseDateOnly,
  ZERO,
} from '../finance/finance-utils.js';
import { AllowanceStatus, AllowanceType, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAllowanceDto, ListAllowancesQueryDto } from './dto/hr.dto.js';
import { parseMonth } from './working-calendar.service.js';

const canManage = (user: AuthenticatedUser) => user.permissions.includes(PERMISSIONS.ALLOWANCES_MANAGE);

const ALLOWANCE_SELECT = {
  id: true,
  type: true,
  amount: true,
  date: true,
  description: true,
  status: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  user: { select: { id: true, fullName: true } },
  submittedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  siteVisit: { select: { id: true, customerName: true, visitDate: true, purpose: true } },
  installation: {
    select: { id: true, salesOrder: { select: { orderNumber: true, customerName: true } } },
  },
} satisfies Prisma.AllowanceSelect;

type AllowanceRow = Prisma.AllowanceGetPayload<{ select: typeof ALLOWANCE_SELECT }>;

const serialize = (a: AllowanceRow) => ({
  ...a,
  amount: money(a.amount),
  date: dateOnly(a.date),
  siteVisit: a.siteVisit ? { ...a.siteVisit, visitDate: dateOnly(a.siteVisit.visitDate) } : null,
  installation: a.installation
    ? {
        id: a.installation.id,
        customerName: a.installation.salesOrder.customerName,
        orderNumberLabel: formatOrderNumber(a.installation.salesOrder.orderNumber),
      }
    : null,
});

/**
 * Allowances (#8). Employees claim their own (PENDING until approved).
 * allowances.manage holders see everyone's, add entries for anyone (approved
 * straight away) and approve or reject claims. Only APPROVED amounts count
 * towards the monthly total that payroll will pick up later.
 */
@Injectable()
export class AllowancesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, query: ListAllowancesQueryDto) {
    if (query.userId && query.userId !== user.id && !canManage(user)) {
      throw new ForbiddenException(`Missing permission tag(s): ${PERMISSIONS.ALLOWANCES_MANAGE}`);
    }
    const range = query.month ? parseMonth(query.month) : null;
    const rows = await this.prisma.allowance.findMany({
      where: {
        userId: canManage(user) ? query.userId : user.id,
        status: query.status,
        date: range ? { gte: range.start, lte: range.end } : undefined,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: ALLOWANCE_SELECT,
    });
    return rows.map(serialize);
  }

  async create(user: AuthenticatedUser, dto: CreateAllowanceDto) {
    const manage = canManage(user);
    const forUserId = dto.userId ?? user.id;
    if (forUserId !== user.id && !manage) {
      throw new ForbiddenException(`Adding allowances for someone else needs ${PERMISSIONS.ALLOWANCES_MANAGE}`);
    }
    if (!manage && !user.permissions.includes(PERMISSIONS.ALLOWANCES_CLAIM)) {
      throw new ForbiddenException(`Missing permission tag(s): ${PERMISSIONS.ALLOWANCES_CLAIM}`);
    }
    const employee = await this.prisma.user.findUnique({ where: { id: forUserId }, select: { isActive: true } });
    if (!employee?.isActive) throw new BadRequestException('Employee not found or inactive');
    const date = parseDateOnly(dto.date);
    if (date > businessToday()) throw new BadRequestException('Allowance date cannot be in the future');
    await this.checkLinks(forUserId, dto, manage);

    const row = await this.prisma.allowance.create({
      data: {
        userId: forUserId,
        type: dto.type,
        amount: new Decimal(dto.amount),
        date,
        description: dto.description,
        siteVisitId: dto.siteVisitId ?? null,
        installationId: dto.installationId ?? null,
        submittedById: user.id,
        // An entry made by a manager needs no second approval.
        ...(manage
          ? { status: AllowanceStatus.APPROVED, decidedById: user.id, decidedAt: new Date() }
          : { status: AllowanceStatus.PENDING }),
      },
      select: ALLOWANCE_SELECT,
    });
    return serialize(row);
  }

  async decide(manager: AuthenticatedUser, id: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    const a = await this.prisma.allowance.findUnique({ where: { id }, select: { status: true } });
    if (!a) throw new NotFoundException('Allowance not found');
    if (a.status !== AllowanceStatus.PENDING) {
      throw new BadRequestException(`Only pending claims can be decided (this one is ${a.status.toLowerCase()})`);
    }
    if (decision === 'REJECTED' && !note) throw new BadRequestException('Give a reason when rejecting');
    const row = await this.prisma.allowance.update({
      where: { id },
      data: { status: decision, decidedById: manager.id, decidedAt: new Date(), decisionNote: note || null },
      select: ALLOWANCE_SELECT,
    });
    return serialize(row);
  }

  /** Employees can withdraw their own pending claims; managers can remove any entry. */
  async remove(user: AuthenticatedUser, id: string) {
    const a = await this.prisma.allowance.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!a) throw new NotFoundException('Allowance not found');
    if (!canManage(user)) {
      if (a.userId !== user.id) throw new NotFoundException('Allowance not found');
      if (a.status !== AllowanceStatus.PENDING) {
        throw new BadRequestException('Only pending claims can be withdrawn');
      }
    }
    await this.prisma.allowance.delete({ where: { id } });
  }

  /** Monthly totals per employee. Managers see everyone; others see themselves. */
  async monthlySummary(user: AuthenticatedUser, month: string) {
    const range = parseMonth(month);
    const rows = await this.prisma.allowance.findMany({
      where: {
        userId: canManage(user) ? undefined : user.id,
        date: { gte: range.start, lte: range.end },
        status: { in: [AllowanceStatus.APPROVED, AllowanceStatus.PENDING] },
      },
      select: { userId: true, type: true, amount: true, status: true, user: { select: { id: true, fullName: true } } },
    });

    const types = Object.values(AllowanceType);
    const byUser = new Map<
      string,
      { employee: { id: string; fullName: string }; approved: Decimal; pending: Decimal; entries: number; byType: Record<string, Decimal> }
    >();
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? {
        employee: r.user,
        approved: ZERO,
        pending: ZERO,
        entries: 0,
        byType: Object.fromEntries(types.map((t) => [t, ZERO])),
      };
      entry.entries += 1;
      if (r.status === 'APPROVED') {
        entry.approved = entry.approved.plus(r.amount);
        entry.byType[r.type] = entry.byType[r.type].plus(r.amount);
      } else {
        entry.pending = entry.pending.plus(r.amount);
      }
      byUser.set(r.userId, entry);
    }

    const list = [...byUser.values()].sort((a, b) => b.approved.comparedTo(a.approved));
    return {
      month: range.month,
      rows: list.map((r) => ({
        employee: r.employee,
        entries: r.entries,
        approvedTotal: money(r.approved),
        pendingTotal: money(r.pending),
        approvedByType: Object.fromEntries(Object.entries(r.byType).map(([t, v]) => [t, money(v)])),
      })),
      totals: {
        approved: money(list.reduce((s, r) => s.plus(r.approved), ZERO)),
        pending: money(list.reduce((s, r) => s.plus(r.pending), ZERO)),
      },
    };
  }

  /**
   * Recent site visits and installations an allowance can be linked to:
   * the employee's own (visits they made, installations assigned to them).
   */
  async linkable(user: AuthenticatedUser, userId?: string) {
    const target = userId ?? user.id;
    if (target !== user.id && !canManage(user)) {
      throw new ForbiddenException(`Missing permission tag(s): ${PERMISSIONS.ALLOWANCES_MANAGE}`);
    }
    const since = addDays(businessToday(), -90);
    const [visits, installations] = await Promise.all([
      this.prisma.siteVisit.findMany({
        where: { personId: target, visitDate: { gte: since } },
        orderBy: { visitDate: 'desc' },
        select: { id: true, visitDate: true, customerName: true, purpose: true },
      }),
      this.prisma.installation.findMany({
        where: { assignedToId: target, scheduledDate: { gte: since } },
        orderBy: { scheduledDate: 'desc' },
        select: { id: true, scheduledDate: true, salesOrder: { select: { orderNumber: true, customerName: true } } },
      }),
    ]);
    return {
      siteVisits: visits.map((v) => ({ ...v, visitDate: dateOnly(v.visitDate) })),
      installations: installations.map((i) => ({
        id: i.id,
        scheduledDate: dateOnly(i.scheduledDate),
        customerName: i.salesOrder.customerName,
        orderNumberLabel: formatOrderNumber(i.salesOrder.orderNumber),
      })),
    };
  }

  /** Without allowances.manage you can only link your own visits/installations. */
  private async checkLinks(userId: string, dto: CreateAllowanceDto, manage: boolean) {
    if (dto.siteVisitId) {
      const v = await this.prisma.siteVisit.findUnique({ where: { id: dto.siteVisitId }, select: { personId: true } });
      if (!v || (!manage && v.personId !== userId)) throw new BadRequestException('Site visit not found (or not yours)');
    }
    if (dto.installationId) {
      const i = await this.prisma.installation.findUnique({
        where: { id: dto.installationId },
        select: { assignedToId: true },
      });
      if (!i || (!manage && i.assignedToId !== userId)) {
        throw new BadRequestException('Installation not found (or not assigned to you)');
      }
    }
  }
}
