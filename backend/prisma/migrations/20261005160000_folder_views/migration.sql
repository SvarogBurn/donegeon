-- A folder no longer takes lists away from the Tasks page: it holds views, the keys of the boxes it shows
-- ("list:<id>", "stat:<name>"). The lists that were in a folder become views of it, and are on the Tasks page again.
ALTER TABLE "Folder" ADD COLUMN "views" JSONB NOT NULL DEFAULT '[]';

UPDATE "Folder" f
SET "views" = COALESCE(
  (SELECT jsonb_agg('list:' || l."id" ORDER BY l."position", l."createdAt") FROM "List" l WHERE l."folderId" = f."id"),
  '[]'::jsonb
);

ALTER TABLE "List" DROP CONSTRAINT "List_folderId_fkey";
DROP INDEX "List_folderId_idx";
ALTER TABLE "List" DROP COLUMN "folderId";
