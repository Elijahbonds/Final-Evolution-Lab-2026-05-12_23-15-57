// Web push's tables, through the pending seam (offline-push, round 8). Server only.
//
// NotificationPref, PushSubscription and PushSendLog arrive with prisma/pending/2026-10-26-push-subscriptions.sql, which
// the owner applies. Until then every read here answers "nothing" and every write "not ready" — never a 500 — and the
// shared probe (lib/coach/pendingSchema.ts) switches it all on within ~5 minutes of the SQL being applied. Raw,
// parameterised statements only ($1, $2 …): nothing from a request is ever put into SQL text, and the generated client
// (a committed deploy artifact this lane does not regenerate) is not needed. The statements are named (SQL) so the
// in-memory stand-in (tests/helpers/fakePushDb.ts) answers them by name, and tests/push/store.integration.test.ts runs
// every one against a real Postgres with the pending file applied.
//
// Times are the database's clock in UTC, the way the TIMESTAMP(3) columns Prisma writes are (lib/rate-limits/store.ts).
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { cleanKinds, NO_PREFS, type Prefs, type PushKind } from './policy';
import type { CleanSubscription } from './subscription';

export type { RawDb };

const NOW = `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`;
/** (new) Devices kept per account; a new one past this replaces the oldest. */
export const MAX_DEVICES = 10;
/** Sends in a row that failed before a device is dropped (a 404/410 drops it at once). */
export const MAX_FAILURES = 5;

export const SQL = {
  probe: `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'PushSendLog' LIMIT 1`,
  readPrefs: `SELECT "kinds", "email" FROM "NotificationPref" WHERE "userId" = $1`,
  writePrefs: `INSERT INTO "NotificationPref" ("userId", "kinds", "email", "updatedAt") VALUES ($1, $2::text[], $3, ${NOW})
ON CONFLICT ("userId") DO UPDATE SET "kinds" = EXCLUDED."kinds", "email" = EXCLUDED."email", "updatedAt" = EXCLUDED."updatedAt"`,
  clearPrefs: `DELETE FROM "NotificationPref" WHERE "userId" = $1`,
  addDevice: `INSERT INTO "PushSubscription" ("id", "userId", "endpoint", "p256dh", "auth", "createdAt", "failures") VALUES ($1, $2, $3, $4, $5, ${NOW}, 0)
ON CONFLICT ("endpoint") DO UPDATE SET "userId" = EXCLUDED."userId", "p256dh" = EXCLUDED."p256dh", "auth" = EXCLUDED."auth", "createdAt" = EXCLUDED."createdAt", "failures" = 0`,
  trimDevices: `DELETE FROM "PushSubscription" WHERE "userId" = $1 AND "id" NOT IN
(SELECT "id" FROM "PushSubscription" WHERE "userId" = $1 ORDER BY "createdAt" DESC, "id" DESC LIMIT ${MAX_DEVICES})`,
  removeAllDevices: `DELETE FROM "PushSubscription" WHERE "userId" = $1`,
  removeDevice: `DELETE FROM "PushSubscription" WHERE "userId" = $1 AND "endpoint" = $2`,
  listDevices: `SELECT "id", "endpoint", "p256dh", "auth", "failures" FROM "PushSubscription" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT ${MAX_DEVICES}`,
  countDevices: `SELECT COUNT(*)::int AS "n" FROM "PushSubscription" WHERE "userId" = $1`,
  deviceWorked: `UPDATE "PushSubscription" SET "failures" = 0, "lastSuccessAt" = ${NOW} WHERE "id" = $1`,
  deviceGone: `DELETE FROM "PushSubscription" WHERE "id" = $1`,
  deviceFailed: `UPDATE "PushSubscription" SET "failures" = "failures" + 1 WHERE "id" = $1`,
  deviceDropFailing: `DELETE FROM "PushSubscription" WHERE "id" = $1 AND "failures" >= ${MAX_FAILURES}`,
  sendCounts: `SELECT COUNT(*)::int AS "n",
(EXTRACT(EPOCH FROM (${NOW} - MAX("sentAt") FILTER (WHERE "kind" = $2))) * 1000)::float8 AS "ago"
FROM "PushSendLog" WHERE "userId" = $1 AND "sentAt" > ${NOW} - INTERVAL '24 hours'`,
  logSend: `INSERT INTO "PushSendLog" ("id", "userId", "kind", "channel", "sentAt") VALUES ($1, $2, $3, $4, ${NOW})`,
  prefsWithAny: `SELECT "userId", "kinds", "email" FROM "NotificationPref" WHERE "kinds" && $1::text[] ORDER BY "updatedAt" ASC LIMIT $2`,
} as const;

const probe = pendingProbe('push', SQL.probe);
export function resetPushProbe(): void { probe.reset(); }
export function pushTablesReady(db: RawDb, now: number = Date.now()): Promise<boolean> { return probe.ready(db, now); }

/** The account's choices; NO_PREFS when it has none; null when they could not be read (a send then refuses). */
export async function readPrefs(db: RawDb, userId: string): Promise<Prefs | null> {
  try {
    const rows = await db.$queryRawUnsafe<{ kinds: unknown; email: unknown }[]>(SQL.readPrefs, userId);
    const r = rows[0];
    return r ? { kinds: cleanKinds(r.kinds), email: r.email === true } : NO_PREFS;
  } catch (e) { probe.fail('push_prefs_read_failed', e); return null; }
}

export async function writePrefs(db: RawDb, userId: string, prefs: Prefs): Promise<boolean> {
  try { await db.$executeRawUnsafe(SQL.writePrefs, userId, cleanKinds(prefs.kinds), prefs.email === true); return true; } catch (e) { probe.fail('push_prefs_write_failed', e); return false; }
}

/** Opt out of everything: the choices go (no empty row is left behind, so nothing is written for anyone). */
export async function clearPrefs(db: RawDb, userId: string): Promise<boolean> {
  try { await db.$executeRawUnsafe(SQL.clearPrefs, userId); return true; } catch (e) { probe.fail('push_prefs_write_failed', e); return false; }
}

export interface StoredDevice { id: string; endpoint: string; p256dh: string; auth: string; failures: number }

/** Keep this browser for this account. One browser is one row: re-subscribed by another account on the same phone, it
 *  moves to that account. Past MAX_DEVICES the oldest of the account's devices goes. */
export async function addDevice(db: RawDb, userId: string, sub: CleanSubscription): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(SQL.addDevice, randomUUID(), userId, sub.endpoint, sub.p256dh, sub.auth);
    await db.$executeRawUnsafe(SQL.trimDevices, userId);
    return true;
  } catch (e) { probe.fail('push_device_write_failed', e); return false; }
}

/** One browser (by its endpoint), or every browser of the account when `endpoint` is null. Only the account's own. */
export async function removeDevices(db: RawDb, userId: string, endpoint: string | null): Promise<number> {
  try {
    return endpoint === null ? await db.$executeRawUnsafe(SQL.removeAllDevices, userId) : await db.$executeRawUnsafe(SQL.removeDevice, userId, endpoint);
  } catch (e) { probe.fail('push_device_delete_failed', e); return 0; }
}

export async function listDevices(db: RawDb, userId: string): Promise<StoredDevice[]> {
  try { return await db.$queryRawUnsafe<StoredDevice[]>(SQL.listDevices, userId); } catch (e) { probe.fail('push_device_read_failed', e); return []; }
}

export async function countDevices(db: RawDb, userId: string): Promise<number> {
  try {
    const rows = await db.$queryRawUnsafe<{ n: number | bigint }[]>(SQL.countDevices, userId);
    return Number(rows[0]?.n ?? 0);
  } catch (e) { probe.fail('push_device_read_failed', e); return 0; }
}

/** A device the push service accepted a message for. */
export async function deviceWorked(db: RawDb, id: string): Promise<void> {
  try { await db.$executeRawUnsafe(SQL.deviceWorked, id); } catch (e) { probe.fail('push_device_write_failed', e); }
}

/** A device the push service refused: gone (404/410) is deleted at once; anything else counts, and MAX_FAILURES deletes. */
export async function deviceFailed(db: RawDb, id: string, gone: boolean): Promise<void> {
  try {
    if (gone) { await db.$executeRawUnsafe(SQL.deviceGone, id); return; }
    await db.$executeRawUnsafe(SQL.deviceFailed, id);
    await db.$executeRawUnsafe(SQL.deviceDropFailing, id);
  } catch (e) { probe.fail('push_device_write_failed', e); }
}

/** This account's sends in the last 24 hours, and how long ago this kind was last sent (ms; null = not in that window).
 *  Null when the count cannot be read: the caller refuses (fail closed). */
export async function sendCounts(db: RawDb, userId: string, kind: PushKind): Promise<{ last24h: number; kindAgoMs: number | null } | null> {
  try {
    const rows = await db.$queryRawUnsafe<{ n: number | bigint; ago: number | string | null }[]>(SQL.sendCounts, userId, kind);
    const r = rows[0];
    return { last24h: Number(r?.n ?? 0), kindAgoMs: r?.ago === null || r?.ago === undefined ? null : Number(r.ago) };
  } catch (e) { probe.fail('push_log_read_failed', e); return null; }
}

export async function logSend(db: RawDb, userId: string, kind: PushKind, channel: 'push' | 'email'): Promise<void> {
  try { await db.$executeRawUnsafe(SQL.logSend, randomUUID(), userId, kind, channel); } catch (e) { probe.fail('push_log_write_failed', e); }
}

/** Accounts that opted in to any of `kinds`, oldest choice first, at most `limit` (the reminder job's work list). */
export async function prefsWithAny(db: RawDb, kinds: readonly PushKind[], limit: number): Promise<{ userId: string; prefs: Prefs }[]> {
  try {
    const rows = await db.$queryRawUnsafe<{ userId: string; kinds: unknown; email: unknown }[]>(SQL.prefsWithAny, [...kinds], limit);
    return rows.map((r) => ({ userId: r.userId, prefs: { kinds: cleanKinds(r.kinds), email: r.email === true } }));
  } catch (e) { probe.fail('push_prefs_read_failed', e); return []; }
}
