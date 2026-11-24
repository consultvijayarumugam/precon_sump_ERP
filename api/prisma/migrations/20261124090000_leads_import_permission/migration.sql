-- The leads.import tag (the seed keeps its text in step with the catalog). Admin and sales could
-- already import (it used leads.write), so their roles get it; telecallers only when an admin grants it.
INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES (gen_random_uuid(), 'leads.import', 'crm',
  'Import leads from a spreadsheet (Import leads page) and choose which telecallers share that upload. Admin and sales have it; grant it to a telecaller to let them import')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r, "permissions" p
WHERE r."key" IN ('admin', 'sales') AND p."key" = 'leads.import'
ON CONFLICT DO NOTHING;
