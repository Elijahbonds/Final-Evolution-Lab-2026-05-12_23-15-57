// OffBallLook — where a body OFF the ball keeps its chest and its eyes (H3c, owner 2026-10-16: "situational awareness" — the players'
// eyes and bodies track the ball, their man and the rim). HOOPS MOTION plan phase 9's LookAt, for the bodies HoopsLook (the handler)
// does not cover:
//   - OFFENCE off the ball (a spacer, a cutter, a popper; a crasher or roller once a shot is up): the eyes on the BALL — that is how a
//     pass is caught, and how a teammate looks like he is in the play. They were on the rim: the ball out of view about half the time
//     (_aware-read on h3c-base). A SCREENER's eyes are on the man he screens. The chest stays the job's (jobObjective).
//   - DEFENCE off the ball (deny / help / navigate): "ball-you-man" — the chest opens between the ball and the man (the pistols), the
//     eyes on the ball with a glance at the man every MAN_GLANCE_EVERY s. The chest used to face the handler.
//   - DEFENCE on the ball (onball / closeout / recover): the chest on the man, the eyes on his middle (where the ball and the hips are).
//   - A box-out or a chase keeps the job's chest; the eyes are on the ball (the shot coming off the iron, the loose ball).
// Pure; the mode keeps one per body (the glance clock) and passes the frame's facts.
import { Vector3 } from '@babylonjs/core';

/** An off-ball defender glances at his man every MAN_GLANCE_EVERY s, for MAN_GLANCE_SEC. TUNED (new). */
export const MAN_GLANCE_EVERY = 1.6, MAN_GLANCE_SEC = 0.4;
/** Where the eyes read a man: his middle (m over his root) — the ball and the hips. */
export const MID_Y = 1.0;
export type LookSide = 'offense' | 'defense';
export const OFF_BALL_DEFENSE_JOBS: ReadonlySet<string> = new Set(['deny', 'help', 'navigate']);
export const ON_BALL_DEFENSE_JOBS: ReadonlySet<string> = new Set(['onball', 'closeout', 'recover']);

export interface OffBallLookIn {
  self: Vector3; ball: Vector3;
  /** The job's own chest target (jobObjective / the mode's objective) — kept where this layer has no better read. */
  jobAim: Vector3;
  /** The man (a defender's mark; a screener's screened defender), or null. */
  man: Vector3 | null;
  side: LookSide; job: string;
  dt: number;
}

export class OffBallLook {
  readonly aim = new Vector3();
  readonly eyes = new Vector3();
  /** What the eyes are on this frame (for probes). */
  reading: 'ball' | 'man' | 'job' = 'ball';
  private clock = 0;
  constructor(private readonly glanceOffset = 0) {}

  update(i: OffBallLookIn): this {
    this.clock += Math.max(0, i.dt);
    this.aim.copyFrom(i.jobAim); this.eyes.copyFrom(i.ball); this.reading = 'ball';
    if (i.side === 'offense') {
      if (i.job === 'screen' && i.man) { this.eyes.set(i.man.x, i.man.y + MID_Y, i.man.z); this.reading = 'man'; }
      return this;
    }
    if (ON_BALL_DEFENSE_JOBS.has(i.job) && i.man) {
      this.aim.copyFrom(i.man); this.eyes.set(i.man.x, i.man.y + MID_Y, i.man.z); this.reading = 'man';
      return this;
    }
    if (!OFF_BALL_DEFENSE_JOBS.has(i.job)) { this.reading = 'job'; return this; }   // a box-out seals the man and watches the shot; a chase is the ball
    if (!i.man) return this;
    // the pistols: the chest on the bisector of the ball and the man
    const bx = i.ball.x - i.self.x, bz = i.ball.z - i.self.z, bl = Math.hypot(bx, bz);
    const mx = i.man.x - i.self.x, mz = i.man.z - i.self.z, ml = Math.hypot(mx, mz);
    if (bl > 1e-3 && ml > 1e-3) {
      let ax = bx / bl + mx / ml, az = bz / bl + mz / ml; const al = Math.hypot(ax, az);
      if (al < 1e-3) { ax = bx / bl; az = bz / bl; } else { ax /= al; az /= al; }   // (ball and man dead opposite: the ball)
      this.aim.set(i.self.x + ax * 3, i.self.y + 1.25, i.self.z + az * 3);
    }
    const glancing = ((this.clock + this.glanceOffset) % MAN_GLANCE_EVERY) > MAN_GLANCE_EVERY - MAN_GLANCE_SEC;
    if (glancing) { this.eyes.set(i.man.x, i.man.y + MID_Y, i.man.z); this.reading = 'man'; }
    return this;
  }
}
