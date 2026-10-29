-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadActivityType" ADD VALUE 'CREATED';
ALTER TYPE "LeadActivityType" ADD VALUE 'ASSIGNED';
ALTER TYPE "LeadActivityType" ADD VALUE 'HANDED_OVER';
ALTER TYPE "LeadActivityType" ADD VALUE 'STATUS_CHANGED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FIELD_CHANGED';
ALTER TYPE "LeadActivityType" ADD VALUE 'NOTES_EDITED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_CREATED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_RESCHEDULED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_COMPLETED';
ALTER TYPE "LeadActivityType" ADD VALUE 'FOLLOW_UP_REOPENED';
ALTER TYPE "LeadActivityType" ADD VALUE 'CALL_LOGGED';
ALTER TYPE "LeadActivityType" ADD VALUE 'SITE_VISIT';

-- AlterTable
ALTER TABLE "lead_activities" ADD COLUMN     "changes" JSONB;

