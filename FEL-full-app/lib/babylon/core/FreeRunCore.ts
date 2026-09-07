// FreeRunCore — the pure rules of FreeRun (A+ mission #10, replaces Gymnastics; owner benchmark: Skate 3 trick-scoring
// model + Mirror's Edge traversal feel). Momentum gates the verbs; tricks are difficulty × execution × combo on Skate's own
// ComboChain (imported by the mode) with Skate's sketchy multiplier; a bail burns the uncommitted pot. Everything here is
// Babylon-free and tested; FreeRunMode wires the Havok capsule, the course meshes and the camera.

import { SKETCHY_SCORE_MULT } from './LandingSystem';

// ── momentum ────────────────────────────────────────────────────────────
export const WALK_MAX = 3.2;       // m/s — below this you are walking
export const RUN_MAX = 6.4;        // top speed on flat ground
export const SPRINT_GATE = 5.2;    // wall-run and cat leap need this much
export const VAULT_GATE = 2.6;     // vault and slide need this much
export const ACCEL = 7.5;          // m/s² toward the stick's wish
export const DECEL = 9.0;          // m/s² with no input

export type RunState = 'ground' | 'air' | 'wallrun' | 'slide' | 'down';

export type Verb = 'JUMP' | 'VAULT' | 'SLIDE' | 'WALL RUN' | 'WALL KICK' | 'CAT LEAP' | 'PRECISION' | 'ROLL';

export interface Env {
  /** A vault-height obstacle within reach ahead (0.6–1.4 m tall). */
  vaultAhead: boolean;
  /** A wall within reach ahead, tall enough to run on. */
  wallAhead: boolean;
  /** A ledge above and ahead that a cat leap could catch. */
  ledgeAhead: boolean;
  /** A slide-height bar ahead (something to go under). */
  barAhead: boolean;
}

/** Which verbs the current speed and surroundings allow — the speed GATES the move list (momentum-based, not fixed). */
export function verbsFor(state: RunState, speed: number, env: Env): Verb[] {
  const v: Verb[] = [];
  if (state === 'ground') {
    v.push('JUMP');
    if (speed >= VAULT_GATE && env.vaultAhead) v.push('VAULT');
    if (speed >= VAULT_GATE && env.barAhead) v.push('SLIDE');
    if (speed >= SPRINT_GATE && env.wallAhead) v.push('WALL RUN');
    v.push('PRECISION');
  } else if (state === 'air') {
    if (env.wallAhead) v.push('WALL KICK');
    if (speed >= SPRINT_GATE && env.ledgeAhead) v.push('CAT LEAP');
    v.push('ROLL');
  } else if (state === 'wallrun') {
    v.push('WALL KICK');
  }
  return v;
}

/** One frame of momentum: accelerate toward the wish speed, coast down with no input. */
export function stepSpeed(speed: number, wish: number, dt: number, max = RUN_MAX): number {
  const target = Math.max(0, Math.min(max, wish));
  if (target > speed) return Math.min(target, speed + ACCEL * dt);
  return Math.max(target, speed - DECEL * dt);
}

// ── landing ─────────────────────────────────────────────────────────────
export type Landing = 'clean' | 'sketchy' | 'bail';
export const ROLL_DROP_M = 2.4;    // from here down a roll matters
export const BAIL_DROP_M = 5.5;    // from here down an unrolled landing is a bail
export const ROLL_WINDOW_S = 0.35; // press ROLL within this of touchdown

/** Landing cleanliness: a soft drop is clean; a big drop needs a timed roll (clean), an untimed one is sketchy, and past
 *  the bail height an unrolled landing puts you down. */
export function gradeDrop(dropM: number, rolledWithin: number | null): Landing {
  if (dropM < ROLL_DROP_M) return 'clean';
  const rolled = rolledWithin !== null && rolledWithin >= 0 && rolledWithin <= ROLL_WINDOW_S;
  if (rolled) return 'clean';
  return dropM >= BAIL_DROP_M ? 'bail' : 'sketchy';
}

/** Speed kept through a landing: clean keeps it, sketchy halves it, a bail stops you. */
export function speedAfterLanding(speed: number, landing: Landing): number {
  return landing === 'clean' ? speed : landing === 'sketchy' ? speed * 0.5 : 0;
}

// ── tricks ──────────────────────────────────────────────────────────────
export interface FreeRunTrick { id: string; name: string; pts: number; axis: 'x' | 'y' | 'z'; turns: number; airSec: number }

/** The trick set — flips, twists, spins — with the air-time each needs to complete. */
export const FREERUN_TRICKS: Record<string, FreeRunTrick> = {
  front: { id: 'front', name: 'FRONT FLIP', pts: 150, axis: 'x', turns: 1, airSec: 0.55 },
  back: { id: 'back', name: 'BACK FLIP', pts: 180, axis: 'x', turns: -1, airSec: 0.6 },
  side: { id: 'side', name: 'SIDE FLIP', pts: 200, axis: 'z', turns: 1, airSec: 0.6 },
  twist: { id: 'twist', name: 'TWIST', pts: 120, axis: 'y', turns: 1, airSec: 0.45 },
  spin: { id: 'spin', name: '540 SPIN', pts: 170, axis: 'y', turns: 1.5, airSec: 0.7 },
};

/** Where a trick was launched from raises its difficulty (Skate 3: the gap pays). */
export const LAUNCH_MULT: Record<'ground' | 'vault' | 'wallkick' | 'drop', number> = { ground: 1, vault: 1.25, wallkick: 1.5, drop: 1.35 };

/** Execution pays the trick: clean = full, sketchy = Skate's multiplier, bail = nothing. */
export function trickPoints(t: FreeRunTrick, launch: keyof typeof LAUNCH_MULT, landing: Landing): number {
  if (landing === 'bail') return 0;
  const exec = landing === 'clean' ? 1 : SKETCHY_SCORE_MULT;
  return Math.round(t.pts * LAUNCH_MULT[launch] * exec);
}

/** Did the air last long enough for the trick to come round? */
export function trickCompletes(t: FreeRunTrick, airSec: number): boolean { return airSec >= t.airSec * 0.85; }

// ── the run ─────────────────────────────────────────────────────────────
export interface Tier { id: 1 | 2 | 3; name: string; parSec: number; gaps: number; routeBonus: number }
export const TIERS: readonly Tier[] = [
  { id: 1, name: 'ROOKIE', parSec: 55, gaps: 2, routeBonus: 300 },
  { id: 2, name: 'RUNNER', parSec: 45, gaps: 3, routeBonus: 450 },
  { id: 3, name: 'TRACEUR', parSec: 38, gaps: 4, routeBonus: 650 },
];
export function tierById(id: number | null | undefined): Tier { return TIERS.find((t) => t.id === id) ?? TIERS[0]; }

/** Time pays too: under par is a bonus per second saved, over par costs nothing more than the time. */
export function timeBonus(timeSec: number, tier: Tier): number {
  return Math.max(0, Math.round((tier.parSec - timeSec) * 25));
}

export type RunGrade = 'S' | 'A' | 'B' | 'C';
export function runGrade(total: number, tier: Tier): RunGrade {
  const bar = tier.parSec * 40;                         // roughly: par time at a modest trick line
  return total >= bar * 2 ? 'S' : total >= bar * 1.3 ? 'A' : total >= bar * 0.7 ? 'B' : 'C';
}
