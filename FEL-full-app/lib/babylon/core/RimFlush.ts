// RimFlush — DUNK-BALL-ARMS-RIM (2026-09-14): the made dunk's ball, from the hand at the iron to the floor. Pure, no Babylon.
//
// Measured on 8586f1e (probe _dunk-ball-arms-rim-probe, five makes): the old flush (ballRig.flushThroughRim) LERPED the ball
// from where the hand let go — 0.16–0.28 m out from the ring's axis at the ring's own height — straight across to the axis
// in 0.22 s, so the ball slid sideways THROUGH the iron (5–8 frames with its centre inside the metal), then sank at a
// constant 2.4 m/s for 0.25 s and stopped 0.6 m under the ring. It hung there, still, through the replay and the judges
// (74–171 frames at y ~2.5): a ball glued in the net. A dunk pushes the ball OVER the lip and DOWN the ring's axis; the net
// grabs it, lets it out the bottom, and it drops to the floor and bounces.
//
//   lip   — from the release the ball moves in toward the axis while it stays clear of the ring (its centre never closer to
//           the ring's circle than a radius + the tube, less a centimetre of squash), then down
//   net   — below the ring the net grabs it (its fall is capped and it centres on the axis) down to the net's bottom
//   free  — out of the net it is a loose ball: the caller hands `pos` / `vel` to the ball sim (gravity, floor bounce)

export type V3 = { x: number; y: number; z: number };

export const RING_TUBE_M = 0.01;          // the iron's tube radius (a 5/8" rod, near enough)
export const FLUSH_LIP_SEC = 0.09;        // over the lip and into the ring (a release already inside the ring takes less)
export const FLUSH_THROW_V = 3.0;         // m/s down the axis as the ball comes off the lip (the slam's push)
export const NET_DEPTH_M = 0.45;          // the net's bottom under the ring
export const NET_MAX_FALL = 2.4;          // m/s — the net's grab caps the fall while the ball is in it
const G = -9.81;
const SQUASH_M = 0.01;                    // the ball may squash this far into the iron on the way over (a centimetre is a touch, not a pass through)

export interface FlushState {
  phase: 'lip' | 'net' | 'free';
  t: number;
  pos: V3; vel: V3;
  /** the release, the horizontal unit from the axis toward it, its radial distance, the radial it pushes in to, the lip's
   *  length, the height it comes off the lip at, and the lift over the iron sampled on the lip's clock (HUMP_N + 1 values) */
  from: V3; ux: number; uz: number; r0: number; rIn: number; lipSec: number; yIn: number; lift: number[];
}

/** How close the ball's centre may come to the ring's circle: a radius + the tube, less the squash. */
export const ringClearance = (ballR: number) => ballR + RING_TUBE_M - SQUASH_M;

/** Distance from a point to the ring's circle (the iron's centreline). */
export function ringDistance(p: V3, rim: V3, ringR: number): number {
  return Math.hypot(Math.hypot(p.x - rim.x, p.z - rim.z) - ringR, p.y - rim.y);
}

const HUMP_N = 60;
const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
/** The lift kernel: full over ±PLATE of a sample's lip time, easing to nothing by ±REACH — so the lift is smooth on the clock. */
const PLATE = 0.06, REACH = 0.3;
const kernel = (d: number) => 1 - smooth(PLATE, REACH, Math.abs(d));
function baseAt(s: Pick<FlushState, 'from' | 'r0' | 'rIn' | 'yIn'>, tau: number): { r: number; y: number } {
  const e = smooth(0, 0.65, tau);   // in toward the axis early, so the lift can come down once the iron is behind it
  return { r: s.r0 + (s.rIn - s.r0) * e, y: s.from.y + (s.yIn - s.from.y) * e };
}
function lipAt(s: FlushState, tau: number): { r: number; y: number } {
  const b = baseAt(s, tau), f = Math.min(1, Math.max(0, tau)) * HUMP_N, i = Math.min(HUMP_N - 1, Math.floor(f)), k = f - i;
  return { r: b.r, y: b.y + s.lift[i] + (s.lift[i + 1] - s.lift[i]) * k };
}

/** Where along this frame's travel (prev → cur) the ball first TOUCHED the iron (its centre a clearance from the ring's circle).
 *  The jam carries the ball ~0.1 m a frame, so the frame the contact is seen on already has it 3–7 cm into the metal; the
 *  release belongs at the touch. Returns `cur` when the ball is clear, or when it was already in the iron a frame ago. */
export function sweptTouch(prev: V3, cur: V3, rim: V3, ringR: number, ballR: number): V3 {
  const c = ringClearance(ballR);
  const at = (k: number) => ({ x: prev.x + (cur.x - prev.x) * k, y: prev.y + (cur.y - prev.y) * k, z: prev.z + (cur.z - prev.z) * k });
  if (ringDistance(cur, rim, ringR) >= c || ringDistance(prev, rim, ringR) < c) return { x: cur.x, y: cur.y, z: cur.z };
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (ringDistance(at(m), rim, ringR) >= c) lo = m; else hi = m; }
  return at(lo);
}

export function startFlush(release: V3, rim: V3, ringR: number, ballR: number): FlushState {
  const dx = release.x - rim.x, dz = release.z - rim.z, r0 = Math.hypot(dx, dz);
  const ux = r0 > 1e-4 ? dx / r0 : 0, uz = r0 > 1e-4 ? dz / r0 : 1;   // no offset: the court side (+z)
  const rIn = Math.min(r0, Math.max(0, ringR - ringClearance(ballR) - 0.012));   // inside the ring with daylight
  // the height it comes off the lip at: never under the ring's plane from above, never under where it was let go
  const yIn = Math.max(release.y, rim.y + 0.005);
  const from = { x: release.x, y: release.y, z: release.z };   // copied by field: a Babylon Vector3 spreads to its private _x/_y/_z
  const base = { from, r0, rIn, yIn };
  const lift = new Array<number>(HUMP_N + 1).fill(0);
  // A release OUTSIDE the ring's radius has the iron between it and the hole: the ball rides OVER it. The lift is the least
  // that keeps the ball clear once it is moving; a release the hand already squashed into the iron (it met the ring low)
  // climbs out over the first half of the lip instead of popping out on one frame. Inside the radius, moving in is already
  // moving away from the iron.
  if (r0 >= ringR) {
    const c = ringClearance(ballR), d0 = Math.min(c, ringDistance(release, rim, ringR));
    const need = new Array<number>(HUMP_N + 1).fill(0);
    for (let i = Math.ceil(0.12 * HUMP_N); i <= HUMP_N; i++) {
      const tau = i / HUMP_N, p = baseAt(base, tau), want = d0 + (c - d0) * smooth(0, 0.5, tau), dr = p.r - ringR;
      if (Math.abs(dr) < want) need[i] = Math.max(0, rim.y + Math.sqrt(want * want - dr * dr) - p.y);
    }
    for (let i = 0; i <= HUMP_N; i++) for (let j = 0; j <= HUMP_N; j++) if (need[j] > 0) lift[i] = Math.max(lift[i], need[j] * kernel((i - j) / HUMP_N));
    lift[HUMP_N] = 0;   // off the lip at the base height (the ball is inside the ring by then)
  }
  const peak = Math.max(...lift);
  const lipSec = FLUSH_LIP_SEC * Math.min(1, Math.max(0.4, (r0 - rIn) / 0.2)) + peak * 1.0;
  return { phase: 'lip', t: 0, pos: { ...from }, vel: { x: 0, y: 0, z: 0 }, ux, uz, lipSec, lift, ...base };
}

/** Advance the flush by `dt` seconds (in place; returns the state). `free` = the caller's ball sim owns the ball now. */
export function stepFlush(s: FlushState, rim: V3, ringR: number, ballR: number, dt: number): FlushState {
  if (s.phase === 'free' || dt <= 0) return s;
  const prev = { ...s.pos };
  s.t += dt;
  if (s.phase === 'lip') {
    const tau = Math.min(1, s.t / s.lipSec), p = lipAt(s, tau);
    s.pos = { x: rim.x + s.ux * p.r, y: p.y, z: rim.z + s.uz * p.r };
    // off the lip once the ball is inside the ring with the lift spent (the last of the clock would be a held frame)
    const li = Math.min(HUMP_N, Math.round(tau * HUMP_N));
    if (tau >= 1 || (tau >= 0.7 && s.lift[li] < 0.004 && p.r <= s.rIn + 0.003)) { s.phase = 'net'; s.vel = { x: 0, y: -FLUSH_THROW_V, z: 0 }; }
    else s.vel = { x: (s.pos.x - prev.x) / dt, y: (s.pos.y - prev.y) / dt, z: (s.pos.z - prev.z) / dt };
    return s;
  }
  // net: gravity from the throw, the fall capped by the net under the plane, the ball centred on the axis as it goes down
  s.vel.y += G * dt;
  if (s.pos.y < rim.y) s.vel.y = Math.max(s.vel.y, -NET_MAX_FALL);
  const centre = 1 - Math.exp(-dt / 0.08);
  s.pos = { x: s.pos.x + (rim.x - s.pos.x) * centre, y: s.pos.y + s.vel.y * dt, z: s.pos.z + (rim.z - s.pos.z) * centre };
  s.vel.x = (s.pos.x - prev.x) / dt; s.vel.z = (s.pos.z - prev.z) / dt;
  if (s.pos.y <= rim.y - NET_DEPTH_M) {
    s.phase = 'free';
    // out of the net's bottom: a little of the net's swing toward the court (+z) so it does not land dead on its own drop point
    s.vel = { x: s.vel.x * 0.3, y: s.vel.y, z: s.vel.z * 0.3 + 0.35 };
  }
  return s;
}
