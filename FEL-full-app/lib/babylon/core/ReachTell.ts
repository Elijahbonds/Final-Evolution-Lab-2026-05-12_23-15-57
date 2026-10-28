// ReachTell — THE AI REACH SHOWS BEFORE IT RESOLVES, AND THE POKE READS THE BALL (lane/hoops-def-tell, owner decision 2026-10-23:
// "rebuild #273 on current release, every number a feel knob"). Spec: #273's T-A A1 (HOOPS-1V1-3V3-CLAUDE-TIPS-08486062). A GAMEPLAY
// CHANGE, flagged for the owner's feel test; every number below is a knob in the feel panel's "Hoops · defense" group.
//
// THE TELL. Before: in 1v1 the AI's steal intent inside 1.6 m WAS the strip — one roll, the ball gone, no tell, no cooldown, no
// cost; in 3v3 the reach rolled its odds on the frame it started. Now a reach starts (the gate roll, one per cooldown), plays the
// `bball_steal_reach` beat, and only resolves after AI_REACH_TELL_SEC: move the ball in that window (a stick move, a spin) and it
// misses. A miss stuns the reacher AI_REACH_STUN_SEC; a miss through a moving handler, body on body, is the reach-in foul.
// `hoops.aiReachTellOn` = 0 puts the release's reach back exactly (1v1: the one-roll strip; 3v3: the immediate roll).
//
// THE POKE'S READ (DefenderBrain's steal intent). Before: `dist < 1.1 && rng() < aggression × 0.02` — a per-FRAME roll (2.4× the
// rate at 144 fps as at 60) gated on the distance to the DENY POINT, which the contain lever drops toward the rim on a moving
// handler (#273 measured a moving handler poked at ~21 % of the standing rate). Now: a per-SECOND rate, aimed at the ball led by
// POKE_LEAD_SEC of the handler's velocity, inside POKE_RANGE. `hoops.pokeReadOn` = 0 puts the old gate and roll back exactly.
// The poke only says "he wants the ball"; where he STANDS is still DefenderBrain's (and #401's BallSideShade's) business.
//
// Pure: no Babylon import, no clock but `dt`; its one import is the feel panel's `feel()` (the shipped constant unless a playtest
// override is live — never in staked, ranked, head-to-head or agent play, lib/feel-panel/sessionGate.ts).

import { feel } from '../../feel-panel/feel';   // feel-panel knobs, group "Hoops · defense" (lib/feel-panel/knobs.ts)

// ── the switches (1 = #273's behaviour, shipped ON; 0 = the release's, exactly — the owner's A/B) ──
/** The reach shows its tell and resolves through resolveAiReach. Knob `hoops.aiReachTellOn`. */
export const AI_REACH_TELL_ON = true;
/** The poke is a per-second rate aimed at the led ball. Knob `hoops.pokeReadOn`. */
export const POKE_READ_ON = true;

// ── the reach (3v3's values moved here unchanged; 1v1 now reaches by the same rules) ──
/** No AI defender starts two reaches inside this (s). Moved from ThreeVThreeMode, unchanged; not a knob (a cadence, not odds). */
export const AI_REACH_COOLDOWN_SEC = 1.2;
/** A steal intent in range becomes a reach this often. 3v3's 0.5; NEW in 1v1 (was: every intent). TUNED 0.5 → 0.7 (hoops-p02, coordinator
 *  call 1A: with the strip decided by the hand on the ball the AI reached too rarely to stop anyone — 0 stops in 18 of my possessions
 *  on the rig). Knob `hoops.aiReachGate`. */
export const AI_REACH_GATE = 0.7;
/** A reach that lands strips this often. 3v3's 0.22, unchanged; NEW in 1v1 (was: 1.0). Knob `hoops.aiStealChance`. */
export const AI_STEAL_CHANCE = 0.22;
/** …and this often inside the bump window (the ball out of the hand). 3v3's 0.6, unchanged; NEW in 1v1. Knob `hoops.aiStealOnBump`. */
export const AI_STEAL_ON_BUMP = 0.6;
/** A missed reach stuns the reacher this long (s). 3v3's literal 0.35, unchanged; NEW in 1v1. Knob `hoops.aiReachStunSec`. */
export const AI_REACH_STUN_SEC = 0.35;
/** TUNED (new, #273): the reach shows this long before it resolves — the handler's window to move the ball (s). Knob `hoops.aiReachTellSec`. */
export const AI_REACH_TELL_SEC = 0.25;

// ── the poke ──
/** TUNED (new, #273): the poke intent's rate per second × aggression — the same at 30, 60 and 144 fps (60 fps × the old 2 % a
 *  frame). Knob `hoops.stealRatePerSec`. */
export const STEAL_RATE_PER_SEC = 1.2;
/** TUNED (new, #273; was 1.1 to the deny point): the poke reaches the led ball inside this (m, planar) — past BODY_STANDOFF 1.10 so
 *  bodies held apart can still poke, inside DefenderBrain.ARMS_LENGTH 1.25 so arm's length stays pressure. Knob `hoops.pokeRangeM`. */
export const POKE_RANGE = 1.2;
/** TUNED (new, #273): the poke leads a moving ball by this much of the handler's velocity (s). Knob `hoops.pokeLeadSec`. */
export const POKE_LEAD_SEC = 0.1;
/** The old gate, kept for the A/B (`hoops.pokeReadOn` = 0): the deny point inside this, 2 % × aggression a frame. Not knobs. */
export const OLD_POKE_DENY_RANGE = 1.1, OLD_POKE_PER_FRAME = 0.02;

/** Is the tell on this frame (the constant, or the panel's A/B override)? */
export function aiReachTellOn(): boolean {
  return feel('hoops.aiReachTellOn', AI_REACH_TELL_ON ? 1 : 0) >= 0.5;
}
/** Is the poke's read on this frame? */
export function pokeReadOn(): boolean {
  return feel('hoops.pokeReadOn', POKE_READ_ON ? 1 : 0) >= 0.5;
}
/** The live numbers (the constants unless a playtest override is live). */
export const aiReachGate = (): number => feel('hoops.aiReachGate', AI_REACH_GATE);
export const aiStealChance = (): number => feel('hoops.aiStealChance', AI_STEAL_CHANCE);
export const aiStealOnBump = (): number => feel('hoops.aiStealOnBump', AI_STEAL_ON_BUMP);
export const aiReachStunSec = (): number => feel('hoops.aiReachStunSec', AI_REACH_STUN_SEC);
/** How long a reach shows before it resolves: the knob with the tell on, 0 with it off (the release's immediate roll). */
export const aiReachTellSec = (): number => (aiReachTellOn() ? feel('hoops.aiReachTellSec', AI_REACH_TELL_SEC) : 0);

export interface Planar { x: number; z: number }

/**
 * THE POKE INTENT (DefenderBrain's `steal`, on the ball). `denyDist` is the brain's planar distance to its deny point (the old gate);
 * `ball` the ball, `handlerVel` the handler's planar velocity (m/s), `self` the defender. Rolls `rng` at most once, and only inside the
 * gate — the same draw order as before, so a seeded run stays seeded.
 */
export function aiPokes(rng: () => number, aggression: number, dt: number, denyDist: number, ball: Planar, handlerVel: Planar, self: Planar): boolean {
  if (!pokeReadOn()) return denyDist < OLD_POKE_DENY_RANGE && rng() < aggression * OLD_POKE_PER_FRAME;
  const lead = feel('hoops.pokeLeadSec', POKE_LEAD_SEC);
  const ax = ball.x + handlerVel.x * lead, az = ball.z + handlerVel.z * lead;
  if (Math.hypot(ax - self.x, az - self.z) >= feel('hoops.pokeRangeM', POKE_RANGE)) return false;
  return rng() < 1 - Math.exp(-Math.max(0, aggression) * feel('hoops.stealRatePerSec', STEAL_RATE_PER_SEC) * Math.max(0, dt));
}

/** One frame's read for a reach that is resolving. */
export interface ReachFrame {
  /** Still carrying, not shooting / dunking / finishing / gathering, not sealed; the reacher not stunned or floored. */
  eligible: boolean;
  inRange: boolean;
  /** The carrier's last stick-move clock now (any monotonic number; a value past the reach's start mark = the ball moved). */
  moveMark: number;
  /** A spin in flight moves the ball too. */
  spinning?: boolean;
  /** Body on body (≤ BODY_STANDOFF + 0.25). */
  onHim: boolean;
  carrierSpeed: number;
  foulSpeed: number;
  roll: () => number;
  /** hoops-p02 (hoops/steals aiStripLands): his hand can get to the ball this frame. Set = the strip is that geometry, no roll; left
   *  undefined = today's roll (`hoops.stealDiceOn` 1, or a caller that does not read the ball). */
  handOnBall?: boolean;
}
export type ReachOutcome = 'strip' | 'whiff' | 'foul';

export interface AiReach {
  /** How long the reach has shown. */
  tellSec: number;
  eligible: boolean;
  inRange: boolean;
  /** The handler moved the ball during the tell (a stick move, a spin). */
  movedDuringTell: boolean;
  /** Inside the bump window when the reach started. */
  exposed: boolean;
  onHim: boolean;
  carrierSpeed: number;
  foulSpeed: number;
  roll: () => number;
  /** hoops-p02: the hand on the ball at the resolve (ReachFrame.handOnBall); undefined = the roll. */
  handOnBall?: boolean;
}

/** How a shown reach ends: a strip, a whiff (the reacher is stunned) or the reach-in foul on a moving handler. A reach never resolves
 *  before its tell (throws: a caller bug, never a silent strip). Rolls `roll` once, and only for a reach that can land. */
export function resolveAiReach(r: AiReach, tellSec = aiReachTellSec()): ReachOutcome {
  if (!(r.tellSec >= tellSec)) throw new Error(`resolveAiReach before the tell (${r.tellSec}s < ${tellSec}s)`);
  // hoops-p02: with the hand read the strip is geometry (his hand on the ball at the resolve), never a roll
  if (r.eligible && r.inRange && !r.movedDuringTell && (r.handOnBall !== undefined ? r.handOnBall : r.roll() < (r.exposed ? aiStealOnBump() : aiStealChance()))) return 'strip';
  return r.onHim && r.carrierSpeed >= r.foulSpeed ? 'foul' : 'whiff';
}

/**
 * One AI defender's reach while it shows. The mode decides when a reach STARTS (its own gate: the intent, the range, the cooldown,
 * `roll() < aiReachGate()`), sets its cooldown and plays the beat, then calls `start`; every later frame it calls `step`. Each returns
 * the outcome on the frame the reach resolves (on `start` itself when the tell is off), else null.
 */
export class AiReachTell {
  private show: { t: number; exposed: boolean; moveMark: number; target: unknown } | null = null;
  /** A reach is showing (the tell). */
  get showing(): boolean { return this.show !== null; }
  /** Whom the showing reach is at (what the mode passed to `start`; a reach at a carrier who passed the ball is dropped). */
  get target(): unknown { return this.show?.target; }
  /** How long the showing reach has shown (s); 0 when none. */
  get t(): number { return this.show?.t ?? 0; }
  /** A dead ball / a possession change ends a showing reach. */
  reset(): void { this.show = null; }

  start(exposed: boolean, f: ReachFrame, target: unknown = null): ReachOutcome | null {
    this.show = { t: 0, exposed, moveMark: f.moveMark, target };
    return aiReachTellSec() <= 0 ? this.resolve(f) : null;
  }

  step(dt: number, f: ReachFrame): ReachOutcome | null {
    if (!this.show) return null;
    this.show.t += Math.max(0, dt);
    return this.show.t >= aiReachTellSec() - 1e-6 ? this.resolve(f) : null;   // 1e-6: 15 × (1/60) sums to 0.2499999…, a 16th frame
  }

  private resolve(f: ReachFrame): ReachOutcome {
    const s = this.show!; this.show = null;
    return resolveAiReach({
      tellSec: s.t, eligible: f.eligible, inRange: f.inRange, movedDuringTell: f.moveMark > s.moveMark || !!f.spinning,
      exposed: s.exposed, onHim: f.onHim, carrierSpeed: f.carrierSpeed, foulSpeed: f.foulSpeed, roll: f.roll, handOnBall: f.handOnBall,
    }, s.t);
  }
}
