// lib/program-ask/accountStore.ts — PROGRAM-ASK-2 (2026-11-03): an adult's "Build my program" plan on their account, in raw SQL.
//
// THE TABLE IS NOT ON PRODUCTION YET: it arrives with prisma/pending/2026-11-03-program-ask.sql, which the owner applies.
// Until then (and in CI) every read answers "not ready" and every write answers null, and nothing 500s: the page keeps
// the plan on the phone (./device.ts), as it always did. The probe is the shared one (lib/coach/pendingSchema.ts):
// applying the SQL switches account save on within ~5 minutes, with no deploy. Every statement is parameterised; nothing
// from a request is put into SQL text, and every value is shaped here before it is written. Ids: node:crypto randomUUID.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import type { Decision } from './checkpoint';
import { MAX_ASK_CHARS, type RequestEdits } from './request';

export type { RawDb };

const probe = pendingProbe('program_ask', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'AskedProgram' LIMIT 1`);

export const programAskReady = (db: RawDb, now: number = Date.now()): Promise<boolean> => probe.ready(db, now);
/** Tests only. */
export const resetProgramAskProbe = (): void => probe.reset();

const COLS = `"id", "userId", "question", "edits", "programId", "done", "decisions", "startedAt", "updatedAt"`;

export const SQL = {
  read: `SELECT ${COLS} FROM "AskedProgram" WHERE "userId" = $1`,
  // one row per account: a new plan replaces the old one (its done marks go with it); the same plan keeps them
  save:
    `INSERT INTO "AskedProgram" (${COLS}) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC')) ` +
    `ON CONFLICT ("userId") DO UPDATE SET "question" = EXCLUDED."question", "edits" = EXCLUDED."edits", "programId" = EXCLUDED."programId", ` +
    `"done" = CASE WHEN "AskedProgram"."programId" = EXCLUDED."programId" THEN "AskedProgram"."done" || EXCLUDED."done" ELSE EXCLUDED."done" END, ` +
    `"decisions" = CASE WHEN "AskedProgram"."programId" = EXCLUDED."programId" AND jsonb_array_length(EXCLUDED."decisions") < jsonb_array_length("AskedProgram"."decisions") THEN "AskedProgram"."decisions" ELSE EXCLUDED."decisions" END, ` +
    `"startedAt" = CASE WHEN "AskedProgram"."programId" = EXCLUDED."programId" THEN "AskedProgram"."startedAt" ELSE EXCLUDED."startedAt" END, ` +
    `"updatedAt" = EXCLUDED."updatedAt"`,
  forget: `DELETE FROM "AskedProgram" WHERE "userId" = $1`,
} as const;

export interface AccountProgram { question: string; edits: RequestEdits; programId: string; done: Record<string, string>; decisions: Decision[]; startedAt: string; updatedAt: string }

const SESSION = /^w\d{1,2}:d\d$/;
const KINDS = new Set(['advance', 'repeat', 'repeat-lighter']);
const EDIT_KEYS = new Set(['equipment', 'tension', 'goal', 'days', 'minutes', 'level', 'weeks', 'age']);
const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return (v ?? fallback) as T;
};
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : new Date(0).toISOString());

/** What may be written: the shapes the page sends, and nothing else (a hostile body is cut to these). */
export function shapeSave(body: unknown): Omit<AccountProgram, 'startedAt' | 'updatedAt'> | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.question !== 'string' || !b.question.trim() || typeof b.programId !== 'string' || !/^[a-z0-9]{1,16}$/.test(b.programId)) return null;
  const edits: RequestEdits = {};
  for (const [k, v] of Object.entries((b.edits && typeof b.edits === 'object' ? b.edits : {}) as Record<string, unknown>)) {
    if (EDIT_KEYS.has(k) && (typeof v === 'number' || (typeof v === 'string' && v.length <= 60))) (edits as Record<string, unknown>)[k] = v;
  }
  const done: Record<string, string> = {};
  for (const [k, v] of Object.entries((b.done && typeof b.done === 'object' ? b.done : {}) as Record<string, unknown>).slice(0, 200)) {
    if (SESSION.test(k) && typeof v === 'string' && !Number.isNaN(Date.parse(v))) done[k] = new Date(v).toISOString();
  }
  const decisions = (Array.isArray(b.decisions) ? b.decisions : []).slice(0, 12)
    .filter((d): d is Decision => !!d && typeof d === 'object' && Number.isInteger((d as Decision).afterWeek) && (d as Decision).afterWeek > 0 && (d as Decision).afterWeek < 40 && KINDS.has((d as Decision).kind))
    .map((d) => ({ afterWeek: d.afterWeek, kind: d.kind }));
  return { question: b.question.trim().slice(0, MAX_ASK_CHARS), edits, programId: b.programId, done, decisions };
}

export async function readAccountProgram(db: RawDb, userId: string): Promise<AccountProgram | null | 'not_ready'> {
  if (!(await probe.ready(db))) return 'not_ready';
  try {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(SQL.read, userId);
    const r = rows?.[0];
    if (!r) return null;
    return {
      question: String(r.question ?? ''), edits: json(r.edits, {}), programId: String(r.programId ?? ''), done: json(r.done, {}),
      decisions: json(r.decisions, []), startedAt: iso(r.startedAt), updatedAt: iso(r.updatedAt),
    };
  } catch (e) {
    probe.fail('program_ask_read_failed', e);
    return 'not_ready';
  }
}

export async function saveAccountProgram(db: RawDb, userId: string, v: Omit<AccountProgram, 'startedAt' | 'updatedAt'>): Promise<boolean | 'not_ready'> {
  if (!(await probe.ready(db))) return 'not_ready';
  try {
    await db.$executeRawUnsafe(SQL.save, randomUUID(), userId, v.question, JSON.stringify(v.edits), v.programId, JSON.stringify(v.done), JSON.stringify(v.decisions));
    return true;
  } catch (e) {
    probe.fail('program_ask_save_failed', e);
    return false;
  }
}

export async function forgetAccountProgram(db: RawDb, userId: string): Promise<boolean | 'not_ready'> {
  if (!(await probe.ready(db))) return 'not_ready';
  try { await db.$executeRawUnsafe(SQL.forget, userId); return true; } catch (e) { probe.fail('program_ask_forget_failed', e); return false; }
}
