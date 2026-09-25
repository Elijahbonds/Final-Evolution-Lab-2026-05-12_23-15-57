// feed — PoseFrames from a probe in place of the camera (movement play, phase 2, 2026-09-24).
//
// A dev and QA hook: `window.__FEL_POSE_FEED__` (PoseService installs it, only when NODE_ENV is development, or on a
// production build served from this machine with ?agent=1; never on the deployed site) lets a probe push frames, such
// as a lib/pose/__fixtures__ take, into PoseService,
// so a live mode is driven by body frames without a camera. Everything downstream (PoseSource today, BodyReader and
// the per-mode profiles later) reads them exactly as it reads the camera's.
//
//   const fx = await (await fetch('…/jump_two_foot_low.json')).json();   // or inline the frames
//   __FEL_POSE_FEED__.begin();          // the feed takes the camera's place; start() now opens no camera
//   await __FEL_POSE_FEED__.play(fx.frames);   // resolves with the count delivered, on the frames' own timing
//   __FEL_POSE_FEED__.status();         // state, model (null), fps, latency, delivered
//   __FEL_POSE_FEED__.end();            // back to idle; the next start() opens the camera
//
// play() keeps the frames' own timing: frame i is delivered (arrive ?? t) − t[0] ms after the call, so a fixture's
// latency model (66 ms by default) is kept. Its t and arrive are moved onto this page's performance.now() clock, the
// clock a camera frame's t is on, unless `retime: false`. push() delivers one frame now, exactly as given.
//
// This file is the pure part: the schedule and the gate. PoseService owns the timer.
import type { PoseFrame } from './landmarks';
import type { PoseStats, PoseStatus } from './PoseService';

export interface FeedPlayOptions {
  /** Playback speed: 0.5 plays twice as long. Timing-based reads (a jump's height from its flight) change with it. */
  rate?: number;
  /** Move t and arrive onto the page clock (default true). false leaves each frame exactly as given. */
  retime?: boolean;
}

/** The probe's handle, as window.__FEL_POSE_FEED__. */
export interface PoseFeed {
  /** Take the camera's place: a live camera is stopped, and start() then resolves at once without asking for one. */
  begin(): void;
  /** Deliver one frame now, exactly as given (arrive is filled with now when missing). Begins the feed if needed. */
  push(frame: PoseFrame): void;
  /** Deliver frames on their own timing (see the header). Cancels a playback already running. */
  play(frames: PoseFrame[], opts?: FeedPlayOptions): Promise<number>;
  /** Stop the playback; the feed stays the source until end(). */
  cancel(): void;
  /** Stop feeding: the service goes idle, and the next start() opens the camera. */
  end(): void;
  status(): PoseStatus & { stats: PoseStats; delivered: number; playing: boolean };
}

declare global {
  interface Window { __FEL_POSE_FEED__?: PoseFeed }
}

/**
 * This machine. A production build served here (`next start`, where the QA eye grades) is a test bench; the deployed
 * site never is, whatever its URL says. `location.hostname` writes IPv6 loopback with its brackets.
 */
const LOOPBACK_HOST = /^(localhost|[\w-]+(\.[\w-]+)*\.localhost|127(\.\d{1,3}){3}|\[::1\])$/i;

/**
 * The hook is dev and QA only: a deployed page must not accept body frames from a script (body play feeds PRQ and the
 * history, and a page that takes scripted frames would record a jump nobody made). Development builds always have it;
 * a production build only on this machine with ?agent=1, since ?agent=1 alone is a query string anyone can type.
 */
export function feedHookAllowed(nodeEnv: string | undefined, agent: boolean, hostname: string): boolean {
  if (nodeEnv === 'development') return true;
  return agent && LOOPBACK_HOST.test(hostname);
}

/**
 * When each frame of a playback is due, on the page clock, and the frame as delivered. Delivery times never go
 * backwards (a frame that arrived before the one ahead of it waits for it), as a camera's results never do.
 */
export class FeedSchedule {
  private i = 0;
  private readonly base: number;
  private readonly at: number[];
  private readonly rate: number;
  private readonly retime: boolean;

  constructor(private readonly frames: readonly PoseFrame[], private readonly startAt: number, opts: FeedPlayOptions = {}) {
    this.rate = opts.rate && opts.rate > 0 ? opts.rate : 1;
    this.retime = opts.retime ?? true;
    this.base = frames.length ? frames[0].t : 0;
    let last = -Infinity;
    this.at = frames.map((f) => {
      last = Math.max(last, startAt + ((f.arrive ?? f.t) - this.base) / this.rate);
      return last;
    });
  }

  get length(): number { return this.frames.length; }
  get delivered(): number { return this.i; }
  get done(): boolean { return this.i >= this.frames.length; }

  /** When the next frame is due (page clock), or null when every frame is out. */
  nextAt(): number | null {
    return this.done ? null : this.at[this.i];
  }

  /** The frames due by `now`, in order. */
  due(now: number): PoseFrame[] {
    const out: PoseFrame[] = [];
    while (!this.done && this.at[this.i] <= now) { out.push(this.shape(this.i)); this.i++; }
    return out;
  }

  private shape(i: number): PoseFrame {
    const f = this.frames[i];
    if (!this.retime) return f;
    // arrive is the scheduled delivery; PoseService overwrites it with the real one (a timer can fire late).
    return { ...f, t: this.startAt + (f.t - this.base) / this.rate, arrive: this.at[i] };
  }
}
