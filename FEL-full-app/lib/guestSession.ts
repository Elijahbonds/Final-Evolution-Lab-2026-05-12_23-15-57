// lib/guestSession.ts — TIP-GUEST-TOKEN-HASH (2026-10-19): find, create and re-issue a guest session by the HASH of its token.
//
// The cookie holds the token; the database never does. A new row stores hashGuestToken(token) in "token" (the existing
// NOT NULL unique column, which the generated client knows) and, once prisma/pending/2026-10-19-guest-token-hash-1-add.sql
// has added it, in "tokenHash" too. The generated client is not regenerated for this (the schema line waits for
// TIP-SCHEMA-SYNC-DOB-TOKENHASH), so "tokenHash" is only ever touched through parameterised raw SQL after an
// information_schema probe (lib/coach/pendingSchema.ts), and its absence never fails a request:
//   · before the SQL: lookup is `token = hash`. New rows match; a pre-hash row (raw token) misses and the guest gets a
//     fresh session — guest rows hold no score yet, so nothing is lost.
//   · after file 1: lookup is `tokenHash = hash OR token = hash`. Backfilled pre-hash rows match on tokenHash.
//   · after file 2 ("token" := "tokenHash"): both columns hold the hash; either side matches.
// The match is equality inside the database (a unique index), so no secret is compared in app code.

import {
  GUEST_COOKIE_LEGACY,
  guestCookieName,
  guestCookieOptions,
  hashGuestToken,
  isGuestTokenFormat,
} from '@/lib/guest';
import { isMissingSchemaError, pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';

/** The slice of next/headers cookies() this file uses. */
export interface GuestCookieJar {
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options?: Record<string, unknown>): unknown;
}

/** The slice of the Prisma client this file uses (the route's `prisma`, or a test stand-in). */
export interface GuestDb extends RawDb {
  guestSession: {
    findUnique(args: { where: { token: string }; select: { id: true; migratedUserId: true } }): Promise<GuestRow | null>;
    create(args: { data: { token: string; data: Record<string, never> }; select: { id: true; migratedUserId: true } }): Promise<GuestRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface GuestRow {
  id: string;
  migratedUserId: string | null;
}

const PROBE_SQL =
  `SELECT 1 AS "ok" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'GuestSession' AND column_name = 'tokenHash' LIMIT 1`;
const FIND_SQL = `SELECT "id", "migratedUserId" FROM "GuestSession" WHERE "tokenHash" = $1 OR "token" = $1 LIMIT 1`;
const STAMP_SQL = `UPDATE "GuestSession" SET "tokenHash" = $1 WHERE "id" = $2 AND "tokenHash" IS NULL`;

const probe = pendingProbe('guest_token_hash', PROBE_SQL);

/** Tests only: forget the cached probe. */
export function resetGuestTokenHashProbe(): void {
  probe.reset();
}

/**
 * The guest token this request carries, or null when there is none or it is not one we minted (no DB query on junk).
 * The current name wins; a legacy `fel_guest` cookie is read once so the guest route can re-issue it under the new name.
 */
export function guestTokenFrom(jar: GuestCookieJar): { token: string; legacy: boolean } | null {
  const name = guestCookieName();
  const current = jar.get(name)?.value;
  if (isGuestTokenFormat(current)) return { token: current, legacy: false };
  if (name !== GUEST_COOKIE_LEGACY) {
    const old = jar.get(GUEST_COOKIE_LEGACY)?.value;
    if (isGuestTokenFormat(old)) return { token: old, legacy: true };
  }
  return null;
}

/** The analytics guest id for this request: the hash of a well-formed guest token, else null. Never the token. */
export function guestIdFrom(jar: GuestCookieJar): string | null {
  const held = guestTokenFrom(jar);
  return held ? hashGuestToken(held.token) : null;
}

/** Set the guest cookie under this environment's name, and expire a legacy `fel_guest` when the names differ. */
export function setGuestCookie(jar: GuestCookieJar, token: string): void {
  const name = guestCookieName();
  jar.set?.(name, token, guestCookieOptions());
  if (name !== GUEST_COOKIE_LEGACY && jar.get(GUEST_COOKIE_LEGACY)) {
    jar.set?.(GUEST_COOKIE_LEGACY, '', { path: '/', maxAge: 0 });
  }
}

/** The session whose token hashes to `hash`, or null. */
export async function findGuestSession(db: GuestDb, hash: string): Promise<GuestRow | null> {
  if (await probe.ready(db)) {
    try {
      const rows = await db.$queryRawUnsafe<GuestRow[]>(FIND_SQL, hash);
      return rows[0] ?? null;
    } catch (e) {
      probe.fail('guest_token_hash_lookup_failed', e);
      if (!isMissingSchemaError(e)) throw e;
    }
  }
  return db.guestSession.findUnique({ where: { token: hash }, select: { id: true, migratedUserId: true } });
}

/** A new session keyed by `hash`. "token" holds the hash (never the raw token); "tokenHash" too, when it exists. */
export async function createGuestSession(db: GuestDb, hash: string): Promise<GuestRow> {
  const row = await db.guestSession.create({ data: { token: hash, data: {} }, select: { id: true, migratedUserId: true } });
  if (await probe.ready(db)) {
    try {
      await db.$executeRawUnsafe(STAMP_SQL, hash, row.id);
    } catch (e) {
      // the row is still found through "token"; file 2's backfill stamps any row this missed
      probe.fail('guest_token_hash_stamp_failed', e);
    }
  }
  return row;
}
