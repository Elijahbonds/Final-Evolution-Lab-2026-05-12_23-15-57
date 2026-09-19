// PARKOUR DERBY — the home run derby as a party arena (owner brief, 2026-09-18: "Parkour Baseball — home run derby + wall-robbery").
//
// Pure reads on the ballpark the derby already builds (a wall 38 m from the plate along an arc):
//   · THE TARGETS. Zones on the outfield wall — bullseyes and multiplier glass. A hit at the wall inside a zone pays the
//     zone; glass shatters and drops a MULTIPLIER token at the wall's base that the fielders scramble to deny.
//   · THE KINETIC SWING. A bat-flip vault in the wind-up fills the flow; the swing's exit speed grows with it.
//   · THE ROBBERY. Two fielders run the wall. If one reaches the ball's crossing point in time he runs up the wall
//     (15 ft) to take it — or, with time to spare, hangs off the rail-bar above it. Pillars on the wall are rebounds
//     that speed a fielder's run.

export const PARK = {
  wallR: 38, wallTop: 6.5,
  /** The wall run's reach, the rail-bar's, and the spare time a hang needs. */
  wallRunReach: 5.5, hangReach: 7.6, hangSpareSec: 0.25, railY: 6.2,   // a ball that barely clears (6.5–7.6 m) is a hang's to take if the fielder is close (7.0 left a 7.0 m homer untouchable, measured)
  fielderSpeed: 7, fielderBearings: [-25, 25] as readonly number[], fielderR: 28,
  pillarBearings: [-12, 12] as readonly number[], pillarBoost: 1.2,
  /** The derby's Flight gravity (the mode builds it with −6). */
  g: 6,
} as const;

export interface WallTarget { id: string; bearingDeg: number; y: number; r: number; kind: 'bullseye' | 'glass'; pts: number }
export const TARGETS: readonly WallTarget[] = [
  { id: 'L2', bearingDeg: -32, y: 4.2, r: 2.4, kind: 'bullseye', pts: 100 },
  { id: 'L1', bearingDeg: -16, y: 5.4, r: 2.4, kind: 'glass', pts: 100 },
  { id: 'C', bearingDeg: 0, y: 4.8, r: 2.4, kind: 'bullseye', pts: 100 },
  { id: 'R1', bearingDeg: 16, y: 5.4, r: 2.4, kind: 'glass', pts: 100 },
  { id: 'R2', bearingDeg: 32, y: 4.2, r: 2.4, kind: 'bullseye', pts: 100 },
];

export interface WallCross { t: number; bearingDeg: number; h: number }
/** Where (and when, and how high) a ball launched with `vel` from `from` crosses the wall; null when it never gets there. */
export function predictWallCross(vel: { x: number; y: number; z: number }, from: { x: number; y: number; z: number }, wallR = PARK.wallR, g = PARK.g): WallCross | null {
  const s = Math.hypot(vel.x, vel.z); if (s < 1e-3) return null;
  const r0 = Math.hypot(from.x, from.z);
  const t = (wallR - r0) / s; if (t <= 0) return null;
  const h = from.y + vel.y * t - 0.5 * g * t * t;
  if (h <= 0) return null;   // on the ground before the wall
  return { t, bearingDeg: (Math.atan2(from.x + vel.x * t, from.z + vel.z * t) * 180) / Math.PI, h };
}
/** The zone the crossing lands in (arc distance × height), skipping zones already taken. */
export function targetHit(cross: { bearingDeg: number; h: number }, targets: readonly WallTarget[] = TARGETS, taken: ReadonlySet<string> = new Set()): WallTarget | null {
  for (const tg of targets) {
    if (taken.has(tg.id)) continue;
    const arc = (PARK.wallR * Math.abs(cross.bearingDeg - tg.bearingDeg) * Math.PI) / 180;
    if (Math.hypot(arc, cross.h - tg.y) <= tg.r) return tg;
  }
  return null;
}
export type Rob = 'wallrun' | 'hang' | null;
/** Can this fielder get to the crossing in time — and how does he take it? */
export function robRead(fielderBearingDeg: number, cross: WallCross, speed = PARK.fielderSpeed): Rob {
  const lo = Math.min(fielderBearingDeg, cross.bearingDeg), hi = Math.max(fielderBearingDeg, cross.bearingDeg);
  const boost = PARK.pillarBearings.some((b) => b > lo && b < hi) ? PARK.pillarBoost : 1;
  const arc = (PARK.wallR * (hi - lo) * Math.PI) / 180;
  const runT = arc / (speed * boost);
  if (runT > cross.t) return null;
  if (cross.h <= PARK.wallRunReach) return 'wallrun';
  if (cross.h <= PARK.hangReach && cross.t - runT >= PARK.hangSpareSec) return 'hang';
  return null;
}
export type Verdict = 'homer' | 'target' | 'robbed' | 'wall' | 'short';
export function verdictFor(cross: { h: number } | null, target: WallTarget | null, rob: Rob): Verdict {
  if (!cross) return 'short';
  if (target) return 'target';
  if (rob) return 'robbed';
  return cross.h >= PARK.wallTop ? 'homer' : 'wall';
}

export const FLOW = { full: 100, batFlip: 35, exitGain: 0.3, kineticFrom: 70 } as const;
export function flowTrick(flow: number, kind: 'batflip'): number { return Math.min(FLOW.full, flow + (kind === 'batflip' ? FLOW.batFlip : 0)); }
export function kineticSwing(flow01: number): { exitMult: number; label: string } {
  const f = Math.max(0, Math.min(1, flow01));
  return { exitMult: 1 + FLOW.exitGain * f, label: f * FLOW.full >= FLOW.kineticFrom ? 'KINETIC SWING' : f > 0 ? 'FLOW SWING' : '' };
}

export const TOKEN = { graceSec: 2.2, mult: 2 } as const;
/** The dropped multiplier: the nearest fielder's run against the grace decides who gets it. */
export function multiplierScramble(tokenBearingDeg: number, fielderBearings: readonly number[], grace = TOKEN.graceSec, speed = PARK.fielderSpeed): 'yours' | 'theirs' {
  const best = Math.min(...fielderBearings.map((b) => (PARK.wallR * Math.abs(b - tokenBearingDeg) * Math.PI) / 180 / speed));
  return best <= grace ? 'theirs' : 'yours';
}
