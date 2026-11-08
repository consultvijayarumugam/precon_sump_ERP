-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('ENTRY', 'MIDDLE', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "stage_id" UUID;

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StageKind" NOT NULL,
    "phase" "LeadStatus" NOT NULL,
    "is_handover" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_key_key" ON "pipeline_stages"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_name_key" ON "pipeline_stages"("name");

-- CreateIndex
CREATE INDEX "pipeline_stages_position_idx" ON "pipeline_stages"("position");

-- CreateIndex
CREATE INDEX "leads_stage_id_idx" ON "leads"("stage_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The current pipeline as stages. New, Won and Lost are protected; Contacted,
-- Qualified and Quoted are editable middle stages (Qualified is where
-- telecallers hand leads to sales).
INSERT INTO "pipeline_stages" ("id", "key", "name", "kind", "phase", "is_handover", "position", "is_active", "updated_at") VALUES
  (gen_random_uuid(), 'NEW',       'New',       'ENTRY',  'NEW',       false, 0,    true, now()),
  (gen_random_uuid(), 'CONTACTED', 'Contacted', 'MIDDLE', 'CONTACTED', false, 10,   true, now()),
  (gen_random_uuid(), 'QUALIFIED', 'Qualified', 'MIDDLE', 'QUALIFIED', true,  20,   true, now()),
  (gen_random_uuid(), 'QUOTED',    'Quoted',    'MIDDLE', 'QUOTED',    false, 30,   true, now()),
  (gen_random_uuid(), 'WON',       'Won',       'WON',    'WON',       false, 1000, true, now()),
  (gen_random_uuid(), 'LOST',      'Lost',      'LOST',   'LOST',      false, 1001, true, now());

-- Every existing lead goes to the stage matching its status.
UPDATE "leads" l SET "stage_id" = s."id" FROM "pipeline_stages" s WHERE s."key" = l."status"::text;

-- Keep a lead's stage consistent with its status (the phase all logic uses).
-- When something sets only the status (or a stage of another phase), the lead
-- moves to the best stage of that phase: an active one first, the stage named
-- after the status next, then the earliest. A stage set together with a
-- matching status is left alone.
CREATE OR REPLACE FUNCTION leads_sync_stage() RETURNS trigger AS $$
BEGIN
  IF NEW."stage_id" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "pipeline_stages" s WHERE s."id" = NEW."stage_id" AND s."phase" = NEW."status"
  ) THEN
    NEW."stage_id" := (
      SELECT s."id" FROM "pipeline_stages" s
      WHERE s."phase" = NEW."status"
      ORDER BY s."is_active" DESC, (s."key" = NEW."status"::text) DESC, s."position" ASC
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "leads_sync_stage"
  BEFORE INSERT OR UPDATE OF "status", "stage_id" ON "leads"
  FOR EACH ROW EXECUTE FUNCTION leads_sync_stage();
