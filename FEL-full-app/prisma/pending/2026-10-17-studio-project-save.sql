-- STUDIO SAVE (owner-approved 2026-10-17): StudioProjectSave — Nexus Studio projects saved to an account.
-- docs/NEXUS-STUDIO-SAVE.md §2 and §7. ADDITIVE ONLY: one new table, no existing table changes.
-- Written in `prisma migrate diff`'s own style for the StudioProjectSave model in prisma/schema.prisma, so the owner's
-- verify step prints an empty migration. Not generated here (no lane runs Prisma against a database) — the preview
-- step below checks it before anything is applied.
--
-- WHO MAY HAVE ROWS: signed-in teens (13–17) and adults (owner, 2026-10-17, Q1). Under 13 and an unknown age are
-- refused by the route (lib/nexus-studio/cloudSave.ts cloudSavePolicy). A row never holds a character's look code (Q2).
-- Deleting the account deletes the rows (ON DELETE CASCADE).
--
-- ORDER (owner, Q8): applied IN THE SAME SESSION as the deploy that carries the route, BEFORE that deploy goes out,
-- by the owner or the named deploy owner (docs/LANES.md §4):
--   1. preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" \
--        --to-schema-datamodel prisma/schema.prisma --script > /tmp/prod-diff.sql
--      It must equal this file's statements. Anything more: production is behind another change too — stop.
--   2. apply:  npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-17-studio-project-save.sql
--   3. verify: the same migrate diff now prints an empty migration.
-- Until it is applied, the routes answer 503 save_unavailable and the export lists no Studio projects; the device save
-- is unaffected. This lane does not run it against any database.

-- CreateTable
CREATE TABLE "StudioProjectSave" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "doc" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioProjectSave_pkey" PRIMARY KEY ("userId","projectId")
);

-- AddForeignKey
ALTER TABLE "StudioProjectSave" ADD CONSTRAINT "StudioProjectSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- rollback (only after a deploy WITHOUT the model is live): DROP TABLE "StudioProjectSave";
