// geometry — the picture's lines, markers and body points the camera sprint timer reads (SPRINT-SPEED, 2026-10-25).
//
//   Units. A tap and a landmark are normalised to the picture (x by its width, y by its height, y DOWN). Every length
//   here is in PICTURE HEIGHTS (x × aspect, y), so a line's slant and a distance mean the same thing in portrait and in
//   landscape. `aspect` = width ÷ height of the frame the model is handed (PoseService.status.camera).
//
//   lineFromTaps      two taps → a line (the finish line as the phone sees it), or why not
//   signedDistance    a point's distance from a line, + on one side and − on the other
//   markerScale       two taps on the running line a known distance apart → metres along the run
//   bodyPoint         the torso (shoulders + hips), the hips or the chest from one frame, or null when unseen
//   heightScale       metres per picture height from the athlete's standing height and their legs in the frames
//
// Why the phone sits ON the line (docs/SPRINT-BENCHMARK.md §2): only then is the line's vertical plane one line in the
// picture, so a body crossing it on screen is crossing it in the world, at any distance from the lens. Two lines in one
// frame cannot both have that; their parallax is in the ± (lib/sprint/flying.ts).
//
// Pure.
import { LEFT_ANKLE, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, RIGHT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER, type Lm, type PoseFrame } from '@/lib/pose/landmarks';
import { sr } from './PROPOSED-sprint';

export interface Pt { x: number; y: number }
export interface Line { a: Pt; b: Pt }

/** A normalised point in picture heights. */
const toH = (p: Pt, aspect: number): Pt => ({ x: p.x * aspect, y: p.y });

export type LineResult = { ok: true; line: Line } | { ok: false; why: string };

/** Two taps → a line. They must be inside the picture and far enough apart to aim along. */
export function lineFromTaps(a: Pt, b: Pt, aspect: number): LineResult {
  const inside = (p: Pt) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  if (!inside(a) || !inside(b)) return { ok: false, why: 'Tap inside the picture.' };
  const A = toH(a, aspect), B = toH(b, aspect);
  if (Math.hypot(B.x - A.x, B.y - A.y) < sr('sprint.minLineFrac')) return { ok: false, why: 'Tap the two ends of the line, further apart.' };
  return { ok: true, line: { a, b } };
}

/** The picture's own vertical centre line: the default finish line when the phone is aimed square across the lane. */
export const CENTRE_LINE: Line = { a: { x: 0.5, y: 0.1 }, b: { x: 0.5, y: 0.9 } };

/** Signed distance (picture heights) of p from the line: + to the right of a → b, − to the left. */
export function signedDistance(line: Line, p: Pt, aspect: number): number {
  const A = toH(line.a, aspect), B = toH(line.b, aspect), P = toH(p, aspect);
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return NaN;
  return (dx * (P.y - A.y) - dy * (P.x - A.x)) / len;
}

/** The line's slant from the picture's vertical, in degrees (0 = upright). */
export function lineTiltDeg(line: Line, aspect: number): number {
  const A = toH(line.a, aspect), B = toH(line.b, aspect);
  return Math.abs((Math.atan2(B.x - A.x, Math.abs(B.y - A.y)) * 180) / Math.PI);
}

// ── markers: metres along the run ──

export interface MarkerScale {
  /** The first marker (the origin of the run axis), normalised. */
  origin: Pt;
  /** Unit vector of the run axis, in picture heights. */
  axis: Pt;
  /** Metres per picture height along the axis. */
  mPerUnit: number;
  aspect: number;
  /** The markers' separation (m), when the scale came from two markers. */
  spanM?: number;
}

export type ScaleResult = { ok: true; scale: MarkerScale } | { ok: false; why: string };

/** Two taps on the running line, `metres` apart → metres along the run from the first one. */
export function markerScale(a: Pt, b: Pt, metres: number, aspect: number): ScaleResult {
  const l = lineFromTaps(a, b, aspect);
  if (!l.ok) return { ok: false, why: l.why.replace('the line', 'the two markers') };
  if (!Number.isFinite(metres) || metres <= 0 || metres > 200) return { ok: false, why: 'Type the distance between the two markers, in metres.' };
  const A = toH(a, aspect), B = toH(b, aspect);
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  return { ok: true, scale: { origin: a, axis: { x: (B.x - A.x) / len, y: (B.y - A.y) / len }, mPerUnit: metres / len, aspect, spanM: metres } };
}

/** The scale's own ±1 SD (%) from where two taps can land: √2 × the tap σ over their separation. */
export function markerScaleSdPct(s: MarkerScale): number {
  return ((Math.SQRT2 * sr('sprint.tapSd') * s.mPerUnit) / Math.max(1e-6, markerSpanM(s))) * 100;
}
/** How far apart the two markers were (m): the scale's span. Kept on the scale for the ±. */
const markerSpanM = (s: MarkerScale): number => s.spanM ?? 1;

/** A point's position along the run, in metres from the first marker (negative before it). */
export function alongM(s: MarkerScale, p: Pt): number {
  const O = toH(s.origin, s.aspect), P = toH(p, s.aspect);
  return ((P.x - O.x) * s.axis.x + (P.y - O.y) * s.axis.y) * s.mPerUnit;
}

/** A scale built from metres per picture height alone (the athlete's height), along the picture's x axis. */
export function heightAxisScale(mPerUnit: number, aspect: number, dir: 1 | -1 = 1): MarkerScale {
  return { origin: { x: 0, y: 0.5 }, axis: { x: dir, y: 0 }, mPerUnit, aspect };
}

// ── body points ──

export type BodyPointKind = 'torso' | 'hips' | 'chest';
export const BODY_POINTS: readonly BodyPointKind[] = ['torso', 'hips', 'chest'];
export const BODY_POINT_LABEL: Record<BodyPointKind, string> = {
  torso: 'Torso (how a race is judged)',
  hips: 'Hips',
  chest: 'Chest (shoulders)',
};

const IDX: Record<BodyPointKind, readonly number[]> = {
  torso: [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP],
  hips: [LEFT_HIP, RIGHT_HIP],
  chest: [LEFT_SHOULDER, RIGHT_SHOULDER],
};

/** The chosen body point in one frame (the mean of its landmarks), or null when the body or any of them is unseen. */
export function bodyPoint(f: Pick<PoseFrame, 'present' | 'image'>, kind: BodyPointKind): (Pt & { v: number }) | null {
  if (!f.present || f.image.length < 33) return null;
  const pts: Lm[] = IDX[kind].map((i) => f.image[i]);
  const minV = sr('sprint.minVisibility');
  if (pts.some((p) => !p || !(p.v >= minV) || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, v: Math.min(...pts.map((p) => p.v)) };
}

/** Hip → knee → ankle in picture heights, the longer (better seen) side, or null. */
export function legLength(f: Pick<PoseFrame, 'present' | 'image'>, aspect: number): number | null {
  if (!f.present || f.image.length < 33) return null;
  const minV = sr('sprint.minVisibility');
  let best: number | null = null;
  for (const [h, k, a] of [[LEFT_HIP, LEFT_KNEE, LEFT_ANKLE], [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE]] as const) {
    const H = f.image[h], K = f.image[k], A = f.image[a];
    if (![H, K, A].every((p) => p && p.v >= minV)) continue;
    const len = Math.hypot((K.x - H.x) * aspect, K.y - H.y) + Math.hypot((A.x - K.x) * aspect, A.y - K.y);
    if (best === null || len > best) best = len;
  }
  return best;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type HeightScale = { ok: true; mPerUnit: number; legFrames: number; spreadPct: number; sdPct: number } | { ok: false; why: string };

/**
 * Metres per picture height from the athlete's standing height: the leg (thigh + shank, rigid lengths, so the stride
 * does not change them) is `legOverStature` of it. Side-on and far, so the leg is in the picture's plane; a leg swung
 * toward the lens reads short and landmark jitter reads long; the median of the frames is the read.
 */
export function heightScale(frames: readonly Pick<PoseFrame, 'present' | 'image'>[], statureM: number, aspect: number): HeightScale {
  if (!Number.isFinite(statureM) || statureM < 1 || statureM > 2.4) return { ok: false, why: 'Type the athlete\'s height.' };
  const legs = frames.map((f) => legLength(f, aspect)).filter((x): x is number => x !== null && x > 0.02);
  if (legs.length < 8) return { ok: false, why: 'The legs were not seen clearly enough to scale the run. Tap two markers instead.' };
  const s = [...legs].sort((a, b) => a - b);
  const q75 = s[Math.floor(0.75 * (s.length - 1))];
  const q25 = s[Math.floor(0.25 * (s.length - 1))];
  const mid = median(legs);
  const spreadPct = ((q75 - q25) / mid) * 100;
  // the person's own leg ratio, and the median's own spread (IQR ÷ 1.35 is an SD; ÷ √n for the median, × 1.25)
  const sdPct = Math.hypot(sr('sprint.legRatioSdPct'), (1.25 * spreadPct) / 1.35 / Math.sqrt(legs.length));
  return { ok: true, mPerUnit: (sr('sprint.legOverStature') * statureM) / mid, legFrames: legs.length, spreadPct: Math.round(spreadPct * 10) / 10, sdPct };
}
