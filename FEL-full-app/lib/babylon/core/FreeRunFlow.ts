// FREE RUN FLOW — the momentum rules of the parkour racer (owner brief, 2026-09-18): "movement generates combat resources,
// and combat maintains traversal momentum."
//
// Two meters and a handful of timing rules, all pure:
//   · FLOW. Wall-runs, rail grinds, surfs, tricks, rebounds and clean landings fill it; standing still drains it. Its TIER
//     raises the top running speed, and a tier can be SPENT on landing as a speed burst (a trick converts flow to speed).
//   · KINETIC (Overdrive). Hits, dodges, chains and clean landings fill it; Y spends it — a forward burst, or a ground
//     slam that clears whoever is near.
//   · VECTOR REBOUND: hit a wall at an angle and tap on contact — the heading reflects off the wall with the speed kept
//     (no magnetism, no decay); head-on is still a wall run.
//   · MOMENTUM VAULT: the press is graded against the obstacle — a perfect frame is a catapult into an air dash.
//   · DRAFT: behind a runner, the gauge fills; full, A slingshots past.
//   · SPEED GATES open only above a threshold.

export const FLOW = {
  max: 300,
  /** The tier floors: 0 below 80, 1 to 170, 2 to 260, 3 at the top. */
  tiers: [0, 80, 170, 260],
  /** Drains this fast on the ground with no move going. */
  decayPerSec: 14,
  wallRunPerSec: 40, grindPerSec: 35, surfPerSec: 30,
  trick: 50, cleanLand: 15, rebound: 40, perfectVault: 30, goodVault: 10, slingshot: 25,
  /** Top speed gain per tier (×). */
  topSpeedPerTier: 0.07,
  /** The landing burst a spent tier gives, m/s. */
  burstPerTier: 1.6,
} as const;

export class FlowMeter {
  value = 0;
  get tier(): number { let t = 0; for (let i = 1; i < FLOW.tiers.length; i++) if (this.value >= FLOW.tiers[i]) t = i; return t; }
  get frac(): number { return this.value / FLOW.max; }
  add(n: number): void { this.value = Math.max(0, Math.min(FLOW.max, this.value + n)); }
  /** One frame: `moving` = a flow move is going (wall run / grind / surf) so no drain; `idle` = standing, drains. */
  tick(dt: number, idle: boolean): void { if (idle) this.add(-FLOW.decayPerSec * dt); }
  /** The top speed multiplier this tier buys. */
  topSpeedMult(): number { return 1 + this.tier * FLOW.topSpeedPerTier; }
  /** Spend the current tier on a landing burst; returns the burst (m/s), 0 when there is no tier to spend. */
  burst(): number {
    const t = this.tier; if (t <= 0) return 0;
    this.value = FLOW.tiers[t] - 1;   // drop to the top of the tier below
    return t * FLOW.burstPerTier;
  }
}

export const KINETIC = {
  max: 100,
  hit: 25, dodge: 20, chain: 15, cleanLand: 6, parry: 30,
  burstCost: 50, slamCost: 100,
  /** The forward burst: speed added and how long it holds. */
  burstSpeed: 4.5, burstSec: 0.5,
  /** The slam clears bodies inside this radius and stuns them this long. */
  slamRadius: 4.5, slamStunSec: 1.4,
} as const;

export class KineticMeter {
  value = 0;
  add(n: number): void { this.value = Math.max(0, Math.min(KINETIC.max, this.value + n)); }
  get canBurst(): boolean { return this.value >= KINETIC.burstCost; }
  get canSlam(): boolean { return this.value >= KINETIC.slamCost; }
  spendBurst(): boolean { if (!this.canBurst) return false; this.value -= KINETIC.burstCost; return true; }
  spendSlam(): boolean { if (!this.canSlam) return false; this.value -= KINETIC.slamCost; return true; }
}

// ── the vector rebound ──────────────────────────────────────────────────────────────────────────────────────────────
export const REBOUND = {
  /** Approach angle (between the heading and the wall's inward normal) that counts as oblique: inside this is a wall run. */
  minDeg: 18, maxDeg: 72,
  /** The tap must land inside this of the contact. */
  windowSec: 0.18,
  /** Speed kept, and the bonus a perfect rebound adds (m/s). */
  keep: 1, bonus: 0.6,
} as const;

/** The angle (deg) between a heading and a wall's normal, folded to 0..90. */
export function approachDeg(heading: { x: number; z: number }, normal: { x: number; z: number }): number {
  const h = Math.hypot(heading.x, heading.z) || 1, n = Math.hypot(normal.x, normal.z) || 1;
  const c = Math.abs((heading.x * normal.x + heading.z * normal.z) / (h * n));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** The heading after a rebound off a wall with normal `n` (reflection), or null when the approach is head-on / grazing. */
export function vectorRebound(heading: { x: number; z: number }, normal: { x: number; z: number }): { x: number; z: number } | null {
  const deg = 90 - approachDeg(heading, normal);   // angle from the wall's FACE: 0 = along it, 90 = head-on
  if (deg < REBOUND.minDeg || deg > REBOUND.maxDeg) return null;
  const nl = Math.hypot(normal.x, normal.z) || 1, nx = normal.x / nl, nz = normal.z / nl;
  const d = heading.x * nx + heading.z * nz;
  const rx = heading.x - 2 * d * nx, rz = heading.z - 2 * d * nz;
  const l = Math.hypot(rx, rz) || 1;
  return { x: rx / l, z: rz / l };
}

// ── the momentum vault ──────────────────────────────────────────────────────────────────────────────────────────────
export const VAULT = {
  /** The ideal press is this many seconds before the obstacle. */
  leadSec: 0.16,
  perfectSec: 0.07, goodSec: 0.2,
  /** The catapult: speed multiplier and the air dash it opens. */
  catapultMult: 1.25, dashSpeed: 3.5, dashSec: 0.35,
} as const;
export type VaultGrade = 'perfect' | 'good' | 'late' | 'early';

/** Grade a vault press: `distM` to the obstacle's near face, `speed` m/s. */
export function vaultTiming(distM: number, speed: number): VaultGrade {
  if (speed < 0.5) return 'late';
  const err = distM / speed - VAULT.leadSec;   // + = early, − = late
  if (Math.abs(err) <= VAULT.perfectSec) return 'perfect';
  if (Math.abs(err) <= VAULT.goodSec) return 'good';
  return err > 0 ? 'early' : 'late';
}

// ── the draft ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const DRAFT = {
  /** Behind a runner inside this along-track gap and this lateral gap. */
  gapM: 7, lateralM: 1.6,
  fillPerSec: 0.55, decayPerSec: 0.35,
  /** The slingshot: speed added. */
  burst: 3.5,
} as const;

/** One frame of the drag-reduction gauge (0..1). */
export function draftStep(gauge: number, behind: boolean, dt: number): number {
  return Math.max(0, Math.min(1, gauge + (behind ? DRAFT.fillPerSec : -DRAFT.decayPerSec) * dt));
}

/** Is `me` drafting `other`? Both along-track (+ = further down the course). */
export function isDrafting(me: { along: number; lateral: number }, other: { along: number; lateral: number }): boolean {
  const gap = other.along - me.along;
  return gap > 0.8 && gap < DRAFT.gapM && Math.abs(other.lateral - me.lateral) < DRAFT.lateralM;
}

// ── speed gates ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** A gate's threshold as a share of the base top speed: tier 1 needs a run, 2 a sprint, 3 flow. */
export const GATE_NEED = [0, 0.8, 1.02, 1.14] as const;
export function gateOpen(speed: number, tier: 1 | 2 | 3, baseTop: number): boolean {
  return speed >= baseTop * GATE_NEED[tier];
}

// ── the grapple ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const GRAPPLE = {
  /** The anchor must be inside this reach, and ahead. */
  reachM: 9, minAheadM: 1.5,
  /** The swing lasts this long and lands this far past the anchor, this much faster. */
  sec: 0.75, exitPastM: 4, speedBonus: 1.8,
} as const;

/** Can a runner at `p` latch the anchor at `a`? Ahead along the course (+z) and inside reach. */
export function canGrapple(p: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }): boolean {
  const dz = a.z - p.z;
  return dz > GRAPPLE.minAheadM && Math.hypot(a.x - p.x, a.y - p.y, dz) <= GRAPPLE.reachM && a.y > p.y + 1;
}

/** Where the swing puts the body `u` (0..1) of the way through: an arc under the anchor from `from` to the exit. */
export function swingAt(from: { x: number; y: number; z: number }, anchor: { x: number; y: number; z: number }, u: number): { x: number; y: number; z: number } {
  const ex = anchor.x, ez = anchor.z + GRAPPLE.exitPastM, ey = from.y;
  const x = from.x + (ex - from.x) * u, z = from.z + (ez - from.z) * u;
  const low = Math.min(from.y, anchor.y - 2.4);
  const y = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * low + u * u * ey;   // a dip under the anchor
  return { x, y, z };
}
