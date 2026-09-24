// DunkLob — the self-lob / kick-up / alley-oop arc (DUNK-CONTROL-JUICE, 2026-09-08). Pure so the arc is unit-tested.
//
// The old alley-oop LERPED the ball from the teammate's hand to the dunker's head and the ball was then parented to the
// palm on a timer — a teleport, never a catch. Now every toss is a real ballistic arc aimed at the CATCH POINT (where the
// ball hand is at the catch beat of the flight) and timed to arrive when the dunker's hand gets there; the catch is a
// proximity check against the ball hand, and a toss the hand never meets bounces away — "LOST THE LOB", a miss.

export interface V3 { x: number; y: number; z: number }

export const GRAVITY = 9.81;
/** The ball hand catches inside this radius of the ball's centre (a 0.24 m ball + an open hand's reach). */
export const LOB_CATCH_RADIUS = 0.55;
/** Clip time of the flight where the lob is aimed to arrive — the hang rise, hand up, before the reach goes to the rim. */
export const LOB_CATCH_CLIP_T = 0.62;
/** The catch beat in REAL seconds after the launch: 0.3 s of clip at 1× to the rise, then the hang slow-mo (0.4× for
 *  0.4 s real = 0.16 s of clip), then 1× — clip 0.62 lands at ≈ 0.86 s real. */
export const LOB_CATCH_REAL_SEC = 0.3 + 0.4 + (LOB_CATCH_CLIP_T - 0.3 - 0.16);

/** The launch velocity that carries a ball from `from` to `to` in exactly `tf` seconds under gravity. */
export function lobVelocity(from: V3, to: V3, tf: number): V3 {
  const t = Math.max(0.05, tf);
  return { x: (to.x - from.x) / t, y: (to.y - from.y) / t + 0.5 * GRAVITY * t, z: (to.z - from.z) / t };
}

/** The ball's position `t` seconds into a lob. */
export function lobAt(from: V3, v: V3, t: number): V3 {
  return { x: from.x + v.x * t, y: from.y + v.y * t - 0.5 * GRAVITY * t * t, z: from.z + v.z * t };
}

/** The arc's apex height above the floor. */
export function lobApex(from: V3, v: V3): number {
  if (v.y <= 0) return from.y;
  return from.y + (v.y * v.y) / (2 * GRAVITY);
}

/** How long the dunker needs to reach the takeoff line from `dist` metres out at `speed` (m/s, the hold-run ramps to it),
 *  plus the flight's own catch beat. A standing thrower gets the run's ramp folded in (2 → max over ~0.8 s). */
export function lobFlightTime(dist: number, speed: number, ramping: boolean, catchRealSec = LOB_CATCH_REAL_SEC): number {
  const v = Math.max(1.5, speed);
  const run = ramping ? Math.max(0, dist) / v + 0.35 : Math.max(0, dist) / v;
  return Math.max(0.05, run + catchRealSec);
}

/** Seconds to cover `dist` metres starting at `v0` m/s, accelerating at `accel` m/s² up to `vmax` and holding it — the
 *  hold-run's ramp. A toss timed at the throw frame's speed as if it held arrived late against a run that kept ramping. */
export function runTimeToLine(dist: number, v0: number, vmax: number, accel: number): number {
  const d = Math.max(0, dist), a = Math.max(0.01, accel), v = Math.max(0.1, Math.min(v0, vmax)), top = Math.max(v, vmax);
  const dRamp = (top * top - v * v) / (2 * a);
  if (d <= dRamp) return (-v + Math.sqrt(v * v + 2 * a * d)) / a;
  return (top - v) / a + (d - dRamp) / top;
}

/** THE GATHER STRIDE (2026-09-18): the last stride into the line eases the run toward the flight's carry speed. */
export interface GatherStride {
  strideSec: number; minM: number; easeSec: number; carryMps: number;
  /** DUNK MOTION phase 8: push 1-2 at the runner's own speed (DunkGatherRun). When given, the gather starts `planDist(v)` out and
   *  takes `planSec(d, v)` from there to the line — the first-order ease to carryMps is the old model. */
  planDist?: (v: number) => number;
  planSec?: (d: number, v: number) => number;
}
/**
 * The hold-run ramp's time to the line WITH the gather stride: inside max(minM, v · strideSec) of the line the speed eases
 * (first-order, easeSec) toward carryMps instead of ramping. Integrated at 5 ms — a toss timed on the plain ramp arrived
 * before the hand once the gather slowed the last stride (measured: the cartwheel's self-lob LOST, dropped at 1.38 s).
 */
export function runTimeToLineGather(dist: number, v0: number, vmax: number, accel: number, g: GatherStride): number {
  let d = Math.max(0, dist), v = Math.max(0.1, Math.min(v0, vmax)), t = 0;
  const step = 0.005;
  let gathering = false;
  for (let i = 0; i < 4000 && d > 0; i++) {
    if (g.planDist && g.planSec && d <= g.planDist(v)) { t += g.planSec(d, v); d = 0; break; }
    if (!g.planDist && !gathering && d <= Math.max(g.minM, v * g.strideSec)) gathering = true;
    if (gathering) v += (g.carryMps - v) * Math.min(1, step / Math.max(1e-3, g.easeSec));
    else v = Math.min(vmax, v + accel * step);
    const dz = v * step;
    if (dz >= d) { t += d / Math.max(0.05, v); d = 0; break; }
    d -= dz; t += step;
  }
  return t;
}

/** A fair catch: the ball inside the catch radius of the hand. */
export function canCatch(hand: V3, ball: V3, radius = LOB_CATCH_RADIUS): boolean {
  const dx = hand.x - ball.x, dy = hand.y - ball.y, dz = hand.z - ball.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

// ── DUNK-GLASS-BOUNCE (2026-09-08): the off-glass throw and the bounce-bounce self-lob ─────────────────────────────
// Both are the same honest arc as the self-lob — a ballistic throw aimed at the CATCH POINT and timed to arrive with the
// hand — with a rebound folded in: the backboard's face for the off-glass throw (WDA "Off The Backboard"), the floor
// (or a prop's top: "off the car") once or twice for the bounce lob (WDA "Bounce Ball"). The solvers hand back the
// launch velocity AND where the rebound happens, so the mode can say "hits the glass at 3.6 m" before the ball leaves.

/** The backboard's restitution: the normal component the glass gives back, the tangential it keeps (a slight scrub). */
export const GLASS_E_N = 0.72, GLASS_E_T = 0.92;
/** A basketball on hardwood: NBA spec drops from 1.8 m rebound to 1.25–1.4 m (e ≈ 0.83–0.88); the floor's scrub on the
 *  roll is BallSim's 0.85. The old 0.62 default is a dead tennis ball. */
export const FLOOR_E = 0.8, FLOOR_FRICTION = 0.85;

export interface GlassLob { v: V3; hit: V3; t1: number }

/** The launch velocity that carries a ball from `from` to the face of a board at `boardZ` (a plane normal to z, the ball
 *  travelling toward −z), rebounds off it (normal e `eN`, tangential keep `eT`) and lands on `to` at exactly `tf` seconds.
 *  Returns null when `from` and `to` are not both in front of the board. The hit point is the ball's CENTRE at contact (a
 *  radius in front of the face) — the mode decides whether that is on the glass or over it. */
export function glassLobVelocity(from: V3, to: V3, boardZ: number, tf: number, eN = GLASS_E_N, eT = GLASS_E_T, radius = 0.12): GlassLob | null {
  const t = Math.max(0.05, tf);
  const zc = boardZ + radius;                         // the centre's plane at contact (the ball sim rebounds there)
  const dz1 = zc - from.z, dz2 = to.z - zc;           // toward the board, then back out
  if (!(dz1 < 0 && dz2 > 0)) return null;
  const s1 = -dz1, s2 = dz2;                          // distances travelled along z before / after the glass
  const vz = (s1 + s2 / eN) / t;                      // |vz| in, eN·|vz| out
  const t1 = s1 / vz, t2 = t - t1;
  const tang = t1 + eT * t2;                          // the tangential axes keep eT of their speed after the hit
  const vx = (to.x - from.x) / tang;
  const vy = (to.y - from.y + 0.5 * GRAVITY * t1 * t1 + eT * GRAVITY * t1 * t2 + 0.5 * GRAVITY * t2 * t2) / tang;
  const hit = { x: from.x + vx * t1, y: from.y + vy * t1 - 0.5 * GRAVITY * t1 * t1, z: zc };
  return { v: { x: vx, y: vy, z: -vz }, hit, t1 };
}

/** The ball's position `t` seconds into an off-glass throw (the mirror of `lobAt` with the rebound folded in). */
export function glassLobAt(from: V3, g: GlassLob, t: number, eN = GLASS_E_N, eT = GLASS_E_T): V3 {   // g.hit.z is the contact plane
  if (t <= g.t1) return lobAt(from, g.v, t);
  const vyHit = g.v.y - GRAVITY * g.t1;
  const v2 = { x: g.v.x * eT, y: vyHit * eT, z: -g.v.z * eN };
  return lobAt(g.hit, v2, t - g.t1);
}

export interface BounceLob { v: V3; bounces: V3[]; times: number[]; apex: number; /** bounceOntoVelocity only: the throw's own flight time */ tf?: number }

/** Where a bounce lob's floor contacts land (the ball's centre at radius over the floor) and the launch velocity that
 *  gets a ball from `from`, thrown DOWN into the floor at `floorY`, up through exactly `n` bounces (restitution `e`, the
 *  horizontal speed scrubbed by `friction` at each) to `to` at `tf` seconds. The last hop's apex is the free parameter:
 *  it is bisected so the total time is `tf`; null when no apex in [to.y + 0.05, to.y + 3] gets there in time (the mode
 *  drops to one bounce, then to the plain lob). The catch is on the DESCENT of the last hop (the ball hangs at the top
 *  of its bounce and settles into the hand — a WDA bounce catch, not a snatch on the way up). */
export function bounceLobVelocity(from: V3, to: V3, tf: number, n: 1 | 2, floorY = 0, radius = 0.12, e = FLOOR_E, friction = FLOOR_FRICTION): BounceLob | null {
  const t = Math.max(0.05, tf), g = GRAVITY, R = floorY + radius;
  if (to.y <= R) return null;
  const solve = (apex: number): { total: number; vy0: number; ts: number[]; hops: number[]; tau: number } | null => {
    // the last hop leaves the floor at uN and peaks at `apex`; every earlier hop is 1/e faster; the drop's impact speed is
    // the first hop's out-speed over e
    const uN = Math.sqrt(2 * g * (apex - R));
    let u = uN; const hops: number[] = [];   // hop flight times, the last one excluded
    for (let i = n - 1; i >= 1; i--) { u = u / e; hops.unshift(2 * u / g); }
    const w1 = u / e;                          // the impact speed of the thrown ball
    const drop = from.y - R;                   // negative when the floor is ABOVE the hand (a prop's top): thrown up onto it
    const vy0sq = w1 * w1 - 2 * g * drop;
    const vy0 = drop < 0 ? Math.sqrt(vy0sq) : vy0sq > 0 ? -Math.sqrt(vy0sq) : 0;   // down at the floor; up onto a roof; a ball that only needs the drop is let go
    const w = Math.sqrt(vy0 * vy0 + 2 * g * drop);
    const t1 = (w + vy0) / g;                  // the flight to the first contact (the positive root)
    // the catch on the last hop's descent: R + uN τ − ½ g τ² = to.y, the later root
    const disc = uN * uN - 2 * g * (to.y - R);
    if (disc < 0) return null;
    const tau = (uN + Math.sqrt(disc)) / g;
    const ts = [t1]; let acc = t1; for (const h of hops) { acc += h; ts.push(acc); }
    return { total: acc + tau, vy0, ts, hops, tau };
  };
  let lo = to.y + 0.05, hi = to.y + 3;
  const sLo = solve(lo), sHi = solve(hi);
  if (!sLo || !sHi) return null;
  if (sLo.total > t || sHi.total < t) return null;   // too little time even for the lowest hop / too much for the highest
  let s = sLo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2; const sm = solve(mid); if (!sm) return null;
    if (sm.total > t) hi = mid; else lo = mid;
    s = sm;
  }
  // the horizontal: one straight line from → to, the speed scrubbed by `friction` at every floor contact
  let span = s.ts[0]; let f = 1;
  for (const h of s.hops) { f *= friction; span += f * h; }
  f *= friction; span += f * s.tau;
  const vx = (to.x - from.x) / span, vz = (to.z - from.z) / span;
  const bounces: V3[] = []; let px = from.x, pz = from.z, ff = 1, tPrev = 0;
  for (const tb of s.ts) { px += vx * ff * (tb - tPrev); pz += vz * ff * (tb - tPrev); bounces.push({ x: px, y: R, z: pz }); ff *= friction; tPrev = tb; }
  return { v: { x: vx, y: s.vy0, z: vz }, bounces, times: s.ts, apex: lo };
}

/** A bounce ONTO something (a car's roof, a crate): the one floor contact is pinned to the point on the from → to line at
 *  `bounceZ` over a floor at `floorY`, and the throw's own clock is what it is (the mode cues the run to it). The last hop's
 *  apex is the free parameter, bisected so the split of the horizontal travel before / after the contact (t1 : friction·τ)
 *  matches the geometry; null when the contact would need a throw higher than `apexCap` (the thrower too far from it). */
export function bounceOntoVelocity(from: V3, to: V3, bounceZ: number, floorY: number, radius = 0.12, e = FLOOR_E, friction = FLOOR_FRICTION, apexCap = 9): BounceLob | null {
  const g = GRAVITY, R = floorY + radius;
  if (to.y <= R) return null;
  const dz = to.z - from.z; if (Math.abs(dz) < 1e-6) return null;
  const k = (bounceZ - from.z) / dz;                    // the contact's place along the line, 0 → 1
  if (k <= 0.02 || k >= 0.98) return null;
  const want = (k * friction) / (1 - k);                // t1 / τ the geometry asks for: k = t1 / (t1 + friction·τ) (the roll is scrubbed after the contact)
  // the catch on the hop's descent (the ball settles into the hand) or, failing that, on its rise (snatched on the way up)
  const parts = (apex: number, descent: boolean) => {
    const uN = Math.sqrt(2 * g * (apex - R)), w1 = uN / e, drop = from.y - R;
    const vy0sq = w1 * w1 - 2 * g * drop; if (vy0sq < 0) return null;
    const vy0 = drop < 0 ? Math.sqrt(vy0sq) : -Math.sqrt(vy0sq);
    const t1 = (w1 + vy0) / g;
    const disc = uN * uN - 2 * g * (to.y - R); if (disc < 0) return null;
    const tau = (uN + (descent ? 1 : -1) * Math.sqrt(disc)) / g;
    return { t1, tau, vy0, uN };
  };
  // t1/τ is not monotonic in the apex (a high last hop is a long descent): bracket a sign change on a scan, then bisect
  for (const descent of [true, false]) {
    // the split is continuous through a catch AT the apex (descent → ascent), so the scan starts a hair over the catch height
    const lo0 = to.y + 0.003, steps = 120; let prev: number | null = null, prevA = lo0, hit: [number, number] | null = null;
    for (let i = 0; i <= steps; i++) {
      const a = lo0 + ((apexCap - lo0) * i) / steps; const pm = parts(a, descent); if (!pm) { prev = null; prevA = a; continue; }
      const f = pm.t1 / pm.tau - want;
      if (prev != null && Math.sign(f) !== Math.sign(prev)) { hit = [prevA, a]; break; }
      prev = f; prevA = a;
    }
    if (!hit) continue;
    let [lo, hi] = hit; let s = parts(lo, descent)!; const fLo = Math.sign(s.t1 / s.tau - want);
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const pm = parts(mid, descent); if (!pm) break; const f = Math.sign(pm.t1 / pm.tau - want); if (f === fLo) lo = mid; else hi = mid; s = pm; }
    const vx = (to.x - from.x) / (s.t1 + friction * s.tau), vz = dz / (s.t1 + friction * s.tau);
    return { v: { x: vx, y: s.vy0, z: vz }, bounces: [{ x: from.x + vx * s.t1, y: R, z: from.z + vz * s.t1 }], times: [s.t1], apex: lo, tf: s.t1 + s.tau };
  }
  return null;
}

/** The least flight time a bounce lob can be thrown in (the lowest last hop that still reaches `to`): the mode throws a
 *  STANDING bounce lob on this clock and cues the run to meet it. Null when no hop count works. */
export function bounceLobMinTime(from: V3, to: V3, n: 1 | 2, floorY = 0, radius = 0.12, e = FLOOR_E, friction = FLOOR_FRICTION): number | null {
  const ok = (tf: number) => bounceLobVelocity(from, to, tf, n, floorY, radius, e, friction) != null;
  let lo = 0.3, hi = -1;
  for (let tf = 0.4; tf <= 6; tf += 0.1) { if (ok(tf)) { hi = tf; break; } lo = tf; }   // the feasible window is bounded above too (the apex cap)
  if (hi < 0) return null;
  for (let i = 0; i < 25; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return hi;
}

/** The rim's iron as a ring of small colliders (the lob sweeps against them — a toss that clips the iron clanks, it
 *  does not pass through the rim on its way to the catch). */
export function rimRing(center: V3, ringRadius: number, n = 12): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push({ x: center.x + Math.cos(a) * ringRadius, y: center.y, z: center.z + Math.sin(a) * ringRadius }); }
  return out;
}

// ── THE CORNER BILLBOARD (DUNK PARKOUR, 2026-09-18: "throw alley oops off that and dunk it") ─────────────────────────
// The backboard solver works in a frame where the glass is the plane z = boardZ and the ball comes from +z. A corner pane
// has a diagonal normal, so the throw is solved in the PANE's frame — z' along its normal (the runway side is +z'), x'
// along its face — and the velocity rotated back. The ball then flies in the world and BallPhysics.sweptPaneHit reflects
// it off the pane with the same eN / eT the solve assumed.
export interface Pane2 { cx: number; cz: number; nx: number; nz: number }
export function paneLobVelocity(from: V3, to: V3, pane: Pane2, tf: number, eN = GLASS_E_N, eT = GLASS_E_T, radius = 0.12): (GlassLob & { hitWorld: V3 }) | null {
  const n = Math.hypot(pane.nx, pane.nz) || 1, nx = pane.nx / n, nz = pane.nz / n, tx = -nz, tz = nx;
  const local = (p: V3): V3 => ({ x: (p.x - pane.cx) * tx + (p.z - pane.cz) * tz, y: p.y, z: (p.x - pane.cx) * nx + (p.z - pane.cz) * nz });
  const world = (p: V3): V3 => ({ x: pane.cx + p.x * tx + p.z * nx, y: p.y, z: pane.cz + p.x * tz + p.z * nz });
  const f = local(from), t = local(to);
  if (f.z <= 0 || t.z <= 0) return null;   // both ends must be in front of the pane
  const g = glassLobVelocity(f, t, 0, tf, eN, eT, radius);
  if (!g) return null;
  const v = { x: g.v.x * tx + g.v.z * nx, y: g.v.y, z: g.v.x * tz + g.v.z * nz };
  return { v, hit: g.hit, t1: g.t1, hitWorld: world({ x: g.hit.x, y: g.hit.y, z: 0 }) };
}
