// The P2 push, checked before it runs (MIRROR-COACH P2 review, 2026-09-26). Owner decision #16's standing GO covers a
// push "after checking the diff adds only columns/tables"; the first P2 preview also dropped ProgramExercise_name_key.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { additiveOnly, comparePushDiff, sqlStatements } from './pushDiff';

// the preview as `prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma
// --script` writes it for this phase (copied to the outbox as painfree/p2/schema-structure/schema-push-preview.sql)
const PREVIEW = readFileSync(new URL('./__fixtures__/p2-push-preview.sql', import.meta.url), 'utf8');
// the swap held for the owner's go (painfree/p2/schema-structure/held-unique-swap.sql)
const HELD_SWAP = `-- DropIndex
DROP INDEX "ProgramExercise_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProgramExercise_coachId_name_key" ON "ProgramExercise"("coachId", "name");`;

describe('additive only — what decision #16 lets the standing GO push', () => {
  it('the P2 push as it ships is additive: new types, columns (nullable or defaulted), the SetLog table and its own keys', () => {
    expect(additiveOnly(PREVIEW)).toEqual({ ok: true, offending: [] });
    expect(sqlStatements(PREVIEW).some((s) => /DROP|ProgramExercise_coachId_name_key/i.test(s))).toBe(false);
  });

  it('the held unique swap is NOT: the DROP, and a unique index on a table that already has rows, are both named', () => {
    const v = additiveOnly(HELD_SWAP);
    expect(v.ok).toBe(false);
    expect(v.offending).toEqual(['DROP INDEX "ProgramExercise_name_key"', 'CREATE UNIQUE INDEX "ProgramExercise_coachId_name_key" ON "ProgramExercise"("coachId", "name")']);
  });

  it('each kind of change a push can hide', () => {
    const not = (sql: string) => additiveOnly(sql).ok;
    expect(not('ALTER TABLE "User" ADD COLUMN "x" TEXT NOT NULL')).toBe(false);                 // no default: fails on rows
    expect(not('ALTER TABLE "User" ADD COLUMN "x" TEXT NOT NULL DEFAULT \'a\'')).toBe(true);
    expect(not('ALTER TABLE "User" DROP COLUMN "x"')).toBe(false);
    expect(not('ALTER TABLE "User" ALTER COLUMN "x" SET DATA TYPE INTEGER')).toBe(false);
    expect(not('ALTER TABLE "User" ADD COLUMN "a" TEXT, DROP COLUMN "b"')).toBe(false);
    expect(not('DROP TABLE "Old"')).toBe(false);
    expect(not('ALTER TYPE "BraceMode" RENAME VALUE \'set\' TO \'hold\'')).toBe(false);
    expect(not('CREATE INDEX "User_x_idx" ON "User"("x")')).toBe(true);                        // cannot fail on data
    expect(not('ALTER TABLE "User" ADD CONSTRAINT "User_x_fkey" FOREIGN KEY ("x") REFERENCES "Other"("id")')).toBe(false);
  });
});

describe('the live diff must BE the reviewed preview', () => {
  it('the same statements in another order match; an empty diff after the push is "nothing left"', () => {
    const shuffled = sqlStatements(PREVIEW).reverse().map((s) => `-- a comment\n${s};`).join('\n\n');
    expect(comparePushDiff(shuffled, PREVIEW)).toEqual({ same: true, onlyLive: [], onlyPreview: [] });
    expect(comparePushDiff('-- This is an empty migration.', '')).toEqual({ same: true, onlyLive: [], onlyPreview: [] });
  });

  it('drift in production shows as statements the preview never had', () => {
    const live = `${PREVIEW}\nDROP INDEX "Wallet_hand_made_idx";`;
    const v = comparePushDiff(live, PREVIEW);
    expect(v).toMatchObject({ same: false, onlyLive: ['DROP INDEX "Wallet_hand_made_idx"'], onlyPreview: [] });
  });
});
