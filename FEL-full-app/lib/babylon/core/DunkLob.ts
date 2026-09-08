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

/** A fair catch: the ball inside the catch radius of the hand. */
export function canCatch(hand: V3, ball: V3, radius = LOB_CATCH_RADIUS): boolean {
  const dx = hand.x - ball.x, dy = hand.y - ball.y, dz = hand.z - ball.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}
