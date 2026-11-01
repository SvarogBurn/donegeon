-- A habit can be left out of the Stats page.
ALTER TABLE "Task" ADD COLUMN "hideInStats" BOOLEAN NOT NULL DEFAULT false;

-- The Stats page now starts with these three minimized: an arrangement already saved gets them too.
UPDATE "User"
SET "statsLayout" = jsonb_set("statsLayout", '{hidden}', COALESCE("statsLayout"->'hidden', '[]'::jsonb) || '["filter","deadlines","time"]'::jsonb)
WHERE jsonb_typeof("statsLayout") = 'object';
