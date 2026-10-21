import { BadRequestException, Injectable } from '@nestjs/common';
import { SalesOrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OverdueQueryDto } from './dto/sales-order.dto.js';
import {
  businessToday,
  dateOnly,
  daysBetween,
  Decimal,
  money,
  parseDateOnly,
  startOfMonth,
  ZERO,
} from './finance-utils.js';
import { ORDER_SELECT, paidByOrder, serializeOrder } from './sales-scope.js';
import { VendorsService } from './vendors.service.js';

@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vendors: VendorsService,
  ) {}

  /**
   * Revenue per salesperson (#7): order value booked in the date range (by
   * order date, cancelled orders excluded), plus how much of it has been collected.
   */
  async revenueByEmployee(range: { from?: string; to?: string }) {
    const from = range.from ? parseDateOnly(range.from) : undefined;
    const to = range.to ? parseDateOnly(range.to) : undefined;
    if (from && to && to < from) throw new BadRequestException('"to" is before "from"');

    const orders = await this.prisma.salesOrder.findMany({
      where: {
        status: { not: SalesOrderStatus.CANCELLED },
        orderDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        totalAmount: true,
        salesperson: { select: { id: true, fullName: true } },
      },
    });
    const paid = await paidByOrder(this.prisma, orders.map((o) => o.id));

    const bySalesperson = new Map<
      string,
      { salesperson: { id: string; fullName: string }; orders: number; revenue: Decimal; collected: Decimal }
    >();
    for (const o of orders) {
      const row = bySalesperson.get(o.salesperson.id) ?? {
        salesperson: o.salesperson,
        orders: 0,
        revenue: ZERO,
        collected: ZERO,
      };
      row.orders += 1;
      row.revenue = row.revenue.plus(o.totalAmount);
      row.collected = row.collected.plus(paid.get(o.id) ?? ZERO);
      bySalesperson.set(o.salesperson.id, row);
    }

    const rows = [...bySalesperson.values()].sort((a, b) => b.revenue.comparedTo(a.revenue));
    const totals = rows.reduce(
      (t, r) => ({
        orders: t.orders + r.orders,
        revenue: t.revenue.plus(r.revenue),
        collected: t.collected.plus(r.collected),
      }),
      { orders: 0, revenue: ZERO, collected: ZERO },
    );
    const format = (r: { orders: number; revenue: Decimal; collected: Decimal }) => ({
      orders: r.orders,
      revenue: money(r.revenue),
      collected: money(r.collected),
      outstanding: money(r.revenue.minus(r.collected)),
    });

    return {
      from: range.from ?? null,
      to: range.to ?? null,
      rows: rows.map((r) => ({ salesperson: r.salesperson, ...format(r) })),
      totals: format(totals),
    };
  }

  /** Orders with a balance still due after their due date (#13). Company-wide. */
  async overdueBalances(query: OverdueQueryDto) {
    const today = businessToday();
    const candidates = await this.prisma.salesOrder.findMany({
      where: { status: { not: SalesOrderStatus.CANCELLED }, dueDate: { lt: today } },
      select: ORDER_SELECT,
    });
    const paid = await paidByOrder(this.prisma, candidates.map((o) => o.id));

    const overdue = candidates
      .map((o) => ({
        order: o,
        daysOverdue: daysBetween(o.dueDate, today),
        balance: o.totalAmount.minus(paid.get(o.id) ?? ZERO),
      }))
      .filter((o) => o.balance.greaterThan(0))
      .sort((a, b) =>
        query.sort === 'largest' ? b.balance.comparedTo(a.balance) : b.daysOverdue - a.daysOverdue,
      );

    const totalOverdue = overdue.reduce((sum, o) => sum.plus(o.balance), ZERO);
    return {
      asOf: dateOnly(today),
      count: overdue.length,
      totalOverdue: money(totalOverdue),
      items: overdue.map(({ order, daysOverdue }) => ({
        ...serializeOrder(order, { paid: paid.get(order.id), showPayments: true, today }),
        daysOverdue,
      })),
    };
  }

  /** Company-wide headline numbers for the admin dashboard. */
  async summary() {
    const today = businessToday();
    const monthStart = startOfMonth(today);

    const [monthAgg, openOrders] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { status: { not: SalesOrderStatus.CANCELLED }, orderDate: { gte: monthStart } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      this.prisma.salesOrder.findMany({
        where: { status: { not: SalesOrderStatus.CANCELLED } },
        select: { id: true, totalAmount: true, dueDate: true },
      }),
    ]);
    const paid = await paidByOrder(this.prisma, openOrders.map((o) => o.id));

    let receivable = ZERO;
    let overdueReceivable = ZERO;
    let overdueOrders = 0;
    for (const o of openOrders) {
      const balance = o.totalAmount.minus(paid.get(o.id) ?? ZERO);
      if (balance.lessThanOrEqualTo(0)) continue;
      receivable = receivable.plus(balance);
      if (o.dueDate < today) {
        overdueReceivable = overdueReceivable.plus(balance);
        overdueOrders += 1;
      }
    }

    const payables = await this.vendors.outstandingTotals();
    return {
      asOf: dateOnly(today),
      revenueThisMonth: money(monthAgg._sum.totalAmount),
      ordersThisMonth: monthAgg._count._all,
      receivable: money(receivable),
      overdueReceivable: money(overdueReceivable),
      overdueOrders,
      payable: payables.payable,
      overduePayable: payables.overduePayable,
    };
  }
}
