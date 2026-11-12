// lib/coach/automations/store.ts — COACH-DELIVERY COA-01 (2026-10-26): CoachAutomation and CoachAutomationRun in raw SQL
// behind the lane's probe (lib/coach/delivery/probe.ts). Before prisma/pending/2026-10-26-coach-delivery.sql is applied every
// read answers null and every write null/false; nothing 500s. Every statement is parameterised; ids are made here.
import { randomUUID } from 'node:crypto';
import { asIso, numOrNull, readRows, strOrNull, writeRows, type RawDb } from '../delivery/probe';
import type { AutoScope, CleanAutomation, Trigger } from './rules';

export type { RawDb };

const NOW = `(NOW() AT TIME ZONE 'UTC')`;
const A = `"id", "coachId", "trigger", "scope", "scopeId", "missedN", "weekday", "hour", "preset", "text", "enabled", "archivedAt", "createdAt"`;

export const SQL = {
  insert: `INSERT INTO "CoachAutomation" ("id", "coachId", "trigger", "scope", "scopeId", "missedN", "weekday", "hour", "preset", "text", "enabled", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, ${NOW}, ${NOW})`,
  update: `UPDATE "CoachAutomation" SET "trigger" = $3, "scope" = $4, "scopeId" = $5, "missedN" = $6, "weekday" = $7, "hour" = $8, "preset" = $9, "text" = $10, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "archivedAt" IS NULL`,
  setEnabled: `UPDATE "CoachAutomation" SET "enabled" = $3, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "archivedAt" IS NULL`,
  archive: `UPDATE "CoachAutomation" SET "archivedAt" = ${NOW}, "enabled" = false, "updatedAt" = ${NOW} WHERE "id" = $1 AND "coachId" = $2 AND "archivedAt" IS NULL`,
  forCoach: `SELECT ${A} FROM "CoachAutomation" WHERE "coachId" = $1 AND "archivedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 50`,
  enabledAll: `SELECT ${A} FROM "CoachAutomation" WHERE "enabled" = true AND "archivedAt" IS NULL ORDER BY "coachId", "createdAt" LIMIT 5000`,
  enabledFor: `SELECT ${A} FROM "CoachAutomation" WHERE "coachId" = $1 AND "enabled" = true AND "archivedAt" IS NULL ORDER BY "createdAt" LIMIT 50`,
  claimRun:
    `INSERT INTO "CoachAutomationRun" ("id", "automationId", "coachId", "athleteId", "day", "outcome", "programId", "messageId", "createdAt") ` +
    `VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, ${NOW}) ON CONFLICT ("automationId", "athleteId", "day") DO NOTHING`,
  finishRun: `UPDATE "CoachAutomationRun" SET "outcome" = $2, "messageId" = $3 WHERE "id" = $1`,
  runsFor: `SELECT "automationId", "athleteId", "day", "outcome" FROM "CoachAutomationRun" WHERE "automationId" = ANY($1::text[]) AND "day" >= $2`,
  recentForCoach: `SELECT "id", "automationId", "athleteId", "day", "outcome", "createdAt" FROM "CoachAutomationRun" WHERE "coachId" = $1 AND "createdAt" >= $2 ORDER BY "createdAt" DESC LIMIT 50`,
} as const;

export interface AutomationRow extends CleanAutomation { id: string; coachId: string; enabled: boolean; archivedAt: string | null; createdAt: string }
export interface RunRow { automationId: string; athleteId: string; day: string; outcome: string }

function asAutomation(r: Record<string, unknown>): AutomationRow {
  return {
    id: String(r.id), coachId: String(r.coachId), trigger: String(r.trigger) as Trigger, scope: String(r.scope) as AutoScope, scopeId: strOrNull(r.scopeId),
    missedN: numOrNull(r.missedN), weekday: numOrNull(r.weekday), hour: numOrNull(r.hour), preset: strOrNull(r.preset), text: strOrNull(r.text),
    enabled: r.enabled === true || r.enabled === 't', archivedAt: r.archivedAt == null ? null : asIso(r.archivedAt), createdAt: asIso(r.createdAt),
  };
}
const list = (rows: Record<string, unknown>[]) => rows.map(asAutomation);

export async function insertAutomation(db: RawDb, coachId: string, a: CleanAutomation, now = Date.now()): Promise<string | null> {
  const id = randomUUID();
  const n = await writeRows(db, now, 'automation_write_failed', () => db.$executeRawUnsafe(SQL.insert, id, coachId, a.trigger, a.scope, a.scopeId, a.missedN, a.weekday, a.hour, a.preset, a.text));
  return n ? id : null;
}
export async function updateAutomation(db: RawDb, id: string, coachId: string, a: CleanAutomation, now = Date.now()): Promise<boolean> {
  return ((await writeRows(db, now, 'automation_write_failed', () => db.$executeRawUnsafe(SQL.update, id, coachId, a.trigger, a.scope, a.scopeId, a.missedN, a.weekday, a.hour, a.preset, a.text))) ?? 0) > 0;
}
export async function setEnabled(db: RawDb, id: string, coachId: string, enabled: boolean, now = Date.now()): Promise<boolean> {
  return ((await writeRows(db, now, 'automation_write_failed', () => db.$executeRawUnsafe(SQL.setEnabled, id, coachId, enabled))) ?? 0) > 0;
}
export async function archiveAutomation(db: RawDb, id: string, coachId: string, now = Date.now()): Promise<boolean> {
  return ((await writeRows(db, now, 'automation_write_failed', () => db.$executeRawUnsafe(SQL.archive, id, coachId))) ?? 0) > 0;
}
export function automationsForCoach(db: RawDb, coachId: string, now = Date.now()): Promise<AutomationRow[] | null> {
  return readRows(db, now, 'automation_read_failed', async () => list(await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.forCoach, coachId)));
}
/** Every enabled automation (the sweep), or one coach's ("Run now"). */
export function enabledAutomations(db: RawDb, coachId: string | null, now = Date.now()): Promise<AutomationRow[] | null> {
  return readRows(db, now, 'automation_read_failed', async () => list(await (coachId ? db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.enabledFor, coachId) : db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.enabledAll))));
}
export async function runsFor(db: RawDb, automationIds: readonly string[], sinceDay: string, now = Date.now()): Promise<RunRow[] | null> {
  if (!automationIds.length) return [];
  return readRows(db, now, 'automation_read_failed', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.runsFor, [...automationIds], sinceDay))
    .map((r) => ({ automationId: String(r.automationId), athleteId: String(r.athleteId), day: String(r.day), outcome: String(r.outcome) })));
}
export function recentRuns(db: RawDb, coachId: string, since: Date, now = Date.now()) {
  return readRows(db, now, 'automation_read_failed', async () => (await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.recentForCoach, coachId, since))
    .map((r) => ({ id: String(r.id), automationId: String(r.automationId), athleteId: String(r.athleteId), day: String(r.day), outcome: String(r.outcome), createdAt: asIso(r.createdAt) })));
}

/**
 * Claim this automation × athlete × day BEFORE posting: the run id when this call made the row, null when a row was
 * already there (another sweep, or earlier today) or the table is not there. The unique key is the dedupe.
 */
export async function claimRun(db: RawDb, r: { automationId: string; coachId: string; athleteId: string; day: string; outcome: string; programId: string | null }, now = Date.now()): Promise<string | null> {
  const id = randomUUID();
  const n = await writeRows(db, now, 'automation_run_failed', () => db.$executeRawUnsafe(SQL.claimRun, id, r.automationId, r.coachId, r.athleteId, r.day, r.outcome, r.programId));
  return n ? id : null;
}
export async function finishRun(db: RawDb, runId: string, outcome: string, messageId: string | null, now = Date.now()): Promise<void> {
  await writeRows(db, now, 'automation_run_failed', () => db.$executeRawUnsafe(SQL.finishRun, runId, outcome, messageId));
}
