// The coaching loop — pure logic behind /api/coach/* (SPEC-PASSION-PIPELINES lane 1, C1–C3). Babylon-free, Prisma-free,
// so it runs as tests: which session is "today", what a valid log or exercise spec looks like, who may touch a program,
// and how a client's logs become a progress series. The routes stay thin.
import type { SessionSection } from '@/public/_prisma/client';
import { STRUCTURE_DEFAULTS, validateStructure, type CleanStructure, type StructureError, type StructureInput } from './structure';
import { validateSets, type CleanSet } from './setLog';

/**
 * One prescribed exercise as every reader sees it. MIRROR-COACH P2 (2026-09-25) added the session-structure fields
 * (lib/coach/structure.ts) and `exerciseId` — the catalogue row it prescribes, which the builder's edit and the
 * round-trip need and which was never sent before.
 */
export interface TreeExercise {
  id: string; order: number; exerciseId: string; name: string; sets: number; reps: string; load: string; tempo: string; restSeconds: number; coachNote: string | null;
  section: SessionSection; isKeySet: boolean; supersetGroup: string | null; workSeconds: number | null; holdSeconds: number | null; setupCues: string[]; effortBand: string | null;
}
export interface TreeSession { id: string; order: number; label: string; exercises: TreeExercise[] }
export interface TreeBlock { id: string; order: number; label: string; targetDate: string | null; sessions: TreeSession[] }
export interface ProgramTree { id: string; name: string; coachId: string; clientId: string; blocks: TreeBlock[] }

/**
 * One SessionExercise row (with its catalogue row's name) as a TreeExercise. MIRROR-COACH P2 (2026-09-25): carries the
 * session-structure columns and the exerciseId. A row read from a database the P2 push has not reached yet (or a
 * test fixture written before it) has none of them, so each falls back to the schema default — a plain Key-section
 * exercise, exactly what it was.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function treeExercise(e: any): TreeExercise {
  return {
    id: e.id, order: e.order, exerciseId: e.exerciseId, name: e.exercise.name, sets: e.sets, reps: e.reps, load: e.load, tempo: e.tempo, restSeconds: e.restSeconds, coachNote: e.coachNote,
    section: e.section ?? STRUCTURE_DEFAULTS.section, isKeySet: e.isKeySet ?? false, supersetGroup: e.supersetGroup ?? null,
    workSeconds: e.workSeconds ?? null, holdSeconds: e.holdSeconds ?? null, setupCues: Array.isArray(e.setupCues) ? [...e.setupCues] : [], effortBand: e.effortBand ?? null,
  };
}

export type ProgramRole = 'coach' | 'client' | null;
export function accessRole(program: { coachId: string; clientId: string }, userId: string): ProgramRole {
  if (program.coachId === userId) return 'coach';
  if (program.clientId === userId) return 'client';
  return null;
}

/** Sessions in program order: block.order, then session.order. */
export function orderedSessions(tree: ProgramTree): { block: TreeBlock; session: TreeSession; index: number }[] {
  const out: { block: TreeBlock; session: TreeSession; index: number }[] = [];
  for (const b of [...tree.blocks].sort((x, y) => x.order - y.order)) {
    for (const s of [...b.sessions].sort((x, y) => x.order - y.order)) out.push({ block: b, session: s, index: out.length });
  }
  return out;
}

/** "Today" = the first session the client has not completed. null when the program is done. */
export function nextSession(tree: ProgramTree, completedSessionIds: Iterable<string>): { block: TreeBlock; session: TreeSession; index: number; total: number } | null {
  const done = new Set(completedSessionIds);
  const all = orderedSessions(tree);
  const hit = all.find((x) => !done.has(x.session.id));
  return hit ? { ...hit, total: all.length } : null;
}

export interface LogInput { sessionExerciseId?: unknown; actualSets?: unknown; actualReps?: unknown; actualLoad?: unknown; rpe?: unknown; clientNote?: unknown; videoUrl?: unknown; sets?: unknown }
/**
 * A cleaned log entry. MIRROR-COACH P2 (2026-09-25): `sets` is the per-set list (lib/coach/setLog.ts) — null when
 * the caller sent none (an old client; its typed per-exercise columns are kept as before), otherwise the complete list
 * for that exercise, from which the per-exercise columns are derived at save (setLog.ts summaryToWrite).
 */
export interface CleanLog { sessionExerciseId: string; actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null; clientNote: string | null; videoUrl: string | null; sets: CleanSet[] | null }

const str = (v: unknown, max: number): string | null => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : null; };
const int = (v: unknown, lo: number, hi: number): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };
const url = (v: unknown): string | null => { const s = str(v, 500); return s && /^https?:\/\/[^\s]+$/i.test(s) ? s : null; };

/**
 * A client's log entry, cleaned; rejects when the exercise id is missing. The old per-exercise numbers are clamped as
 * they always were; a per-set value out of range is REFUSED with its own error and the 1-based `set` it came from
 * (lib/coach/setLog.ts validateSets), because a set is a number the client typed and a clamped one is not theirs.
 */
export function validateLog(input: LogInput): { ok: true; log: CleanLog } | { ok: false; error: string; set?: number } {
  const sessionExerciseId = str(input.sessionExerciseId, 64);
  if (!sessionExerciseId) return { ok: false, error: 'session_exercise_required' };
  const sets = validateSets(input.sets);
  if (!sets.ok) return { ok: false, error: sets.error, ...(sets.set ? { set: sets.set } : {}) };
  return { ok: true, log: {
    sessionExerciseId,
    actualSets: int(input.actualSets, 0, 20), actualReps: str(input.actualReps, 24), actualLoad: str(input.actualLoad, 24),
    rpe: int(input.rpe, 1, 10), clientNote: str(input.clientNote, 500), videoUrl: url(input.videoUrl),
    sets: sets.sets,
  } };
}

export interface ExerciseSpecInput extends StructureInput { exerciseId?: unknown; sets?: unknown; reps?: unknown; load?: unknown; tempo?: unknown; restSeconds?: unknown; coachNote?: unknown }
export interface CleanExerciseSpec extends CleanStructure { exerciseId: string; sets: number; reps: string; load: string; tempo: string; restSeconds: number; coachNote: string | null }

/**
 * A coach's prescription for one exercise in a session (sets 1–10, rest 0–600 s, tempo like 3-1-1-0), plus the
 * session-structure fields (MIRROR-COACH P2: section, key set, superset, work/hold seconds, set-up cues, effort
 * band — lib/coach/structure.ts refuses a value outside its list with that field's own error).
 *
 * A TIMED item's reps text always states its seconds: "30 s", or the coach's own text when it starts with them ("30 s
 * each side"). Anything else — no reps, the schema's "8-10", a text left over from before the timer changed — is
 * replaced with "<seconds> s", so every reader that predates workSeconds (the inbox's "prescribed" line, /training's
 * step-through) shows the dose the timer will run. Found live on :3131 (2026-09-25): a carry added from the builder's
 * add row and then timed kept "8-10", and read "3×8-10" everywhere but the builder.
 */
export function validateExerciseSpec(input: ExerciseSpecInput): { ok: true; spec: CleanExerciseSpec } | { ok: false; error: string | StructureError } {
  const exerciseId = str(input.exerciseId, 64);
  if (!exerciseId) return { ok: false, error: 'exercise_required' };
  const tempo = str(input.tempo, 12) ?? '3-1-1-0';
  if (!/^\d+-\d+-\d+-\d+$/.test(tempo)) return { ok: false, error: 'tempo_format' };
  const st = validateStructure(input);
  if (!st.ok) return st;
  const typed = str(input.reps, 24);
  const ws = st.structure.workSeconds;
  // MIRROR-COACH P2 review (2026-09-26): a per-side (or any) text after the seconds SURVIVES a change of timer — "30 s
  // each side" with the timer moved to 40 is "40 s each side". It became "40 s", and the builder hid the reps box for
  // timed items, so the coach could neither see nor restore the "each side".
  const tail = typed ? /^\d+\s*s\b\s*(.*)$/i.exec(typed)?.[1]?.trim() ?? '' : '';
  const reps = ws ? (typed && typed.startsWith(`${ws} s`) ? typed : tail ? `${ws} s ${tail}`.slice(0, 24) : `${ws} s`) : (typed ?? '8-10');
  // …and a load the coach CLEARED is no load. It was "RPE7" (the schema default) whether the box was blank or not sent,
  // so a breath drill read "@ RPE7" and a cleared load came back. Not sent at all (an API caller that predates the
  // builder) still gets the default.
  const load = input.load === undefined ? 'RPE7' : str(input.load, 24) ?? '';
  return { ok: true, spec: {
    exerciseId, sets: int(input.sets, 1, 10) ?? 3, reps, load,
    tempo, restSeconds: int(input.restSeconds, 0, 600) ?? 90, coachNote: str(input.coachNote, 300),
    ...st.structure,
  } };
}

/**
 * The stored prescription as a spec input, so an EDIT can send only what changed. The builder's 'update' used to
 * run the body alone through validateExerciseSpec, which filled every field the body left out with its default: an
 * update that sent only `sets: 4` also reset reps to "8-10", load to "RPE7", rest to 90 s and wiped the coach note.
 * The route now merges the body over this.
 */
export function specInputFromRow(row: Partial<CleanExerciseSpec> & { exerciseId: string }): ExerciseSpecInput {
  return {
    exerciseId: row.exerciseId, sets: row.sets, reps: row.reps, load: row.load, tempo: row.tempo, restSeconds: row.restSeconds, coachNote: row.coachNote,
    section: row.section ?? STRUCTURE_DEFAULTS.section, isKeySet: row.isKeySet ?? STRUCTURE_DEFAULTS.isKeySet,
    supersetGroup: row.supersetGroup ?? null, workSeconds: row.workSeconds ?? null, holdSeconds: row.holdSeconds ?? null,
    setupCues: row.setupCues ?? [], effortBand: row.effortBand ?? null,
  };
}

/**
 * An edit: the body's fields over the stored row. Two follow-ons a coach would otherwise trip on:
 *   · moving the key set OUT of the Key section clears the flag (instead of refusing the move as key_set_outside_key);
 *   · turning a timed dose on or off with no reps typed re-derives the reps text ("30 s" ↔ the default), so the old
 *     readers never show "3 × 8-10" for a 30-second carry.
 */
export function mergeSpecUpdate(row: Partial<CleanExerciseSpec> & { exerciseId: string }, body: Record<string, unknown>): ExerciseSpecInput {
  const merged: ExerciseSpecInput & Record<string, unknown> = { ...specInputFromRow(row) };
  for (const [k, v] of Object.entries(body)) if (v !== undefined && k !== 'action' && k !== 'sessionExerciseId' && k !== 'sessionId') merged[k] = v;
  if (body.section !== undefined && body.isKeySet === undefined && merged.section !== 'key') merged.isKeySet = false;
  if (body.workSeconds !== undefined && body.reps === undefined) {
    const timedNow = !(body.workSeconds === null || body.workSeconds === '');
    // a stored "30 s each side" is kept for the validator to re-time ("40 s each side"); only a bare "30 s" is re-derived
    const withTail = /^\d+\s*s\b\s*\S/i.test(String(row.reps ?? ''));
    if ((timedNow && !withTail) || /^\d+ s$/.test(String(row.reps ?? ''))) delete merged.reps;
  }
  return merged;
}

export interface LogRow { exerciseName: string; completedAt: string | Date | null; actualLoad: string | null; actualReps: string | null; rpe: number | null }
export interface ProgressPoint { at: string; load: number | null; reps: number | null; rpe: number | null }

/** Leading number of a load/reps string ("225 lbs" → 225, "8-10" → 8, "RPE7" → null). */
export function leadingNumber(s: string | null): number | null {
  if (!s) return null;
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) : null;
}

/** Per-exercise time series for the progress chart, oldest first, completed logs only. */
export function progressSeries(logs: LogRow[]): Record<string, ProgressPoint[]> {
  const out: Record<string, ProgressPoint[]> = {};
  for (const l of logs) {
    if (!l.completedAt) continue;
    const at = typeof l.completedAt === 'string' ? l.completedAt : l.completedAt.toISOString();
    (out[l.exerciseName] ??= []).push({ at, load: leadingNumber(l.actualLoad), reps: leadingNumber(l.actualReps), rpe: l.rpe });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

/** Completed client sessions with at least one log the coach has not commented on. */
export function needsReview(sessions: { completedAt: string | Date | null; logs: { coachComment: string | null }[] }[]): number {
  return sessions.filter((s) => s.completedAt && s.logs.some((l) => !l.coachComment)).length;
}

export function validateMessage(body: unknown): string | null {
  const s = str(body, 2000);
  return s;
}
