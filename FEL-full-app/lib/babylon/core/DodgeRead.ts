// A DODGE THAT PAYS THE SAME WHENEVER YOU PRESS IT IS A PANIC BUTTON (2026-09-14).
//
// Owner ask: "a reward for well timed dodges". The reward is the easy half; the hard half is making sure
// the reward cannot be farmed by mashing, because a dodge that pays on every press is strictly better than
// a dodge that pays on a read, and then nobody ever reads anything again.
//
// THE RULE THIS FILE EXISTS TO ENFORCE:
//
//   AN EARLY DODGE MUST PAY NOTHING. Not less — NOTHING.
//
// A graded reward that tapers with distance from the window sounds fairer and is worse: it means holding
// dodge on cooldown still earns something, so the optimal play is still to always be dodging. The window
// is binary, and outside it a dodge is just a dodge — you avoided the hit, which is already the reward for
// avoiding the hit.
//
// WHY THE WINDOW IS MEASURED AGAINST THE INCOMING STRIKE AND NOT AGAINST A TIMER. "Well timed" can only
// mean one thing: you moved because you saw THAT attack coming. So the input is seconds until the strike
// would have landed at the moment the dodge began. There is no window at all when nothing is being thrown
// at you, which is why `perfectDodge` refuses a null.
//
// Pure: no Babylon, no clock, no randomness.

/**
 * How close to the impact a dodge must start to read as a perfect one.
 *
 * Generous enough that a human reacting to a telegraph lands it (a startup is 120–180 ms and human
 * reaction is ~250 ms, so this is read off the WIND-UP, not off the strike), tight enough that a panic
 * press half a second early does not.
 */
export const PERFECT_WINDOW_SEC = 0.22;

/**
 * The same read, in a HORDE.
 *
 * Karate endless had its own `PERFECT_WINDOW_SEC = 0.12` measured from the other end — "did the strike
 * land inside the first window of the i-frames" — which is the same question asked backwards, and it was
 * correct. It is kept as a separate, tighter number rather than unified to one, because the situations
 * genuinely differ: in a duel you are reading ONE telegraph, and against eight attackers a window that
 * generous would make a perfect dodge the default outcome of pressing dodge at all.
 *
 * What is NOT kept is two constants with the same name in two files. They live here together so the gap
 * between them is a visible decision instead of a drift nobody notices.
 */
export const HORDE_WINDOW_SEC = 0.12;

/** How long the punish stays open after a perfect dodge. */
export const COUNTER_SEC = 0.85;
/** Slow-mo beat on a perfect dodge — a taste, never the scoped parry slow-mo the duel owns. */
export const DODGE_SLOWMO_SEC = 0.22;
/** What a counter-window strike is worth. Bounded: a perfect dodge is an opening, not a execute. */
export const COUNTER_DAMAGE_MULT = 1.5;

export interface DodgeReward {
  perfect: boolean;
  /** Seconds of slow-mo to play. 0 on an ordinary dodge. */
  slowMoSec: number;
  /** Seconds the counter window stays open. 0 on an ordinary dodge. */
  counterSec: number;
  /** Damage multiplier a strike inside the window carries. 1 when there is no window. */
  damageMult: number;
  /** The banner, or null. One phrasing, so four modes cannot each invent their own. */
  label: string | null;
}

export const NO_REWARD: DodgeReward = { perfect: false, slowMoSec: 0, counterSec: 0, damageMult: 1, label: null };

/**
 * Was this a read or a panic?
 *
 * `secToImpact` is how long until the incoming strike would have connected, at the moment the dodge
 * started. `null` means nothing was coming — which is never perfect, however good it looked.
 *
 * Negative is allowed and is NOT perfect: the strike had already landed or passed, so the dodge was late.
 */
export function perfectDodge(secToImpact: number | null): boolean {
  if (secToImpact === null || !Number.isFinite(secToImpact)) return false;
  return secToImpact >= 0 && secToImpact <= PERFECT_WINDOW_SEC;
}

/** What a dodge at this moment earns. Binary by design — see the header. */
export function dodgeReward(secToImpact: number | null): DodgeReward {
  if (!perfectDodge(secToImpact)) return NO_REWARD;
  return {
    perfect: true,
    slowMoSec: DODGE_SLOWMO_SEC,
    counterSec: COUNTER_SEC,
    damageMult: COUNTER_DAMAGE_MULT,
    label: 'PERFECT DODGE',
  };
}

/** The counter window, counted down by the mode. Seconds; frame-independent because dt is seconds. */
export function tickCounter(counterLeft: number, dt: number): number {
  if (!(dt > 0)) return counterLeft;
  return Math.max(0, counterLeft - dt);
}

/** Damage multiplier for a strike thrown now, given what is left of the counter window. */
export function counterMult(counterLeft: number): number {
  return counterLeft > 0 ? COUNTER_DAMAGE_MULT : 1;
}
