// lib/rate-limits/store.ts — RATE-LIMIT-WIRE (PR #289 QA rework 2026-10-16; rebuilt on release as lane/rate-limits,
// 2026-10-23): request counts every server instance shares.
//
// QA failed the first cut because the counts lived in each instance's memory (lib/rate-limit.ts): the hosted function
// runs up to 4 instances (firebase.json maxInstances), and each one counted its own window. The counts now live in ONE
// table, rate_limits (prisma/pending/2026-10-16-rate-limits.sql, model RateLimit), one row per bucket, and a hit is a
// single atomic statement: INSERT … ON CONFLICT DO UPDATE takes the row lock, so two instances counting the same bucket
// at the same instant get 1 and 2, never 1 and 1. The window is the database's clock, not the instance's.
//
// The statement is raw and parameterised ($1, $2; nothing from a request is ever put into SQL text), not the generated
// model, so the code is the same before and after the client knows RateLimit.
//
// FAIL OPEN (lane/rate-limits brief, 2026-10-23). The table arrives with a pending SQL file, and a deploy can run before
// it is applied. So when the table is missing (Postgres 42P01), the database cannot be reached, or the statement fails
// any other way, the hit is ALLOWED and one warn line says so — a limit never turns a request into a 500, and never
// refuses one it could not count. A missing table is asked about again after PROBE_TTL_MS (the coach lane's
// pending-schema rule), so applying the SQL switches the limits on within minutes, with no deploy. (PR #289 fell back to
// lib/rate-limit.ts's per-instance window instead; that is the owner's call to bring back — see the lane report.)
//
// A bucket never holds an email, an address or an account id in the clear: it is "<route>:<kind>:<HMAC>".
import { createHmac } from 'node:crypto';
import { isMissingSchemaError, PROBE_TTL_MS } from '@/lib/coach/pendingSchema';

/** The two raw calls the store makes: a route's `prisma`, or a test stand-in. */
export interface RawDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface LimitRule {
  limit: number;
  windowMs: number;
}

export interface LimitHit {
  ok: boolean;
  /** Requests counted in this window, this one included (null when nothing was counted: the limit failed open). */
  hits: number | null;
  /** Seconds until the window closes — the Retry-After value. */
  retryAfterSec: number;
  /** 'table': counted in the shared table. 'open': not counted (no table, no database, a failed statement) and allowed. */
  store: 'table' | 'open';
}

// "now" is the database's, in UTC, so it lines up with the TIMESTAMP(3) columns Prisma writes (UTC, no zone).
const NOW = `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`;

/** One hit: open the window, or count into the open one, or (once it has closed) open the next one in the same row. */
export const HIT_SQL = [
  `INSERT INTO "rate_limits" AS r ("bucket", "hits", "reset_at")`,
  `VALUES ($1, 1, ${NOW} + $2::int * INTERVAL '1 millisecond')`,
  `ON CONFLICT ("bucket") DO UPDATE SET`,
  `"hits" = CASE WHEN r."reset_at" <= ${NOW} THEN 1 ELSE r."hits" + 1 END,`,
  `"reset_at" = CASE WHEN r."reset_at" <= ${NOW} THEN EXCLUDED."reset_at" ELSE r."reset_at" END`,
  `RETURNING r."hits" AS "hits", GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r."reset_at" - ${NOW}))))::int AS "retryAfterSec"`,
].join(' ');

/** Rows whose window closed over an hour ago (on the reset_at index). */
export const SWEEP_SQL = `DELETE FROM "rate_limits" WHERE "reset_at" < ${NOW} - INTERVAL '1 hour'`;
export const SWEEP_EVERY_MS = 10 * 60_000;

let missingUntil = 0;
let lastSweep = 0;

/** One line, no PII: the event plus the error's class name and code (a Prisma P-code or a Postgres SQLSTATE). */
function logFailure(event: string, e: unknown): void {
  const err = (e && typeof e === 'object' ? e : {}) as { name?: unknown; code?: unknown };
  const safe = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? v : '');
  console.warn(`[rate-limits] ${event} ${safe(err.name) || typeof e}${safe(err.code) ? ` ${safe(err.code)}` : ''}`);
}

/** "<route>:<kind>:<digest>". The digest is an HMAC, so the table cannot be read back into emails or addresses. */
export function bucketKey(route: string, kind: string, value: string): string {
  const digest = createHmac('sha256', `fel-rate-limits:${process.env.NEXTAUTH_SECRET ?? ''}`).update(value).digest('base64url');
  return `${route}:${kind}:${digest.slice(0, 32)}`;
}

/** Not counted, so allowed: the limit fails open. */
function openHit(): LimitHit {
  return { ok: true, hits: null, retryAfterSec: 0, store: 'open' };
}

function canQuery(db: unknown): db is Pick<RawDb, '$queryRawUnsafe'> & Partial<RawDb> {
  return !!db && typeof (db as Partial<RawDb>).$queryRawUnsafe === 'function';
}

/** Count one request into `bucket` and say whether it is inside `rule`. Never throws. */
export async function hitBucket(db: unknown, bucket: string, rule: LimitRule, now: number = Date.now()): Promise<LimitHit> {
  // Not a database client at all (a test stand-in without raw SQL; the real client always has it): open, silently.
  if (!canQuery(db)) return openHit();
  // The table was found missing a moment ago: open, without asking again until PROBE_TTL_MS has passed.
  if (now < missingUntil) return openHit();
  try {
    const rows = await db.$queryRawUnsafe<Array<{ hits?: unknown; retryAfterSec?: unknown }>>(HIT_SQL, bucket, Math.round(rule.windowMs));
    const row = Array.isArray(rows) ? rows[0] : undefined;
    const hits = Number(row?.hits);
    if (!Number.isInteger(hits) || hits < 1) throw Object.assign(new Error('rate_limits answered no count'), { name: 'NoCount' });
    const retry = Number(row?.retryAfterSec);
    sweep(db, now);
    return {
      ok: hits <= rule.limit,
      hits,
      retryAfterSec: Number.isFinite(retry) && retry >= 1 ? Math.ceil(retry) : Math.max(1, Math.ceil(rule.windowMs / 1000)),
      store: 'table',
    };
  } catch (e) {
    if (isMissingSchemaError(e)) {
      logFailure('table_missing_failing_open', e);
      missingUntil = now + PROBE_TTL_MS;
    } else {
      logFailure('hit_failed_failing_open', e);
    }
    return openHit();
  }
}

function sweep(db: Partial<RawDb>, now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS || typeof db.$executeRawUnsafe !== 'function') return;
  lastSweep = now;
  // not awaited: the request does not wait on house-keeping
  Promise.resolve().then(() => db.$executeRawUnsafe!(SWEEP_SQL)).catch((e: unknown) => logFailure('sweep_failed', e));
}

/** Tests only. */
export function resetRateLimitStore(): void {
  missingUntil = 0;
  lastSweep = 0;
}
