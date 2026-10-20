// THE LINE — the scene half of a free-throw trip (lane/hoops-shot-content, owner 2026-10-20). FreeThrows.ts is the clock and the
// rules; this carries them out on the bodies: the dead-ball setup (the shooter on the stripe, everybody else on the lane lines), the
// routine (two dribbles, the ball up to the set), the press (the line's own meter, the set shot paced so its release frame lands on the
// green — the 1v1 rise's pacing, with no hop), the release (graded, decided by the iron — RimDecides, so the ring and
// the scoreboard cannot disagree) and the dead ball after it.
//
// A mode owns one FreeThrowLine and hands it a host (the bodies, the shoot button, the HUD, the camera, the score). While a trip is on,
// the mode's update returns right after `line.update(dt)` — live play is frozen under the dead ball, the way the ref stops it — and when
// the trip is over the line calls the continuation the mode gave it: the same reset or check-up the foul led to before free throws
// existed. Nothing here changes a timing window, a make chance or who has the ball next (FreeThrows.ts, assumptions 4 and 5).
import { Vector3, type AbstractMesh, type Scene, type Skeleton, type TransformNode } from '@babylonjs/core';
import { ShotArc, followThroughFor, type ShotQuality } from './BasketballCore';
import { rimDecides } from './RimDecides';
import { resolveRim, forcedMissProfile } from './RimPhysics';
import { BallSim } from './BallPhysics';
import { netExitVelocity } from './NetExit';
import { RELEASE_FRAME_01, syncedShotSpeed } from './BallHandling';
import { yawTo } from './Biomech';
import { FREE_THROW_M, FREE_THROW_POINTS, FreeThrowSequence, freeThrowLabel, freeThrowPct, freeThrowsFor, type FtEvent } from './FreeThrows';
import { rule, type Call, type RuleId } from './Ref';
import type { AnimTreeInput } from '../anim/basketballTree';
import { hoopsHand } from '../anim/hoopsHand';
import { gatherBallToHand, releaseBall } from '../anim/ballRig';
import { releaseFrameOf } from '../anim/opponentMotion';
import type { CharacterAnimator } from '../anim/CharacterAnimator';
import type { BallCarry } from '../anim/ballCarry';
import type { RigHand } from '../anim/athleteSide';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { ShotMeter3DHandle } from '../visual/ShotMeter3D';
import type { HudValue } from './ModeHarness';

/** A body the line moves and animates: the mode's own handles on it. */
export interface FtBody {
  root: TransformNode;
  skeleton: Skeleton;
  animator: Pick<CharacterAnimator, 'durationOf' | 'clipNames'>;
  tree: { beat(clip: string, o?: { fadeSec?: number; holdEnd?: boolean; speedRatio?: number }): void; hold(clip: string, o?: { fadeSec?: number; speedRatio?: number }): void; release(): void };
  carry: BallCarry | null;
  /** The rig hand the ball rides at the line (the athlete's right, as drawn). */
  hand(): RigHand;
}

export interface FreeThrowHost {
  scene: Scene;
  ball: AbstractMesh;
  rim: Vector3;
  /** The rim's floor point. */
  rimFloor: Vector3;
  /** Unit vector on the floor from the rim toward the stripe (the board's normal). */
  out: Vector3;
  /** Log tag: '1V1' / '3V3'. */
  tag: string;
  shooter(): FtBody;
  /** Everybody else on the floor — placed on the lane lines, facing the lane, idle through the trip. */
  others(): FtBody[];
  place(body: FtBody, pos: Vector3, yaw: number): void;
  /** The shoot button (Square) is down. */
  held(): boolean;
  /** One frame of the mode's own idle for every body: the shooter's dribble loop while `shooterLoop`, everybody else's watch. */
  tickBodies(dt: number, shooterLoop: boolean): void;
  hud(u: Record<string, HudValue>): void;
  banner(text: string, ms: number): void;
  /** Frame the shooter and the rim (`snap` = cut, not chase). */
  camera(dt: number, snap: boolean): void;
  /** Add a made free throw's point; true when it ended the game (the line stops and does not call the continuation). */
  score(points: number): boolean;
  /** The mode's world meter (read each time: the mode remounts it on a rematch). */
  meter3d(): ShotMeter3DHandle | null;
}

/** A standing body's velocity for the camera's follow (never written). */
export const FT_STILL = new Vector3();

/** The lane spots (x across the lane, metres out from the rim along `out`): the low blocks, then up the lane, then the top. */
export const FT_LANE_SPOTS: ReadonlyArray<readonly [number, number]> = [[2.4, 1.1], [-2.4, 1.1], [2.4, 2.2], [-2.4, 2.2], [0.9, FREE_THROW_M + 2.4]];

export class FreeThrowLine {
  readonly seq = new FreeThrowSequence();
  private arc = new ShotArc();
  private sim: BallSim;
  private then: (() => void) | null = null;
  private stopped = false;
  private pendingMade = false;
  private q: ShotQuality = 'good';
  private snap = false;
  private head = new Vector3();
  /** Dev / probe read: what the last trip did. */
  readonly log: string[] = [];

  constructor(private host: FreeThrowHost) {
    this.sim = new BallSim(host.ball, 0.12);
    if (process.env.NODE_ENV === 'development') {
      (host.scene.metadata ??= {}).freeThrows = {
        start: (n: number) => { if (!this.active) this.start(n, () => {}, 'probe'); return this.active; },
        state: () => ({ phase: this.seq.phase, shot: this.seq.shot, total: this.seq.total, made: this.seq.made, meterT: this.seq.meter.t, log: this.log.slice() }),
      };
    }
  }

  get active(): boolean { return this.seq.active; }

  /** Start a trip of `n` shots; `then` runs when it is over (never when a free throw ended the game). n ≤ 0 runs `then` at once. */
  start(n: number, then: () => void, reason: string): void {
    if (this.active) { this.then = then; return; }
    this.then = then; this.stopped = false; this.log.length = 0;
    this.say(`${n} shot${n === 1 ? '' : 's'} (${reason})`);
    this.handle(this.seq.start(n));
  }

  /**
   * THE ONE HOOK a foul site calls: what the ref's call is worth at the line for the shot that was fouled (FreeThrows
   * freeThrowsFor), then `cont` — the reset or check-up the site ran before free throws existed. Not a shooting foul, or free throws
   * off: `cont` at once, exactly as before.
   */
  after(call: Call | RuleId | null | undefined, shotWasThree: boolean, cont: () => void): void {
    const c = typeof call === 'string' ? rule(call) : call;
    const n = freeThrowsFor(c, shotWasThree);
    if (n > 0) this.start(n, cont, c!.id); else cont();
  }

  /** Drop the trip without its continuation (the mode reset under it, or is going away). */
  cancel(): void {
    if (!this.active) return;
    this.seq.cancel(); this.sim.stop(); this.arc.active = false; this.then = null;
    this.host.meter3d()?.end(null); this.host.hud({ shotType: '', shotMeterT: 0 });
  }

  dispose(): void { this.cancel(); const md = this.host.scene.metadata as { freeThrows?: unknown } | null; if (md?.freeThrows) delete md.freeThrows; }

  /** One frame of the trip. The mode returns right after it while `active`. */
  update(dt: number): void {
    if (!this.active) return;
    const h = this.host, s = h.shooter();
    this.handle(this.seq.step(dt, h.held()));
    if (!this.active) return;
    const ph = this.seq.phase;
    if (ph === 'rising') {
      h.hud({ shotMeterT: this.seq.meter.t });
      h.meter3d()?.set(this.seq.meter.t, this.head.set(s.root.position.x, s.root.position.y + 1.72, s.root.position.z));
    }
    if (this.arc.active) {
      const res = this.arc.step(dt, h.ball.position, h.ball);
      for (const t of this.arc.takeTouches()) SoundKit.play(t.on === 'glass' ? 'thud' : 'rattle', { volume: 0.2 + t.strength01 * 0.2 });
      if (res === 'made' || res === 'missed') this.land(res === 'made');
    }
    if (this.sim.active) this.sim.step(dt);
    // the shooter dribbles through the routine; through the set, the shot and its result the clip he is in owns him
    s.carry?.update(dt, 0, ph === 'routine');
    h.tickBodies(dt, ph === 'routine' || ph === 'setup');
    h.camera(dt, this.snap); this.snap = false;
  }

  private handle(evs: FtEvent[]): void {
    for (const e of evs) {
      switch (e.kind) {
        case 'setup': this.setup(e.total); break;
        case 'routine': this.routine(e.shot, e.total); break;
        case 'set': this.set(); break;
        case 'ready': this.host.hud({ shotType: `${freeThrowLabel(e.shot, this.seq.total)} — HOLD, RELEASE IN THE GREEN` }); break;
        case 'rise': this.rise(); break;
        case 'release': this.release(e.quality); break;
        case 'next': this.say(`next: ${freeThrowLabel(e.shot, this.seq.total)}`); break;
        case 'done': this.done(e.made, e.total); break;
      }
    }
  }

  private stripe(): Vector3 { return this.host.rimFloor.add(this.host.out.scale(FREE_THROW_M)); }

  /** The dead-ball setup: the shooter on the stripe facing the rim, the ball in his hand, everybody else on the lane lines. */
  private setup(total: number): void {
    const h = this.host, s = h.shooter();
    this.sim.stop(); this.arc.active = false;
    h.meter3d()?.end(null);   // a shot the foul cut off leaves no bar up
    const spot = this.stripe();
    h.place(s, spot, yawTo(spot, h.rimFloor));
    const across = new Vector3(h.out.z, 0, -h.out.x);
    const lookAt = h.rimFloor.add(h.out.scale(2.2));
    h.others().forEach((b, i) => {
      const [x, z] = FT_LANE_SPOTS[i % FT_LANE_SPOTS.length];
      const p = h.rimFloor.add(h.out.scale(z)).add(across.scale(x));
      h.place(b, p, yawTo(p, lookAt));
      b.carry?.update(0, 0, false);
    });
    s.carry?.reset();
    this.ballToHand(s);
    h.hud({ shotType: `FREE THROWS — ${total} SHOT${total === 1 ? '' : 'S'}`, shotMeterT: 0 });
    this.snap = true;
    this.say(`setup at ${spot.x.toFixed(2)}, ${spot.z.toFixed(2)} (${h.others().length} on the lane)`);
  }

  private routine(shot: number, total: number): void {
    const h = this.host, s = h.shooter();
    this.sim.stop(); this.arc.active = false;
    if (shot > 0) { this.ballToHand(s); s.tree.release(); }   // the ref bounces it back to him
    h.hud({ shotType: freeThrowLabel(shot, total), shotMeterT: 0 });
    h.banner(freeThrowLabel(shot, total), 900);
    this.say(`routine ${freeThrowLabel(shot, total)}`);
  }

  /** The ball up to the set: the pull-up gather's plant and chest, held on its loaded frame until the press. */
  private set(): void {
    const s = this.host.shooter();
    s.carry?.update(0, 0, false);
    this.ballToHand(s);
    s.tree.beat('bball_pullup_gather', { fadeSec: 0.1, holdEnd: true });
  }

  /** The press: the set shot rises out of the set, paced so its own release frame lands on the line meter's green — the 1v1 rise's
   *  pacing (syncedShotSpeed on the clip that really plays), with no hop: a free throw is a set shot. */
  private rise(): void {
    const s = this.host.shooter(), m = this.seq.meter;
    const clipSec = s.animator.durationOf('jumpshot') ?? 0.9;
    const greenInRise01 = (m.greenCenter01 * m.durationSec - m.gatherSec) / m.riseSec;
    const speedRatio = syncedShotSpeed(clipSec, m.riseSec, greenInRise01, releaseFrameOf(s.animator as CharacterAnimator, 'jumpshot', RELEASE_FRAME_01));
    s.tree.hold('jumpshot', { speedRatio, fadeSec: 0.08 });
    this.host.meter3d()?.begin({ center: m.greenCenter01, half: m.greenHalfWidth01 });
    this.host.hud({ shotMeterGreen: `${m.greenCenter01.toFixed(3)},${m.greenHalfWidth01.toFixed(3)}` });
    SoundKit.play('whoosh', { pitch: 1.0, volume: 0.15 });
  }

  private release(q: ShotQuality): void {
    const h = this.host, s = h.shooter(), m = this.seq.meter;
    this.q = q;
    h.meter3d()?.end(q);
    h.hud({ shotMeterT: 0 });
    const pct = freeThrowPct(q);
    const toShooter = s.root.position.subtract(h.rim); toShooter.y = 0;
    const q01 = q === 'perfect' ? 0.95 : q === 'early' || q === 'late' ? 0.55 : 0.2;
    const short = q === 'early' ? 0.8 : q === 'late' ? -0.8 : q === 'brick' ? 0.3 : 0;
    const v = rimDecides(h.rim, toShooter, pct, q01, { short, lateral: q === 'brick' ? (Math.random() < 0.5 ? -0.7 : 0.7) : 0 });
    this.pendingMade = v.made;
    h.ball.computeWorldMatrix(true);
    const from = h.ball.getAbsolutePosition().clone();
    releaseBall(h.ball);
    h.ball.position.copyFrom(from);
    this.arc.start(from, h.rim, v.made, 'jumper', 0, null, v.play);
    s.tree.beat(followThroughFor(q), { fadeSec: 0.2, holdEnd: true });
    const word = q === 'perfect' ? 'GREEN!' : q === 'good' ? 'GOOD RELEASE' : q === 'early' ? 'EARLY' : q === 'late' ? 'LATE' : 'WAY LATE';
    h.banner(word, 600);
    this.say(`release ${q} at t=${m.t.toFixed(3)} (green ${m.greenCenter01.toFixed(3)} ± ${m.greenHalfWidth01.toFixed(3)}) pct ${pct.toFixed(2)} → ${v.made ? 'YES' : 'no'} (${v.play.kind})`);
  }

  private land(made: boolean): void {
    const h = this.host;
    if (made !== this.pendingMade) this.say(`(the arc said ${made}, the verdict ${this.pendingMade})`);
    this.seq.landed(made);
    if (made) {
      SoundKit.play('swish', { volume: 0.6 });
      EffectsKit.burst(h.scene, h.rim, 'net');
      const v = netExitVelocity('jumper');
      this.sim.launch(h.ball.position.clone(), new Vector3(v.x, v.y, v.z));
      h.banner(`FREE THROW GOOD +${FREE_THROW_POINTS}`, 900);
      this.say(`made (${this.seq.made} of ${this.seq.shot + 1})`);
      if (h.score(FREE_THROW_POINTS)) { this.stopped = true; this.seq.cancel(); this.then = null; this.say('the free throw ended the game'); }
    } else {
      SoundKit.play('miss');
      const play = this.arc.play;
      if (play) this.sim.launch(h.ball.position.clone(), play.exitVel.clone());
      else {
        const toShooter = h.shooter().root.position.subtract(h.rim); toShooter.y = 0;
        const r = resolveRim(h.rim, toShooter, forcedMissProfile(0.5, { short: 0.4, lateral: 0 }), 0.06);
        this.sim.launch(r.contact, r.outVel);
      }
      h.banner('FREE THROW MISSED', 900);
      this.say(`missed (${this.seq.made} of ${this.seq.shot + 1})`);
    }
  }

  private done(made: number, total: number): void {
    const h = this.host;
    this.sim.stop(); this.arc.active = false;
    h.shooter().tree.release();
    h.hud({ shotType: '', shotMeterT: 0 });
    this.say(`done: ${made} of ${total}`);
    const then = this.then; this.then = null;
    if (!this.stopped) then?.();
  }

  private ballToHand(s: FtBody): void {
    const ball = this.host.ball;
    (ball.metadata ??= {}).felReleased = false;
    gatherBallToHand(ball, s.skeleton, s.hand(), 0);
  }

  private say(m: string): void { this.log.push(m); console.info(`[${this.host.tag}-FT] ${m}`); }
}

/** A body the line can move, from the mode's own handles (one line a body at the host). */
export function ftBody(char: { root: TransformNode; skeleton: Skeleton; animator: CharacterAnimator }, tree: FtBody['tree'], carry: BallCarry | null): FtBody {
  return { root: char.root, skeleton: char.skeleton, animator: char.animator, tree, carry, hand: () => hoopsHand(char) };
}

/** The idle a body stands in at the line: the shooter's stationary dribble (`hasBall`), everybody else's watch. */
export function ftIdleInput(dt: number, hasBall: boolean): AnimTreeInput {
  return { dtSec: dt, speedMps: 0, speed01: 0, crossover: false, nearestDefender: Infinity, hasBall, shooting: false, dunking: false, driving: false,
    defending: false, bracing: false, staggered: false, ballHand: 'right', moveActive: false };
}
