-- Phone is now the only required field on a lead; the name is optional.
ALTER TABLE "leads" ALTER COLUMN "name" DROP NOT NULL;

-- Quick add used to save a stand-in name ("WhatsApp enquiry …3210") when none
-- was given. Clear exactly those, so screens show the phone number instead.
-- A real name typed later is never touched (it doesn't match this pattern).
UPDATE "leads"
SET "name" = NULL
WHERE "source" = 'WHATSAPP'
  AND "name" ~ '^WhatsApp enquiry …[0-9]{4}$'
  AND right(regexp_replace("phone", '\D', '', 'g'), 4) = right("name", 4);
