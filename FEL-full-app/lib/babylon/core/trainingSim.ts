// TRAINING scoring sim (R5 / HOOPS-10 round 5: training is "in" and had NO headless sim — dance, dunkduel,
// and irl/acting all carry one). Faithful to components/games/training-game.tsx's real loop: power ramps at
// 0.55 × the exercise's speed per second while held, the zone re-rolls each rep, the sweet spot is the middle
// ±18% of the zone, a rep ends on release, over 1.0 auto-fails (a miss), four reps advance the exercise, and
// the round is 60 s. Deterministic (mulberry32), so a win-rate finding is reproducible, not a vibe.
//
// The question it answers honestly: can a player who LEARNS the ramp win, and does the score separate a
// panic-masher from a steady player? It does not invent a 7.5 target — it measures what the rules produce.

export interface TrainingExercise { name: string; zoneSize: number; speed: number }

/** The four exercises, mirrored from training-game.tsx (the integrity test pins the same constants). */
export const TRAINING_EXERCISES: readonly TrainingExercise[] = [
  { name: 'BENCH PRESS', zoneSize: 0.2, speed: 0.85 },
  { name: 'SQUATS', zoneSize: 0.16, speed: 1.0 },
  { name: 'BICEP CURLS', zoneSize: 0.13, speed: 1.2 },
  { name: 'OVERHEAD PRESS', zoneSize: 0.11, speed: 1.35 },
];

export const TRAINING_GAME_LEN = 60;
export const TRAINING_WIN_SCORE = 1000;
/** power += dt × RAMP × exercise.speed (training-game.tsx line 158). */
export const TRAINING_RAMP = 0.55;
/** PERFECT band: |power − mid| ≤ zone × this (training-game.tsx line 83). */
export const TRAINING_PERFECT_FRAC = 0.18;

export interface TrainingRun {
  score: number;
  reps: number;
  won: boolean;
  perfects: number;
  misses: number;
}

export interface TrainingPlayer {
  /** Seconds of hold-timing error, uniform in ±this. 0 = the release lands dead centre. */
  timingErrorSec: number;
  /** Reaction lag added to every release (a slow player releases late). */
  lagSec?: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulate one 60 s round for a player. `zoneBonus` is the grade's zone widening (ELITE 1.25 … STARTER 1.0).
 * The player holds until the power reaches the zone's middle, plus their timing error, then releases.
 */
export function simulateTrainingRun(
  player: TrainingPlayer,
  opts: { zoneBonus?: number; seed?: number; dt?: number } = {},
): TrainingRun {
  const zoneBonus = opts.zoneBonus ?? 1.0;
  const dt = opts.dt ?? 1 / 120;
  const rng = mulberry32(opts.seed ?? 1);
  let timeLeft = TRAINING_GAME_LEN;
  let score = 0, reps = 0, perfects = 0, misses = 0, streak = 0;
  let exIdx = 0, repsThisEx = 0;

  const rollZone = (): [number, number] => {
    const size = TRAINING_EXERCISES[exIdx].zoneSize * zoneBonus;
    const lo = 0.45 + rng() * (0.95 - size - 0.45);
    return [lo, lo + size];
  };

  let [zoneLo, zoneHi] = rollZone();
  while (timeLeft > 0) {
    const ex = TRAINING_EXERCISES[exIdx];
    const mid = (zoneLo + zoneHi) / 2;
    // the hold the player intends: reach the middle, with their timing error and lag
    const err = (rng() * 2 - 1) * player.timingErrorSec + (player.lagSec ?? 0);
    const holdSec = Math.max(0, mid / (TRAINING_RAMP * ex.speed) + err);
    let power = 0, held = 0;
    while (held < holdSec && timeLeft > 0) {
      power = Math.min(1, power + dt * TRAINING_RAMP * ex.speed);
      held += dt; timeLeft -= dt;
      if (power >= 1) break;   // auto-fail on max hold
    }
    if (timeLeft <= 0) break;
    // the release (training-game endHold)
    if (power >= zoneLo && power <= zoneHi) {
      const perfect = Math.abs(power - mid) <= (zoneHi - zoneLo) * TRAINING_PERFECT_FRAC;
      streak += 1;
      if (perfect) perfects += 1;
      score += (perfect ? 80 : 50) + (streak >= 3 ? 20 : 0);
      reps += 1; repsThisEx += 1;
      if (repsThisEx >= 4 && exIdx < TRAINING_EXERCISES.length - 1) { exIdx += 1; repsThisEx = 0; }
    } else {
      streak = 0; misses += 1;   // over the zone (overextended) or under it (too weak)
    }
    [zoneLo, zoneHi] = rollZone();
  }
  return { score, reps, won: score >= TRAINING_WIN_SCORE, perfects, misses };
}
