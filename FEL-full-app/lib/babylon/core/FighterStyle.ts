// FIGHTER STYLE — what your body can do in a fight, and how it is earned (2026-09-12).
//
// Owner's brief for the combat siblings (combat / karate_vs / karate_endless): "movement and animations need
// to be clean, special effects, prq and upgrades, way better movement, more fun".
//
// FightCore already owns strikes, guard, chi, the 160 ms parry and the vertical/horizontal line grammar, and
// it is good. Two things it has no concept of:
//
//   1. PRQ. There is no link between the player's scan and what they can do in a fight at all — so an
//      upgraded athlete fights identically to a fresh one, and the subscription that keeps upgrades
//      (lib/progression/upgradeGate.ts) buys nothing visible here. That is the same problem the handle
//      solved for the hoops modes, and it gets the same answer: attributes gate the VOCABULARY, so the thing
//      a subscriber keeps is a move they can see.
//
//   2. ROUTES. A combo is currently a COUNTER — `combo++` with damage scaling — so jab-jab-jab and
//      jab-kick-heavy are worth the same and neither is a thing with a name. Karate Endless already proved
//      the idea with its jab-jab-UPPERCUT tracker; this generalises it so all three modes share one
//      vocabulary of named routes, each with its own payoff and its own effects tier.
//
// PRQ is a physical scan (strength, speed, endurance, agility, power, flexibility, recovery, mental) so the
// two fight ratings below are DERIVED from it rather than invented, exactly as the handle is.
//
// Pure: no Babylon, no scene.

/** A fighter's two earned numbers, 0..100. */
export interface FightRatings {
  /** How fast the hands and feet are: startup, cancels, how long a window stays open. */
  quickness: number;
  /** How much a clean hit takes out of someone, and whether the finisher is available at all. */
  force: number;
}

/** Baseline scan: what a fresh fighter is. */
export const BASELINE_RATING = 50;

/**
 * Ratings out of a PRQ scan.
 *
 * Quickness is agility and speed with a little flexibility (a hip that turns is a kick that lands).
 * Force is power and strength, with mental in it because a finisher is a decision as much as a punch.
 */
export function ratingsFrom(prq: {
  agility?: number; speed?: number; flexibility?: number; power?: number; strength?: number; mental?: number;
}): FightRatings {
  const g = (v: number | undefined) => v ?? 50;
  return {
    quickness: clamp01to100(g(prq.agility) * 0.45 + g(prq.speed) * 0.35 + g(prq.flexibility) * 0.20),
    force: clamp01to100(g(prq.power) * 0.45 + g(prq.strength) * 0.35 + g(prq.mental) * 0.20),
  };
}

function clamp01to100(v: number): number { return Math.max(0, Math.min(100, v)); }

export const BASELINE_RATINGS: FightRatings = { quickness: BASELINE_RATING, force: BASELINE_RATING };

/** The earned moves. The basics are never gated — a fresh fighter is never helpless. */
export type FightMove = 'jab' | 'kick' | 'heavy' | 'block' | 'evade' | 'parry' | 'counter_throw' | 'dragon';

/** Which rating gates a move, and at what value. */
const MOVE_GATE: Readonly<Record<FightMove, { rating: keyof FightRatings; at: number }>> = {
  jab: { rating: 'quickness', at: 0 },
  kick: { rating: 'quickness', at: 0 },
  heavy: { rating: 'force', at: 0 },
  block: { rating: 'force', at: 0 },
  parry: { rating: 'quickness', at: 0 },
  // earned:
  evade: { rating: 'quickness', at: 58 },          // slipping a strike is a trained thing
  counter_throw: { rating: 'force', at: 70 },      // taking a committed body and putting it down
  dragon: { rating: 'force', at: 78 },             // the finisher needs chi AND a body that can throw it
};

export function hasFightMove(move: FightMove, r: FightRatings): boolean {
  const g = MOVE_GATE[move];
  return r[g.rating] >= g.at;
}

/** Everything this body can currently do. For a HUD, a trainer, or a move list. */
export function fightMovesFor(r: FightRatings): FightMove[] {
  return (Object.keys(MOVE_GATE) as FightMove[]).filter((m) => hasFightMove(m, r));
}

/**
 * How long the cancel window stays open after a hit.
 *
 * This is the "way better movement, more fun" dial. A slow fighter gets a window so short that strikes are
 * separate presses; a quick one can cancel one strike into the next and actually run a route. FightCore's
 * COMBO_WINDOW_SEC (1.1 s) is the baseline this scales around.
 */
export function cancelWindowSec(r: FightRatings, base = 1.1): number {
  const t = clamp01to100(r.quickness) / 100;
  return base * (0.62 + t * 0.76);                 // 0.68 s at nothing, ~1.52 s at max
}

/** Startup scaling: a quick body gets there sooner. Never below 65% — a fast fighter is not an unreactable one. */
export function startupScale(r: FightRatings): number {
  const t = clamp01to100(r.quickness) / 100;
  return 1.15 - t * 0.5;                           // 1.15x at nothing, 0.65x at max
}

/** Damage scaling off force. Kept narrow so a fight is never decided before it starts. */
export function damageScale(r: FightRatings): number {
  const t = clamp01to100(r.force) / 100;
  return 0.82 + t * 0.42;                          // 0.82x .. 1.24x
}

// ── ROUTES ───────────────────────────────────────────────────────────────────────────────────────────────
// A combo with a NAME. jab-jab-jab and jab-kick-heavy used to be worth exactly the same because the only
// thing counted was how many landed.

export type RouteStrike = 'jab' | 'kick' | 'heavy';

export interface ComboRoute {
  id: string;
  label: string;
  /** The sequence that completes it. */
  steps: readonly RouteStrike[];
  /** Damage multiplier on the LAST hit when the route completes. */
  payoff: number;
  /** How loud the effects are: 1 a flourish, 3 a screen-shaking finisher. */
  fx: 1 | 2 | 3;
  /** Force needed to own it. The heavy routes are earned. */
  force: number;
  /** What it does to the victim beyond damage. */
  ender: 'stun' | 'knockdown' | 'launch';
}

/**
 * THE ROUTES, longest first.
 *
 * Longest-first matters: `routeFor` returns the first match, and a three-step route must win over the
 * two-step route that is its own suffix, or the longer route could never fire.
 */
export const ROUTES: readonly ComboRoute[] = [
  { id: 'storm', label: 'STORM', steps: ['kick', 'kick', 'heavy'], payoff: 2.0, fx: 3, force: 74, ender: 'launch' },
  { id: 'triple', label: 'TRIPLE', steps: ['jab', 'jab', 'kick'], payoff: 1.5, fx: 2, force: 0, ender: 'knockdown' },
  { id: 'breaker', label: 'BREAKER', steps: ['jab', 'kick', 'heavy'], payoff: 1.8, fx: 3, force: 62, ender: 'knockdown' },
  { id: 'crusher', label: 'CRUSHER', steps: ['jab', 'heavy'], payoff: 1.35, fx: 2, force: 0, ender: 'stun' },
  { id: 'sweep', label: 'SWEEP', steps: ['kick', 'heavy'], payoff: 1.4, fx: 2, force: 55, ender: 'knockdown' },
];

/**
 * Does this sequence of landed strikes complete a route I own?
 *
 * Reads the TAIL of the sequence, so a route can complete inside a longer exchange rather than only from a
 * clean start — which is what makes routes usable in a real fight instead of only in a drill.
 */
export function routeFor(landed: readonly RouteStrike[], r: FightRatings): ComboRoute | null {
  for (const route of ROUTES) {
    if (r.force < route.force) continue;
    const n = route.steps.length;
    if (landed.length < n) continue;
    const tail = landed.slice(landed.length - n);
    if (tail.every((s, i) => s === route.steps[i])) return route;
  }
  return null;
}

/** Routes this body owns, for a HUD or a trainer. */
export function routesFor(r: FightRatings): ComboRoute[] {
  return ROUTES.filter((route) => r.force >= route.force);
}

/** Hit-stop for a route's payoff, ms. The frame should hold longer the bigger the thing that just happened. */
export function routeHitStopMs(fx: 1 | 2 | 3): number {
  return fx === 3 ? 120 : fx === 2 ? 70 : 40;
}

/** Shake for a route's payoff. */
export function routeShake(fx: 1 | 2 | 3): { amp: number; ms: number } {
  return fx === 3 ? { amp: 0.14, ms: 180 } : fx === 2 ? { amp: 0.08, ms: 120 } : { amp: 0.04, ms: 80 };
}
