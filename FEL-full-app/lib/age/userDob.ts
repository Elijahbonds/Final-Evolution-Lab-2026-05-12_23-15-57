// lib/age/userDob.ts — FN-BOX-1b (2026-10-19): the account's full date of birth, User.dob.
//
// THE COLUMN IS NOT ON PRODUCTION YET. User.dob arrives with prisma/pending/2026-10-19-user-dob.sql, which the owner
// applies. Until then every read here answers null ("no full date on file", so the body gate falls back to the strict
// year rule and fails closed) and every write is skipped. Nothing here may fail a signup or a birth-year answer.
//
// WHY RAW SQL, NOT THE GENERATED CLIENT. The committed client (public/_prisma/client, a deploy artifact no lane
// regenerates) has never heard of `dob`, so `prisma.user.update({ data: { dob } })` would not type-check. Same pattern
// as lib/coach/messageReads.ts: one cached information_schema probe (lib/coach/pendingSchema.ts), parameterised
// statements only ($1, $2), working the same before and after the owner regenerates the client.
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { parseBirthDate, formatBirthDate } from './ageRules';

const probe = pendingProbe(
  'user_dob',
  `SELECT 1 AS "ok" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'dob' LIMIT 1`,
);

/** Set once: a date already on file is never changed (the same rule as dobYear). */
const WRITE_SQL = `UPDATE "User" SET "dob" = $1::date WHERE "id" = $2 AND "dob" IS NULL`;
const READ_SQL = `SELECT to_char("dob", 'YYYY-MM-DD') AS "dob" FROM "User" WHERE "id" = $1 LIMIT 1`;

/** Tests only: forget the cached probe. */
export function resetUserDobProbe(): void {
  probe.reset();
}

/** Store `dob` ('YYYY-MM-DD') when the column is there and none is on file. Never throws; true when written. */
export async function writeUserDob(db: RawDb, userId: string, dob: string): Promise<boolean> {
  const date = parseBirthDate(dob);
  if (!date) return false;
  try {
    if (!(await probe.ready(db))) return false;
    return (await db.$executeRawUnsafe(WRITE_SQL, formatBirthDate(date), userId)) === 1;
  } catch (e) {
    probe.fail('user_dob_write_failed', e);
    return false;
  }
}

/** The full date on file, 'YYYY-MM-DD', or null (none, no column yet, or a failed read). Never throws. */
export async function readUserDob(db: RawDb, userId: string): Promise<string | null> {
  try {
    if (!(await probe.ready(db))) return null;
    const rows = await db.$queryRawUnsafe<{ dob: string | null }[]>(READ_SQL, userId);
    const date = parseBirthDate(rows?.[0]?.dob);
    return date ? formatBirthDate(date) : null;
  } catch (e) {
    probe.fail('user_dob_read_failed', e);
    return null;
  }
}
