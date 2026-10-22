-- Two product types only: SUMP (one stock item per litre size) and MICROBES.
-- Written to be safe on existing rows: old product codes are mapped, not dropped.
-- (Old UG sump -> SUMP 10,000 L; bio-septic / precast -> SUMP. Demo data is reseeded afterwards.)

-- New columns
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sump_size_litres" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "size_litres" INTEGER, ADD COLUMN IF NOT EXISTS "sku" TEXT;

-- Give existing stock items a SKU (and the old UG sump its 10,000 L size)
UPDATE "products" SET "size_litres" = 10000, "sku" = 'SUMP-10000' WHERE "code"::text = 'UG_SUMP' AND "sku" IS NULL;
UPDATE "products" SET "sku" = 'MICROBES' WHERE "code"::text = 'MICROBES' AND "sku" IS NULL;
UPDATE "products" SET "sku" = 'LEGACY-' || "code"::text WHERE "sku" IS NULL;

-- Several stock items will share a code (one per sump size), so the old
-- one-row-per-code rule must go before old codes are merged into SUMP.
DROP INDEX IF EXISTS "products_code_key";

-- Swap the enum, mapping old values onto the two new ones
CREATE TYPE "ProductInterest_new" AS ENUM ('SUMP', 'MICROBES');
ALTER TABLE "leads" ALTER COLUMN "product_interest" TYPE "ProductInterest_new"
  USING (CASE WHEN "product_interest"::text = 'MICROBES' THEN 'MICROBES' ELSE 'SUMP' END)::"ProductInterest_new";
ALTER TABLE "products" ALTER COLUMN "code" TYPE "ProductInterest_new"
  USING (CASE WHEN "code"::text = 'MICROBES' THEN 'MICROBES' ELSE 'SUMP' END)::"ProductInterest_new";
ALTER TYPE "ProductInterest" RENAME TO "ProductInterest_old";
ALTER TYPE "ProductInterest_new" RENAME TO "ProductInterest";
DROP TYPE "public"."ProductInterest_old";

-- SKU is the unique key now
ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_code_size_litres_idx" ON "products"("code", "size_litres");
