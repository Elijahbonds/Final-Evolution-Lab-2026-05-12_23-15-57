// lib/vbt/live.ts — VBT (2026-10-25): a set as it happens. Frames in (the camera's own clock), the reps so far out.
//
// The whole set is re-read from its frames every READ_EVERY_MS (a set is at most a few thousand frames, and a full
// re-read lets the ruler settle and a rep's edges firm up as the next frames arrive), so the live numbers are the same
// numbers the summary shows. A rep appears once the bar has held its top for a smoothing half-window (lib/vbt/reps.ts).
// The auto-stop cue: the velocity loss against the set's fastest rep has reached the stop line (coach-set, else
// LOSS_STOP_PCT.default), after at least LOSS_MIN_REPS counted reps. It is a cue on the screen and a beep; it never
// ends anything by itself.
//
// Pure (no clock but the frames' own).
import { LIFTS, type Lift, type LiftId } from './lifts';
import { readThrows, type Throw } from './medball';
import { readSet, type SetRead } from './reps';
import { LOSS_MIN_REPS, LOSS_STOP_PCT } from './thresholds';
import { trackOf, type Ruler, type TrackSource, type VbtFrame } from './track';

/** (new) How often the live set is re-read (ms of camera time). */
export const READ_EVERY_MS = 100;
/** (new) A set keeps at most this many frames (a 60 s set at 60 fps; a slow-mo import is read whole, not live). */
export const MAX_LIVE_FRAMES = 3600;

export interface VbtSetOpts {
  lift: LiftId;
  loadKg: number | null;
  /** The athlete's height (m): the ruler when no plate is found. */
  heightM: number | null;
  /** Width ÷ height of the camera picture. */
  aspect: number;
  /** The coach's stop line, or the default. */
  lossStopPct?: number;
}

export type VbtStatus = 'waiting' | 'no_body' | 'no_ruler' | 'reading';

export interface LiveView {
  status: VbtStatus;
  source: TrackSource | null;
  ruler: Ruler['from'] | null;
  read: SetRead | null;
  throws: Throw[] | null;
  /** The newest counted rep's MCV (or the newest throw's speed) and its ±. */
  headline: { value: number; pm: number; kind: 'mcv' | 'pv' | 'release' } | null;
  stop: boolean;
  lossStopPct: number;
  fps: number;
}

export const clampStop = (pct: number | null | undefined): number =>
  pct == null || !Number.isFinite(pct) ? LOSS_STOP_PCT.default : Math.min(LOSS_STOP_PCT.max, Math.max(LOSS_STOP_PCT.min, Math.round(pct)));

/** One set's frames → its view. Pure; the live class below only caches it. */
export function viewOf(lift: Lift, frames: readonly VbtFrame[], o: VbtSetOpts, final: boolean): LiveView {
  const lossStopPct = clampStop(o.lossStopPct);
  const empty: LiveView = { status: 'waiting', source: null, ruler: null, read: null, throws: null, headline: null, stop: false, lossStopPct, fps: 0 };
  if (frames.length < 5) return empty;
  const tr = trackOf(lift, frames, o.aspect, o.heightM);
  if (!tr.ok) return { ...empty, status: tr.why };
  const { track } = tr;
  if (lift.family === 'medball') {
    const { throws, fps } = readThrows(track);
    const last = throws[throws.length - 1];
    return { ...empty, status: 'reading', source: track.source, ruler: track.ruler.from, throws, fps, headline: last ? { value: last.speed, pm: last.speedPm, kind: 'release' } : null };
  }
  const read = readSet(lift, track, final);
  const counted = read.reps.filter((r) => r.counted);
  const last = counted[counted.length - 1];
  const headline = last ? (lift.ballistic ? { value: last.pv, pm: last.pvPm, kind: 'pv' as const } : { value: last.mcv, pm: last.mcvPm, kind: 'mcv' as const }) : null;
  const stop = counted.length >= LOSS_MIN_REPS && (last?.lossPct ?? 0) >= lossStopPct;
  return { status: 'reading', source: track.source, ruler: track.ruler.from, read, throws: null, headline, stop, lossStopPct, fps: read.fps };
}

/** The live set: push frames, read the view. */
export class VbtLive {
  readonly lift: Lift;
  private frames: VbtFrame[] = [];
  private lastReadT = -Infinity;
  private view: LiveView;

  constructor(readonly opts: VbtSetOpts) {
    this.lift = LIFTS[opts.lift];
    this.view = viewOf(this.lift, [], opts, false);
  }

  push(f: VbtFrame): LiveView {
    const prev = this.frames[this.frames.length - 1];
    if (prev && f.t <= prev.t) return this.view;           // the camera's clock only goes forward
    this.frames.push(f);
    if (this.frames.length > MAX_LIVE_FRAMES) this.frames.splice(0, this.frames.length - MAX_LIVE_FRAMES);
    if (f.t - this.lastReadT >= READ_EVERY_MS) {
      this.lastReadT = f.t;
      this.view = viewOf(this.lift, this.frames, this.opts, false);
    }
    return this.view;
  }

  /** The set as it ended: every rep, the last one included. */
  finish(): LiveView {
    this.view = viewOf(this.lift, this.frames, this.opts, true);
    return this.view;
  }

  get frameCount(): number { return this.frames.length; }
}
