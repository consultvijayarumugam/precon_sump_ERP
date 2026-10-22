/**
 * The product catalogue (see CLAUDE.md "Products"): the business makes only
 * two product types.
 *
 *   SUMP     - precon sump, one STOCK ITEM PER SIZE (litres). Each size has its
 *              own quantity on hand and low-stock threshold.
 *   MICROBES - one stock item, counted in packs.
 *
 * Every stock item has a SKU ("SUMP-5000", "MICROBES"); sales orders point at
 * the stock item, so picking "Sump + size" picks exactly one row.
 */
import { BadRequestException } from '@nestjs/common';
import { ProductInterest } from '../generated/prisma/client.js';

export const SUMP_SIZES_LITRES = [3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000] as const;
export type SumpSizeLitres = (typeof SUMP_SIZES_LITRES)[number];

export const PRODUCT_UNITS: Record<ProductInterest, string> = { SUMP: 'nos', MICROBES: 'packs' };

export const skuFor = (code: ProductInterest, sizeLitres?: number | null) =>
  code === 'SUMP' ? `SUMP-${sizeLitres}` : 'MICROBES';

export const productNameFor = (code: ProductInterest, sizeLitres?: number | null) =>
  code === 'SUMP' ? `Sump ${new Intl.NumberFormat('en-IN').format(sizeLitres ?? 0)} L` : 'Microbes';

/**
 * Checks a product choice and returns its SKU: a sump needs one of the valid
 * sizes; microbes take no size.
 */
export function resolveSku(code: ProductInterest, sizeLitres?: number | null): string {
  if (code === 'SUMP') {
    if (sizeLitres == null) throw new BadRequestException('Choose a sump size (litres)');
    if (!(SUMP_SIZES_LITRES as readonly number[]).includes(sizeLitres)) {
      throw new BadRequestException(`Sump size must be one of: ${SUMP_SIZES_LITRES.join(', ')} litres`);
    }
  } else if (sizeLitres != null) {
    throw new BadRequestException('Microbes have no size');
  }
  return skuFor(code, sizeLitres);
}
