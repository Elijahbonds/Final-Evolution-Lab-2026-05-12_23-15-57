// lib/coach/weeklyDraft/approve.ts — COACH-AI-DRAFT (2026-10-24): a coach's decision on a drafted change.
//
// NOTHING CHANGES A CLIENT'S PROGRAM UNTIL THE COACH APPROVES, and an approval writes through the program builder's own
// action (lib/coach/builderServer.ts builderAction) — the same path, the same checks (a certified coach, their own
// program and catalogue, the youth band and pin rules, the spec validator) as a coach typing it in. Before anything is
// written, every check below must pass; the first that fails answers, and nothing is written:
//   1. the drafts tables are there (the audit trail is not optional) — else 503 drafts_not_ready;
//   2. the draft is this coach's, the athlete is still on their LIVE roster, the program is still theirs and active;
//   3. the athlete still passes the teen gate (a guardian's consent can be withdrawn after the draft was made);
//   4. the change is in the draft and not decided yet (a second tap returns the first decision: idempotent);
//   5. an edit only touches sets, reps, load and band, and the edited change is classified again (./safety.ts) with the
//      week's guard and a FRESH read of the coach's catalogue — an edit cannot make a held change, and a change that has
//      become unsafe since (a row re-tagged as jump work) is refused; under youth rules the touched sessions' jump
//      contacts are read fresh too (YOUTH-CONTACT-CAP: at most MAX_TEEN_SESSION_CONTACTS a session);
//   6. every row is still exactly as drafted (no stale write over the coach's own later edit) and has no logged work;
//   7. every write validates (lib/coach/loop.ts validateExerciseSpec) before the first one is sent.
// Then the decision is CLAIMED in the audit table (who, when, before, after), the builder writes, and the coach's note,
// if any, goes to the athlete's thread as an ordinary message. A write that fails part-way leaves the decision 'partial'
// with what was written; one that fails before anything was written removes the claim so the coach can try again.

import type { PrismaClient } from '@/public/_prisma/client';
import { builderAction, type BuilderDb } from '../builderServer';
import { mergeSpecUpdate, validateExerciseSpec } from '../loop';
import { logHasContent } from '../setLog';
import { readTeenGate, type TeenGateDb } from '../teenGateServer';
import { isEffortBandId } from '../taxonomy';
import { sessionContacts } from './contacts';
import { classify } from './safety';
import { claimDecision, decisionsFor, draftById, draftsReady, dropClaim, settleDecision, type Decision, type RawDb, type StoredDecision } from './store';
import { NOTE_MAX_CHARS } from './thresholds';
import type { DraftCatalogueRow, DraftChange, DraftOp, OpFields } from './types';

export type ApproveDb = RawDb & BuilderDb & TeenGateDb & Pick<PrismaClient, 'coachClient' | 'programMessage'>;

export type DecideInput =
  | { draftId: string; changeId: string; decision: 'approve' | 'reject'; note?: string | null }
  | { draftId: string; changeId: string; decision: 'edit'; edits: EditFields[]; note?: string | null };

/** One update op's new numbers, by the op's index in the change. Anything not given keeps the drafted value. */
export interface EditFields { sets?: number; reps?: string; load?: string; effortBand?: string | null }

export type DecideResult =
  | { ok: true; decision: StoredDecision | { changeId: string; decision: Decision }; already: boolean; written: number }
  | { ok: false; status: number; error: string; why?: string };

const fail = (status: number, error: string, why?: string): DecideResult => ({ ok: false, status, error, ...(why ? { why } : {}) });

/** The request body → a DecideInput, or the reason it is refused. Unknown keys are refused, so nothing free-form is stored. */
export function parseDecideBody(body: unknown): { ok: true; input: DecideInput } | { ok: false; error: string } {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, error: 'bad_body' };
  const allowed = new Set(['draftId', 'changeId', 'decision', 'edits', 'note']);
  if (Object.keys(b).some((k) => !allowed.has(k))) return { ok: false, error: 'unexpected_field' };
  const draftId = typeof b.draftId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(b.draftId) ? b.draftId : null;
  const changeId = typeof b.changeId === 'string' && /^[a-z_]+-[a-z0-9]{1,13}$/.test(b.changeId) ? b.changeId : null;
  if (!draftId || !changeId) return { ok: false, error: 'draft_required' };
  const note = b.note == null ? null : typeof b.note === 'string' ? b.note.trim().slice(0, NOTE_MAX_CHARS) || null : undefined;
  if (note === undefined) return { ok: false, error: 'bad_note' };
  if (b.decision === 'approve' || b.decision === 'reject') return { ok: true, input: { draftId, changeId, decision: b.decision, note } };
  if (b.decision !== 'edit') return { ok: false, error: 'bad_decision' };
  if (!Array.isArray(b.edits) || b.edits.length > 20) return { ok: false, error: 'bad_edits' };
  const edits: EditFields[] = [];
  for (const e of b.edits) {
    const x = (e ?? {}) as Record<string, unknown>;
    if (typeof x !== 'object' || Object.keys(x).some((k) => !['sets', 'reps', 'load', 'effortBand'].includes(k))) return { ok: false, error: 'bad_edits' };
    const out: EditFields = {};
    if (x.sets !== undefined) { if (!Number.isInteger(x.sets) || (x.sets as number) < 1 || (x.sets as number) > 10) return { ok: false, error: 'bad_edits' }; out.sets = x.sets as number; }
    if (x.reps !== undefined) { if (typeof x.reps !== 'string' || !x.reps.trim() || x.reps.length > 24) return { ok: false, error: 'bad_edits' }; out.reps = x.reps.trim(); }
    if (x.load !== undefined) { if (typeof x.load !== 'string' || x.load.length > 24) return { ok: false, error: 'bad_edits' }; out.load = x.load.trim(); }
    if (x.effortBand !== undefined) { if (x.effortBand !== null && !isEffortBandId(x.effortBand)) return { ok: false, error: 'bad_edits' }; out.effortBand = x.effortBand as string | null; }
    edits.push(out);
  }
  return { ok: true, input: { draftId, changeId, decision: 'edit', edits, note } };
}

/** The change with the coach's edits applied to its update ops (by index). Adds and swaps keep what was drafted. */
export function withEdits(change: DraftChange, edits: readonly EditFields[]): DraftChange {
  let k = -1;
  const ops = change.ops.map((op) => {
    if (op.action !== 'update') return op;
    k += 1;
    const e = edits[k];
    if (!e) return op;
    const after: OpFields = { ...op.after, ...(e.sets !== undefined ? { sets: e.sets } : {}), ...(e.reps !== undefined ? { reps: e.reps } : {}), ...(e.load !== undefined ? { load: e.load } : {}), ...(e.effortBand !== undefined ? { effortBand: e.effortBand } : {}) };
    return { ...op, after };
  });
  return { ...change, ops };
}

/** The builder body for one op: only the fields the op changes, so the builder merges them over the stored row. */
export function builderBody(op: DraftOp): Record<string, unknown> {
  if (op.action === 'add') return { action: 'add', ...op.body };
  const body: Record<string, unknown> = { action: 'update', sessionExerciseId: op.sessionExerciseId };
  for (const k of ['exerciseId', 'sets', 'reps', 'load', 'effortBand'] as const) if (op.after[k] !== op.before[k]) body[k] = op.after[k];
  return body;
}

const same = (row: { exerciseId: string; sets: number; reps: string; load: string; effortBand: string | null }, f: OpFields) =>
  row.exerciseId === f.exerciseId && row.sets === f.sets && row.reps === f.reps && row.load === f.load && (row.effortBand ?? null) === (f.effortBand ?? null);

/** The coach's decision on one change (the module header has every check, in order). */
export async function decideChange(db: ApproveDb, coachId: string, input: DecideInput, now: number = Date.now()): Promise<DecideResult> {
  if (!(await draftsReady(db, now))) return fail(503, 'drafts_not_ready');
  const stored = await draftById(db, input.draftId, coachId);
  if (!stored) return fail(404, 'draft_not_found');
  const { draft } = stored;

  const link = await db.coachClient.findFirst({ where: { coachId, clientId: stored.clientId, endedAt: null }, select: { id: true } });
  if (!link) return fail(403, 'not_on_roster');
  const program = await db.coachingProgram.findUnique({ where: { id: stored.programId }, select: { id: true, coachId: true, clientId: true, isActive: true } });
  if (!program || program.coachId !== coachId || program.clientId !== stored.clientId || !program.isActive) return fail(409, 'program_changed');
  const gate = await readTeenGate(db, stored.clientId, new Date(now));
  if (!gate.ok) return fail(403, gate.error);

  const drafted = draft.changes.find((c) => c.id === input.changeId);
  if (!drafted) return fail(404, 'change_not_found');
  const prior = (await decisionsFor(db, [stored.id])).find((d) => d.changeId === drafted.id);
  if (prior) return { ok: true, decision: prior, already: true, written: 0 };

  const base = { draftId: stored.id, changeId: drafted.id, actorId: coachId, programId: stored.programId, clientId: stored.clientId, note: input.note ?? null };
  if (input.decision === 'reject') {
    const id = await claimDecision(db, { ...base, decision: 'rejected', before: drafted.ops, after: null, clientLine: null });
    if (!id) return alreadyDecided(db, stored.id, drafted.id);
    return { ok: true, decision: { changeId: drafted.id, decision: 'rejected' }, already: false, written: 0 };
  }

  const change = input.decision === 'edit' ? withEdits(drafted, input.edits) : drafted;
  // 5. judged again, by what it writes now, against the week's guard and the coach's catalogue as it is today
  const catalogue = await db.programExercise.findMany({ where: { coachId }, select: { id: true, name: true, category: true, pattern: true, skillLayer: true, regressionOfId: true, progressionOfId: true } });
  const youth = gate.band === 'teen' || draft.guard.youth;
  const catMap = new Map(catalogue.map((r) => [r.id, r as unknown as DraftCatalogueRow]));
  // YOUTH-CONTACT-CAP: under youth rules, each touched session's jump contacts as its rows are NOW (other approved
  // changes and the coach's own edits included), so the edited change is judged against the real session
  let contacts: Record<string, number> | undefined;
  if (youth) {
    contacts = {};
    for (const sid of new Set(change.ops.flatMap((op) => (op.action === 'update' ? [op.sessionId] : [])))) {
      const rows = await db.sessionExercise.findMany({ where: { sessionId: sid }, select: { exerciseId: true, sets: true, reps: true } });
      contacts[sid] = sessionContacts(rows, catMap);
    }
  }
  const s = classify(change, {
    ...draft.guard, youth, formDropPatterns: new Set(draft.guard.formDropPatterns),
    catalogue: catMap,
    ...(contacts ? { sessionContacts: contacts } : {}),
  });
  if (s.safety === 'unsafe') return fail(input.decision === 'edit' ? 400 : 409, input.decision === 'edit' ? 'edit_unsafe' : 'no_longer_safe', s.why ?? undefined);

  // 6 + 7. every row as drafted, nothing logged on it, every write valid — before the first write
  const completed = new Set((await db.clientSession.findMany({ where: { programId: stored.programId, clientId: stored.clientId, completedAt: { not: null } }, select: { sessionId: true } })).map((c) => c.sessionId));
  const writes: DraftOp[] = [];
  for (const op of change.ops) {
    if (op.action === 'update') {
      const se = await db.sessionExercise.findUnique({ where: { id: op.sessionExerciseId }, include: { session: { include: { block: true } } } });
      if (!se || se.session.block.programId !== stored.programId || !same(se, op.before)) return fail(409, 'draft_stale');
      const logs = await db.exerciseLog.findMany({
        where: { sessionExerciseId: se.id },
        select: { id: true, actualSets: true, actualReps: true, actualLoad: true, rpe: true, clientNote: true, videoUrl: true, coachComment: true, setLogs: { select: { id: true }, take: 1 } },
      });
      if (logs.some(logHasContent)) return fail(409, 'exercise_logged');
      const v = validateExerciseSpec(mergeSpecUpdate(se, builderBody(op)));
      if (!v.ok) return fail(400, String(v.error));
      writes.push(op);
    } else {
      if (completed.has(op.sessionId)) return fail(409, 'draft_stale');
      const inSession = await db.sessionExercise.findMany({ where: { sessionId: op.sessionId }, select: { exerciseId: true } });
      if (inSession.some((e) => e.exerciseId === op.exerciseId)) continue; // already there (added by hand): nothing to write
      const v = validateExerciseSpec({ ...op.body, exerciseId: op.exerciseId });
      if (!v.ok) return fail(400, String(v.error));
      writes.push(op);
    }
  }

  const decision: Decision = input.decision === 'edit' ? 'edited' : 'approved';
  const claim = await claimDecision(db, { ...base, decision, before: drafted.ops, after: change.ops, clientLine: change.clientLine });
  if (!claim) return alreadyDecided(db, stored.id, drafted.id);
  const written: DraftOp[] = [];
  for (const op of writes) {
    let r: Awaited<ReturnType<typeof builderAction>>;
    try {
      r = await builderAction(db, coachId, stored.programId, builderBody(op));
    } catch (e) {
      r = { ok: false, status: 500, error: e instanceof Error ? e.name : 'write_failed' };
    }
    if (!r.ok) {
      if (written.length) await settleDecision(db, claim, 'partial', written);
      else await dropClaim(db, claim, coachId);
      return fail(r.status === 500 ? 500 : 409, written.length ? 'partially_written' : r.error);
    }
    written.push(op);
  }
  if (input.note) await postNote(db, stored.programId, coachId, input.note);
  return { ok: true, decision: { changeId: drafted.id, decision }, already: false, written: written.length };
}

async function alreadyDecided(db: ApproveDb, draftId: string, changeId: string): Promise<DecideResult> {
  const d = (await decisionsFor(db, [draftId])).find((x) => x.changeId === changeId);
  return d ? { ok: true, decision: d, already: true, written: 0 } : fail(409, 'decision_conflict');
}

/** The coach's note, as an ordinary message on the program's thread (the athlete's Today shows the thread). */
async function postNote(db: ApproveDb, programId: string, coachId: string, note: string): Promise<void> {
  try {
    await db.programMessage.create({ data: { programId, authorId: coachId, body: note.slice(0, NOTE_MAX_CHARS) } });
  } catch (e) {
    console.error('[coach/drafts] note not posted', e instanceof Error ? e.name : 'unknown');
  }
}

export interface ApproveAllResult { approved: string[]; skipped: { changeId: string; error: string }[] }

/** "Approve all safe": every SAFE change in the draft not yet decided, one by one through decideChange; one note at the end. */
export async function approveAllSafe(db: ApproveDb, coachId: string, draftId: string, note: string | null, now: number = Date.now()): Promise<{ ok: true; result: ApproveAllResult } | { ok: false; status: number; error: string }> {
  if (!(await draftsReady(db, now))) return { ok: false, status: 503, error: 'drafts_not_ready' };
  const stored = await draftById(db, draftId, coachId);
  if (!stored) return { ok: false, status: 404, error: 'draft_not_found' };
  const decided = new Set((await decisionsFor(db, [draftId])).map((d) => d.changeId));
  const result: ApproveAllResult = { approved: [], skipped: [] };
  for (const c of stored.draft.changes) {
    if (c.safety !== 'safe' || decided.has(c.id)) continue;
    const r = await decideChange(db, coachId, { draftId, changeId: c.id, decision: 'approve' }, now);
    if (r.ok && !r.already) result.approved.push(c.id);
    else if (!r.ok) {
      result.skipped.push({ changeId: c.id, error: r.error });
      // the whole draft is refused for the same reason every time (the roster, the program, the gate): stop at the first
      if (['not_on_roster', 'program_changed', 'guardian_consent_required', 'under_13', 'age_required'].includes(r.error)) return { ok: false, status: r.status, error: r.error };
    }
  }
  if (note && result.approved.length) await postNote(db, stored.programId, coachId, note);
  return { ok: true, result };
}
