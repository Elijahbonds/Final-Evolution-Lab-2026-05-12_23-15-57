// lib/hoops-cam/live.ts — basketball on the camera (BBS, 2026-10-26): the shots page's whole read, one frame at a time.
//
// The page hands each camera frame here: its time, the colour copy (frame.ts) and the pose (normalised landmarks, or
// none). This runs the ball's eye (ball.ts + track.ts), and in SHOTS mode the shot reader against the rim the user
// marked (shots.ts, rim.ts) with each shot's spot (spot.ts); in DRIBBLE mode the dribble reader (dribble.ts). It keeps
// the session's shots as NUMBERS (log.ts) and lets the player fix any of them with a tap — the beta's tap-to-correct.
// Nothing here touches the DOM, the camera or the network; the page owns those.
//
// Pure.
import { BallEye, type BallObs } from './track';
import { ShotReader, type ShotRead } from './shots';
import { DribbleReader, type DribbleRead } from './dribble';
import { rimPx, type Rim, type RimPx } from './rim';
import { spotOf, type Placement, type Spot } from './spot';
import type { LoggedShot, ShotSession, DribbleSession } from './log';
import type { Rgb } from './frame';
import type { HoopsStatus } from './copy';
import type { Lm } from '@/lib/pose/landmarks';

/** (new) The ball's radius range against the ring's: the ball is 0.525 of the ring's half-width at the ring's depth; the
 *  shooter may stand nearer the lens (bigger) or the ball fly farther (smaller). */
export const BALL_NEAR = 3.2;
export const BALL_FAR = 0.4;
/** (new) In dribble mode (no ring to scale by): the ball's radius as a share of the frame's height. */
export const DRIBBLE_R_MAX = 0.12;

export function ballRange(rim: RimPx): { min: number; max: number } {
  const r0 = rim.hw * 0.525;
  return { min: Math.max(1.2, r0 * BALL_FAR), max: Math.max(6, r0 * BALL_NEAR) };
}

export type HoopsMode = 'shots' | 'dribble';

export interface LiveShot {
  index: number;
  /** ms from the session's start. */
  t: number;
  made: boolean;
  /** The read was NOT SURE and the player has not answered yet. */
  ask: boolean;
  fixed: boolean;
  spot: Spot | null;
  why: ShotRead['why'];
}

export interface HoopsView {
  mode: HoopsMode;
  status: HoopsStatus;
  /** The ball this frame (normalised), for the overlay. */
  ball: { x: number; y: number; r: number } | null;
  shots: LiveShot[];
  made: number;
  taken: number;
  /** The newest shot (for the big result), or null. */
  last: LiveShot | null;
  dribble: DribbleRead | null;
  /** Frames a second the page is reading at (the last 2 s). */
  fps: number;
}

export interface HoopsLiveOpts {
  mode: HoopsMode;
  rim: Rim | null;
  placement: Placement;
  heightM: number | null;
  /** The camera's aspect (width ÷ height). */
  aspect: number;
}

export class HoopsLive {
  private eye: BallEye;
  private shots: ShotReader | null = null;
  private dribble = new DribbleReader({ w: 1, h: 1 });
  private list: LiveShot[] = [];
  private t0: number | null = null;
  private times: number[] = [];
  private last: BallObs | null = null;
  private frame = { w: 0, h: 0 };
  private view: HoopsView;

  constructor(private o: HoopsLiveOpts) {
    this.eye = new BallEye({ gPx: 0 });
    this.view = this.snapshot();
  }

  get opts(): HoopsLiveOpts { return this.o; }
  get rim(): Rim | null { return this.o.rim; }

  /** The rim marked (or re-marked): the shot reader starts over against it; the shots so far stay. */
  setRim(rim: Rim | null): HoopsView {
    this.o = { ...this.o, rim };
    this.shots = null;
    return (this.view = this.snapshot());
  }

  private ensure(w: number, h: number): void {
    const sized = this.frame.w === w && this.frame.h === h;
    if (sized && (this.o.mode === 'dribble' || this.shots || !this.o.rim)) return;
    this.frame = { w, h };
    if (this.o.mode === 'shots' && this.o.rim) {
      const rp = rimPx(this.o.rim, w, h);
      this.eye.tracker.setOpts({ rRange: ballRange(rp) });
      this.shots = new ShotReader(rp, { w, h });
    } else if (this.o.mode === 'dribble') {
      this.eye.tracker.setOpts({ rRange: { min: 2, max: h * DRIBBLE_R_MAX } });
      this.dribble = new DribbleReader({ w, h });
    }
  }

  /** One camera frame (time-ordered). */
  push(f: { t: number; rgb: Rgb; pose: readonly Lm[] | null }): HoopsView {
    this.ensure(f.rgb.w, f.rgb.h);
    if (this.t0 === null) this.t0 = f.t;
    this.times.push(f.t);
    while (this.times.length && this.times[0] < f.t - 2000) this.times.shift();
    const obs = this.eye.see(f.t, f.rgb, f.pose);
    this.last = obs && !obs.coast ? obs : null;
    if (this.o.mode === 'shots' && this.shots) {
      this.shots.seePose(f.t, f.pose);
      const r = this.shots.step(f.t, obs);
      if (r) this.add(r);
    } else if (this.o.mode === 'dribble') {
      this.dribble.step(f.t, obs, f.pose);
    }
    return (this.view = this.snapshot());
  }

  private add(r: ShotRead): void {
    const spot = this.o.rim ? spotOf({ feet: r.feet, bodyUnits: r.bodyUnits, rim: this.o.rim, aspect: this.o.aspect, placement: this.o.placement, heightM: this.o.heightM }) : null;
    this.list.push({ index: this.list.length + 1, t: Math.max(0, Math.round(r.t - (this.t0 ?? r.t))), made: r.outcome === 'make', ask: !r.sure, fixed: false, spot, why: r.why });
  }

  /** The player's tap: this shot went in (true) or not. Any shot can be fixed; a NOT SURE one is answered. */
  fix(index: number, made: boolean): HoopsView {
    this.list = this.list.map((s) => (s.index === index ? { ...s, made, ask: false, fixed: true } : s));
    return (this.view = this.snapshot());
  }

  /** The player's tap on "a shot it missed": a shot added by hand (no spot). */
  addByHand(made: boolean, atMs: number): HoopsView {
    const index = (this.list[this.list.length - 1]?.index ?? 0) + 1;
    this.list.push({ index, t: Math.max(0, Math.round(atMs - (this.t0 ?? atMs))), made, ask: false, fixed: true, spot: null, why: 'lost' });
    return (this.view = this.snapshot());
  }

  /** The player's tap: that was not a shot. */
  drop(index: number): HoopsView {
    this.list = this.list.filter((s) => s.index !== index);
    return (this.view = this.snapshot());
  }

  /** The session is over: an open shot is closed (NOT SURE) and the view returned. */
  finish(t: number): HoopsView {
    const r = this.shots?.flush(t);
    if (r) this.add(r);
    return (this.view = this.snapshot());
  }

  current(): HoopsView { return this.view; }

  private snapshot(): HoopsView {
    const { w, h } = this.frame;
    const status: HoopsStatus = this.o.mode === 'shots' && !this.o.rim ? 'no_rim' : this.last ? 'tracking' : 'looking';
    const fps = this.times.length > 1 ? Math.round(((this.times.length - 1) * 1000) / Math.max(1, this.times[this.times.length - 1] - this.times[0])) : 0;
    return {
      mode: this.o.mode, status,
      ball: this.last && w ? { x: this.last.x / w, y: this.last.y / h, r: this.last.r / h } : null,
      shots: this.list, made: this.list.filter((s) => s.made).length, taken: this.list.length,
      last: this.list[this.list.length - 1] ?? null,
      dribble: this.o.mode === 'dribble' ? this.dribble.read() : null,
      fps,
    };
  }

  /** The session as numbers for the log (shots mode). */
  shotSession(day: string, at: number): ShotSession {
    const shots: LoggedShot[] = this.list.map((s) => ({ t: s.t, made: s.made, fixed: s.fixed, x: s.spot?.x ?? null, z: s.spot?.z ?? null }));
    return { kind: 'shots', day, at, placement: this.o.placement, shots };
  }

  /** The session as numbers for the log (dribble mode). */
  dribbleSession(day: string, at: number, sec: number): DribbleSession {
    const d = this.dribble.read();
    return { kind: 'dribble', day, at, count: d.count, crossovers: d.crossovers, left: d.left, right: d.right, rateHz: d.rateHz, rhythmCv: d.rhythmCv, sec: Math.round(sec) };
  }
}
