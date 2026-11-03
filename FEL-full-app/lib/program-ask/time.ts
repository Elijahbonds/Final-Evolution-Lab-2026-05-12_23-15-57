// lib/program-ask/time.ts — PROGRAM-ASK (2026-11-02): how long a session takes, estimated the way it will be played.
//
// The session player (lib/session-player/machine.ts) runs a counted set until Set done, a timed set by its clock, then the
// rest; a pair alternates its two items set for set with CHANGE_SECONDS between them and the round's rest after the
// second. The estimate is that walk: sets × (work + rest), work being reps × seconds per rep (the tempo's four numbers when
// one is written, else SECONDS_PER_REP) or the timed seconds, both sides for a one-sided item, plus a few seconds to get
// set. The player never rests less than CHANGE_SECONDS between two sets, so neither does the estimate. The warm-up and
// cool-down are their generators' own seconds.
//
// Pure.
import { CHANGE_SECONDS, READY_SECONDS } from '@/lib/session-player/machine';
import type { ProgramBlock, ProgramDay, ProgramItem } from './types';

/** A rep without a written tempo: about a second down, a second up, a beat between. FEL's estimate. */
export const SECONDS_PER_REP = 3;
/** Getting into position and out again, per set. FEL's estimate. */
export const SET_SETUP_SECONDS = 5;

export function secondsPerRep(tempo: string | null): number {
  if (!tempo) return SECONDS_PER_REP;
  const parts = tempo.split('-').map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const sum = parts.reduce((a, b) => a + b, 0);
  return Math.max(2, sum);
}

const repCount = (reps: string | null): number => {
  const m = /(\d+)/.exec(reps ?? '');
  return m ? Number(m[1]) : 8;
};

/** One set of one item, in seconds. */
export function workSeconds(it: Pick<ProgramItem, 'reps' | 'workSeconds' | 'perSide' | 'tempo'>): number {
  const sides = it.perSide ? 2 : 1;
  if (typeof it.workSeconds === 'number' && it.workSeconds > 0) return it.workSeconds * sides + SET_SETUP_SECONDS;
  return repCount(it.reps) * secondsPerRep(it.tempo) * sides + SET_SETUP_SECONDS;
}

/** A block: a single item's sets, or a pair's / circuit's rounds. */
export function blockSeconds(b: Pick<ProgramBlock, 'items'>): number {
  const rounds = Math.max(0, ...b.items.map((i) => i.sets));
  let s = 0;
  for (let r = 0; r < rounds; r++) {
    const live = b.items.filter((i) => i.sets > r);
    live.forEach((i, k) => {
      s += workSeconds(i);
      const last = k === live.length - 1;
      s += last ? Math.max(i.restSeconds, CHANGE_SECONDS) : CHANGE_SECONDS;
    });
  }
  return s;
}

export function daySeconds(d: Pick<ProgramDay, 'warmup' | 'blocks' | 'cooldown'>): number {
  const warm = d.warmup.reduce((a, s) => a + s.seconds, 0);
  const cool = d.cooldown.reduce((a, s) => a + s.seconds, 0);
  const main = d.blocks.reduce((a, b) => a + blockSeconds(b), 0);
  return READY_SECONDS + warm + main + cool;
}

/** The window a session must land in: minutes ± tolerance, in seconds. */
export const timeWindow = (minutes: number, tolerance: number): [number, number] => [minutes * 60 * (1 - tolerance), minutes * 60 * (1 + tolerance)];
