-- STUDIO-SHARE (lane/nexus-publish, NEX-06, 2026-10-26; owner 2026-10-20 "share links: signed-in players open them; the owner and
-- verified adults make them; teens build but stay private; moderation: auto text screen, reports and takedown; unlisted links work
-- at once; player content is practice-only").
-- ADDITIVE ONLY: one new table, two indexes and one foreign key. No existing table or column is changed or dropped.
--
-- WHAT IS STORED. One row per share link a creator made from Nexus Studio:
--   tokenHash    — sha256 (hex) of the link's 192-bit token. The token itself is shown to the creator once and never stored,
--                  so this table cannot rebuild a working link.
--   creatorId    — the account that made it (the owner, or a verified adult in a later beta; never a minor).
--   creatorName  — the display name shown on the link's landing (owner Q6: "the creator's name shows"), copied at creation.
--   mode         — the play-test target it opens (lib/nexus-studio/targets.ts).
--   venueName    — the venue's name, screened at creation.
--   payload      — the venue export (lib/nexus-studio/exportVenue.ts), sanitised, gated (keep-out, readability, the phone budget
--                  the editor measured) and screened; NEVER a look code or a cast (lib/nexus-studio/published.ts publicView).
--                  NULL once the link is revoked by its creator or taken down by staff: the content is gone, not hidden.
--   status       — 'live' | 'revoked' | 'taken_down'.
--   opens        — how many times it was opened (a count, no who).
--   createdAt, endedAt.
-- WHO READS IT: any signed-in account opening the link (the payload, the creator's name and the venue's name only); the creator
-- (their own links); founder and admin (a takedown). Nothing lists links publicly: a link is unlisted (owner Q7).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged.
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/nexus-studio/share.ts probes information_schema for "StudioShareLink" (the
-- coach pendingSchema seam): without it every share route answers 503 share_not_ready and the Studio says sharing is not
-- open yet. Nothing 500s. Within ~5 minutes of applying, sharing works with no deploy (STUDIO_SHARE_ENABLED still has to be on).
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model StudioShareLink {
--          id          String    @id
--          tokenHash   String    @unique
--          creatorId   String
--          creatorName String?
--          mode        String
--          venueName   String
--          payload     Json?
--          status      String    @default("live")
--          opens       Int       @default(0)
--          createdAt   DateTime  @default(now())
--          endedAt     DateTime?
--          creator     User      @relation("StudioShareLinks", fields: [creatorId], references: [id], onDelete: Cascade)
--
--          @@index([creatorId, createdAt])
--        }
--
--      and the back-relation on model User:
--        studioShareLinks StudioShareLink[] @relation("StudioShareLinks")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-26-studio-share.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- ACCOUNT DELETION: a creator's links cascade with the User row (lib/data-rights/registry.ts StudioShareLink: delete).
-- RETENTION: a revoked or taken-down row keeps no content (payload NULL); how long the empty row stays is an owner call
-- (round-8 report).
--
-- ROLLBACK (every share link stops working; the venues stay in their creators' projects):
--   DROP TABLE "StudioShareLink";

-- CreateTable
CREATE TABLE "StudioShareLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT,
    "mode" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'live',
    "opens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "StudioShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudioShareLink_tokenHash_key" ON "StudioShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "StudioShareLink_creatorId_createdAt_idx" ON "StudioShareLink"("creatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudioShareLink" ADD CONSTRAINT "StudioShareLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
