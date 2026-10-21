/**
 * Sample finance and stock data (Phase 3). Dates are relative to today so the
 * overdue views always have something in them. Each part runs only if its
 * tables are empty, so re-seeding never duplicates or clobbers real data.
 *
 * What you get:
 *  - Stock for all 4 products; bio-septic tanks are below their threshold.
 *  - 4 sales orders from won leads, with partial payments: 2 overdue balances,
 *    1 balance not yet due, 1 fully paid. 3 are delivered (stock reduced).
 *  - 2 won leads with no order yet, to try "Convert to sales order".
 *  - 3 vendors: one with an overdue bill, one owed but not yet due, one paid up.
 */
import type {
  LeadSource,
  PaymentMode,
  PrismaClient,
  ProductInterest,
  StockMovementReason,
  VendorCategory,
} from '../src/generated/prisma/client.js';
import { Prisma } from '../src/generated/prisma/client.js';

const DAY = 24 * 60 * 60 * 1000;

/** Business "today" in India as a DATE (UTC midnight). */
function today(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}
const day = (offset: number) => new Date(today().getTime() + offset * DAY);
const rupees = (n: number) => new Prisma.Decimal(n);
/** Delivered 3 days after the order, at 11:00 India time (05:30 UTC). */
const deliveredAt = (o: { orderDaysAgo: number }) =>
  new Date(day(-o.orderDaysAgo + 3).getTime() + 5.5 * 60 * 60 * 1000);

const PRODUCTS: {
  code: ProductInterest;
  name: string;
  unit: string;
  opening: number;
  lowStockThreshold: number;
}[] = [
  { code: 'UG_SUMP', name: 'UG sump (precast, 10,000 L)', unit: 'nos', opening: 14, lowStockThreshold: 5 },
  { code: 'BIO_SEPTIC_TANK', name: 'Bio-septic tank (FRP, 5-user)', unit: 'nos', opening: 3, lowStockThreshold: 5 },
  { code: 'MICROBES', name: 'Bio-septic microbes (1 kg pack)', unit: 'packs', opening: 60, lowStockThreshold: 25 },
  { code: 'PRECAST', name: 'Precast compound wall panel', unit: 'panels', opening: 210, lowStockThreshold: 50 },
];

interface SampleOrder {
  leadName: string; // existing won lead, or created below
  newLead?: { phone: string; city: string; source: LeadSource; owner: 'sales' | 'sales2'; closedDaysAgo: number };
  product: ProductInterest;
  quantity: number;
  total: number;
  orderDaysAgo: number;
  dueInDays: number; // relative to today; negative = already past due
  delivered: boolean;
  payments: { amount: number; daysAgo: number; mode: PaymentMode; reference?: string }[];
}

const ORDERS: SampleOrder[] = [
  {
    leadName: 'Senthil Farms', product: 'MICROBES', quantity: 20, total: 18000,
    orderDaysAgo: 18, dueInDays: -3, delivered: true,
    payments: [{ amount: 10000, daysAgo: 17, mode: 'UPI', reference: 'UPI 4417 2210 9931' }],
  },
  {
    leadName: 'Divya Hospital', product: 'UG_SUMP', quantity: 2, total: 420000,
    orderDaysAgo: 25, dueInDays: -10, delivered: true,
    payments: [{ amount: 200000, daysAgo: 24, mode: 'BANK_TRANSFER', reference: 'NEFT HDFC0012' }],
  },
  {
    leadName: 'Sri Murugan Residency',
    newLead: { phone: '9442233445', city: 'Tiruppur', source: 'WEBSITE', owner: 'sales', closedDaysAgo: 5 },
    product: 'BIO_SEPTIC_TANK', quantity: 1, total: 65000,
    orderDaysAgo: 5, dueInDays: 10, delivered: false,
    payments: [{ amount: 20000, daysAgo: 5, mode: 'CASH' }],
  },
  {
    leadName: 'Kongu Engineering College',
    newLead: { phone: '9865544332', city: 'Perundurai', source: 'REFERRAL', owner: 'sales2', closedDaysAgo: 40 },
    product: 'PRECAST', quantity: 60, total: 150000,
    orderDaysAgo: 40, dueInDays: -25, delivered: true,
    payments: [
      { amount: 75000, daysAgo: 39, mode: 'CHEQUE', reference: 'Chq 004512' },
      { amount: 75000, daysAgo: 20, mode: 'BANK_TRANSFER', reference: 'NEFT SBIN0441' },
    ],
  },
];

/** Won but not converted yet, so you can try the conversion yourself. */
const UNCONVERTED_WON_LEADS = [
  { name: 'Sakthi Hardware Stores', phone: '9789012345', city: 'Erode', source: 'MANUAL' as LeadSource, product: 'MICROBES' as ProductInterest, owner: 'sales' as const },
  { name: 'Palani Hill Resorts', phone: '9500123456', city: 'Kodaikanal', source: 'META' as LeadSource, product: 'UG_SUMP' as ProductInterest, owner: 'sales2' as const },
];

const VENDORS: {
  name: string;
  category: VendorCategory;
  contactPerson: string;
  phone: string;
  purchases: { item: string; invoice: string; amount: number; daysAgo: number; dueInDays: number }[];
  payments: { amount: number; daysAgo: number; mode: PaymentMode; reference?: string }[];
}[] = [
  {
    name: 'Ramco Cement Dealers', category: 'RAW_MATERIAL', contactPerson: 'Mr. Selvam', phone: '9842012345',
    purchases: [
      { item: 'OPC 53 cement, 300 bags', invoice: 'RCD-2231', amount: 120000, daysAgo: 35, dueInDays: -5 },
      { item: 'OPC 53 cement, 200 bags', invoice: 'RCD-2290', amount: 80000, daysAgo: 10, dueInDays: 20 },
    ],
    payments: [{ amount: 70000, daysAgo: 20, mode: 'BANK_TRANSFER', reference: 'NEFT 88123' }],
  },
  {
    name: 'Sri Balaji Steels', category: 'RAW_MATERIAL', contactPerson: 'Mrs. Kavitha', phone: '9443098765',
    purchases: [{ item: 'TMT bars 8mm/10mm, 4 tonnes', invoice: 'SBS/0912', amount: 240000, daysAgo: 20, dueInDays: 10 }],
    payments: [{ amount: 100000, daysAgo: 15, mode: 'CHEQUE', reference: 'Chq 117722' }],
  },
  {
    name: 'KPN Transports', category: 'TRANSPORT', contactPerson: 'Mr. Kumar', phone: '9894411223',
    purchases: [{ item: 'Crane + lorry hire, Salem delivery', invoice: 'KPN-554', amount: 18000, daysAgo: 15, dueInDays: -1 }],
    payments: [{ amount: 18000, daysAgo: 3, mode: 'UPI' }],
  },
];

export async function seedFinanceAndStock(prisma: PrismaClient) {
  const userId = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
  const adminId = await userId('admin@precon.local');
  const owners = { sales: await userId('sales@precon.local'), sales2: await userId('sales2@precon.local') };

  // 1. Products + opening stock (only products that don't exist yet)
  for (const p of PRODUCTS) {
    const exists = await prisma.product.findUnique({ where: { code: p.code } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        code: p.code,
        name: p.name,
        unit: p.unit,
        quantityOnHand: p.opening,
        lowStockThreshold: p.lowStockThreshold,
        movements: {
          create: {
            change: p.opening,
            reason: 'OPENING' as StockMovementReason,
            note: 'Opening stock',
            createdById: adminId,
            createdAt: day(-60),
          },
        },
      },
    });
  }
  const productId = new Map(
    (await prisma.product.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );

  // 2. Sales orders with payments
  if ((await prisma.salesOrder.count()) === 0) {
    for (const o of ORDERS) {
      let lead = await prisma.lead.findFirst({
        where: { name: o.leadName },
        select: { id: true, name: true, assignedToId: true },
      });
      if (!lead && o.newLead) {
        lead = await prisma.lead.create({
          data: {
            name: o.leadName,
            phone: o.newLead.phone,
            city: o.newLead.city,
            source: o.newLead.source,
            productInterest: o.product,
            status: 'WON',
            assignedToId: owners[o.newLead.owner],
            createdById: adminId,
            createdAt: day(-o.newLead.closedDaysAgo - 12),
            closedAt: day(-o.newLead.closedDaysAgo),
          },
          select: { id: true, name: true, assignedToId: true },
        });
      }
      if (!lead?.assignedToId) {
        console.log(`  (skipping order for "${o.leadName}": lead missing or unassigned)`);
        continue;
      }

      const order = await prisma.salesOrder.create({
        data: {
          leadId: lead.id,
          customerName: lead.name,
          productId: productId.get(o.product)!,
          quantity: o.quantity,
          totalAmount: rupees(o.total),
          orderDate: day(-o.orderDaysAgo),
          dueDate: day(o.dueInDays),
          status: o.delivered ? 'DELIVERED' : 'CONFIRMED',
          deliveredAt: o.delivered ? deliveredAt(o) : null,
          salespersonId: lead.assignedToId,
          createdById: lead.assignedToId,
          payments: {
            create: o.payments.map((p) => ({
              amount: rupees(p.amount),
              paidOn: day(-p.daysAgo),
              mode: p.mode,
              reference: p.reference,
              recordedById: adminId,
            })),
          },
        },
        select: { id: true, orderNumber: true },
      });

      if (o.delivered) {
        await prisma.product.update({
          where: { id: productId.get(o.product)! },
          data: { quantityOnHand: { decrement: o.quantity } },
        });
        await prisma.stockMovement.create({
          data: {
            productId: productId.get(o.product)!,
            change: -o.quantity,
            reason: 'DELIVERY',
            note: `Delivered SO-${String(order.orderNumber).padStart(4, '0')} to ${lead.name}`,
            salesOrderId: order.id,
            createdById: adminId,
            createdAt: deliveredAt(o),
          },
        });
      }
    }

    for (const l of UNCONVERTED_WON_LEADS) {
      if (await prisma.lead.findFirst({ where: { name: l.name } })) continue;
      await prisma.lead.create({
        data: {
          name: l.name,
          phone: l.phone,
          city: l.city,
          source: l.source,
          productInterest: l.product,
          status: 'WON',
          notes: 'Won; ready to convert into a sales order.',
          assignedToId: owners[l.owner],
          createdById: adminId,
          createdAt: day(-9),
          closedAt: day(-1),
        },
      });
    }
    console.log(`Seeded ${ORDERS.length} sales orders and ${UNCONVERTED_WON_LEADS.length} won leads awaiting conversion.`);
  } else {
    console.log('Sales orders already exist; skipping sample orders.');
  }

  // 3. Vendors, purchases, vendor payments
  if ((await prisma.vendor.count()) === 0) {
    for (const v of VENDORS) {
      await prisma.vendor.create({
        data: {
          name: v.name,
          category: v.category,
          contactPerson: v.contactPerson,
          phone: v.phone,
          purchases: {
            create: v.purchases.map((p) => ({
              item: p.item,
              invoiceNumber: p.invoice,
              amount: rupees(p.amount),
              purchaseDate: day(-p.daysAgo),
              dueDate: day(p.dueInDays),
              createdById: adminId,
            })),
          },
          payments: {
            create: v.payments.map((p) => ({
              amount: rupees(p.amount),
              paidOn: day(-p.daysAgo),
              mode: p.mode,
              reference: p.reference,
              recordedById: adminId,
            })),
          },
        },
      });
    }
    console.log(`Seeded ${VENDORS.length} vendors with purchases and payments.`);
  } else {
    console.log('Vendors already exist; skipping sample vendors.');
  }
}
