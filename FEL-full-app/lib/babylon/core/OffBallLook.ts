// OffBallLook — where a body OFF the ball keeps its chest and its eyes (lane/h3-aware, owner decision 2026-10-24: port PR #313's H3c
// "situational awareness" — the players' eyes and bodies track the ball, their man and the rim). The posture layer turns the head and
// the thoracic chain toward the two points this returns (PostureFeed `eyes` / `aim`):
//   - OFFENCE off the ball (a spacer, a cutter, a popper; a crasher or a roller once a shot is up): the eyes on the BALL — that is how a
//     pass is caught. On release the eyes were on the RIM, so a spacer had the ball out of view about half the time (#313's _aware-read,
//     head 62° off the ball p50). A SCREENER's eyes are on the man he screens. The chest stays the job's (the mode's objectiveFor).
//   - DEFENCE off the ball (deny / help / navigate): "ball-you-man" — the chest opens between the ball and the man (the pistols), the
//     eyes on the ball with a glance at the man every MAN_GLANCE_EVERY_SEC.
//   - DEFENCE on the ball (onball / closeout / recover): the chest on the man, the eyes on his middle (where the ball and the hips are).
//   - A box-out or a chase keeps the job's chest; the eyes are on the ball (the shot coming off the iron, the loose ball).
// The glance clock is the mode's clock (absolute seconds) plus a per-body offset, so the bodies do not glance in unison and a frame the
// level of detail skips loses nothing. Pure apart from Vector3; every number is a feel knob (group "Hoops · 3v3 awareness").
import { Vector3 } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** The look on (1) / off (0). Off: the release feed exactly (the chest on the job, the eyes on the ball on D and the rim on O). TUNED (new). */
export const OFF_BALL_LOOK_ON = 1;
/** An off-ball defender glances at his man every this many seconds… TUNED (new; #313 MAN_GLANCE 1.6 s). */
export const MAN_GLANCE_EVERY_SEC = 1.6;
/** …for this long. TUNED (new; #313 0.4 s). */
export const MAN_GLANCE_SEC = 0.4;
/** Where the eyes read a man: his middle (m over his root) — the ball and the hips. */
export const MID_Y = 1.0;

export type LookSide = 'offense' | 'defense';
export const OFF_BALL_DEFENSE_JOBS: ReadonlySet<string> = new Set(['deny', 'help', 'navigate']);
export const ON_BALL_DEFENSE_JOBS: ReadonlySet<string> = new Set(['onball', 'closeout', 'recover']);

export const offBallLookOn = (): boolean => feel('hoops.offBallLookOn', OFF_BALL_LOOK_ON) >= 0.5;

export interface OffBallLookIn {
  self: Vector3; ball: Vector3;
  /** The job's own chest target (the mode's objectiveFor) — kept where this layer has no better read. */
  jobAim: Vector3;
  /** The man (a defender's mark; a screener's screened defender), or null. */
  man: Vector3 | null;
  side: LookSide; job: string;
  /** The mode's clock (s): the glance's phase. */
  clock: number;
}

export class OffBallLook {
  readonly aim = new Vector3();
  readonly eyes = new Vector3();
  /** What the eyes are on this frame (for probes and tests). */
  reading: 'ball' | 'man' | 'job' = 'ball';
  constructor(private readonly glanceOffset = 0) {}

  update(i: OffBallLookIn): this {
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
    const every = Math.max(0.2, feel('hoops.manGlanceEverySec', MAN_GLANCE_EVERY_SEC));
    const sec = Math.min(every, Math.max(0, feel('hoops.manGlanceSec', MAN_GLANCE_SEC)));
    const phase = (((i.clock + this.glanceOffset) % every) + every) % every;
    if (phase > every - sec) { this.eyes.set(i.man.x, i.man.y + MID_Y, i.man.z); this.reading = 'man'; }
    return this;
  }
}
