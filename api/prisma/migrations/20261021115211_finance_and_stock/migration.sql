-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('CONFIRMED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('OPENING', 'PRODUCTION', 'DELIVERY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('RAW_MATERIAL', 'TRANSPORT', 'EQUIPMENT', 'SERVICES', 'OTHER');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" "ProductInterest" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "change" INTEGER NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "note" TEXT,
    "sales_order_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "order_number" SERIAL NOT NULL,
    "lead_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "order_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "delivered_at" TIMESTAMP(3),
    "notes" TEXT,
    "salesperson_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "category" "VendorCategory" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "item" TEXT NOT NULL,
    "invoice_number" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "purchase_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_order_number_key" ON "sales_orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_lead_id_key" ON "sales_orders"("lead_id");

-- CreateIndex
CREATE INDEX "sales_orders_salesperson_id_order_date_idx" ON "sales_orders"("salesperson_id", "order_date");

-- CreateIndex
CREATE INDEX "sales_orders_status_due_date_idx" ON "sales_orders"("status", "due_date");

-- CreateIndex
CREATE INDEX "payments_sales_order_id_idx" ON "payments"("sales_order_id");

-- CreateIndex
CREATE INDEX "purchases_vendor_id_due_date_idx" ON "purchases"("vendor_id", "due_date");

-- CreateIndex
CREATE INDEX "vendor_payments_vendor_id_idx" ON "vendor_payments"("vendor_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
