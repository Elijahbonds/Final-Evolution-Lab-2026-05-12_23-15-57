// FREE THROWS (lane/hoops-shot-content, owner 2026-10-20: "a shooting foul gives two shots — three on a three, one on an and-one —
// with the line routine, its own meter and a dead-ball setup").
//
// Pure logic: no scene, no bodies. The REF (Ref.ts) still owns what a foul IS (`judge` → a Call with `shots`); this file owns what
// happens AT THE LINE: how many shots a call is worth for the shot that was fouled, what each one scores, how a line trip runs
// (setup → routine → set → the press → the release → the iron → the next one) and how a release is graded. The modes report the
// foul exactly as they did; the scene half (core/FreeThrowLine.ts) carries out this sequence on the bodies.
//
// The rules chosen here (each one is an `assumption:` line in the lane's report — the owner had not ruled on them):
//   1. A shooting foul on a missed shot is TWO shots, THREE when the shot fouled was a three; an and-one is ONE shot.
//   2. A free throw is worth ONE point (1v1 and 3v3 both count 2s and 3s, so a 1 is a real, distinct value).
//   3. Every free throw is a DEAD BALL: make or miss, nobody rebounds it — no lane players (the brief made them optional).
//   4. After the last shot the ball goes where the ref's call ALREADY sends it (the fouled side, then the mode's format), exactly as
//      before free throws existed. The trip adds points; it does not change who has the ball next.
//   5. The line's meter is the uncontested jumper's window (ShotMeter.start(0, 'jumper', 0): 0.72 s, green at 0.62 ± 0.09) narrowed
//      for the stripe's distance exactly as lane/hoops-shot-core narrows any hero jumper (ShotWindow.distanceGreenFactor at
//      FREE_THROW_M 4.19 m: ×0.912, ≈ ±59 ms), and its make chance is the release's own SHOT_QUALITY_PCT — no contest, no
//      momentum, no fatigue, no new odds table.
//   6. No clock at the line: the shooter takes it when he presses (the AI's internal timers are untouched; the player has none).
//   7. Only a fouled HERO shoots them — the modes only ever detect a foul on the hero's shot (the rival is never fouled shooting).

import { FREE_THROWS_IMPLEMENTED, type Call } from './Ref';
import { SHOT_QUALITY_PCT, ShotMeter, type ShotQuality } from './BasketballCore';
import { distanceGreenFactor } from './ShotWindow';
import { FREE_THROW_M } from './DunkApproach';
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.ft*Sec (lib/feel-panel/knobs.ts)

/** One point a make (assumption 2). */
export const FREE_THROW_POINTS = 1;
/** The distance the shooter stands from the rim centre: the real stripe (DunkApproach.FREE_THROW_M, 4.19 m — the court art's line). */
export { FREE_THROW_M } from './DunkApproach';

/**
 * How many free throws a call is worth, for the shot that was fouled (assumption 1). 0 when free throws are off or the call is
 * not a shooting foul. The handbook carries the base (shooting_foul 2, and_one 1); a three that was fouled shoots three.
 */
export function freeThrowsFor(call: Pick<Call, 'id' | 'shots'> | null | undefined, shotWasThree: boolean): number {
  if (!FREE_THROWS_IMPLEMENTED || !call) return 0;
  if (call.id === 'and_one') return call.shots;
  if (call.id === 'shooting_foul') return shotWasThree ? 3 : call.shots;
  return 0;
}

/** The make chance of a release at the line (assumption 5): the meter's grade, nothing else. */
export function freeThrowPct(q: ShotQuality): number { return SHOT_QUALITY_PCT[q]; }

/** Start the line's meter (assumption 5): the uncontested jumper's window, no gather, narrowed for the stripe's distance the way
 *  every hero jumper is (lane/hoops-shot-core's ShotWindow; its hoops.distGreen* knobs move this one too). */
export function startLineMeter(m: ShotMeter): void { m.start(0, 'jumper', 0); m.narrowBy(distanceGreenFactor(FREE_THROW_M, 'jumper')); }

/** The trip's beats, in game seconds (all `(new)` numbers — presentation only: none of them is a timing window). */
/** The whistle to the shooter at the line: the bodies walk off, the camera cuts. Feel knob hoops.ftSetupSec. */
export const FT_SETUP_SEC = 0.9;
/** The routine: two dribbles at the stripe before the set. Feel knob hoops.ftRoutineSec. */
export const FT_ROUTINE_SEC = 1.2;
/** The ball up to the set (the pull-up gather's 0.3 s clip, held on its loaded frame). Feel knob hoops.ftSetSec. */
export const FT_SET_SEC = 0.3;
/** The ball's result shown before the next shot (or the end of the trip). Feel knob hoops.ftResultSec. */
export const FT_RESULT_SEC = 1.1;
/** The shipped beats together (the defaults; the sequence reads each through feel()). */
export const FT_TIMING = { setupSec: FT_SETUP_SEC, routineSec: FT_ROUTINE_SEC, setSec: FT_SET_SEC, resultSec: FT_RESULT_SEC } as const;

export type FtPhase = 'idle' | 'setup' | 'routine' | 'set' | 'ready' | 'rising' | 'flight' | 'result' | 'done';
export type FtEvent =
  | { kind: 'setup'; total: number }
  | { kind: 'routine'; shot: number; total: number }
  | { kind: 'set'; shot: number }
  | { kind: 'ready'; shot: number }
  | { kind: 'rise'; shot: number }
  | { kind: 'release'; shot: number; quality: ShotQuality }
  | { kind: 'next'; shot: number }
  | { kind: 'done'; made: number; total: number; lastMade: boolean };

/**
 * One trip to the line, as a clock. The scene half calls `step(dt, held)` every frame with the shoot button's state and acts on the
 * events; it reports the iron's answer with `landed(made)` when the ball gets there.
 *
 * The press must be FRESH: a button still down from the play the foul interrupted (the shooter was fouled with Square held) does not
 * start the first free throw — the button has to come up at the line first.
 */
export class FreeThrowSequence {
  phase: FtPhase = 'idle';
  /** 0-based shot index. */
  shot = 0;
  total = 0;
  made = 0;
  lastMade = false;
  readonly meter = new ShotMeter();
  private t = 0;
  private armed = false;

  get active(): boolean { return this.phase !== 'idle' && this.phase !== 'done'; }
  /** Seconds into the current phase. */
  get phaseSec(): number { return this.t; }

  start(n: number): FtEvent[] {
    this.total = Math.max(0, Math.floor(n)); this.shot = 0; this.made = 0; this.lastMade = false; this.t = 0; this.armed = false;
    this.meter.active = false; this.meter.t = 0;
    if (this.total <= 0) { this.phase = 'done'; return [{ kind: 'done', made: 0, total: 0, lastMade: false }]; }
    this.phase = 'setup';
    return [{ kind: 'setup', total: this.total }];
  }

  /** The iron's answer for the shot in flight. */
  landed(made: boolean): void {
    if (this.phase !== 'flight') return;
    if (made) this.made++;
    this.lastMade = made;
    this.phase = 'result'; this.t = 0;
  }

  /** Abandon the trip (the mode was reset or disposed under it). */
  cancel(): void { this.phase = 'idle'; this.meter.active = false; }

  step(dt: number, held: boolean): FtEvent[] {
    const out: FtEvent[] = [];
    if (!this.active) return out;
    this.t += dt;
    if (!held) this.armed = true;
    switch (this.phase) {
      case 'setup':
        if (this.t >= feel('hoops.ftSetupSec', FT_SETUP_SEC)) this.enter('routine', out);
        break;
      case 'routine':
        if (this.t >= feel('hoops.ftRoutineSec', FT_ROUTINE_SEC)) this.enter('set', out);
        break;
      case 'set':
        if (this.t >= feel('hoops.ftSetSec', FT_SET_SEC)) this.enter('ready', out);
        break;
      case 'ready':
        if (this.armed && held) {
          startLineMeter(this.meter);
          this.enter('rising', out);
        }
        break;
      case 'rising': {
        this.meter.update(dt);
        if (!held || this.meter.t >= 1) {
          const quality = this.meter.release();
          this.phase = 'flight'; this.t = 0;
          out.push({ kind: 'release', shot: this.shot, quality });
        }
        break;
      }
      case 'flight':
        break;   // landed() moves it on
      case 'result':
        if (this.t >= feel('hoops.ftResultSec', FT_RESULT_SEC)) {
          if (this.shot + 1 < this.total) {
            this.shot++; this.armed = false;
            out.push({ kind: 'next', shot: this.shot });
            this.enter('routine', out);
          } else {
            this.phase = 'done'; this.t = 0;
            out.push({ kind: 'done', made: this.made, total: this.total, lastMade: this.lastMade });
          }
        }
        break;
    }
    return out;
  }

  private enter(p: 'routine' | 'set' | 'ready' | 'rising', out: FtEvent[]): void {
    this.phase = p; this.t = 0;
    if (p === 'routine') out.push({ kind: 'routine', shot: this.shot, total: this.total });
    else if (p === 'set') out.push({ kind: 'set', shot: this.shot });
    else if (p === 'ready') out.push({ kind: 'ready', shot: this.shot });
    else out.push({ kind: 'rise', shot: this.shot });
  }
}

/** The HUD's line: "FREE THROW 1 OF 2". */
export function freeThrowLabel(shot: number, total: number): string { return `FREE THROW ${shot + 1} OF ${total}`; }
