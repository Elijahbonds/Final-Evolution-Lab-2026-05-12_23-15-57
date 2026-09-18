// The coaching loop — pure logic behind /api/coach/* (SPEC-PASSION-PIPELINES lane 1, C1–C3). Babylon-free, Prisma-free,
// so it runs as tests: which session is "today", what a valid log or exercise spec looks like, who may touch a program,
// and how a client's logs become a progress series. The routes stay thin.

export interface TreeExercise { id: string; order: number; name: string; sets: number; reps: string; load: string; tempo: string; restSeconds: number; coachNote: string | null }
export interface TreeSession { id: string; order: number; label: string; exercises: TreeExercise[] }
export interface TreeBlock { id: string; order: number; label: string; targetDate: string | null; sessions: TreeSession[] }
export interface ProgramTree { id: string; name: string; coachId: string; clientId: string; blocks: TreeBlock[] }

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

export interface LogInput { sessionExerciseId?: unknown; actualSets?: unknown; actualReps?: unknown; actualLoad?: unknown; rpe?: unknown; clientNote?: unknown; videoUrl?: unknown }
export interface CleanLog { sessionExerciseId: string; actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null; clientNote: string | null; videoUrl: string | null }

const str = (v: unknown, max: number): string | null => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s.slice(0, max) : null; };
const int = (v: unknown, lo: number, hi: number): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };
const url = (v: unknown): string | null => { const s = str(v, 500); return s && /^https?:\/\/[^\s]+$/i.test(s) ? s : null; };

/** A client's log entry, clamped and cleaned; rejects when the exercise id is missing. */
export function validateLog(input: LogInput): { ok: true; log: CleanLog } | { ok: false; error: string } {
  const sessionExerciseId = str(input.sessionExerciseId, 64);
  if (!sessionExerciseId) return { ok: false, error: 'session_exercise_required' };
  return { ok: true, log: {
    sessionExerciseId,
    actualSets: int(input.actualSets, 0, 20), actualReps: str(input.actualReps, 24), actualLoad: str(input.actualLoad, 24),
    rpe: int(input.rpe, 1, 10), clientNote: str(input.clientNote, 500), videoUrl: url(input.videoUrl),
  } };
}

export interface ExerciseSpecInput { exerciseId?: unknown; sets?: unknown; reps?: unknown; load?: unknown; tempo?: unknown; restSeconds?: unknown; coachNote?: unknown }
export interface CleanExerciseSpec { exerciseId: string; sets: number; reps: string; load: string; tempo: string; restSeconds: number; coachNote: string | null }

/** A coach's prescription for one exercise in a session (sets 1–10, rest 0–600 s, tempo like 3-1-1-0). */
export function validateExerciseSpec(input: ExerciseSpecInput): { ok: true; spec: CleanExerciseSpec } | { ok: false; error: string } {
  const exerciseId = str(input.exerciseId, 64);
  if (!exerciseId) return { ok: false, error: 'exercise_required' };
  const tempo = str(input.tempo, 12) ?? '3-1-1-0';
  if (!/^\d+-\d+-\d+-\d+$/.test(tempo)) return { ok: false, error: 'tempo_format' };
  return { ok: true, spec: {
    exerciseId, sets: int(input.sets, 1, 10) ?? 3, reps: str(input.reps, 24) ?? '8-10', load: str(input.load, 24) ?? 'RPE7',
    tempo, restSeconds: int(input.restSeconds, 0, 600) ?? 90, coachNote: str(input.coachNote, 300),
  } };
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
