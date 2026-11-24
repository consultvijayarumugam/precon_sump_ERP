-- AlterEnum
ALTER TYPE "LeadActivityType" ADD VALUE 'VOICE_NOTE';

-- CreateTable
CREATE TABLE "lead_voice_notes" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_voice_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_voice_notes_stored_name_key" ON "lead_voice_notes"("stored_name");

-- CreateIndex
CREATE INDEX "lead_voice_notes_lead_id_created_at_idx" ON "lead_voice_notes"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "lead_voice_notes" ADD CONSTRAINT "lead_voice_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_voice_notes" ADD CONSTRAINT "lead_voice_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
