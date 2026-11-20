-- CreateEnum
CREATE TYPE "UserAuditAction" AS ENUM ('CREATED', 'ROLE_CHANGED', 'DEACTIVATED', 'REACTIVATED', 'LEADS_REASSIGNED', 'DELETED');

-- CreateTable
CREATE TABLE "user_audit_events" (
    "id" UUID NOT NULL,
    "target_user_id" UUID,
    "target_name" TEXT NOT NULL,
    "target_email" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_name" TEXT NOT NULL,
    "action" "UserAuditAction" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_audit_events_target_user_id_created_at_idx" ON "user_audit_events"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_audit_events_created_at_idx" ON "user_audit_events"("created_at");

-- AddForeignKey
ALTER TABLE "user_audit_events" ADD CONSTRAINT "user_audit_events_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_audit_events" ADD CONSTRAINT "user_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
