// lib/coach/live/session.ts — COACH-LIVE (2026-10-25): the session's sets as the coach sees them, and the summary that
// is the ONLY thing a live session keeps.
//
// The coach starts and stops each set; the client's phone counts it (lib/coach/live/reader.ts) and sends each rep as it
// closes, then the whole set once it stops (set_done), which settles any rep message the channel lost. The coach's list
// is built from those messages alone.
//
// THE SUMMARY. On End, the coach's page builds { sets: [{ movement, reps, flagged: [{ rep, faults, sides }] }] } and
// POSTs it; the server re-validates it (parseSummary) and writes ONE program-thread message from it (summaryText), in
// words this file owns — never text the page sent. Nothing else of the session is stored: no video (there is no
// recorder: tests/coach-live/no-recording.scan.test.ts), no pose frames, no timings.
//
// Pure.

import { isLiveFault, isLiveMovement, LIVE_SPECS, flagLine, type FaultSide, type LiveMovement } from './movements';
import type { WireRep } from './wire';

export interface CoachSet {
  id: number;
  movement: LiveMovement;
  state: 'live' | 'done';
  reps: WireRep[];
}

export interface CoachSessionState {
  movement: LiveMovement;
  sets: CoachSet[];
  nextId: number;
}

export const initialCoachSession = (movement: LiveMovement = 'squat'): CoachSessionState => ({ movement, sets: [], nextId: 1 });

export const liveSet = (s: CoachSessionState): CoachSet | null => s.sets.find((x) => x.state === 'live') ?? null;

export function pickExercise(s: CoachSessionState, movement: LiveMovement): CoachSessionState {
  return liveSet(s) ? s : { ...s, movement };
}

/** Start a set (none may be running). Returns the new state and the set's id. */
export function startSet(s: CoachSessionState): { state: CoachSessionState; id: number | null } {
  if (liveSet(s)) return { state: s, id: null };
  const id = s.nextId;
  return { state: { ...s, nextId: id + 1, sets: [...s.sets, { id, movement: s.movement, state: 'live', reps: [] }] }, id };
}

export function stopSet(s: CoachSessionState, id: number): CoachSessionState {
  return { ...s, sets: s.sets.map((x) => (x.id === id && x.state === 'live' ? { ...x, state: 'done' as const } : x)) };
}

/** A rep from the client. Kept once per number; a rep for a set the coach does not have, or another movement, is dropped. */
export function addRep(s: CoachSessionState, set: number, movement: LiveMovement, rep: WireRep): CoachSessionState {
  return {
    ...s,
    sets: s.sets.map((x) => {
      if (x.id !== set || x.movement !== movement || x.reps.some((r) => r.n === rep.n)) return x;
      return { ...x, reps: [...x.reps, rep].sort((a, b) => a.n - b.n) };
    }),
  };
}

/** The client's whole set: it replaces what the rep messages built (the reliable channel's last word on the set). */
export function settleSet(s: CoachSessionState, set: number, movement: LiveMovement, reps: WireRep[]): CoachSessionState {
  return { ...s, sets: s.sets.map((x) => (x.id === set && x.movement === movement ? { ...x, state: 'done' as const, reps: [...reps] } : x)) };
}

export const flaggedReps = (set: Pick<CoachSet, 'reps'>): WireRep[] => set.reps.filter((r) => r.faults.length > 0);

/** The set's flags, grouped by fault, in the movement's coaching order: "Knee drifting inward … (left) — reps 3, 6". */
export function setFlagLines(set: Pick<CoachSet, 'movement' | 'reps'>): string[] {
  const order = LIVE_SPECS[set.movement].faults;
  const by = new Map<string, { reps: number[]; side: FaultSide | null }>();
  for (const r of set.reps) {
    for (const f of r.faults) {
      const e = by.get(f) ?? { reps: [], side: null };
      e.reps.push(r.n);
      const side = r.sides[f] ?? null;
      e.side = e.side === null ? side : side && side !== e.side ? 'both' : e.side;
      by.set(f, e);
    }
  }
  return order.filter((f) => by.has(f)).map((f) => {
    const e = by.get(f)!;
    return `${flagLine(set.movement, f, e.side)} — rep${e.reps.length > 1 ? 's' : ''} ${e.reps.join(', ')}`;
  });
}

// ── the summary ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SummarySet { movement: LiveMovement; reps: number; flagged: { rep: number; faults: string[]; sides: Record<string, FaultSide> }[] }
export interface LiveSummary { sets: SummarySet[] }

export const SUMMARY_MAX_SETS = 40;

export function buildSummary(s: CoachSessionState): LiveSummary {
  return {
    sets: s.sets.filter((x) => x.reps.length > 0).slice(0, SUMMARY_MAX_SETS).map((x) => ({
      movement: x.movement,
      reps: x.reps.length,
      flagged: flaggedReps(x).map((r) => ({ rep: r.n, faults: [...r.faults], sides: { ...r.sides } })),
    })),
  };
}

/** The server's check of a summary body: only these shapes, bounded, every fault one of the movement's own. */
export function parseSummary(body: unknown): LiveSummary | null {
  if (!body || typeof body !== 'object') return null;
  const sets = (body as { sets?: unknown }).sets;
  if (!Array.isArray(sets) || sets.length > SUMMARY_MAX_SETS) return null;
  const out: SummarySet[] = [];
  for (const raw of sets) {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    if (!isLiveMovement(s.movement) || typeof s.reps !== 'number' || !Number.isInteger(s.reps) || s.reps < 0 || s.reps > 60) return null;
    if (!Array.isArray(s.flagged) || s.flagged.length > s.reps) return null;
    const movement = s.movement;
    const flagged: SummarySet['flagged'] = [];
    for (const f of s.flagged) {
      if (!f || typeof f !== 'object') return null;
      const r = f as Record<string, unknown>;
      if (typeof r.rep !== 'number' || !Number.isInteger(r.rep) || r.rep < 1 || r.rep > s.reps) return null;
      if (!Array.isArray(r.faults) || !r.faults.length || r.faults.length > 8 || !r.faults.every((x) => isLiveFault(movement, x))) return null;
      const sides: Record<string, FaultSide> = {};
      for (const [k, v] of Object.entries((r.sides ?? {}) as Record<string, unknown>)) {
        if (!(r.faults as string[]).includes(k) || (v !== 'left' && v !== 'right' && v !== 'both')) return null;
        sides[k] = v;
      }
      flagged.push({ rep: r.rep, faults: [...(r.faults as string[])], sides });
    }
    out.push({ movement, reps: s.reps, flagged });
  }
  return { sets: out };
}

/** The thread message. Words owned here; fits ProgramMessage's 2000 characters. */
export function summaryText(sum: LiveSummary, minutes: number | null = null): string {
  const total = sum.sets.reduce((a, s) => a + s.reps, 0);
  const flagged = sum.sets.reduce((a, s) => a + s.flagged.length, 0);
  const head = `Live session summary${minutes ? ` (${minutes} min)` : ''}: ${sum.sets.length} set${sum.sets.length === 1 ? '' : 's'}, ${total} rep${total === 1 ? '' : 's'}, ${flagged} flagged.`;
  const lines = sum.sets.map((s, i) => {
    const flags = setFlagLines({ movement: s.movement, reps: s.flagged.map((f) => ({ n: f.rep, faults: f.faults, sides: f.sides, read: true })) });
    return `${i + 1}. ${LIVE_SPECS[s.movement].label}: ${s.reps} rep${s.reps === 1 ? '' : 's'}${flags.length ? ` — ${flags.join('; ')}` : ', no flags'}`;
  });
  const tail = 'Counted by the camera. Not recorded.';
  let text = [head, ...lines, tail].join('\n');
  if (text.length > 2000) text = `${[head, ...lines].join('\n').slice(0, 2000 - tail.length - 3)}…\n${tail}`;
  return text;
}
