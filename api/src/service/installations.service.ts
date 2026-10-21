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
import { businessToday, dateOnly, formatOrderNumber, parseDateOnly } from '../finance/finance-utils.js';
import { SalesOrdersService } from '../finance/sales-orders.service.js';
import { InstallationStatus, Prisma, SalesOrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CompleteInstallationDto,
  CreateInstallationDto,
  ListInstallationsQueryDto,
  UpdateInstallationDto,
} from './dto/service.dto.js';

export const INSTALLATION_SELECT = {
  id: true,
  scheduledDate: true,
  teamName: true,
  siteAddress: true,
  notes: true,
  status: true,
  startedAt: true,
  completedAt: true,
  completionNotes: true,
  createdAt: true,
  assignedTo: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  salesOrder: {
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      status: true,
      quantity: true,
      product: { select: { code: true, name: true, unit: true } },
      lead: { select: { phone: true, city: true } },
      salesperson: { select: { id: true, fullName: true } },
    },
  },
  _count: { select: { serviceJobs: true } },
} satisfies Prisma.InstallationSelect;

type InstallationRow = Prisma.InstallationGetPayload<{ select: typeof INSTALLATION_SELECT }>;

export function serializeInstallation(i: InstallationRow, today: Date) {
  const { _count, salesOrder, ...rest } = i;
  return {
    ...rest,
    scheduledDate: dateOnly(i.scheduledDate),
    // Past its date and still not done.
    isLate: i.status !== InstallationStatus.COMPLETED && i.scheduledDate < today,
    serviceJobCount: _count.serviceJobs,
    salesOrder: { ...salesOrder, orderNumberLabel: formatOrderNumber(salesOrder.orderNumber) },
  };
}

@Injectable()
export class InstallationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly salesOrders: SalesOrdersService,
  ) {}

  async list(user: AuthenticatedUser, query: ListInstallationsQueryDto) {
    const today = businessToday();
    const rows = await this.prisma.installation.findMany({
      where: {
        status: query.status,
        assignedToId: query.assignedTo === 'me' ? user.id : undefined,
        scheduledDate: {
          gte: query.from ? parseDateOnly(query.from) : undefined,
          lte: query.to ? parseDateOnly(query.to) : undefined,
        },
      },
      // Done ones newest first; the rest in the order they're due.
      orderBy: { scheduledDate: query.status === 'COMPLETED' ? 'desc' : 'asc' },
      take: 500,
      select: INSTALLATION_SELECT,
    });
    return rows.map((r) => serializeInstallation(r, today));
  }

  async summary() {
    const today = businessToday();
    const weekAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [scheduledThisWeek, inProgress, late, completed] = await this.prisma.$transaction([
      this.prisma.installation.count({
        where: { status: 'SCHEDULED', scheduledDate: { gte: today, lt: weekAhead } },
      }),
      this.prisma.installation.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.installation.count({
        where: { status: { not: 'COMPLETED' }, scheduledDate: { lt: today } },
      }),
      this.prisma.installation.count({ where: { status: 'COMPLETED' } }),
    ]);
    return { scheduledThisWeek, inProgress, late, completed };
  }

  async findOne(id: string) {
    const row = await this.prisma.installation.findUnique({
      where: { id },
      select: {
        ...INSTALLATION_SELECT,
        serviceJobs: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, jobNumber: true, type: true, status: true, priority: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Installation not found');
    const { serviceJobs, ...rest } = row;
    return {
      ...serializeInstallation(rest, businessToday()),
      serviceJobs: serviceJobs.map((j) => ({ ...j, jobNumberLabel: `SJ-${String(j.jobNumber).padStart(4, '0')}` })),
    };
  }

  /** Orders that can be scheduled: not cancelled, no installation yet. */
  async eligibleOrders() {
    const orders = await this.prisma.salesOrder.findMany({
      where: { status: { not: SalesOrderStatus.CANCELLED }, installation: null },
      orderBy: { orderDate: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        status: true,
        quantity: true,
        product: { select: { name: true, unit: true } },
        lead: { select: { city: true, phone: true } },
      },
    });
    return orders.map((o) => ({ ...o, orderNumberLabel: formatOrderNumber(o.orderNumber) }));
  }

  /** People who can be put in charge of an installation. */
  assignees() {
    return this.accessControl.activeUsersWithAnyTag([PERMISSIONS.INSTALLATIONS_WRITE]);
  }

  async create(user: AuthenticatedUser, dto: CreateInstallationDto) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: dto.salesOrderId },
      select: { status: true, installation: { select: { id: true } } },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status === SalesOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be installed');
    }
    if (order.installation) throw new ConflictException('This order already has an installation');
    if (dto.assignedToId) await this.ensureAssignable(dto.assignedToId);

    const created = await this.prisma.installation.create({
      data: {
        salesOrderId: dto.salesOrderId,
        scheduledDate: parseDateOnly(dto.scheduledDate),
        assignedToId: dto.assignedToId ?? null,
        teamName: dto.teamName || null,
        siteAddress: dto.siteAddress,
        notes: dto.notes || null,
        createdById: user.id,
      },
      select: { id: true },
    });
    return this.findOne(created.id);
  }

  /** Reschedule, reassign, or fix details. Completed installations are locked. */
  async update(id: string, dto: UpdateInstallationDto) {
    const existing = await this.getStatus(id);
    if (existing === InstallationStatus.COMPLETED) {
      throw new BadRequestException('Completed installations cannot be changed');
    }
    if (dto.assignedToId) await this.ensureAssignable(dto.assignedToId);
    const opt = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
    await this.prisma.installation.update({
      where: { id },
      data: {
        scheduledDate: dto.scheduledDate ? parseDateOnly(dto.scheduledDate) : undefined,
        assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
        teamName: opt(dto.teamName),
        siteAddress: dto.siteAddress,
        notes: opt(dto.notes),
      },
    });
    return this.findOne(id);
  }

  async start(id: string) {
    const flipped = await this.prisma.installation.updateMany({
      where: { id, status: InstallationStatus.SCHEDULED },
      data: { status: InstallationStatus.IN_PROGRESS, startedAt: new Date() },
    });
    if (flipped.count === 0) {
      await this.getStatus(id); // 404 if missing
      throw new BadRequestException('Only scheduled installations can be started');
    }
    return this.findOne(id);
  }

  /**
   * Done on site. This is what makes the customer eligible for service jobs.
   * If the goods weren't marked delivered yet, they are now (stock reduced),
   * which needs stock.write.
   */
  async complete(user: AuthenticatedUser, id: string, dto: CompleteInstallationDto) {
    const inst = await this.prisma.installation.findUnique({
      where: { id },
      select: { status: true, salesOrder: { select: { id: true, status: true } } },
    });
    if (!inst) throw new NotFoundException('Installation not found');
    if (inst.status === InstallationStatus.COMPLETED) {
      throw new BadRequestException('Installation is already completed');
    }
    if (inst.salesOrder.status === SalesOrderStatus.CANCELLED) {
      throw new BadRequestException('The sales order was cancelled');
    }
    const needsDelivery = inst.salesOrder.status === SalesOrderStatus.CONFIRMED;
    if (needsDelivery && !user.permissions.includes(PERMISSIONS.STOCK_WRITE)) {
      throw new ForbiddenException(
        `The order isn't delivered yet; completing will deliver it, which needs ${PERMISSIONS.STOCK_WRITE}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const flipped = await tx.installation.updateMany({
        where: { id, status: { not: InstallationStatus.COMPLETED } },
        data: {
          status: InstallationStatus.COMPLETED,
          completedAt: now,
          completionNotes: dto.completionNotes || null,
        },
      });
      if (flipped.count === 0) throw new ConflictException('Installation was already completed');
      // Keep startedAt meaningful if they skipped "start".
      await tx.installation.updateMany({ where: { id, startedAt: null }, data: { startedAt: now } });
      if (needsDelivery) await this.salesOrders.deliverInTransaction(tx, inst.salesOrder.id, user.id);
    });
    return this.findOne(id);
  }

  private async getStatus(id: string) {
    const row = await this.prisma.installation.findUnique({ where: { id }, select: { status: true } });
    if (!row) throw new NotFoundException('Installation not found');
    return row.status;
  }

  private async ensureAssignable(userId: string) {
    const ok = (await this.assignees()).some((u) => u.id === userId);
    if (!ok) {
      throw new BadRequestException(`Assignee must be active and hold ${PERMISSIONS.INSTALLATIONS_WRITE}`);
    }
  }
}
