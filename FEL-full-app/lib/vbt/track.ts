// lib/vbt/track.ts — VBT (2026-10-25): camera frames → the tracked point in metres, and the ruler that makes them metres.
//
// UNITS. Image landmarks are 0..1 of the width and of the height. Everything here is first put in IMAGE HEIGHTS (x times
// the aspect, y as is, so a circle stays a circle), then scaled to metres by ONE ruler per set:
//   · the PLATE — a standard 45 cm bumper's fitted diameter (lib/vbt/plate.ts), when the bar is read at the plate. The
//     plate sits nearer the lens than the athlete (half the bar's length), so the plate's ruler is used ONLY for the
//     plate's own path — never for the body's points, which would read ~25 % fast;
//   · the BODY — the near-side shoulder → hip → knee → ankle in the picture against the athlete's entered height
//     (SEGMENT_STATURE_SHARE of it), as the jump check scales from the entered height. Side-on, those segments lie in
//     the picture's plane standing, lying on a bench, hanging from a bar or in a push-up.
// No ruler (no plate and no height) → no metres: the caller asks for the height.
//
// WHAT IS READ PER MOVE (lib/vbt/lifts.ts): the plate's centre, else the hands (the more visible wrist weighted more);
// the moving wrist for a dumbbell or kettlebell; the hips' or shoulders' midpoint for a body-only move. A set is read
// from ONE source: the plate when it was found in at least PLATE_SHARE of the body frames, else the pose — so a rep is
// never half plate, half wrist.
//
// Pure.
import {
  LEFT_ANKLE, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, LEFT_WRIST, RIGHT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER, RIGHT_WRIST,
  type Lm,
} from '@/lib/pose/landmarks';
import type { Lift } from './lifts';
import type { Sample } from './signal';
import { median } from './signal';
import { PLATE_DIAMETER_M, PLATE_JITTER, PLATE_SCALE_SD, POSE_JITTER, POSE_SCALE_SD, SEGMENT_STATURE_SHARE } from './thresholds';

/** A plate found in one frame, in image heights (centre and radius). */
export interface PlateObs { cx: number; cy: number; r: number }

/** One frame as the VBT reader takes it. `image` empty when no body was found. */
export interface VbtFrame { t: number; image: readonly Lm[]; plate?: PlateObs | null }

export type TrackSource = 'plate' | 'pose';

export interface Ruler {
  /** Metres per image height. */
  mPerUnit: number;
  /** Relative 1-SD error of that ruler. */
  sd: number;
  from: 'plate' | 'height';
}

/** (new) The share of body frames that must carry a plate for the set to be read at the plate. */
export const PLATE_SHARE = 0.6;
const VIS = 0.5;

const ok = (l: Lm | undefined): l is Lm => !!l && l.v >= VIS && Number.isFinite(l.x) && Number.isFinite(l.y);
const dist = (a: Lm, b: Lm, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

/** The near side's shoulder→hip→knee→ankle length in image heights, or null. The more visible side wins. */
export function segmentUnits(image: readonly Lm[], aspect: number): number | null {
  const sides = [[LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE], [RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE]] as const;
  let best: { len: number; vis: number } | null = null;
  for (const s of sides) {
    const pts = s.map((i) => image[i]);
    if (!pts.every(ok)) continue;
    const vis = pts.reduce((a, p) => a + p.v, 0);
    const len = dist(pts[0], pts[1], aspect) + dist(pts[1], pts[2], aspect) + dist(pts[2], pts[3], aspect);
    if (!best || vis > best.vis) best = { len, vis };
  }
  return best ? best.len : null;
}

/** The body ruler: median segment length over the frames vs the entered height. */
export function bodyRuler(frames: readonly VbtFrame[], aspect: number, heightM: number | null): Ruler | null {
  if (!heightM || !(heightM > 0.9 && heightM < 2.5)) return null;
  const lens = frames.map((f) => segmentUnits(f.image, aspect)).filter((x): x is number => x != null && x > 0.05);
  if (lens.length < 3) return null;
  return { mPerUnit: (SEGMENT_STATURE_SHARE * heightM) / median(lens), sd: POSE_SCALE_SD, from: 'height' };
}

/** The plate ruler: the median fitted radius against the 45 cm bumper; its SD adds the radii's own spread. */
export function plateRuler(frames: readonly VbtFrame[]): Ruler | null {
  const rs = frames.map((f) => f.plate?.r).filter((r): r is number => r != null && r > 0);
  if (rs.length < 3) return null;
  const r = median(rs);
  const mad = median(rs.map((x) => Math.abs(x - r))) * 1.4826;
  return { mPerUnit: PLATE_DIAMETER_M / (2 * r), sd: Math.hypot(PLATE_SCALE_SD, mad / r / Math.sqrt(rs.length)), from: 'plate' };
}

/** Which source a set is read from. */
export function sourceOf(lift: Lift, frames: readonly VbtFrame[]): TrackSource {
  if (lift.point !== 'bar') return 'pose';
  const body = frames.filter((f) => f.image.length > 0 || f.plate).length;
  const plates = frames.filter((f) => f.plate).length;
  return body > 0 && plates / body >= PLATE_SHARE ? 'plate' : 'pose';
}

const wmean = (pts: Lm[], aspect: number): { x: number; y: number } => {
  const w = pts.reduce((a, p) => a + p.v, 0);
  return { x: pts.reduce((a, p) => a + p.x * aspect * p.v, 0) / w, y: pts.reduce((a, p) => a + p.y * p.v, 0) / w };
};

/** The wrist to read for a dumbbell / kettlebell / throw: the one that travels further over the set, or both when even. */
export function wristChoice(frames: readonly VbtFrame[]): 'left' | 'right' | 'both' {
  const range = (i: number) => {
    const ys = frames.map((f) => f.image[i]).filter(ok).map((l) => l.y);
    const xs = frames.map((f) => f.image[i]).filter(ok).map((l) => l.x);
    return ys.length < 3 ? 0 : Math.hypot(Math.max(...ys) - Math.min(...ys), Math.max(...xs) - Math.min(...xs));
  };
  const l = range(LEFT_WRIST), r = range(RIGHT_WRIST);
  if (l === 0 && r === 0) return 'both';
  if (l > 1.3 * r) return 'left';
  if (r > 1.3 * l) return 'right';
  return 'both';
}

/** The tracked point of one frame, in image heights (y DOWN), or null. */
export function pointOf(lift: Lift, f: VbtFrame, aspect: number, source: TrackSource, wrist: 'left' | 'right' | 'both'): { x: number; y: number } | null {
  if (source === 'plate') return f.plate ? { x: f.plate.cx, y: f.plate.cy } : null;
  const im = f.image;
  if (!im.length) return null;
  const pick = (idx: readonly number[]) => { const pts = idx.map((i) => im[i]).filter(ok); return pts.length ? wmean(pts, aspect) : null; };
  switch (lift.point) {
    case 'hip': return pick([LEFT_HIP, RIGHT_HIP]);
    case 'shoulder': return pick([LEFT_SHOULDER, RIGHT_SHOULDER]);
    default: return pick(wrist === 'left' ? [LEFT_WRIST] : wrist === 'right' ? [RIGHT_WRIST] : [LEFT_WRIST, RIGHT_WRIST]);
  }
}

export interface Track {
  source: TrackSource;
  ruler: Ruler;
  /** Position jitter, 1 SD, in metres. */
  posSdM: number;
  samples: Sample[];
}

/**
 * Frames → the set's track in metres (x toward image-right, y UP, origin at the first sample), or why not. The caller
 * passes the athlete's height (m) for the body ruler.
 */
export function trackOf(lift: Lift, frames: readonly VbtFrame[], aspect: number, heightM: number | null): { ok: true; track: Track } | { ok: false; why: 'no_body' | 'no_ruler' } {
  const source = sourceOf(lift, frames);
  const ruler = source === 'plate' ? plateRuler(frames) : bodyRuler(frames, aspect, heightM);
  if (!ruler) return { ok: false, why: frames.some((f) => f.image.length) ? 'no_ruler' : 'no_body' };
  const wrist = lift.point === 'wrist' || lift.point === 'bar' ? wristChoice(frames) : 'both';
  const raw: { t: number; x: number; y: number }[] = [];
  for (const f of frames) {
    const p = pointOf(lift, f, aspect, source, lift.point === 'bar' ? 'both' : wrist);
    if (p) raw.push({ t: f.t, ...p });
  }
  if (raw.length < 3) return { ok: false, why: 'no_body' };
  raw.sort((a, b) => a.t - b.t);
  const x0 = raw[0].x, y0 = raw[0].y, k = ruler.mPerUnit;
  const samples = raw.filter((s, i) => i === 0 || s.t > raw[i - 1].t).map((s) => ({ t: s.t, x: (s.x - x0) * k, y: -(s.y - y0) * k }));
  return { ok: true, track: { source, ruler, posSdM: (source === 'plate' ? PLATE_JITTER : POSE_JITTER) * k, samples } };
}
