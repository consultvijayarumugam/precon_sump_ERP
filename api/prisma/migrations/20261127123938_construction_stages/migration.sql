-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "construction_stage_id" UUID;

-- CreateTable
CREATE TABLE "construction_stages" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "construction_stages_key_key" ON "construction_stages"("key");

-- CreateIndex
CREATE UNIQUE INDEX "construction_stages_name_key" ON "construction_stages"("name");

-- CreateIndex
CREATE INDEX "construction_stages_position_idx" ON "construction_stages"("position");

-- CreateIndex
CREATE INDEX "leads_construction_stage_id_idx" ON "leads"("construction_stage_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_construction_stage_id_fkey" FOREIGN KEY ("construction_stage_id") REFERENCES "construction_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data: split the single pipeline into lead status + construction stage.
-- Every lead keeps its row and its history. Only leads whose old stage was a
-- construction value move; everyone else keeps their status and gets
-- construction stage "Not known" (NULL).
-- ---------------------------------------------------------------------------

-- 1. The construction stages (admin can rename/reorder/add/switch off later).
INSERT INTO "construction_stages" ("id", "key", "name", "position", "is_active", "updated_at") VALUES
  (gen_random_uuid(), 'planning',    'Planning',    10, true, now()),
  (gen_random_uuid(), 'foundation',  'Foundation',  20, true, now()),
  (gen_random_uuid(), 'plinth-beam', 'Plinth Beam', 30, true, now()),
  (gen_random_uuid(), 'basement',    'Basement',    40, true, now()),
  (gen_random_uuid(), 'roof',        'Roof',        50, true, now()),
  (gen_random_uuid(), 'finishing',   'Finishing',   60, true, now())
ON CONFLICT ("key") DO NOTHING;

-- 2-6 run as ONE statement (a DO block is atomic): all of it happens, or none of it.
DO $migration$
DECLARE
  admin_id uuid := (SELECT u."id" FROM "users" u JOIN "roles" r ON r."id" = u."role_id" WHERE r."key" = 'admin' ORDER BY u."created_at" LIMIT 1);
  target record;
BEGIN
  -- 2. Old pipeline stages that are really construction stages: matched by name, ignoring
  --    case, spaces and a trailing "stage" ("Plinth Beam Stage" -> plinth-beam).
  CREATE TEMP TABLE "_construction_map" AS
  SELECT p."id" AS "old_stage_id", p."name" AS "old_name", c."id" AS "construction_id", c."name" AS "construction_name"
  FROM "pipeline_stages" p
  JOIN "construction_stages" c
    ON c."key" = regexp_replace(regexp_replace(lower(trim(p."name")), '\s*stage$', ''), '\s+', '-', 'g')
  WHERE p."kind" = 'MIDDLE';

  -- 3. The lead status those leads take: "Follow Up" (the same Quoted phase they're counted
  --    in now, so reports don't move); without one, the first active Quoted-phase status left.
  SELECT s."id", s."name", s."phase" INTO target FROM "pipeline_stages" s
  WHERE s."kind" = 'MIDDLE' AND s."id" NOT IN (SELECT "old_stage_id" FROM "_construction_map")
  ORDER BY (lower(s."name") = 'follow up') DESC, (s."phase" = 'QUOTED' AND s."is_active") DESC, s."position" ASC
  LIMIT 1;

  IF EXISTS (SELECT 1 FROM "_construction_map") THEN
    IF target."id" IS NULL THEN
      RAISE EXCEPTION 'No lead status left to move construction-stage leads to; nothing was changed';
    END IF;
    -- 4. History first (while the old stage name is known), as the first admin, clearly marked.
    IF admin_id IS NOT NULL THEN
      INSERT INTO "lead_activities" ("id", "lead_id", "user_id", "type", "message", "changes", "created_at")
      SELECT gen_random_uuid(), l."id", admin_id, 'STATUS_CHANGED',
        'System update: pipeline split into lead status and construction stage. Lead status ' || m."old_name" || ' → ' || target."name" || '; construction stage set to ' || m."construction_name",
        jsonb_build_array(
          jsonb_build_object('field', 'stage', 'label', 'Lead status', 'from', m."old_name", 'to', target."name"),
          jsonb_build_object('field', 'constructionStage', 'label', 'Construction stage', 'from', NULL, 'to', m."construction_name")
        ),
        now()
      FROM "leads" l JOIN "_construction_map" m ON m."old_stage_id" = l."stage_id";
    END IF;

    -- 5. Move those leads: construction stage from the old value, lead status to the target.
    UPDATE "leads" l
    SET "construction_stage_id" = m."construction_id", "stage_id" = target."id", "status" = target."phase"
    FROM "_construction_map" m
    WHERE l."stage_id" = m."old_stage_id";

    -- 6. The construction values leave the lead-status list (nothing points at them now).
    DELETE FROM "pipeline_stages" p
    WHERE p."id" IN (SELECT "old_stage_id" FROM "_construction_map")
      AND NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."stage_id" = p."id");
  END IF;

  DROP TABLE "_construction_map";
END
$migration$;
