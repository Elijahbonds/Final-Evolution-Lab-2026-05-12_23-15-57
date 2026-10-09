// lib/coach/pendingSchema.ts — COACH-AI Phase 8 (2026-10-07): code that runs before its pending SQL is applied.
//
// The read markers (ProgramMessage.readAt) and the availability table (CoachAvailability) arrive with prisma/pending/
// files the OWNER applies. Until then this lane's code must not 500 (the Knowledge Feed precedent), and it cannot use
// the generated client (public/_prisma/client is a committed deploy artifact this lane does not regenerate). So each
// feature asks the database once whether its column/table is there, through a cached probe:
//   · a "yes" is kept for the life of the process (a statement that fails later resets it — see fail());
//   · a "no", or a probe that throws, is asked again after PROBE_TTL_MS, so applying the SQL switches the feature on
//     within minutes, with no deploy and no env change.
// Every statement is parameterised ($1, $2 …); nothing from a request is ever put into SQL text.

/** The two raw calls this lane makes. A route's `prisma` (cast), or a test stand-in. */
export interface RawDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export const PROBE_TTL_MS = 5 * 60_000;

/** One line, no PII: the event plus the error's class name and code (a Prisma P-code or a Postgres SQLSTATE). */
export function logPendingFailure(event: string, e: unknown): void {
  const err = (e && typeof e === 'object' ? e : {}) as { name?: unknown; code?: unknown };
  const safe = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? v : '');
  console.warn(`[coach] ${event} ${safe(err.name) || typeof e}${safe(err.code) ? ` ${safe(err.code)}` : ''}`);
}

/**
 * Does this error say the column/table is not there? Postgres SQLSTATE 42703 (undefined_column) or 42P01
 * (undefined_table), on the error itself or, for Prisma's raw-query error (P2010), in its `meta.code`. Anything else (a
 * foreign-key refusal, a dropped connection) is NOT a reason to switch the feature off.
 */
export function isMissingSchemaError(e: unknown): boolean {
  const err = (e && typeof e === 'object' ? e : {}) as { code?: unknown; meta?: { code?: unknown } | null; message?: unknown };
  const codes = [err.code, err.meta?.code];
  if (codes.some((c) => c === '42703' || c === '42P01')) return true;
  return typeof err.message === 'string' && /(column|relation) "[^"]+" (of relation "[^"]+" )?does not exist/.test(err.message);
}

export interface PendingProbe {
  /** Is the column/table there? Never throws. */
  ready(db: RawDb, now?: number): Promise<boolean>;
  /** A statement that relies on it failed: log, and when the error says the column/table is gone, treat it as missing
   *  until the next probe (any other failure — a refused foreign key, a dropped connection — leaves the probe alone). */
  fail(event: string, e: unknown, now?: number): void;
  /** Tests only. */
  reset(): void;
}

/** `sql` returns at least one row when the thing is there, none when it is not. */
export function pendingProbe(name: string, sql: string): PendingProbe {
  let cached: { ok: boolean; at: number } | null = null;
  return {
    async ready(db, now = Date.now()) {
      if (cached && (cached.ok || now - cached.at < PROBE_TTL_MS)) return cached.ok;
      let ok = false;
      try {
        const rows = await db.$queryRawUnsafe<unknown[]>(sql);
        ok = Array.isArray(rows) && rows.length > 0;
      } catch (e) {
        logPendingFailure(`${name}_probe_failed`, e);
      }
      cached = { ok, at: now };
      return ok;
    },
    fail(event, e, now = Date.now()) {
      logPendingFailure(event, e);
      if (isMissingSchemaError(e)) cached = { ok: false, at: now };
    },
    reset() {
      cached = null;
    },
  };
}
