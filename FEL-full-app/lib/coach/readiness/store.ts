// lib/coach/readiness/store.ts — COACH-READINESS (2026-10-25): the checks, the coaches' rules and the alerts, in raw SQL.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-25-coach-readiness.sql, which the owner
// applies. Until then (and in CI) every read answers "not available" and nothing 500s — the check still runs against the
// phone's own history, Today is served as written, and a coach sees no readiness alerts. The probe is the shared one
// (lib/coach/pendingSchema.ts): applying the SQL switches it all on within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here.

import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '../pendingSchema';
import type { ReadinessBand, ReadinessReason, RuleAction, RuleKind, RuleScope, StoredRule } from './types';

export type { RawDb };

// the three tables arrive in one file; the alerts table is created last, so its presence means all three are there
const probe = pendingProbe('coach_readiness', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'ReadinessAlert' LIMIT 1`);

/** Tests only. */
export function resetReadinessProbe(): void {
  probe.reset();
}

export function readinessReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

const CHECK_COLS = `"id", "userId", "day", "bestCm", "meanCm", "teCm", "jumps", "poseHz", "feel", "band", "reason", "belowReal", "baselineCm", "baselineMeanCm", "baselineN", "dropPct", "createdAt"`;

/** The statements, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  insertCheck:
    `INSERT INTO "ReadinessJumpCheck" (${CHECK_COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("userId", "day") DO NOTHING`,
  checkByDay: `SELECT ${CHECK_COLS} FROM "ReadinessJumpCheck" WHERE "userId" = $1 AND "day" = $2`,
  checksFor: `SELECT ${CHECK_COLS} FROM "ReadinessJumpCheck" WHERE "userId" = $1 AND "createdAt" >= $2 ORDER BY "day" DESC LIMIT $3`,
  checksForUsers: `SELECT ${CHECK_COLS} FROM "ReadinessJumpCheck" WHERE "userId" = ANY($1::text[]) AND "createdAt" >= $2 ORDER BY "day" DESC`,
  deleteChecks: `DELETE FROM "ReadinessJumpCheck" WHERE "userId" = $1`,
  rulesForCoaches: `SELECT "coachId", "scope", "scopeId", "kind", "dropPct", "action", "updatedAt" FROM "ReadinessRule" WHERE "coachId" = ANY($1::text[])`,
  upsertRule:
    `INSERT INTO "ReadinessRule" ("id", "coachId", "scope", "scopeId", "kind", "dropPct", "action", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("coachId", "scope", "scopeId") DO UPDATE SET "kind" = EXCLUDED."kind", "dropPct" = EXCLUDED."dropPct", "action" = EXCLUDED."action", "updatedAt" = EXCLUDED."updatedAt"`,
  deleteRule: `DELETE FROM "ReadinessRule" WHERE "coachId" = $1 AND "scope" = $2 AND "scopeId" = $3`,
  insertAlert:
    `INSERT INTO "ReadinessAlert" ("id", "coachId", "athleteId", "day", "checkId", "action", "reason", "dropPct", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("coachId", "athleteId", "day") DO NOTHING`,
  alertsForCoach:
    `SELECT "id", "athleteId", "day", "action", "reason", "dropPct", "createdAt", "seenAt" FROM "ReadinessAlert" WHERE "coachId" = $1 AND "createdAt" >= $2 ORDER BY "createdAt" DESC LIMIT 100`,
  seeAlert: `UPDATE "ReadinessAlert" SET "seenAt" = (NOW() AT TIME ZONE 'UTC') WHERE "id" = $1 AND "coachId" = $2 AND "seenAt" IS NULL`,
  alertsForAthleteDay: `SELECT "coachId" FROM "ReadinessAlert" WHERE "athleteId" = $1 AND "day" = $2`,
} as const;

export interface StoredCheck {
  id: string; userId: string; day: string; bestCm: number; meanCm: number; teCm: number; jumps: number; poseHz: number;
  feel: number | null; band: ReadinessBand; reason: ReadinessReason; belowReal: boolean;
  baselineCm: number | null; baselineMeanCm: number | null; baselineN: number | null; dropPct: number | null; createdAt: string;
}
export type NewCheck = Omit<StoredCheck, 'id' | 'createdAt'>;

export interface StoredAlert { id: string; athleteId: string; day: string; action: RuleAction; reason: ReadinessReason; dropPct: number | null; createdAt: string; seenAt: string | null }

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());

function asCheck(r: Record<string, unknown>): StoredCheck {
  return {
    id: String(r.id), userId: String(r.userId), day: String(r.day), bestCm: num(r.bestCm), meanCm: num(r.meanCm), teCm: num(r.teCm),
    jumps: num(r.jumps), poseHz: num(r.poseHz), feel: numOrNull(r.feel), band: String(r.band) as ReadinessBand, reason: String(r.reason) as ReadinessReason,
    belowReal: r.belowReal === true || r.belowReal === 't', baselineCm: numOrNull(r.baselineCm), baselineMeanCm: numOrNull(r.baselineMeanCm),
    baselineN: numOrNull(r.baselineN), dropPct: numOrNull(r.dropPct), createdAt: iso(r.createdAt),
  };
}

/** Keep the day's check, once. `inserted` false = that day already had one (the first stands); `check` is the day's row. */
export async function keepCheck(db: RawDb, c: NewCheck, now: number = Date.now()): Promise<{ inserted: boolean; check: StoredCheck } | null> {
  if (!(await readinessReady(db, now))) return null;
  try {
    const n = await db.$executeRawUnsafe(
      SQL.insertCheck, randomUUID(), c.userId, c.day, c.bestCm, c.meanCm, c.teCm, c.jumps, c.poseHz, c.feel, c.band, c.reason, c.belowReal,
      c.baselineCm, c.baselineMeanCm, c.baselineN, c.dropPct,
    );
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.checkByDay, c.userId, c.day);
    return rows[0] ? { inserted: Number(n) > 0, check: asCheck(rows[0]) } : null;
  } catch (e) {
    probe.fail('coach_readiness_keep_failed', e, now);
    return null;
  }
}

/** One athlete's checks since `since`, newest day first; null when the tables are not there. */
export async function checksFor(db: RawDb, userId: string, since: Date, limit = 60, now: number = Date.now()): Promise<StoredCheck[] | null> {
  if (!(await readinessReady(db, now))) return null;
  try {
    return (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.checksFor, userId, since, limit)).map(asCheck);
  } catch (e) {
    probe.fail('coach_readiness_read_failed', e, now);
    return null;
  }
}

/** Several athletes' checks since `since`; [] when the tables are not there (a coach's board and the weekly draft). */
export async function checksForUsers(db: RawDb, userIds: readonly string[], since: Date, now: number = Date.now()): Promise<StoredCheck[]> {
  if (!userIds.length || !(await readinessReady(db, now))) return [];
  try {
    return (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.checksForUsers, [...userIds], since)).map(asCheck);
  } catch (e) {
    probe.fail('coach_readiness_read_failed', e, now);
    return [];
  }
}

/** Remove every check of this athlete's (their alerts go with them: ON DELETE CASCADE). */
export async function deleteChecks(db: RawDb, userId: string, now: number = Date.now()): Promise<boolean> {
  if (!(await readinessReady(db, now))) return false;
  try {
    await db.$executeRawUnsafe(SQL.deleteChecks, userId);
    return true;
  } catch (e) {
    probe.fail('coach_readiness_delete_failed', e, now);
    return false;
  }
}

/** Every rule these coaches set; [] when the tables are not there. */
export async function rulesForCoaches(db: RawDb, coachIds: readonly string[], now: number = Date.now()): Promise<StoredRule[]> {
  if (!coachIds.length || !(await readinessReady(db, now))) return [];
  try {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.rulesForCoaches, [...coachIds]);
    return rows.map((r) => ({
      coachId: String(r.coachId), scope: String(r.scope) as RuleScope, scopeId: String(r.scopeId), kind: String(r.kind) as RuleKind,
      dropPct: num(r.dropPct), action: String(r.action) as RuleAction, updatedAt: iso(r.updatedAt),
    }));
  } catch (e) {
    probe.fail('coach_readiness_rules_failed', e, now);
    return [];
  }
}

/** Set (or replace) a coach's rule for one athlete or team. false when the tables are not there or the write failed. */
export async function setRule(db: RawDb, r: Omit<StoredRule, 'updatedAt'>, now: number = Date.now()): Promise<boolean> {
  if (!(await readinessReady(db, now))) return false;
  try {
    await db.$executeRawUnsafe(SQL.upsertRule, randomUUID(), r.coachId, r.scope, r.scopeId, r.kind, r.dropPct, r.action);
    return true;
  } catch (e) {
    probe.fail('coach_readiness_rule_write_failed', e, now);
    return false;
  }
}

/** Back to the default for one athlete or team. */
export async function clearRule(db: RawDb, coachId: string, scope: RuleScope, scopeId: string, now: number = Date.now()): Promise<boolean> {
  if (!(await readinessReady(db, now))) return false;
  try {
    await db.$executeRawUnsafe(SQL.deleteRule, coachId, scope, scopeId);
    return true;
  } catch (e) {
    probe.fail('coach_readiness_rule_write_failed', e, now);
    return false;
  }
}

/** Tell one coach, once per athlete per day. true = this call fired it; false = it had already fired (or could not be kept). */
export async function fireAlert(db: RawDb, a: { coachId: string; athleteId: string; day: string; checkId: string; action: RuleAction; reason: ReadinessReason; dropPct: number | null }, now: number = Date.now()): Promise<boolean> {
  if (!(await readinessReady(db, now))) return false;
  try {
    const n = await db.$executeRawUnsafe(SQL.insertAlert, randomUUID(), a.coachId, a.athleteId, a.day, a.checkId, a.action, a.reason, a.dropPct);
    return Number(n) > 0;
  } catch (e) {
    probe.fail('coach_readiness_alert_failed', e, now);
    return false;
  }
}

/** The coaches already told about this athlete's day. */
export async function toldFor(db: RawDb, athleteId: string, day: string, now: number = Date.now()): Promise<string[]> {
  if (!(await readinessReady(db, now))) return [];
  try {
    return (await db.$queryRawUnsafe<{ coachId: string }[]>(SQL.alertsForAthleteDay, athleteId, day)).map((r) => String(r.coachId));
  } catch (e) {
    probe.fail('coach_readiness_read_failed', e, now);
    return [];
  }
}

/** This coach's alerts since `since`, newest first; null when the tables are not there. */
export async function alertsForCoach(db: RawDb, coachId: string, since: Date, now: number = Date.now()): Promise<StoredAlert[] | null> {
  if (!(await readinessReady(db, now))) return null;
  try {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.alertsForCoach, coachId, since);
    return rows.map((r) => ({
      id: String(r.id), athleteId: String(r.athleteId), day: String(r.day), action: String(r.action) as RuleAction, reason: String(r.reason) as ReadinessReason,
      dropPct: numOrNull(r.dropPct), createdAt: iso(r.createdAt), seenAt: r.seenAt == null ? null : iso(r.seenAt),
    }));
  } catch (e) {
    probe.fail('coach_readiness_read_failed', e, now);
    return null;
  }
}

/** The coach dismisses an alert (their own only). */
export async function seeAlert(db: RawDb, coachId: string, id: string, now: number = Date.now()): Promise<boolean> {
  if (!(await readinessReady(db, now))) return false;
  try {
    return Number(await db.$executeRawUnsafe(SQL.seeAlert, id, coachId)) > 0;
  } catch (e) {
    probe.fail('coach_readiness_alert_failed', e, now);
    return false;
  }
}
