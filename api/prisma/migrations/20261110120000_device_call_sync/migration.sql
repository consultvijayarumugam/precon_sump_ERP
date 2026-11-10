-- AlterEnum
ALTER TYPE "LeadActivityType" ADD VALUE 'CALL_SYNCED';

-- CreateEnum
CREATE TYPE "DeviceCallDirection" AS ENUM ('OUTGOING', 'INCOMING', 'MISSED', 'REJECTED');

-- CreateTable
CREATE TABLE "device_calls" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lead_id" UUID,
    "phone" TEXT NOT NULL,
    "direction" "DeviceCallDirection" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "device_call_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_calls_user_id_started_at_idx" ON "device_calls"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "device_calls_lead_id_started_at_idx" ON "device_calls"("lead_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_calls_user_id_device_call_id_started_at_key" ON "device_calls"("user_id", "device_call_id", "started_at");

-- AddForeignKey
ALTER TABLE "device_calls" ADD CONSTRAINT "device_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_calls" ADD CONSTRAINT "device_calls_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
