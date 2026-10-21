-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ServiceJobType" AS ENUM ('COMPLAINT', 'MAINTENANCE', 'WARRANTY');

-- CreateEnum
CREATE TYPE "ServiceJobPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ServiceJobStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ServiceFollowUpOutcome" AS ENUM ('CONNECTED', 'NO_ANSWER', 'SITE_VISITED', 'PARTS_PENDING', 'FIXED', 'CUSTOMER_SATISFIED', 'OTHER');

-- CreateTable
CREATE TABLE "installations" (
    "id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "assigned_to_id" UUID,
    "team_name" TEXT,
    "site_address" TEXT NOT NULL,
    "notes" TEXT,
    "status" "InstallationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completion_notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_jobs" (
    "id" UUID NOT NULL,
    "job_number" SERIAL NOT NULL,
    "installation_id" UUID NOT NULL,
    "type" "ServiceJobType" NOT NULL,
    "priority" "ServiceJobPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ServiceJobStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "assigned_to_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_follow_ups" (
    "id" UUID NOT NULL,
    "service_job_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "outcome" "ServiceFollowUpOutcome",
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_visit_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_visit_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_visits" (
    "id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "person_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "site_address" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    "installation_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SiteVisitToSiteVisitTag" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_SiteVisitToSiteVisitTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "installations_sales_order_id_key" ON "installations"("sales_order_id");

-- CreateIndex
CREATE INDEX "installations_status_scheduled_date_idx" ON "installations"("status", "scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "service_jobs_job_number_key" ON "service_jobs"("job_number");

-- CreateIndex
CREATE INDEX "service_jobs_status_priority_idx" ON "service_jobs"("status", "priority");

-- CreateIndex
CREATE INDEX "service_jobs_assigned_to_id_idx" ON "service_jobs"("assigned_to_id");

-- CreateIndex
CREATE INDEX "service_follow_ups_service_job_id_idx" ON "service_follow_ups"("service_job_id");

-- CreateIndex
CREATE INDEX "service_follow_ups_completed_at_scheduled_at_idx" ON "service_follow_ups"("completed_at", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_visit_tags_name_key" ON "site_visit_tags"("name");

-- CreateIndex
CREATE INDEX "site_visits_visit_date_idx" ON "site_visits"("visit_date");

-- CreateIndex
CREATE INDEX "_SiteVisitToSiteVisitTag_B_index" ON "_SiteVisitToSiteVisitTag"("B");

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_follow_ups" ADD CONSTRAINT "service_follow_ups_service_job_id_fkey" FOREIGN KEY ("service_job_id") REFERENCES "service_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_follow_ups" ADD CONSTRAINT "service_follow_ups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SiteVisitToSiteVisitTag" ADD CONSTRAINT "_SiteVisitToSiteVisitTag_A_fkey" FOREIGN KEY ("A") REFERENCES "site_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SiteVisitToSiteVisitTag" ADD CONSTRAINT "_SiteVisitToSiteVisitTag_B_fkey" FOREIGN KEY ("B") REFERENCES "site_visit_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
