'use client';
// CoachSessionPlayer — PLAT-P06 (2026-10-28): a coach's session in the phase-1 player. Owner, 2026-10-27: "autoplay, no
// extra taps, never confusing". Start on Today opens it; it plays like a signature session (the same SessionPlayer, the
// same machine), with what a coached session adds:
//
//   · the coach's reply on top of the first exercise while the ready count runs (lib/coach/coachReply.ts);
//   · FEL's warm-up first and FEL's cool-down last, when Today shows them (lib/session-player/fromCoachToday.ts);
//   · SET LOGGING. Set done is the log: the set is written into Today's own drafts (lib/coach/setLog.ts SetDraft — the
//     same rows the full session's SetLogger edits, one source of truth) with this session's set before it, else the plan
//     (assumption: Set done means "done as written"; the owner may prefer blank-until-typed, see the report). During the
//     rest the row is open inline (components/coach/set-logger.tsx, one row, reps and weight) to change. The finish posts
//     the existing log route (complete), then the existing cool-down route when FEL's cool-down ran. Teen and simple
//     logging rules are the route's and the logger's, unchanged;
//   · SEND TO COACH: after a set of an exercise the camera can read, with sets still to go, the rest offers the existing
//     film link (components/coach/form-review/film-set-link.tsx, cue-rewrite's words, wrapped). It is shown to an adult
//     reader only (youth rules hide it here; the form-review route's own gates still decide: adults, opt-in per send,
//     pose data only). Leaving to film saves the sets so far and remembers where the session stood, so coming back
//     resumes it with no tap (resumeKey).
import { useCallback, useMemo, useRef } from 'react';
import { SessionPlayer, type FinishResult } from '@/components/session-player/session-player';
import { SetLogger } from '@/components/coach/set-logger';
import { FilmSetLink } from '@/components/coach/form-review/film-set-link';
import { reviewMovementFor } from '@/lib/coach/formReview/movements';
import { leadingNumber } from '@/lib/coach/loop';
import { draftIsEmpty, emptySetDraft, type SetDraft, type WeightUnit } from '@/lib/coach/setLog';
import { repsPlaceholder, simpleLogging, type TodayExercise } from '@/lib/coach/today';
import { slotSet, type CoachSession } from '@/lib/session-player/fromCoachToday';
import type { PlayerState } from '@/lib/session-player/machine';
import type { Session } from '@/lib/session-player/model';
import type { CoachReply } from '@/lib/coach/coachReply';
import { COACH_PLAYER_COPY as C } from './coach-copy';
import { CoachReplyCard } from './coach-reply';
import { COACH_LOOK as L } from './coach-look';

/** Where a coached session stood when the athlete left it to film a set (sessionStorage: this tab only). */
export const RESUME_KEY = 'fel.coachPlayer.resume';
/** A remembered position older than this opens Today, not the player. (new) */
export const RESUME_MAX_MINUTES = 60;

export interface ResumePoint { sessionId: string; step: number; set: number; setsDone: number; elapsedMs: number; at: number }

export function readResume(sessionId: string, now: number = Date.now()): ResumePoint | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as ResumePoint;
    if (r.sessionId !== sessionId || !(now - r.at < RESUME_MAX_MINUTES * 60_000)) return null;
    return r;
  } catch { return null; }
}
export function writeResume(r: ResumePoint | null): void {
  try { if (r) sessionStorage.setItem(RESUME_KEY, JSON.stringify(r)); else sessionStorage.removeItem(RESUME_KEY); } catch { /* storage blocked: Today opens instead */ }
}

/** The player's state for a remembered position: the ready count over that set, so it starts by itself. */
export function resumeState(r: ResumePoint, readySeconds = 5): PlayerState {
  return { phase: 'ready', step: r.step, set: r.set, leftMs: readySeconds * 1000, fullMs: readySeconds * 1000, paused: false, elapsedMs: r.elapsedMs, setsDone: r.setsDone };
}

/** The set before (step, set) in the walk — the one just done, during a rest. */
export function previousPosition(session: Pick<Session, 'steps'>, step: number, set: number): { step: number; set: number } | null {
  if (set > 1) return { step, set: set - 1 };
  return step > 0 ? { step: step - 1, set: Math.max(1, session.steps[step - 1].sets) } : null;
}

/** What Set done writes into a blank row: this session's set before it, else the plan (a timed row: its seconds). */
export function prefillRow(e: Pick<TodayExercise, 'reps' | 'workSeconds' | 'coaching'>, rows: readonly SetDraft[], index: number): SetDraft {
  const have = rows[index];
  if (have && !draftIsEmpty(have)) return have;
  const before = index > 0 ? rows[index - 1] : null;
  const base = emptySetDraft();
  if (typeof e.workSeconds === 'number' && e.workSeconds > 0) return { ...base, workSeconds: before?.workSeconds || String(e.workSeconds) };
  const planned = leadingNumber(repsPlaceholder(e.reps ?? ''));
  const reps = before && before.reps.trim() ? before.reps : planned !== null ? String(planned) : '';
  return { ...base, reps, weight: simpleLogging(e) ? '' : before?.weight ?? '' };
}

export interface CoachSessionPlayerProps {
  coach: CoachSession;
  exercises: readonly TodayExercise[];
  drafts: Readonly<Record<string, { sets: SetDraft[] }>>;
  unit: WeightUnit;
  /** An off day logs minutes or reps only. */
  simpleLog: boolean;
  reply: CoachReply | null;
  /** Write one slot's rows into Today's drafts. */
  onRows: (slot: string, rows: SetDraft[]) => void;
  /** Save the drafts. `complete`: the session is done (and `cooldown`: FEL's cool-down ran). `keepalive`: leaving the page. */
  save: (o: { complete: boolean; cooldown: boolean; keepalive?: boolean }) => Promise<FinishResult>;
  onClose: () => void;
  initial?: PlayerState;
}

export function CoachSessionPlayer({ coach, exercises, drafts, unit, simpleLog, reply, onRows, save, onClose, initial }: CoachSessionPlayerProps) {
  const bySlot = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const stateRef = useRef<PlayerState | null>(initial ?? null);
  const finished = useRef(false);
  // rows Set done filled in (slot:index): a Back that undoes the set clears them again; a row the athlete typed stays
  const filled = useRef(new Set<string>());

  // Set done: the set just done is logged (a blank row gets the prefill); the machine has moved on, so read it back
  const onState = useCallback((s: PlayerState) => {
    const prev = stateRef.current;
    stateRef.current = s;
    if (!prev) return;
    if (s.setsDone < prev.setsDone && s.phase === 'work') {
      const back = slotSet(coach.refs, s.step, s.set);
      const key = back ? `${back.slot}:${back.index}` : '';
      if (back && filled.current.has(key)) {
        filled.current.delete(key);
        const rows = [...(draftsRef.current[back.slot]?.sets ?? [])];
        if (rows[back.index]) { rows[back.index] = emptySetDraft(); onRows(back.slot, rows); }
      }
      return;
    }
    if (s.setsDone <= prev.setsDone || prev.phase !== 'work') return;
    const at = slotSet(coach.refs, prev.step, prev.set);
    const e = at ? bySlot.get(at.slot) : null;
    if (!at || !e) return;
    const rows = [...(draftsRef.current[at.slot]?.sets ?? [])];
    while (rows.length <= at.index) rows.push(emptySetDraft());
    if (!rows[at.index] || draftIsEmpty(rows[at.index])) filled.current.add(`${at.slot}:${at.index}`);
    rows[at.index] = prefillRow(e, rows, at.index);
    onRows(at.slot, rows);
  }, [coach.refs, bySlot, onRows]);

  const leaveToFilm = useCallback(() => {
    const s = stateRef.current;
    if (s) writeResume({ sessionId: coach.session.id, step: s.step, set: s.set, setsDone: s.setsDone, elapsedMs: s.elapsedMs, at: Date.now() });
    void save({ complete: false, cooldown: false, keepalive: true });
  }, [coach.session.id, save]);

  const finish = useCallback(async (): Promise<FinishResult> => {
    finished.current = true;
    writeResume(null);
    const r = await save({ complete: true, cooldown: coach.cooldown });
    return r.ok ? { ok: true, line: r.line ?? C.saved } : r;
  }, [save, coach.cooldown]);

  const close = useCallback(() => {
    // ended early: keep what was logged (an open session, as Today's Save always did); the finish already saved
    if (!finished.current) void save({ complete: false, cooldown: false });
    onClose();
  }, [save, onClose]);

  const lead = reply ? <CoachReplyCard reply={reply} /> : null;

  return (
    <SessionPlayer
      session={coach.session} mode="save" initial={initial} onFinish={finish} onClose={close} doneLabel={C.backToToday} lead={lead}
      onState={onState}
      restPanel={(s) => <RestLog coach={coach} bySlot={bySlot} drafts={drafts} unit={unit} simpleLog={simpleLog} state={s} onRows={onRows} onFilm={leaveToFilm} />}
    />
  );
}

/** The rest's inline row: the set just done, as logged, to change; and the film link when the next set is the same exercise. */
function RestLog({ coach, bySlot, drafts, unit, simpleLog, state, onRows, onFilm }: {
  coach: CoachSession; bySlot: ReadonlyMap<string, TodayExercise>; drafts: Readonly<Record<string, { sets: SetDraft[] }>>; unit: WeightUnit;
  simpleLog: boolean; state: PlayerState; onRows: (slot: string, rows: SetDraft[]) => void; onFilm: () => void;
}) {
  const s = state;
  if (s.phase !== 'rest') return null;
  const done = previousPosition(coach.session, s.step, s.set);
  const at = done ? slotSet(coach.refs, done.step, done.set) : null;
  const e = at ? bySlot.get(at.slot) : null;
  if (!at || !e) return null;
  const rows = drafts[at.slot]?.sets ?? [];
  const next = slotSet(coach.refs, s.step, s.set);
  const filmable = next?.slot === at.slot && !e.youthRules && !!reviewMovementFor({ name: e.name, pattern: e.coaching.pattern?.id ?? null });
  const timed = typeof e.workSeconds === 'number' && e.workSeconds > 0;
  return (
    <div className={L.log} data-rest-log={at.slot} data-rest-set={at.index}>
      <p className={L.logHead}>{C.setOf(at.index + 1, e.name)}</p>
      <SetLogger name={e.name} rows={rows} unit={unit} timed={timed} simple={simpleLog || simpleLogging(e)} youth={!!e.youthRules}
        repsHint={repsPlaceholder(e.reps)} workHint={String(e.workSeconds ?? '')} only={at.index} compact
        onChange={(r) => onRows(at.slot, r)} />
      {filmable && <div className={L.film} onClickCapture={onFilm} data-rest-film><FilmSetLink exercise={e} /></div>}
    </div>
  );
}
