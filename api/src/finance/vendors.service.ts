import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreatePurchaseDto,
  CreateVendorDto,
  RecordVendorPaymentDto,
  UpdateVendorDto,
} from './dto/vendor.dto.js';
import { businessToday, dateOnly, daysBetween, Decimal, money, parseDateOnly, ZERO } from './finance-utils.js';

interface PurchaseForAllocation {
  id: string;
  amount: Decimal;
  dueDate: Date;
  purchaseDate: Date;
}

/**
 * Vendor payments aren't tied to a single bill, so we apply them to the
 * oldest-due bills first (FIFO). That tells us how much of each bill is
 * still unpaid, and therefore how much is overdue.
 */
function allocatePayments(purchases: PurchaseForAllocation[], totalPaid: Decimal, today: Date) {
  let remainingPaid = totalPaid;
  let outstanding = ZERO;
  let overdue = ZERO;
  let oldestUnpaidDue: Date | null = null;

  const bills = [...purchases]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.purchaseDate.getTime() - b.purchaseDate.getTime())
    .map((p) => {
      const covered = Decimal.min(p.amount, remainingPaid);
      remainingPaid = remainingPaid.minus(covered);
      const unpaid = p.amount.minus(covered);
      const isOverdue = unpaid.greaterThan(0) && p.dueDate < today;
      if (unpaid.greaterThan(0)) {
        outstanding = outstanding.plus(unpaid);
        oldestUnpaidDue ??= p.dueDate;
      }
      if (isOverdue) overdue = overdue.plus(unpaid);
      return { id: p.id, unpaid, isOverdue };
    });

  return { bills, outstanding, overdue, oldestUnpaidDue: oldestUnpaidDue as Date | null };
}

const VENDOR_SELECT = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  email: true,
  category: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.VendorSelect;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vendor outstanding view (#14): what we owe each vendor, most owed first. */
  async list() {
    const today = businessToday();
    const vendors = await this.prisma.vendor.findMany({
      orderBy: { name: 'asc' },
      select: {
        ...VENDOR_SELECT,
        purchases: { select: { id: true, amount: true, dueDate: true, purchaseDate: true } },
        payments: { select: { amount: true } },
      },
    });

    const rows = vendors.map(({ purchases, payments, ...vendor }) => {
      const billed = purchases.reduce((s, p) => s.plus(p.amount), ZERO);
      const paid = payments.reduce((s, p) => s.plus(p.amount), ZERO);
      const { outstanding, overdue, oldestUnpaidDue } = allocatePayments(purchases, paid, today);
      return {
        ...vendor,
        totalPurchased: money(billed),
        totalPaid: money(paid),
        outstanding: money(outstanding),
        overdue: money(overdue),
        isOverdue: overdue.greaterThan(0),
        oldestUnpaidDue: oldestUnpaidDue ? dateOnly(oldestUnpaidDue) : null,
        _outstanding: outstanding,
      };
    });
    rows.sort((a, b) => b._outstanding.comparedTo(a._outstanding) || a.name.localeCompare(b.name));

    const totals = rows.reduce(
      (t, r) => ({ outstanding: t.outstanding.plus(r.outstanding), overdue: t.overdue.plus(r.overdue) }),
      { outstanding: ZERO, overdue: ZERO },
    );
    return {
      asOf: dateOnly(today),
      totalOutstanding: money(totals.outstanding),
      totalOverdue: money(totals.overdue),
      items: rows.map(({ _outstanding, ...r }) => r),
    };
  }

  async findOne(id: string) {
    const today = businessToday();
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: {
        ...VENDOR_SELECT,
        purchases: {
          orderBy: { purchaseDate: 'desc' },
          select: {
            id: true,
            item: true,
            invoiceNumber: true,
            amount: true,
            purchaseDate: true,
            dueDate: true,
            notes: true,
            createdBy: { select: { id: true, fullName: true } },
          },
        },
        payments: {
          orderBy: { paidOn: 'desc' },
          select: {
            id: true,
            amount: true,
            paidOn: true,
            mode: true,
            reference: true,
            note: true,
            recordedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const paid = vendor.payments.reduce((s, p) => s.plus(p.amount), ZERO);
    const billed = vendor.purchases.reduce((s, p) => s.plus(p.amount), ZERO);
    const allocation = allocatePayments(vendor.purchases, paid, today);
    const billState = new Map(allocation.bills.map((b) => [b.id, b]));

    return {
      ...vendor,
      totalPurchased: money(billed),
      totalPaid: money(paid),
      outstanding: money(allocation.outstanding),
      overdue: money(allocation.overdue),
      purchases: vendor.purchases.map((p) => {
        const state = billState.get(p.id)!;
        return {
          ...p,
          amount: money(p.amount),
          purchaseDate: dateOnly(p.purchaseDate),
          dueDate: dateOnly(p.dueDate),
          unpaid: money(state.unpaid),
          isOverdue: state.isOverdue,
          daysOverdue: state.isOverdue ? daysBetween(p.dueDate, today) : 0,
        };
      }),
      payments: vendor.payments.map((p) => ({ ...p, amount: money(p.amount), paidOn: dateOnly(p.paidOn) })),
    };
  }

  /** Totals across all vendors, for the finance dashboard. */
  async outstandingTotals() {
    const { totalOutstanding, totalOverdue } = await this.list();
    return { payable: totalOutstanding, overduePayable: totalOverdue };
  }

  create(dto: CreateVendorDto) {
    return this.prisma.vendor.create({ data: this.vendorData(dto) as Prisma.VendorCreateInput, select: VENDOR_SELECT });
  }

  async update(id: string, dto: UpdateVendorDto) {
    await this.ensureVendor(id);
    return this.prisma.vendor.update({ where: { id }, data: this.vendorData(dto), select: VENDOR_SELECT });
  }

  async addPurchase(userId: string, vendorId: string, dto: CreatePurchaseDto) {
    await this.ensureVendor(vendorId);
    const purchaseDate = parseDateOnly(dto.purchaseDate);
    const dueDate = parseDateOnly(dto.dueDate);
    if (dueDate < purchaseDate) throw new BadRequestException('dueDate cannot be before purchaseDate');
    await this.prisma.purchase.create({
      data: {
        vendorId,
        item: dto.item,
        invoiceNumber: dto.invoiceNumber || null,
        amount: new Decimal(dto.amount),
        purchaseDate,
        dueDate,
        notes: dto.notes || null,
        createdById: userId,
      },
    });
    return this.findOne(vendorId);
  }

  /** Paying more than we owe is refused (no advances in this phase). */
  async addPayment(userId: string, vendorId: string, dto: RecordVendorPaymentDto) {
    const vendor = await this.findOne(vendorId);
    const amount = new Decimal(dto.amount);
    if (amount.greaterThan(vendor.outstanding)) {
      throw new BadRequestException(`Amount is more than the outstanding balance (${vendor.outstanding})`);
    }
    await this.prisma.vendorPayment.create({
      data: {
        vendorId,
        amount,
        paidOn: parseDateOnly(dto.paidOn),
        mode: dto.mode,
        reference: dto.reference || null,
        note: dto.note || null,
        recordedById: userId,
      },
    });
    return this.findOne(vendorId);
  }

  async deletePayment(paymentId: string) {
    const payment = await this.prisma.vendorPayment.findUnique({
      where: { id: paymentId },
      select: { vendorId: true },
    });
    if (!payment) throw new NotFoundException('Vendor payment not found');
    await this.prisma.vendorPayment.delete({ where: { id: paymentId } });
    return this.findOne(payment.vendorId);
  }

  private vendorData(dto: UpdateVendorDto): Prisma.VendorUpdateInput {
    const opt = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
    return {
      name: dto.name,
      category: dto.category,
      contactPerson: opt(dto.contactPerson),
      phone: opt(dto.phone),
      email: opt(dto.email),
      notes: opt(dto.notes),
    };
  }

  private async ensureVendor(id: string) {
    const found = await this.prisma.vendor.count({ where: { id } });
    if (!found) throw new NotFoundException('Vendor not found');
  }
}
