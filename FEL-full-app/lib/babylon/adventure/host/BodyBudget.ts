/**
 * BodyBudget (ADVENTURE PLAN A4, "Performance budgets"): every half-second, give every body a FIDELITY by distance and
 * priority, so a phone 3–4 years old stays cool and smooth. Pure: the view reads the answer and acts on it (animation
 * every frame or every third, a shadow or none, a frozen pose, hidden).
 *
 *   full      animated every frame, casts a shadow.
 *   reduced   animated every third frame, no shadow.
 *   impostor  a frozen pose (or a billboard): no animation, no shadow.
 *   culled    not drawn.
 * Radii by tier (the plan's table): phone full ≤ 30 m, reduced 30–55, impostor 55–90, culled beyond; desktop double.
 * ALWAYS FULL at any distance: the player, the partner, the lock target and a boss.
 * PRESSURE: PerfGovernor levels 3 and 4 (and ThermalWatch's hot verdict) shrink the full radius by 30% and the body cap
 * by 25%. THE CAP: past `maxFull` full bodies (story: 12 on a phone, 24 desktop), the farthest full bodies drop a level.
 *
 * Allocation: one result record per body, kept in a Map and refilled; a re-pick allocates nothing for a known body.
 */

import type { ActorId, AdventureActor, Vec3 } from '../contracts';

export type Fidelity = 'full' | 'reduced' | 'impostor' | 'culled';
export type BudgetTier = 'mobile' | 'desktop';

export interface BudgetRadii { full: number; reduced: number; impostor: number }

/** The plan's radii, metres. [TUNE] (plan-fixed) */
export const BODY_RADII: Readonly<Record<BudgetTier, BudgetRadii>> = Object.freeze({
  mobile: Object.freeze({ full: 30, reduced: 55, impostor: 90 }),
  desktop: Object.freeze({ full: 60, reduced: 110, impostor: 180 }),
});
/** Skinned bodies in a story scene (the plan: ≤ 12 phone, ≤ 24 desktop). */
export const STORY_BODY_CAP: Readonly<Record<BudgetTier, number>> = Object.freeze({ mobile: 12, desktop: 24 });
/** The plan's re-pick period, seconds. */
export const BUDGET_PERIOD_SEC = 0.5;
/** Governor levels 3–4 / a hot phone: the full radius × 0.7 and the cap × 0.75. */
export const PRESSURE_RADIUS = 0.7;
export const PRESSURE_CAP = 0.75;

export interface BudgetInput {
  tier: BudgetTier;
  /** The eye the distances are measured from (the camera, or the player). */
  eye: Vec3;
  /** Bodies that are always full (the player, the partner, the lock target, a boss): their ids. */
  pinned: (a: AdventureActor) => boolean;
  /** PerfGovernor's level (0..4) or ThermalWatch hot. */
  governorLevel?: number;
  hot?: boolean;
  /** The body cap override (default STORY_BODY_CAP[tier]). */
  cap?: number;
}

const ORDER: readonly Fidelity[] = ['full', 'reduced', 'impostor', 'culled'];

export class BodyBudget {
  private readonly picks = new Map<ActorId, Fidelity>();
  private readonly dist = new Map<ActorId, number>();
  private readonly fullIds: ActorId[] = [];
  private sinceSec = Infinity;
  /** How many bodies are full after the last pick (tests, the perf row). */
  fullCount = 0;

  /** The fidelity a body got at the last pick ('full' for a body never picked: the first frame draws it). */
  of(id: ActorId): Fidelity { return this.picks.get(id) ?? 'full'; }

  /** Re-pick when the period has passed (or `force`). Returns true when it re-picked. */
  update(actors: Iterable<AdventureActor>, dtSec: number, input: BudgetInput, force = false): boolean {
    this.sinceSec += dtSec;
    if (!force && this.sinceSec < BUDGET_PERIOD_SEC) return false;
    this.sinceSec = 0;
    this.pick(actors, input);
    return true;
  }

  /** Pick now. */
  pick(actors: Iterable<AdventureActor>, input: BudgetInput): void {
    const pressure = (input.governorLevel ?? 0) >= 3 || !!input.hot;
    const base = BODY_RADII[input.tier];
    const fullR = base.full * (pressure ? PRESSURE_RADIUS : 1);
    const cap = Math.max(1, Math.floor((input.cap ?? STORY_BODY_CAP[input.tier]) * (pressure ? PRESSURE_CAP : 1)));
    this.fullIds.length = 0;
    let pinnedFull = 0;
    for (const a of actors) {
      const d = Math.hypot(a.pos.x - input.eye.x, a.pos.y - input.eye.y, a.pos.z - input.eye.z);
      this.dist.set(a.id, d);
      let f: Fidelity;
      if (input.pinned(a)) { f = 'full'; pinnedFull++; }
      else if (!(d <= base.impostor)) f = 'culled';
      else if (d <= fullR) { f = 'full'; this.fullIds.push(a.id); }
      else if (d <= base.reduced) f = 'reduced';
      else f = 'impostor';
      this.picks.set(a.id, f);
    }
    // over the cap: the farthest unpinned full bodies step down to reduced (pinned bodies always keep their slot)
    let over = pinnedFull + this.fullIds.length - cap;
    if (over > 0) {
      this.fullIds.sort((x, y) => (this.dist.get(y) ?? 0) - (this.dist.get(x) ?? 0));
      for (let i = 0; i < this.fullIds.length && over > 0; i++, over--) this.picks.set(this.fullIds[i], 'reduced');
    }
    let n = 0;
    for (const f of this.picks.values()) if (f === 'full') n++;
    this.fullCount = n;
  }

  /** Forget a body that left the scene. */
  forget(id: ActorId): void { this.picks.delete(id); this.dist.delete(id); }

  /** Animate this body on this rendered frame? Full every frame, reduced every third, impostor and culled never. */
  static animates(f: Fidelity, frame: number): boolean {
    return f === 'full' || (f === 'reduced' && frame % 3 === 0);
  }

  /** Does a body at this fidelity cast a shadow? (The plan: the player, the partner and a boss on a phone; the view
   *  narrows a full body's shadow by tier.) */
  static shadows(f: Fidelity): boolean { return f === 'full'; }

  /** Is `a` at least as detailed as `b`? */
  static atLeast(a: Fidelity, b: Fidelity): boolean { return ORDER.indexOf(a) <= ORDER.indexOf(b); }
}
