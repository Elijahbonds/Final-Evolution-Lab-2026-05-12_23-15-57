-- PROGRAM-ASK-2 (2026-11-03; coordinator relaying the owner's call on lane/program-ask: "account save: yes"): an adult's
-- "Build my program" plan, kept on their account as well as on the phone.
-- ADDITIVE ONLY: one new table, one index and one foreign key. No existing table or column is changed or dropped.
--
-- WHAT IS STORED, AND WHAT IS NOT. The program itself is NOT stored: the builder is deterministic (lib/program-ask/build.ts),
-- so the ask and the chips' edits rebuild it. One row per account (the plan they are on now):
--   question  — the ask as typed (≤ 400 characters);
--   edits     — the chips' edits (JSON: days, minutes, level … each clamped by lib/program-ask/request.ts applyEdits);
--   programId — the built program's id, so the done marks are only read against the same program;
--   done      — JSON: session instance "w2:d3" → when it was done;
--   decisions — JSON: the checkpoint decisions ({ afterWeek, kind: 'advance' | 'repeat' | 'repeat-lighter' });
--   startedAt, updatedAt.
-- No health answer, no pain score, no number about a body. Written ONLY for an adult: under youth rules (under 18, or no
-- birth year) the plan stays on the phone (lib/program-ask/accountServer.ts refuses, the signature programs' rule).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged.
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/program-ask/accountStore.ts probes information_schema for the table: without it
-- every account read answers "not ready" and the page keeps the plan on the phone only (lib/program-ask/device.ts), as it
-- does today. Within ~5 minutes of applying, account save is on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model AskedProgram {
--          id        String   @id
--          userId    String   @unique
--          question  String
--          edits     Json     @default("{}")
--          programId String
--          done      Json     @default("{}")
--          decisions Json     @default("[]")
--          startedAt DateTime @default(now())
--          updatedAt DateTime @default(now())
--          user      User     @relation("AskedPrograms", fields: [userId], references: [id], onDelete: Cascade)
--        }
--
--      and the back-relation on model User:
--        askedProgram AskedProgram? @relation("AskedPrograms")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-11-03-program-ask.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- DATA RIGHTS: lib/data-rights/registry.ts AskedProgram — exported with "Download my data", deleted by the account erase
-- (and the foreign key cascades the same way).
--
-- ROLLBACK (loses every saved plan; the phones keep theirs): DROP TABLE "AskedProgram";

-- CreateTable
CREATE TABLE "AskedProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "edits" JSONB NOT NULL DEFAULT '{}',
    "programId" TEXT NOT NULL,
    "done" JSONB NOT NULL DEFAULT '{}',
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskedProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AskedProgram_userId_key" ON "AskedProgram"("userId");

-- AddForeignKey
ALTER TABLE "AskedProgram" ADD CONSTRAINT "AskedProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
