// AI REACTION DELAY BY DIFFICULTY (lane/hoops-round2, HOP-02; owner 2026-10-20, HOOPS DEFENSE: "reaction delay by difficulty
// (420/220/120)").
//
// core/Difficulty has said since 2026-09-13 that a ROOKIE "reacts late" (TierProfile.reactionMs 420 / 220 / 120), but no hoops brain
// read it: every DefenderBrain saw the handler and the ball on the frame they moved, so a rookie answered a crossover as fast as an
// elite (0 ms). This is that delay, as PERCEPTION: the defender's brain is shown the attackers and the ball as they were `reactMs`
// ago, carried forward on the motion he had seen then (dead reckoning). A handler running a straight line is tracked with no lag —
// a defender who has seen you run keeps running with you — but a CHANGE (a crossover, a stop, a reversal) reaches the brain
// `reactMs` late. That is what "reacts late" means, and nothing else about the brain changes: no speed, no reach, no odds.
//
// TUNED (new behaviour, the owner's numbers): the hoops defenders' reaction 0 ms → ROOKIE 420 / PRO 220 / ELITE 120 ms, read per
// call through the feel panel (hoops.aiReactRookieMs / ProMs / EliteMs; never in a ranked, staked or head-to-head run — feel()
// returns the default there, and those runs play PRO: Difficulty.tierForSearch). Pure maths + one wrapper; no Babylon scene.
import { Vector3 } from '@babylonjs/core';
import type { AIBehavior, Intent } from '../core/PlayerSlot';
import { TIER_PROFILES, type Tier } from '../core/Difficulty';
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.aiReact{Rookie,Pro,Elite}Ms (lib/feel-panel/knobs.ts)

/** ROOKIE's reaction (ms): Difficulty's TIER_PROFILES.rookie.reactionMs, the owner's 420. */
export const AI_REACT_ROOKIE_MS = 420;
/** PRO's reaction (ms): TIER_PROFILES.pro.reactionMs, the owner's 220. */
export const AI_REACT_PRO_MS = 220;
/** ELITE's reaction (ms): TIER_PROFILES.elite.reactionMs, the owner's 120. */
export const AI_REACT_ELITE_MS = 120;

/** The defender's reaction for this run's tier (ms), through the feel panel. */
export function aiReactMs(tier: Tier): number {
  if (tier === 'rookie') return feel('hoops.aiReactRookieMs', AI_REACT_ROOKIE_MS);
  if (tier === 'elite') return feel('hoops.aiReactEliteMs', AI_REACT_ELITE_MS);
  return feel('hoops.aiReactProMs', AI_REACT_PRO_MS);
}
/** The tier table's own value (what the knobs default to) — kept equal by reaction.test.ts. */
export const tierReactionMs = (tier: Tier): number => TIER_PROFILES[tier].reactionMs;

/** A body that moves more than this in one frame was placed (a reset, the check spot), not run: perception starts over. */
export const SNAP_M = 1.5;
/** The motion carried forward is read over this much of the seen history (s) — a velocity, not one frame's jitter. */
const VEL_SPAN_SEC = 0.1;
/** Dead reckoning never carries a seen body faster than this (m/s). */
const MAX_CARRY_MPS = 8;
/** History kept (s): the longest delay a knob allows (0.8 s) plus the velocity span. */
const KEEP_SEC = 1.0;

/** One tracked point's seen history: a ring of (t, x, z) samples. Allocation-free after construction. */
class Track {
  private t: Float64Array; private x: Float64Array; private z: Float64Array; private n = 0; private head = 0;
  constructor(private cap: number) { this.t = new Float64Array(cap); this.x = new Float64Array(cap); this.z = new Float64Array(cap); }
  clear(): void { this.n = 0; this.head = 0; }
  push(t: number, x: number, z: number): void {
    if (this.n > 0) { const i = (this.head + this.cap - 1) % this.cap; if (Math.hypot(x - this.x[i], z - this.z[i]) > SNAP_M) this.clear(); }
    this.t[this.head] = t; this.x[this.head] = x; this.z[this.head] = z;
    this.head = (this.head + 1) % this.cap; this.n = Math.min(this.cap, this.n + 1);
  }
  /** Linear read of the history at time `at` (clamped to what is held). */
  private at(at: number, out: { x: number; z: number }): void {
    const old = (this.head + this.cap - this.n) % this.cap;
    if (at <= this.t[old]) { out.x = this.x[old]; out.z = this.z[old]; return; }
    for (let k = this.n - 1; k > 0; k--) {
      const i = (old + k) % this.cap, j = (old + k - 1) % this.cap;
      if (this.t[j] <= at) { const span = this.t[i] - this.t[j]; const f = span > 1e-9 ? Math.min(1, (at - this.t[j]) / span) : 1; out.x = this.x[j] + (this.x[i] - this.x[j]) * f; out.z = this.z[j] + (this.z[i] - this.z[j]) * f; return; }
    }
    const last = (this.head + this.cap - 1) % this.cap; out.x = this.x[last]; out.z = this.z[last];
  }
  private a = { x: 0, z: 0 }; private b = { x: 0, z: 0 };
  /** Where the point was `delay` s before `now`, carried forward by the motion seen then. False with no history. */
  seen(now: number, delay: number, out: { x: number; z: number }): boolean {
    if (this.n === 0) return false;
    const old = (this.head + this.cap - this.n) % this.cap;
    const held = now - this.t[old];
    const d = Math.max(0, Math.min(delay, held));   // a fresh track (after a snap) is seen as-is, and catches up to the delay
    const t0 = now - d;
    this.at(t0, this.a); this.at(t0 - VEL_SPAN_SEC, this.b);
    let vx = (this.a.x - this.b.x) / VEL_SPAN_SEC, vz = (this.a.z - this.b.z) / VEL_SPAN_SEC;
    const sp = Math.hypot(vx, vz); if (sp > MAX_CARRY_MPS) { vx *= MAX_CARRY_MPS / sp; vz *= MAX_CARRY_MPS / sp; }
    out.x = this.a.x + vx * d; out.z = this.a.z + vz * d;
    return true;
  }
}

/**
 * What a defender perceives: the ball and the attackers `delay` s late, dead-reckoned. `see()` takes the live points and returns
 * the perceived ones in reused vectors (y kept from the live point — a rim, a ball in the air, are not "seen late" in height).
 */
export class ReactionLens {
  private tracks: Track[] = [];
  private outs: Vector3[] = [];
  private tmp = { x: 0, z: 0 };
  private cap: number;
  constructor(fps = 60) { this.cap = Math.ceil(KEEP_SEC * fps * 2) + 4; }
  reset(): void { for (const t of this.tracks) t.clear(); }
  /** Perceive `pts` at `now` (s) with `delaySec`. Returns the perceived points (same order; reused between calls). */
  see(now: number, delaySec: number, pts: readonly Vector3[]): Vector3[] {
    while (this.tracks.length < pts.length) { this.tracks.push(new Track(this.cap)); this.outs.push(new Vector3()); }
    const res = this.outs; res.length = pts.length;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; const tr = this.tracks[i]; tr.push(now, p.x, p.z);
      const o = this.outs[i] ?? (this.outs[i] = new Vector3());
      if (delaySec > 0 && tr.seen(now, delaySec, this.tmp)) o.set(this.tmp.x, p.y, this.tmp.z); else o.copyFrom(p);
      res[i] = o;
    }
    return res;
  }
}

/**
 * A defender brain that reacts `aiReactMs(tier)` late: the ball and the attackers it decides on are perceived through a
 * ReactionLens. Its own body and its teammates are where they are. The mode sets the tier where it sets the tier's aggression
 * (setTier); `now` is the brain's own clock (the sum of the dt it is given), so a paused game does not age what it saw.
 */
export class ReactiveDefender implements AIBehavior {
  private lens = new ReactionLens();
  private clock = 0;
  private tier: Tier = 'pro';
  private pts: Vector3[] = [];
  constructor(readonly inner: AIBehavior) {}
  setTier(t: Tier): void { this.tier = t; }
  /** A new possession / a reset: no stale history carried across it. */
  reset(): void { this.lens.reset(); }
  /** The delay this brain plays now (s). */
  delaySec(): number { return Math.max(0, aiReactMs(this.tier)) / 1000; }
  decide(dt: number, self: Vector3, ball: Vector3, hoop: Vector3, allies: Vector3[], foes: Vector3[]): Intent {
    this.clock += Math.max(0, dt);
    const pts = this.pts; pts.length = 0; pts.push(ball); for (const f of foes) pts.push(f);
    const seen = this.lens.see(this.clock, this.delaySec(), pts);
    const seenFoes = seen.slice(1);
    return this.inner.decide(dt, self, seen[0], hoop, allies, seenFoes);
  }
}
