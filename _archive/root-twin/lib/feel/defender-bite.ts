/**
 * lib/feel/defender-bite.ts
 * =========================
 * PURE, deterministic model of a one-on-one defender who can be BEATEN by a
 * shot-fake / crossover before the ball-handler commits to the shot.
 *
 * This is the shared "fake-then-commit" core imported by BOTH the live basketball
 * modes (1v1 `basketball-3d`, 3v3 `three-v-three-3d`) AND the feel tests
 * (`scripts/defender-bite-tests.ts`), so the mechanic can never silently fork.
 *
 * The model is intentionally tiny and side-effect-free apart from mutating the
 * passed-in state object — callers own the RNG (pass a roll in [0,1)) so tests
 * stay deterministic.
 */

export interface DefenderBite {
  /** Weight shift: -1 (leaning left) .. 0 (balanced) .. +1 (leaning right). A crossover pushes this. */
  lean: number;
  /** Seconds the defender stays beaten/off-balance after biting (counts down to 0). */
  offBalanceT: number;
  /** True the instant a fake makes the defender commit; clears when they recover. */
  committed: boolean;
}

export const BITE = {
  /** How long an "open look" lasts after the defender bites. */
  OPEN_WINDOW: 0.9, // TUNE(elijah) seconds
  /** Per-second easing of `lean` back toward balanced. */
  LEAN_DECAY: 5, // TUNE(elijah)
  /** Weight shift added per crossover gesture. */
  LEAN_PER_CROSS: 0.5, // TUNE(elijah)
  /** Base bite chance contribution from defender aggression. */
  AGGR_WEIGHT: 0.6, // TUNE(elijah)
  /** Bite chance contribution from how far the defender is already leaning. */
  LEAN_WEIGHT: 0.4, // TUNE(elijah)
  /** Hard cap so a fake is never a guaranteed beat. */
  MAX_BITE_CHANCE: 0.95, // TUNE(elijah)
  /** Sweet-spot multiplier applied to the shot while the defender is beaten. */
  OPEN_SWEET_MULT: 1.5, // TUNE(elijah)
  /** Sweet-spot multiplier when shooting into an on-balance contest. */
  CONTEST_SWEET_MULT: 0.85, // TUNE(elijah)
};

export function createDefenderBite(): DefenderBite {
  return { lean: 0, offBalanceT: 0, committed: false };
}

/**
 * The chance a fake makes THIS defender bite right now, given their aggression
 * (0..1). A defender already leaning hard is easier to send the wrong way.
 */
export function biteChance(state: DefenderBite, aggression: number): number {
  const a = Math.max(0, Math.min(1, aggression));
  const raw = a * BITE.AGGR_WEIGHT + Math.abs(state.lean) * BITE.LEAN_WEIGHT;
  return Math.max(0, Math.min(BITE.MAX_BITE_CHANCE, raw));
}

/**
 * Resolve a shot/pass fake. `roll` is a caller-supplied uniform in [0,1).
 * On a bite the defender is committed and left open for `OPEN_WINDOW` seconds.
 */
export function resolveFake(
  state: DefenderBite,
  aggression: number,
  roll: number,
): { bit: boolean; chance: number } {
  const chance = biteChance(state, aggression);
  const bit = roll < chance;
  if (bit) {
    state.committed = true;
    state.offBalanceT = BITE.OPEN_WINDOW;
  }
  return { bit, chance };
}

/** Push the defender's weight with a crossover. `dir` is -1 (left) or +1 (right). */
export function crossover(state: DefenderBite, dir: -1 | 1): void {
  state.lean = Math.max(-1, Math.min(1, state.lean + dir * BITE.LEAN_PER_CROSS));
}

/** Advance the model by `dt` seconds: lean eases to balance, off-balance timer decays. */
export function updateDefenderBite(state: DefenderBite, dt: number): void {
  const d = BITE.LEAN_DECAY * dt;
  if (state.lean > 0) state.lean = Math.max(0, state.lean - d);
  else if (state.lean < 0) state.lean = Math.min(0, state.lean + d);
  if (state.offBalanceT > 0) {
    state.offBalanceT = Math.max(0, state.offBalanceT - dt);
    if (state.offBalanceT === 0) state.committed = false;
  }
}

/** Is the shooter open right now (defender still beaten)? */
export function isOpen(state: DefenderBite): boolean {
  return state.offBalanceT > 0;
}

/**
 * Sweet-spot multiplier to apply to a shot's timing window given the current
 * defender state: widened on an open look, shrunk on an on-balance contest.
 */
export function shotSweetMultiplier(state: DefenderBite): number {
  return isOpen(state) ? BITE.OPEN_SWEET_MULT : BITE.CONTEST_SWEET_MULT;
}
