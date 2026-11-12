-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'WHATSAPP';

-- The leads.quick_add tag (the seed keeps its text in step with the catalog), granted to the admin role.
INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES (gen_random_uuid(), 'leads.quick_add', 'crm',
  'Quick add WhatsApp enquiries (phone, optional name and first message); they go round-robin to the telecallers. Nothing else: no editing, importing or assigning leads')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r, "permissions" p
WHERE r."key" = 'admin' AND p."key" = 'leads.quick_add'
ON CONFLICT DO NOTHING;
