// lib/coach/weeklyDraft/store.ts — COACH-AI-DRAFT (2026-10-24): the drafts and the decision audit, in raw SQL.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-24-coach-ai-draft.sql, which the owner
// applies. Until then (and in CI) every read here answers "not available" and nothing 500s — the coach still reads the
// week's drafts (computed live: the rules engine is deterministic), and approving answers 503 drafts_not_ready, because
// a program change with no audit trail behind it is exactly what this feature must not do. The probe is the shared one
// (lib/coach/pendingSchema.ts): applying the SQL switches approvals on within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is put into SQL text. Ids are made here
// (node:crypto randomUUID): the generated client never sees these tables until the owner regenerates it.

import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '../pendingSchema';
import type { ClientDraft, DraftOp } from './types';

export type { RawDb };

// both tables arrive in one file; the decisions table is created second, so its presence means both are there
const probe = pendingProbe('coach_ai_draft', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CoachDraftDecision' LIMIT 1`);

/** Tests only. */
export function resetDraftStoreProbe(): void {
  probe.reset();
}

export function draftsReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

/** The statements, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  insertDraft:
    `INSERT INTO "CoachProgramDraft" ("id", "coachId", "clientId", "programId", "weekKey", "engine", "draft", "createdAt") ` +
    `VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, (NOW() AT TIME ZONE 'UTC')) ON CONFLICT ("coachId", "clientId", "programId", "weekKey") DO NOTHING`,
  draftsForWeek:
    `SELECT "id", "clientId", "programId", "engine", "draft" FROM "CoachProgramDraft" WHERE "coachId" = $1 AND "weekKey" = $2`,
  draftById:
    `SELECT "id", "coachId", "clientId", "programId", "weekKey", "engine", "draft" FROM "CoachProgramDraft" WHERE "id" = $1 AND "coachId" = $2`,
  decisionsFor:
    `SELECT "id", "draftId", "changeId", "decision", "actorId", "decidedAt", "after", "note" FROM "CoachDraftDecision" WHERE "draftId" = ANY($1::text[])`,
  claimDecision:
    `INSERT INTO "CoachDraftDecision" ("id", "draftId", "changeId", "decision", "actorId", "programId", "clientId", "before", "after", "clientLine", "note", "decidedAt") ` +
    `VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, (NOW() AT TIME ZONE 'UTC')) ON CONFLICT ("draftId", "changeId") DO NOTHING`,
  settleDecision: `UPDATE "CoachDraftDecision" SET "decision" = $2, "after" = $3::jsonb WHERE "id" = $1`,
  dropClaim: `DELETE FROM "CoachDraftDecision" WHERE "id" = $1 AND "actorId" = $2`,
  clientUpdates:
    `SELECT d."id", d."decision", d."clientLine", d."note", d."decidedAt", d."programId" FROM "CoachDraftDecision" d ` +
    `WHERE d."clientId" = $1 AND d."decision" IN ('approved', 'edited', 'partial') AND d."decidedAt" >= $2 ORDER BY d."decidedAt" DESC LIMIT 20`,
} as const;

export interface StoredDraft { id: string; clientId: string; programId: string; engine: string; draft: ClientDraft }
export interface StoredDecision { id: string; draftId: string; changeId: string; decision: Decision; actorId: string; decidedAt: string; after: unknown; note: string | null }
export type Decision = 'approved' | 'edited' | 'rejected' | 'partial';

const asDraft = (v: unknown): ClientDraft | null => {
  const d = (typeof v === 'string' ? safeJson(v) : v) as ClientDraft | null;
  return d && typeof d === 'object' && d.version === 1 && Array.isArray(d.changes) ? d : null;
};
function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());

/** This coach's stored drafts for a week, or null when the tables are not there. */
export async function draftsForWeek(db: RawDb, coachId: string, weekKey: string, now: number = Date.now()): Promise<StoredDraft[] | null> {
  if (!(await draftsReady(db, now))) return null;
  try {
    const rows = await db.$queryRawUnsafe<{ id: string; clientId: string; programId: string; engine: string; draft: unknown }[]>(SQL.draftsForWeek, coachId, weekKey);
    return rows.flatMap((r) => { const d = asDraft(r.draft); return d ? [{ id: r.id, clientId: r.clientId, programId: r.programId, engine: r.engine, draft: d }] : []; });
  } catch (e) {
    probe.fail('coach_ai_draft_read_failed', e, now);
    return null;
  }
}

/**
 * Keep this week's draft for one client and program, once. A second call in the same week inserts nothing and gets the
 * FIRST row back, whatever it was asked to store: the week's draft is fixed once made, so its change ids hold still while
 * the coach works through them. null when the tables are not there.
 */
export async function keepDraft(db: RawDb, draft: ClientDraft, now: number = Date.now()): Promise<StoredDraft | null> {
  if (!draft.programId || !(await draftsReady(db, now))) return null;
  try {
    await db.$executeRawUnsafe(SQL.insertDraft, randomUUID(), draft.coachId, draft.clientId, draft.programId, draft.weekKey, draft.engine, JSON.stringify(draft));
    const rows = await db.$queryRawUnsafe<{ id: string; clientId: string; programId: string; engine: string; draft: unknown }[]>(SQL.draftsForWeek, draft.coachId, draft.weekKey);
    const r = rows.find((x) => x.clientId === draft.clientId && x.programId === draft.programId);
    const d = r ? asDraft(r.draft) : null;
    return r && d ? { id: r.id, clientId: r.clientId, programId: r.programId, engine: r.engine, draft: d } : null;
  } catch (e) {
    probe.fail('coach_ai_draft_keep_failed', e, now);
    return null;
  }
}

export async function draftById(db: RawDb, draftId: string, coachId: string): Promise<(StoredDraft & { weekKey: string }) | null> {
  const rows = await db.$queryRawUnsafe<{ id: string; clientId: string; programId: string; weekKey: string; engine: string; draft: unknown }[]>(SQL.draftById, draftId, coachId);
  const r = rows[0];
  const d = r ? asDraft(r.draft) : null;
  return r && d ? { id: r.id, clientId: r.clientId, programId: r.programId, weekKey: r.weekKey, engine: r.engine, draft: d } : null;
}

export async function decisionsFor(db: RawDb, draftIds: readonly string[]): Promise<StoredDecision[]> {
  if (!draftIds.length) return [];
  const rows = await db.$queryRawUnsafe<(Omit<StoredDecision, 'decidedAt'> & { decidedAt: unknown })[]>(SQL.decisionsFor, [...draftIds]);
  return rows.map((r) => ({ ...r, decidedAt: iso(r.decidedAt), after: typeof r.after === 'string' ? safeJson(r.after) : r.after }));
}

export interface DecisionRecord {
  draftId: string;
  changeId: string;
  decision: Decision;
  actorId: string;
  programId: string;
  clientId: string;
  before: readonly DraftOp[] | null;
  after: readonly DraftOp[] | null;
  clientLine: string | null;
  note: string | null;
}

/** Claim the decision (the audit row) before anything is written. Its id, or null when this change was already decided. */
export async function claimDecision(db: RawDb, r: DecisionRecord): Promise<string | null> {
  const id = randomUUID();
  const n = await db.$executeRawUnsafe(
    SQL.claimDecision, id, r.draftId, r.changeId, r.decision, r.actorId, r.programId, r.clientId,
    r.before ? JSON.stringify(r.before) : null, r.after ? JSON.stringify(r.after) : null, r.clientLine, r.note,
  );
  return Number(n) > 0 ? id : null;
}

/** After a write that failed part-way: the decision says 'partial' and records what was written. */
export async function settleDecision(db: RawDb, id: string, decision: Decision, after: readonly DraftOp[]): Promise<void> {
  await db.$executeRawUnsafe(SQL.settleDecision, id, decision, JSON.stringify(after));
}

/** After a write that failed before anything was written: the claim goes, so the coach can try again. */
export async function dropClaim(db: RawDb, id: string, actorId: string): Promise<void> {
  await db.$executeRawUnsafe(SQL.dropClaim, id, actorId);
}

export interface ClientUpdate { id: string; decision: Decision; clientLine: string | null; note: string | null; decidedAt: string; programId: string }

/** The athlete's own approved updates since `since`, newest first; [] when the tables are not there. */
export async function clientUpdates(db: RawDb, clientId: string, since: Date, now: number = Date.now()): Promise<{ available: boolean; updates: ClientUpdate[] }> {
  if (!(await draftsReady(db, now))) return { available: false, updates: [] };
  try {
    const rows = await db.$queryRawUnsafe<(Omit<ClientUpdate, 'decidedAt'> & { decidedAt: unknown })[]>(SQL.clientUpdates, clientId, since);
    return { available: true, updates: rows.map((r) => ({ ...r, decidedAt: iso(r.decidedAt) })) };
  } catch (e) {
    probe.fail('coach_ai_draft_updates_failed', e, now);
    return { available: false, updates: [] };
  }
}
