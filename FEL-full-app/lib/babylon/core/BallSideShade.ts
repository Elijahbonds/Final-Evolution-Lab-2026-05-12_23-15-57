// BallSideShade — THE ON-BALL DEFENDER SHADES THE BALL SIDE (hoops round 2, owner 2026-10-20: "Defense: defenders shade the
// ball side … a good cross makes the on-ball defender re-shift, which opens a lane for a beat"). A GAMEPLAY CHANGE, flagged for
// the owner's feel test.
//
// What the on-ball man guarded before: DefenderBrain anchored his deny point on the BALL itself (Lerp(ball, hoop, lever)), so the
// point followed the ball across the handler's body on the frame it crossed — no read, no commitment, no beat — and the ball's own
// lateral (about a hand's width off the hip) was all the shade there was.
//
// What he guards now: the ball's distance along the handler→rim line as before, but ACROSS that line he stands where he has READ
// the ball to be — `offsetM` toward the ball's side (the hand the handler would drive with). When the ball changes sides he does
// not follow it on that frame: inside `rangeM` (a cross thrown at him) he holds his side for `reactSec`, then slides across at
// `shiftMps` (his mover's own accel and brake still decide what his feet really do). That hold-then-slide is the lane: the ball is
// on the new side and he is still on the old one. A cross from out of range gives him no beat (he saw it coming); a ball that comes
// back before he has gone cancels the read.
//
// Positioning only. Nothing here reads or rolls a steal, a strip, a block or a contest, and nothing changes his speed, his
// aggression or a timing window: those stay where DefenderBrain and the modes keep them. Pure: no Babylon import, no clock but `dt`.

/** The owner's switch: false restores the old anchor (the ball itself) exactly. */
export const BALL_SIDE_SHADE_ON = true;

/** TUNED (new, 2026-10-20 — first guesses for the owner's feel test; register as feel knobs once the feel panel lands). */
export const SHADE = {
  /** How far across the handler→rim line his anchor sits toward the ball's side (m, at the handler). */
  offsetM: 0.5,
  /** The beat: how long he holds his side after the ball crosses in front of him (s). */
  reactSec: 0.22,
  /** How fast the anchor slides across once he goes (m/s). */
  shiftMps: 2.4,
  /** The ball must be this far over the line before he reads the other side (m): the dribble's own sway never flips him. */
  flipM: 0.08,
  /** Only a cross thrown inside this of him earns the beat (m) — DefenderReact's DEF_REACT_RANGE. */
  rangeM: 2.4,
  /** A handler who moved further than this between two reads is a new look (a check, a switch): no beat, he is simply there (m). */
  reseedM: 1.0,
} as const;
export type ShadeTune = { readonly [K in keyof typeof SHADE]: number };

export interface Planar { x: number; z: number }

/** The handler→rim frame: `u` toward the rim, `p` its perpendicular (a fixed handedness, so a lateral's sign means a side). */
export function rimFrame(handler: Planar, hoop: Planar): { u: Planar; p: Planar } {
  const dx = hoop.x - handler.x, dz = hoop.z - handler.z;
  const L = Math.hypot(dx, dz);
  const u = L > 1e-4 ? { x: dx / L, z: dz / L } : { x: 0, z: 1 };
  return { u, p: { x: -u.z, z: u.x } };
}

/** A point's lateral off the handler→rim line (m, along `p`). */
export function lateralOf(pt: Planar, handler: Planar, hoop: Planar): number {
  const { p } = rimFrame(handler, hoop);
  return (pt.x - handler.x) * p.x + (pt.z - handler.z) * p.z;
}

export class BallSideShade {
  /** The lateral his anchor sits at now (m, along the frame's `p`). */
  private sigma = 0;
  /** The side he has read (+1 / −1 along `p`; 0 = no read yet). */
  private side: -1 | 0 | 1 = 0;
  /** Seconds he still holds before he goes. */
  private wait = 0;
  private prev: Planar | null = null;

  constructor(private readonly tune: ShadeTune = SHADE) {}

  /** The lateral of his anchor now (m). */
  get lateral(): number { return this.sigma; }
  /** He has read the ball on this side and is still holding the old one (the beat). */
  get holding(): boolean { return this.wait > 0; }

  /** Forget the read (a new possession): the next step seeds it, with no beat. */
  reset(): void { this.sigma = 0; this.side = 0; this.wait = 0; this.prev = null; }

  /**
   * One frame's read. `defender` is where he stands (the beat needs him inside `rangeM`). Returns the anchor's lateral (m along `p`).
   */
  step(dt: number, handler: Planar, ball: Planar, hoop: Planar, defender: Planar): number {
    const t = this.tune;
    const lat = lateralOf(ball, handler, hoop);
    const read: -1 | 0 | 1 = lat > t.flipM ? 1 : lat < -t.flipM ? -1 : 0;
    const jumped = !this.prev || Math.hypot(handler.x - this.prev.x, handler.z - this.prev.z) > t.reseedM;
    this.prev = { x: handler.x, z: handler.z };
    if (jumped || this.side === 0) {
      // a fresh look: he is simply on the ball's side (or square, until the ball shows a side)
      if (read !== 0) { this.side = read; this.sigma = read * t.offsetM; this.wait = 0; }
      else if (jumped) { this.side = 0; this.sigma = 0; this.wait = 0; }
      return this.sigma;
    }
    if (read !== 0 && read !== this.side) {
      // THE CROSS: the ball is on the other side now. Thrown at him (inside range), he holds his side for the beat; from out of range he
      // just goes. A ball that came back before he went (below) leaves him where he was.
      this.side = read;
      const gap = Math.hypot(defender.x - handler.x, defender.z - handler.z);
      this.wait = gap < t.rangeM ? t.reactSec : 0;
    }
    const target = this.side * t.offsetM;
    if (this.wait > 0) {
      this.wait = Math.max(0, this.wait - Math.max(0, dt));
      // the ball came back to the side he never left: the read is over, there is nothing to shift to
      if (Math.sign(this.sigma) === this.side) this.wait = 0;
      return this.sigma;
    }
    const step = t.shiftMps * Math.max(0, dt);
    this.sigma = Math.abs(target - this.sigma) <= step ? target : this.sigma + Math.sign(target - this.sigma) * step;
    return this.sigma;
  }

  /**
   * The on-ball anchor (DefenderBrain's hook): the ball's distance along the handler→rim line, and across it the side he has read.
   * `ball` keeps its own height (the brain's distances are planar). With BALL_SIDE_SHADE_ON false this is the ball, unchanged.
   */
  anchor<T extends { x: number; y: number; z: number; clone(): T }>(dt: number, handler: Planar, ball: T, hoop: Planar, defender: Planar): T {
    if (!BALL_SIDE_SHADE_ON) return ball;
    const sigma = this.step(dt, handler, ball, hoop, defender);
    const { u, p } = rimFrame(handler, hoop);
    const along = (ball.x - handler.x) * u.x + (ball.z - handler.z) * u.z;
    const out = ball.clone();
    out.x = handler.x + u.x * along + p.x * sigma;
    out.z = handler.z + u.z * along + p.z * sigma;
    return out;
  }
}
