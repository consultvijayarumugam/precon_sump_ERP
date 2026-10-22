import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductInterest,
  StockMovementReason,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveSku } from './product-catalog.js';

type Tx = Prisma.TransactionClient;

const PRODUCT_SELECT = {
  id: true,
  sku: true,
  code: true,
  sizeLitres: true,
  name: true,
  unit: true,
  quantityOnHand: true,
  lowStockThreshold: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

const withLowFlag = (p: ProductRow) => ({
  ...p,
  isLow: p.quantityOnHand <= p.lowStockThreshold,
});

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    // Sumps first, smallest to largest, then microbes.
    const products = await this.prisma.product.findMany({
      orderBy: [{ code: 'asc' }, { sizeLitres: 'asc' }],
      select: PRODUCT_SELECT,
    });
    const items = products.map(withLowFlag);
    return { lowCount: items.filter((p) => p.isLow).length, items };
  }

  movements(productId?: string) {
    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        change: true,
        reason: true,
        note: true,
        createdAt: true,
        product: { select: { code: true, sizeLitres: true, name: true, unit: true } },
        salesOrder: { select: { id: true, orderNumber: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateSettings(
    productId: string,
    data: { name?: string; unit?: string; lowStockThreshold?: number },
  ) {
    await this.ensureProduct(productId);
    const product = await this.prisma.product.update({
      where: { id: productId },
      data,
      select: PRODUCT_SELECT,
    });
    return withLowFlag(product);
  }

  /** Manual stock change from the stock screen (production in, or a correction). */
  async recordManualMovement(
    userId: string,
    productId: string,
    dto: { change: number; reason: StockMovementReason; note?: string },
  ) {
    await this.ensureProduct(productId);
    if (dto.reason === StockMovementReason.PRODUCTION && dto.change <= 0) {
      throw new BadRequestException('Production must add stock (positive change)');
    }
    const product = await this.prisma.$transaction((tx) =>
      this.applyMovement(tx, {
        productId,
        change: dto.change,
        reason: dto.reason,
        note: dto.note,
        userId,
      }),
    );
    return withLowFlag(product);
  }

  /**
   * The one place stock changes. Atomic: the quantity check and the update are
   * a single statement, so stock can never go below zero, even under concurrency.
   */
  async applyMovement(
    tx: Tx,
    m: {
      productId: string;
      change: number;
      reason: StockMovementReason;
      note?: string;
      salesOrderId?: string;
      userId: string;
    },
  ): Promise<ProductRow> {
    const updated = await tx.product.updateMany({
      where: { id: m.productId, quantityOnHand: { gte: -m.change } },
      data: { quantityOnHand: { increment: m.change } },
    });
    if (updated.count === 0) {
      const product = await tx.product.findUnique({
        where: { id: m.productId },
        select: { name: true, unit: true, quantityOnHand: true },
      });
      throw new BadRequestException(
        product
          ? `Not enough stock of ${product.name}: ${product.quantityOnHand} ${product.unit} on hand, need ${-m.change}`
          : 'Product not found',
      );
    }
    await tx.stockMovement.create({
      data: {
        productId: m.productId,
        change: m.change,
        reason: m.reason,
        note: m.note || null,
        salesOrderId: m.salesOrderId,
        createdById: m.userId,
      },
    });
    return tx.product.findUniqueOrThrow({
      where: { id: m.productId },
      select: PRODUCT_SELECT,
    });
  }

  /** The stock item for a product choice: Sump + size, or Microbes. */
  async productIdFor(tx: Tx, code: ProductInterest, sizeLitres?: number | null): Promise<string> {
    const sku = resolveSku(code, sizeLitres);
    const product = await tx.product.findUnique({ where: { sku }, select: { id: true } });
    if (!product) throw new BadRequestException(`No stock item set up for ${sku}`);
    return product.id;
  }


  private async ensureProduct(id: string) {
    const found = await this.prisma.product.count({ where: { id } });
    if (!found) throw new NotFoundException('Product not found');
  }
}
