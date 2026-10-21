import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateOnly, Decimal, formatOrderNumber, money, ZERO } from './finance-utils.js';

/**
 * Which sales orders a user may see or touch (tags, not role names):
 *   sales.read_all -> every order
 *   otherwise      -> orders credited to them (salespersonId)
 */
export function salesScope(user: AuthenticatedUser): Prisma.SalesOrderWhereInput {
  return user.permissions.includes(PERMISSIONS.SALES_READ_ALL)
    ? {}
    : { salespersonId: user.id };
}

export const canSeePayments = (user: AuthenticatedUser) =>
  user.permissions.includes(PERMISSIONS.PAYMENTS_READ);

export const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  customerName: true,
  quantity: true,
  totalAmount: true,
  orderDate: true,
  dueDate: true,
  status: true,
  deliveredAt: true,
  notes: true,
  createdAt: true,
  lead: { select: { id: true, phone: true, city: true } },
  product: { select: { id: true, code: true, name: true, unit: true } },
  salesperson: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.SalesOrderSelect;

export type OrderRow = Prisma.SalesOrderGetPayload<{ select: typeof ORDER_SELECT }>;

/** Sum of payments per order id. */
export async function paidByOrder(
  prisma: PrismaService | Prisma.TransactionClient,
  orderIds: string[],
): Promise<Map<string, Decimal>> {
  if (orderIds.length === 0) return new Map();
  const rows = await prisma.payment.groupBy({
    by: ['salesOrderId'],
    where: { salesOrderId: { in: orderIds } },
    orderBy: { salesOrderId: 'asc' },
    _sum: { amount: true },
  });
  return new Map(
    rows.map((r) => [r.salesOrderId, (r._sum as { amount: Decimal | null }).amount ?? ZERO]),
  );
}

/**
 * API shape of an order. Balance fields are only included for users with
 * payments.read; cancelled orders never owe anything.
 */
export function serializeOrder(
  order: OrderRow,
  opts: { paid?: Decimal; showPayments: boolean; today: Date },
) {
  const base = {
    ...order,
    orderNumberLabel: formatOrderNumber(order.orderNumber),
    totalAmount: money(order.totalAmount),
    orderDate: dateOnly(order.orderDate),
    dueDate: dateOnly(order.dueDate),
  };
  if (!opts.showPayments) return base;

  const paid = opts.paid ?? ZERO;
  const balance = order.status === 'CANCELLED' ? ZERO : order.totalAmount.minus(paid);
  const isOverdue = balance.greaterThan(0) && order.dueDate < opts.today;
  return {
    ...base,
    amountPaid: money(paid),
    balanceDue: money(balance),
    isOverdue,
  };
}
