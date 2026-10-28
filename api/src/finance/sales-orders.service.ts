import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { leadScope } from '../crm/lead-scope.js';
import {
  LeadStatus,
  Prisma,
  SalesOrderStatus,
  StockMovementReason,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';
import {
  CreateSalesOrderDto,
  ListSalesOrdersQueryDto,
  RecordPaymentDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto.js';
import {
  addDays,
  businessToday,
  dateOnly,
  Decimal,
  formatOrderNumber,
  money,
  parseDateOnly,
} from './finance-utils.js';
import {
  canSeePayments,
  ORDER_SELECT,
  paidByOrder,
  salesScope,
  serializeOrder,
} from './sales-scope.js';

/** Payment terms used when no due date is given. */
const DEFAULT_PAYMENT_TERMS_DAYS = 30;

const PAYMENT_SELECT = {
  id: true,
  amount: true,
  paidOn: true,
  mode: true,
  reference: true,
  note: true,
  createdAt: true,
  recordedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentSelect;

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly accessControl: AccessControlService,
  ) {}

  async list(user: AuthenticatedUser, query: ListSalesOrdersQueryDto) {
    const where: Prisma.SalesOrderWhereInput = {
      AND: [
        salesScope(user),
        {
          status: query.status,
          salespersonId: query.salespersonId,
          orderDate: {
            gte: query.from ? parseDateOnly(query.from) : undefined,
            lte: query.to ? parseDateOnly(query.to) : undefined,
          },
        },
      ],
    };
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.salesOrder.count({ where }),
      this.prisma.salesOrder.findMany({
        where,
        orderBy: [{ orderDate: 'desc' }, { orderNumber: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: ORDER_SELECT,
      }),
    ]);

    const showPayments = canSeePayments(user);
    const paid = showPayments ? await paidByOrder(this.prisma, orders.map((o) => o.id)) : new Map();
    const today = businessToday();
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: orders.map((o) => serializeOrder(o, { paid: paid.get(o.id), showPayments, today })),
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { AND: [{ id }, salesScope(user)] },
      select: ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Sales order not found');

    const showPayments = canSeePayments(user);
    const payments = showPayments
      ? await this.prisma.payment.findMany({
          where: { salesOrderId: id },
          orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
          select: PAYMENT_SELECT,
        })
      : [];
    const paid = payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

    return {
      ...serializeOrder(order, { paid, showPayments, today: businessToday() }),
      ...(showPayments
        ? {
            payments: payments.map((p) => ({
              ...p,
              amount: money(p.amount),
              paidOn: dateOnly(p.paidOn),
            })),
          }
        : {}),
    };
  }

  /** Sales summary for the dashboard, within the user's order scope. */
  async summary(user: AuthenticatedUser) {
    const scope = salesScope(user);
    const today = businessToday();
    const monthStart = parseDateOnly(`${dateOnly(today).slice(0, 7)}-01`);
    const [thisMonth, awaitingDelivery] = await this.prisma.$transaction([
      this.prisma.salesOrder.aggregate({
        where: { AND: [scope, { status: { not: 'CANCELLED' }, orderDate: { gte: monthStart } }] },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      this.prisma.salesOrder.count({ where: { AND: [scope, { status: 'CONFIRMED' }] } }),
    ]);
    return {
      monthStart: dateOnly(monthStart),
      ordersThisMonth: thisMonth._count._all,
      valueThisMonth: money(thisMonth._sum.totalAmount),
      awaitingDelivery,
    };
  }

  /** Convert a WON lead into a sales order (#7). */
  async create(user: AuthenticatedUser, dto: CreateSalesOrderDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id: dto.leadId }, leadScope(user)] },
      select: {
        id: true,
        name: true,
        status: true,
        productInterest: true,
        sumpSizeLitres: true,
        assignedToId: true,
        salesOrder: { select: { id: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status !== LeadStatus.WON) {
      throw new BadRequestException('Only WON leads can be converted to a sales order');
    }
    if (lead.salesOrder) {
      throw new ConflictException('This lead already has a sales order');
    }

    const salespersonId = await this.resolveSalesperson(user, dto.salespersonId, lead.assignedToId);
    const orderDate = dto.orderDate ? parseDateOnly(dto.orderDate) : businessToday();
    const dueDate = dto.dueDate
      ? parseDateOnly(dto.dueDate)
      : addDays(orderDate, DEFAULT_PAYMENT_TERMS_DAYS);
    if (dueDate < orderDate) throw new BadRequestException('dueDate cannot be before orderDate');

    const order = await this.prisma.$transaction(async (tx) => {
      // Product defaults to what the lead wanted; a sump also needs a size.
      const code = dto.product ?? lead.productInterest;
      if (!code) throw new BadRequestException("The lead's product isn't known yet; choose the product for this order");
      // A size sent with microbes is refused (resolveSku), not silently dropped.
      const size = code === 'SUMP' ? (dto.sizeLitres ?? lead.sumpSizeLitres) : (dto.sizeLitres ?? null);
      const productId = await this.stock.productIdFor(tx, code, size);
      return tx.salesOrder.create({
        data: {
          leadId: lead.id,
          customerName: lead.name,
          productId,
          quantity: dto.quantity,
          totalAmount: new Decimal(dto.totalAmount),
          orderDate,
          dueDate,
          notes: dto.notes || null,
          salespersonId,
          createdById: user.id,
        },
        select: { id: true },
      });
    });
    return this.findOne(user, order.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateSalesOrderDto) {
    const existing = await this.getInScope(user, id);
    if (existing.status === SalesOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be edited');
    }
    const delivered = existing.status === SalesOrderStatus.DELIVERED;
    if (delivered && (dto.product !== undefined || dto.sizeLitres !== undefined || dto.quantity !== undefined)) {
      throw new BadRequestException('Product, size and quantity are fixed once an order is delivered');
    }

    const data: Prisma.SalesOrderUncheckedUpdateInput = {
      quantity: dto.quantity,
      notes: dto.notes,
      orderDate: dto.orderDate ? parseDateOnly(dto.orderDate) : undefined,
      dueDate: dto.dueDate ? parseDateOnly(dto.dueDate) : undefined,
    };
    const orderDate = dto.orderDate ? parseDateOnly(dto.orderDate) : existing.orderDate;
    const dueDate = dto.dueDate ? parseDateOnly(dto.dueDate) : existing.dueDate;
    if (dueDate < orderDate) throw new BadRequestException('dueDate cannot be before orderDate');

    if (dto.salespersonId !== undefined && dto.salespersonId !== existing.salespersonId) {
      data.salespersonId = await this.resolveSalesperson(user, dto.salespersonId, existing.salespersonId);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.totalAmount !== undefined) {
        const total = new Decimal(dto.totalAmount);
        const paid = (await paidByOrder(tx, [id])).get(id) ?? new Decimal(0);
        if (total.lessThan(paid)) {
          throw new BadRequestException(
            `Total cannot be less than the ${money(paid)} already received`,
          );
        }
        data.totalAmount = total;
      }
      if (dto.product !== undefined || dto.sizeLitres !== undefined) {
        const code = dto.product ?? existing.product.code;
        const size = code === 'SUMP' ? (dto.sizeLitres ?? existing.product.sizeLitres) : (dto.sizeLitres ?? null);
        data.productId = await this.stock.productIdFor(tx, code, size);
      }
      await tx.salesOrder.update({ where: { id }, data });
    });

    const stillVisible = await this.prisma.salesOrder.count({
      where: { AND: [{ id }, salesScope(user)] },
    });
    return stillVisible ? this.findOne(user, id) : { id, movedOutOfScope: true };
  }

  /** Goods left the factory: reduce stock and mark DELIVERED, atomically (#6). */
  async deliver(user: AuthenticatedUser, id: string) {
    const order = await this.getInScope(user, id);
    if (order.status !== SalesOrderStatus.CONFIRMED) {
      throw new BadRequestException(`Order is already ${order.status.toLowerCase()}`);
    }
    await this.prisma.$transaction((tx) => this.deliverInTransaction(tx, id, user.id));
    return this.findOne(user, id);
  }

  /**
   * Flip a CONFIRMED order to DELIVERED and take its goods out of stock, inside
   * the caller's transaction. Also used when an installation is completed.
   */
  async deliverInTransaction(tx: Prisma.TransactionClient, orderId: string, userId: string) {
    const order = await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { orderNumber: true, productId: true, quantity: true, customerName: true },
    });
    // Guard against a double click delivering twice.
    const flipped = await tx.salesOrder.updateMany({
      where: { id: orderId, status: SalesOrderStatus.CONFIRMED },
      data: { status: SalesOrderStatus.DELIVERED, deliveredAt: new Date() },
    });
    if (flipped.count === 0) throw new ConflictException('Order was already updated');
    await this.stock.applyMovement(tx, {
      productId: order.productId,
      change: -order.quantity,
      reason: StockMovementReason.DELIVERY,
      note: `Delivered ${formatOrderNumber(order.orderNumber)} to ${order.customerName}`,
      salesOrderId: orderId,
      userId,
    });
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const order = await this.getInScope(user, id);
    if (order.status !== SalesOrderStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed (undelivered) orders can be cancelled');
    }
    const payments = await this.prisma.payment.count({ where: { salesOrderId: id } });
    if (payments > 0) {
      throw new BadRequestException('This order has payments recorded; remove them first');
    }
    await this.prisma.salesOrder.update({
      where: { id },
      data: { status: SalesOrderStatus.CANCELLED },
    });
    return this.findOne(user, id);
  }

  /** Record money received against an order (#13). Over-payment is refused. */
  async recordPayment(user: AuthenticatedUser, orderId: string, dto: RecordPaymentDto) {
    const order = await this.getInScope(user, orderId);
    if (order.status === SalesOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot record a payment on a cancelled order');
    }
    await this.prisma.$transaction(async (tx) => {
      const paid = (await paidByOrder(tx, [orderId])).get(orderId) ?? new Decimal(0);
      const balance = order.totalAmount.minus(paid);
      const amount = new Decimal(dto.amount);
      if (amount.greaterThan(balance)) {
        throw new BadRequestException(`Amount is more than the balance due (${money(balance)})`);
      }
      await tx.payment.create({
        data: {
          salesOrderId: orderId,
          amount,
          paidOn: parseDateOnly(dto.paidOn),
          mode: dto.mode,
          reference: dto.reference || null,
          note: dto.note || null,
          recordedById: user.id,
        },
      });
    });
    return this.findOne(user, orderId);
  }

  async deletePayment(user: AuthenticatedUser, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, salesOrder: salesScope(user) },
      select: { id: true, salesOrderId: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.payment.delete({ where: { id: paymentId } });
    return this.findOne(user, payment.salesOrderId);
  }

  private async getInScope(user: AuthenticatedUser, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { AND: [{ id }, salesScope(user)] },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        productId: true,
        quantity: true,
        totalAmount: true,
        customerName: true,
        orderDate: true,
        dueDate: true,
        salespersonId: true,
        product: { select: { code: true, sizeLitres: true } },
      },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    return order;
  }

  /**
   * Revenue is credited to the lead's salesperson by default. Crediting
   * someone else needs sales.read_all, and they must be able to hold orders.
   */
  private async resolveSalesperson(
    user: AuthenticatedUser,
    requested: string | undefined,
    fallback: string | null,
  ): Promise<string> {
    const target = requested ?? fallback;
    if (!target) {
      throw new BadRequestException('This lead is unassigned; choose a salesperson (salespersonId)');
    }
    if (target !== fallback && target !== user.id && !user.permissions.includes(PERMISSIONS.SALES_READ_ALL)) {
      throw new ForbiddenException(`Missing permission tag(s): ${PERMISSIONS.SALES_READ_ALL}`);
    }
    const person = await this.prisma.user.findUnique({
      where: { id: target },
      select: { isActive: true },
    });
    if (!person?.isActive) throw new BadRequestException('Salesperson not found or inactive');
    const { permissions } = await this.accessControl.getEffectiveAccess(target);
    if (!permissions.includes(PERMISSIONS.SALES_READ)) {
      throw new BadRequestException(`Salesperson must hold the ${PERMISSIONS.SALES_READ} tag`);
    }
    return target;
  }
}
