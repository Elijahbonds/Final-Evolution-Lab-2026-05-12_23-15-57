// timing — a camera sprint read end to end from the frames (SPRINT-SPEED, 2026-10-25).
//
//   readGateRun     one phone at the finish line: the start (the Go, first movement, or another phone's) to the
//                   chosen body point crossing the tapped line
//   readFlying      two lines in one wide side-on frame: the point crossing the first, then the second — the time
//                   between, and the speed over that stretch. The parallax of lines the lens is not on is in the ±
//
// Every number here is an ESTIMATE with its own ±1 SD; nothing is claimed against timing gates until the pilot.
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { bodyPoint, signedDistance, type BodyPointKind, type Line } from './geometry';
import { findCrossings, type Crossing, type LineSample } from './crossing';
import { detectOnset, type StartRead } from './start';
import { remoteStart, type ClockOffset, type SyncMessage } from './sync';
import { sr } from './PROPOSED-sprint';

export type FrameLike = Pick<PoseFrame, 't' | 'present' | 'image'>;

/** The frames' pose rate (Hz), from the median gap between body frames. */
export function framesHz(frames: readonly Pick<PoseFrame, 't'>[]): number {
  if (frames.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < frames.length; i++) { const g = frames[i].t - frames[i - 1].t; if (g > 0) gaps.push(g); }
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return 1000 / gaps[gaps.length >> 1];
}

/** Each frame where the point is seen: its time and its signed distance from the line. */
export function lineSamples(frames: readonly FrameLike[], line: Line, point: BodyPointKind, aspect: number): LineSample[] {
  const out: LineSample[] = [];
  for (const f of frames) {
    const p = bodyPoint(f, point);
    if (p) out.push({ t: f.t, d: signedDistance(line, p, aspect) });
  }
  return out;
}

export type StartChoice =
  | { kind: 'go'; read: StartRead }
  | { kind: 'movement' }
  | { kind: 'phone'; read: StartRead };

/** A start another phone read and sent, on this phone's clock (lib/sprint/sync.ts). */
export function startFromPhone(msg: Extract<SyncMessage, { type: 'sync.start' }>, clock: Extract<ClockOffset, { ok: true }>): StartChoice {
  const r = remoteStart(msg, clock);
  return { kind: 'phone', read: { kind: 'phone', t: r.t, sdMs: r.sdMs, reactionIncluded: r.reactionIncluded } };
}

export type GateFlag = 'lowFps' | 'fitFallback' | 'slowCross';

export const GATE_TIPS: Record<GateFlag, string> = {
  lowFps: 'The camera ran under 60 frames a second, so the finish is read from fewer frames. A phone that films at 60 or more gives a tighter read.',
  fitFallback: 'The body point was hard to follow at the line (blur or something in the way), so the finish was read from two frames only.',
  slowCross: 'The athlete crossed the line slowly, so the finish read is wider. Run through the line.',
};

export type GateRun =
  | {
    ok: true;
    /** Seconds, start to line, and its ±1 SD. */
    timeS: number; sdS: number;
    start: StartRead; finish: Crossing;
    poseHz: number; flags: GateFlag[];
  }
  | { ok: false; why: string };

/** One phone at the finish line: start → the point crossing `line`. `from` = the arming time (ms). */
export function readGateRun(o: {
  frames: readonly FrameLike[]; aspect: number; line: Line; point: BodyPointKind; start: StartChoice; from: number;
}): GateRun {
  const { frames, aspect, line, point } = o;
  const hz = framesHz(frames);
  let start: StartRead;
  if (o.start.kind === 'movement') {
    const pts = frames.map((f) => ({ t: f.t, p: bodyPoint(f, point) }));
    const on = detectOnset(pts, aspect, o.from);
    if (!on.ok) return on;
    start = on;
  } else start = o.start.read;
  const samples = lineSamples(frames, line, point, aspect);
  const cross = findCrossings(samples, { after: start.t });
  if (!cross.length) return { ok: false, why: 'Nobody crossed the line in the picture. Check the line sits where the athlete runs, and that the whole body is in view.' };
  const finish = cross[0];
  const timeMs = finish.t - start.t;
  if (timeMs < 300) return { ok: false, why: 'That crossing came too soon after the start to be a run.' };
  const flags: GateFlag[] = [];
  if (hz > 0 && hz < 55) flags.push('lowFps');
  if (finish.n < 2 * Math.round(sr('sprint.fitHalf'))) flags.push('fitFallback');
  if (finish.speed < 0.6) flags.push('slowCross');
  return { ok: true, timeS: timeMs / 1000, sdS: Math.hypot(start.sdMs, finish.sdMs) / 1000, start, finish, poseHz: Math.round(hz), flags };
}

export type FlyingRun =
  | {
    ok: true;
    timeS: number; sdS: number;
    /** Metres per second over the stretch, and its ±1 SD. */
    speedMps: number; speedSd: number;
    first: Crossing; second: Crossing; poseHz: number;
    /** The parallax share of the ± (s). */
    parallaxSdS: number;
  }
  | { ok: false; why: string };

/**
 * Two lines in one frame, `distanceM` apart, the phone `cameraM` from the running line (null: assumed as far as the
 * lines are apart, the nearest a 60° lens sees both). The athlete crosses `first` then `second`.
 */
export function readFlying(o: {
  frames: readonly FrameLike[]; aspect: number; first: Line; second: Line; point: BodyPointKind; distanceM: number; cameraM: number | null; from: number;
}): FlyingRun {
  if (!(o.distanceM > 0)) return { ok: false, why: 'Type the distance between the two lines.' };
  const a = findCrossings(lineSamples(o.frames, o.first, o.point, o.aspect), { after: o.from });
  if (!a.length) return { ok: false, why: 'Nobody crossed the first line in the picture.' };
  const b = findCrossings(lineSamples(o.frames, o.second, o.point, o.aspect), { after: a[0].t });
  if (!b.length) return { ok: false, why: 'Nobody crossed the second line after the first.' };
  const first = a[0], second = b[0];
  const timeS = (second.t - first.t) / 1000;
  if (timeS < 0.2) return { ok: false, why: 'The two crossings were too close together to be a run.' };
  const speed = o.distanceM / timeS;
  // the lines' vertical planes miss the lens: running `laneOffsetM` off the marker line moves each crossing by
  // (half the span) × offset ÷ camera distance, the two in opposite directions — the stretch is off by span × offset ÷ D
  const cam = o.cameraM && o.cameraM > 0 ? o.cameraM : o.distanceM;
  const parallaxM = (o.distanceM * sr('sprint.laneOffsetM')) / cam;
  const parallaxSdS = parallaxM / speed / Math.sqrt(3);
  const sdS = Math.hypot(first.sdMs / 1000, second.sdMs / 1000, parallaxSdS);
  return { ok: true, timeS, sdS, speedMps: speed, speedSd: (speed * sdS) / timeS, first, second, poseHz: Math.round(framesHz(o.frames)), parallaxSdS };
}
