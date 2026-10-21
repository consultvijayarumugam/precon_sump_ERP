-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('META', 'MANUAL', 'WEBSITE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductInterest" AS ENUM ('UG_SUMP', 'BIO_SEPTIC_TANK', 'MICROBES', 'PRECAST');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "FollowUpOutcome" AS ENUM ('CONNECTED', 'NO_ANSWER', 'CALL_BACK', 'INTERESTED', 'NOT_INTERESTED', 'QUOTE_SENT', 'OTHER');

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "source" "LeadSource" NOT NULL,
    "product_interest" "ProductInterest" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "assigned_to_id" UUID,
    "created_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "outcome" "FollowUpOutcome",
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_assigned_to_id_status_idx" ON "leads"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "leads_status_closed_at_idx" ON "leads"("status", "closed_at");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "follow_ups_lead_id_idx" ON "follow_ups"("lead_id");

-- CreateIndex
CREATE INDEX "follow_ups_completed_at_scheduled_at_idx" ON "follow_ups"("completed_at", "scheduled_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
