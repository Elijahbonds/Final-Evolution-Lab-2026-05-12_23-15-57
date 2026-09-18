// TELLING ONE DATABASE FAILURE FROM ANOTHER (2026-09-14).
//
// A route that answers "the table is not there yet, run the migration" has to be RIGHT about that, because
// the whole value of the message is that it sends somebody to the one command that fixes it. Sending them
// to a migration when the real problem is a bad password wastes an afternoon.
//
// THE TRAP THIS MODULE EXISTS BECAUSE OF, caught live rather than in review:
//
//   Prisma puts the CALLING SOURCE CODE in the error message. A detector written as
//   `/P2021|42P01|does not exist/.test(e.message)` matched an AUTHENTICATION failure — because the code
//   frame Prisma pasted into the message contained the detector's own regex, pattern text and all. It
//   reported "needs a db push" for a stale credential and looked completely convincing doing it.
//
// So the test is the ERROR CODE and nothing else. P2021 is Prisma's "table does not exist"; 42P01 is
// Postgres saying the same underneath a raw query, where Prisma reports P2010 and carries the real code in
// `meta`. Neither can be spoofed by whatever source text happens to be nearby.

/** The shape of the parts of a Prisma error this cares about. Structural, so nothing has to be imported. */
interface DbError {
  code?: unknown;
  meta?: { code?: unknown } | null;
}

/** Prisma's code for "the table does not exist in the current database". */
export const TABLE_MISSING = 'P2021';
/** Postgres' own `undefined_table`, which arrives under P2010 for a raw query. */
export const PG_UNDEFINED_TABLE = '42P01';

/** Is this "the table has not been created yet" — as opposed to any other database failure? */
export function isMissingTable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as DbError;
  if (err.code === TABLE_MISSING) return true;
  return err.meta?.code === PG_UNDEFINED_TABLE;
}

/** Prisma's codes for bad credentials and an unreachable server — a DIFFERENT fix entirely. */
export const AUTH_FAILED = 'P1000';
export const CANNOT_REACH = 'P1001';

/**
 * Can we not talk to the database at all?
 *
 * Measured, not assumed: a real stale-password failure on this project arrives as a
 * `PrismaClientInitializationError` whose `code` AND `errorCode` are both undefined — the class name and
 * the message are all it carries. So the class name counts as evidence here. It is not free text from a
 * query; it is the constructor Prisma chose, and it means the client never got a connection.
 */
export function isUnreachable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as DbError & { errorCode?: unknown; constructor?: { name?: string } };
  if (err.code === AUTH_FAILED || err.code === CANNOT_REACH) return true;
  if (err.errorCode === AUTH_FAILED || err.errorCode === CANNOT_REACH) return true;
  return err.constructor?.name === 'PrismaClientInitializationError';
}
