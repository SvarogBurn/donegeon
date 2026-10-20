-- The character at the top of the user's page (name, title, stats, skills, looks); null = the defaults.
ALTER TABLE "User" ADD COLUMN "profile" JSONB;
