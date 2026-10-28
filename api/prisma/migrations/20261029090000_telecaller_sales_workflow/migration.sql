-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('NO_ANSWER', 'BUSY', 'CALL_BACK', 'INTERESTED', 'NOT_INTERESTED', 'WRONG_NUMBER');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "qualified_at" TIMESTAMP(3),
ADD COLUMN     "qualified_by_id" UUID,
ADD COLUMN     "telecaller_id" UUID;

-- AlterTable
ALTER TABLE "site_visits" ADD COLUMN     "accuracy_meters" INTEGER,
ADD COLUMN     "checked_in_at" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "lead_id" UUID,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "call_logs" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "caller_id" UUID NOT NULL,
    "outcome" "CallOutcome" NOT NULL,
    "note" TEXT,
    "called_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_logs_caller_id_called_at_idx" ON "call_logs"("caller_id", "called_at");

-- CreateIndex
CREATE INDEX "call_logs_lead_id_called_at_idx" ON "call_logs"("lead_id", "called_at");

-- CreateIndex
CREATE INDEX "leads_telecaller_id_created_at_idx" ON "leads"("telecaller_id", "created_at");

-- CreateIndex
CREATE INDEX "site_visits_person_id_checked_in_at_idx" ON "site_visits"("person_id", "checked_in_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_telecaller_id_fkey" FOREIGN KEY ("telecaller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_qualified_by_id_fkey" FOREIGN KEY ("qualified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: leads the round-robin gave to someone were received by that telecaller.
UPDATE "leads" SET "telecaller_id" = "assigned_to_id" WHERE "auto_assigned" = true AND "telecaller_id" IS NULL;
