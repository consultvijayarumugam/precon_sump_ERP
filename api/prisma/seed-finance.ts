/**
 * Sample finance and stock data (Phase 3). Dates are relative to today so the
 * overdue views always have something in them. Each part runs only if its
 * tables are empty, so re-seeding never duplicates or clobbers real data.
 *
 * What you get:
 *  - Stock for every sump size (3,000-20,000 L) and microbes; Sump 5,000 L
 *    and 12,000 L are at or below their alert level.
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
import { PRODUCT_UNITS, productNameFor, skuFor } from '../src/stock/product-catalog.js';

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

/**
 * Starting stock per item. `onHand` is what you'll see after seeding; opening
 * stock is that plus whatever the sample deliveries below take out.
 * Sump 5,000 L and 12,000 L are at/below their alert level on purpose.
 */
const STOCK_PLAN: { code: ProductInterest; size: number | null; onHand: number; lowStockThreshold: number }[] = [
  { code: 'SUMP', size: 3000, onHand: 6, lowStockThreshold: 3 },
  { code: 'SUMP', size: 4000, onHand: 5, lowStockThreshold: 3 },
  { code: 'SUMP', size: 5000, onHand: 2, lowStockThreshold: 3 }, // low
  { code: 'SUMP', size: 6000, onHand: 4, lowStockThreshold: 2 },
  { code: 'SUMP', size: 8000, onHand: 3, lowStockThreshold: 2 },
  { code: 'SUMP', size: 10000, onHand: 7, lowStockThreshold: 3 },
  { code: 'SUMP', size: 12000, onHand: 2, lowStockThreshold: 2 }, // low (at the alert level)
  { code: 'SUMP', size: 15000, onHand: 3, lowStockThreshold: 1 },
  { code: 'SUMP', size: 20000, onHand: 2, lowStockThreshold: 1 },
  { code: 'MICROBES', size: null, onHand: 40, lowStockThreshold: 25 },
];

interface SampleOrder {
  leadName: string; // existing won lead, or created below
  newLead?: { phone: string; city: string; source: LeadSource; owner: 'sales' | 'sales2'; closedDaysAgo: number };
  product: ProductInterest;
  size: number | null; // litres, sumps only
  quantity: number;
  total: number;
  orderDaysAgo: number;
  dueInDays: number; // relative to today; negative = already past due
  delivered: boolean;
  payments: { amount: number; daysAgo: number; mode: PaymentMode; reference?: string }[];
}

const ORDERS: SampleOrder[] = [
  {
    leadName: 'Senthil Farms', product: 'MICROBES', size: null, quantity: 20, total: 18000,
    orderDaysAgo: 18, dueInDays: -3, delivered: true,
    payments: [{ amount: 10000, daysAgo: 17, mode: 'UPI', reference: 'UPI 4417 2210 9931' }],
  },
  {
    leadName: 'Divya Hospital', product: 'SUMP', size: 20000, quantity: 2, total: 420000,
    orderDaysAgo: 25, dueInDays: -10, delivered: true,
    payments: [{ amount: 200000, daysAgo: 24, mode: 'BANK_TRANSFER', reference: 'NEFT HDFC0012' }],
  },
  {
    leadName: 'Sri Murugan Residency',
    newLead: { phone: '9442233445', city: 'Tiruppur', source: 'WEBSITE', owner: 'sales', closedDaysAgo: 5 },
    product: 'SUMP', size: 5000, quantity: 1, total: 65000,
    orderDaysAgo: 5, dueInDays: 10, delivered: false,
    payments: [{ amount: 20000, daysAgo: 5, mode: 'CASH' }],
  },
  {
    leadName: 'Kongu Engineering College',
    newLead: { phone: '9865544332', city: 'Perundurai', source: 'REFERRAL', owner: 'sales2', closedDaysAgo: 40 },
    product: 'SUMP', size: 15000, quantity: 1, total: 150000,
    orderDaysAgo: 40, dueInDays: -25, delivered: true,
    payments: [
      { amount: 75000, daysAgo: 39, mode: 'CHEQUE', reference: 'Chq 004512' },
      { amount: 75000, daysAgo: 20, mode: 'BANK_TRANSFER', reference: 'NEFT SBIN0441' },
    ],
  },
];

/** Won but not converted yet, so you can try the conversion yourself. */
const UNCONVERTED_WON_LEADS = [
  { name: 'Sakthi Hardware Stores', phone: '9789012345', city: 'Erode', source: 'MANUAL' as LeadSource, product: 'MICROBES' as ProductInterest, size: null, owner: 'sales' as const },
  { name: 'Palani Hill Resorts', phone: '9500123456', city: 'Kodaikanal', source: 'META' as LeadSource, product: 'SUMP' as ProductInterest, size: 10000, owner: 'sales2' as const },
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

  // 1. Stock items + opening stock (only items that don't exist yet)
  const deliveredQty = (sku: string) =>
    ORDERS.filter((o) => o.delivered && skuFor(o.product, o.size) === sku).reduce((n, o) => n + o.quantity, 0);
  for (const p of STOCK_PLAN) {
    const sku = skuFor(p.code, p.size);
    if (await prisma.product.findUnique({ where: { sku } })) continue;
    const opening = p.onHand + deliveredQty(sku);
    await prisma.product.create({
      data: {
        sku,
        code: p.code,
        sizeLitres: p.size,
        name: productNameFor(p.code, p.size),
        unit: PRODUCT_UNITS[p.code],
        quantityOnHand: opening,
        lowStockThreshold: p.lowStockThreshold,
        movements: {
          create: {
            change: opening,
            reason: 'OPENING' as StockMovementReason,
            note: 'Opening stock',
            createdById: adminId,
            createdAt: day(-60),
          },
        },
      },
    });
  }
  const productIdBySku = new Map(
    (await prisma.product.findMany({ select: { id: true, sku: true } })).map((p) => [p.sku, p.id]),
  );
  const productIdFor = (o: { product: ProductInterest; size: number | null }) =>
    productIdBySku.get(skuFor(o.product, o.size))!;

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
            sumpSizeLitres: o.size,
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
          productId: productIdFor(o),
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
          where: { id: productIdFor(o) },
          data: { quantityOnHand: { decrement: o.quantity } },
        });
        await prisma.stockMovement.create({
          data: {
            productId: productIdFor(o),
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
          sumpSizeLitres: l.size,
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
