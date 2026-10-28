-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "auto_assigned" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "product_interest" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auto_assign_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_auto_assigned_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

