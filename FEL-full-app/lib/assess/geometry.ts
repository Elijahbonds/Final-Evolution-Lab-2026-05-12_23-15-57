// geometry — every per-frame measure the jump screen scores, from 33 landmarks (spec §3.2).
//
// ANGLES ARE READ IN PIXELS, NOT IN NORMALISED UNITS. MediaPipe normalises x by the image's width and y by its
// height, so on a 4:3 camera a unit of x is a third longer than a unit of y, and an angle taken straight from the
// normalised numbers is bent. Every angle here scales x by the image's aspect (width ÷ height) first, so both axes are
// in image-height units. A ratio of two x distances (the knee-inside ratio) needs no aspect: it cancels.
//
// IMAGE PLANE, NOT WORLD. The spec allows world landmarks for knee flexion "if available". v0.1 reads the image for
// every angle a view measures in its own plane (a side view's knee, trunk, tibia and shoulder; a front view's FPPA,
// pelvis and trunk lean): the measured plane is parallel to the lens there, so a pinhole camera keeps the angle, while
// MediaPipe's world depth is its noisiest axis. The one exception is depth from the FRONT (T3), where the knee bends
// toward the lens and the image cannot see it: world landmarks when the frame has them, else an estimate from how
// much the leg shortens (kneeFlexionFromFront). [TUNE-EJ]: revisit once the gold-standard capture exists.
//
// "left" is the SUBJECT's left (lib/pose/landmarks.ts): facing the camera, the left leg is on the image's right.
//
// Pure: numbers in, numbers out.
import {
  SIDE, LEFT_HIP, RIGHT_HIP, LEFT_SHOULDER, RIGHT_SHOULDER, NOSE, LEFT_EAR, RIGHT_EAR,
  type Lm, type Wm, type Side,
} from '@/lib/pose/landmarks';
import { th } from './thresholds';

/** A point in image-height units: x × aspect, y (down). */
export interface P { x: number; y: number }

export const deg = (r: number) => (r * 180) / Math.PI;
const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

export const pt = (l: Lm, aspect: number): P => ({ x: l.x * aspect, y: l.y });
const midP = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Interior angle at b between a–b–c, degrees (0..180). */
export function angleAt(a: P, b: P, c: P): number {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const n = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (n < 1e-12) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n))));
}

/** The same in 3-D (world landmarks, metres). */
export function angleAt3(a: Wm, b: Wm, c: Wm): number {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const n = Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]);
  if (n < 1e-12) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / n))));
}

const P_ = (img: readonly Lm[], i: number, aspect: number) => pt(img[i], aspect);

/** Every listed landmark is at or above `min` visibility. */
export function visible(img: readonly Lm[], idx: readonly number[], min: number): boolean {
  return idx.every((i) => !!img[i] && img[i].v >= min);
}

// ── side view (spec §3.2: knee, hip, trunk, tibia, shoulder) ─────────────────────────────────────────────────────

/** Knee flexion: 180° − ∠(hip, knee, ankle). 0 = a straight leg. */
export function kneeFlexion(img: readonly Lm[], side: Side, aspect: number): number {
  const s = SIDE[side];
  return 180 - angleAt(P_(img, s.hip, aspect), P_(img, s.knee, aspect), P_(img, s.ankle, aspect));
}

/** Knee flexion from world landmarks (3-D), for a knee bending toward the lens. */
export function kneeFlexionWorld(world: readonly Wm[], side: Side): number {
  const s = SIDE[side];
  return 180 - angleAt3(world[s.hip], world[s.knee], world[s.ankle]);
}

/** Hip flexion: 180° − ∠(shoulder, hip, knee). */
export function hipFlexion(img: readonly Lm[], side: Side, aspect: number): number {
  const s = SIDE[side];
  return 180 - angleAt(P_(img, s.shoulder, aspect), P_(img, s.hip, aspect), P_(img, s.knee, aspect));
}

/**
 * Which way a side-on athlete faces in the image: +1 toward image-right, −1 toward image-left, 0 when it cannot be
 * told. Read from the feet (toe ahead of heel), which do not care which side is labelled left; the face (nose ahead of
 * the ears) breaks a tie.
 */
export function facingSign(img: readonly Lm[]): 1 | -1 | 0 {
  let d = 0;
  for (const s of ['left', 'right'] as const) {
    const toe = img[SIDE[s].footIndex], heel = img[SIDE[s].heel];
    if (toe && heel) d += toe.x - heel.x;
  }
  if (Math.abs(d) > 0.004) return d > 0 ? 1 : -1;
  const nose = img[NOSE], le = img[LEFT_EAR], re = img[RIGHT_EAR];
  if (nose && le && re) {
    const e = nose.x - (le.x + re.x) / 2;
    if (Math.abs(e) > 0.004) return e > 0 ? 1 : -1;
  }
  return 0;
}

/** Signed angle of a segment from vertical, degrees: + = its top ahead of its bottom in the facing direction. */
function fromVertical(bottom: P, top: P, facing: 1 | -1): number {
  return deg(Math.atan2(facing * (top.x - bottom.x), bottom.y - top.y));
}

/** Trunk angle: hip midpoint → shoulder midpoint against vertical, + = leaning forward (side). */
export function trunkAngle(img: readonly Lm[], aspect: number, facing: 1 | -1): number {
  const hip = midP(P_(img, LEFT_HIP, aspect), P_(img, RIGHT_HIP, aspect));
  const sh = midP(P_(img, LEFT_SHOULDER, aspect), P_(img, RIGHT_SHOULDER, aspect));
  return fromVertical(hip, sh, facing);
}

/** Tibia angle: ankle → knee against vertical, + = the knee ahead of the ankle (side). */
export function tibiaAngle(img: readonly Lm[], side: Side, aspect: number, facing: 1 | -1): number {
  const s = SIDE[side];
  return fromVertical(P_(img, s.ankle, aspect), P_(img, s.knee, aspect), facing);
}

/** Trunk − tibia: 0 = parallel, + = the trunk leaning further forward than the shin. */
export function trunkTibiaDiff(img: readonly Lm[], side: Side, aspect: number, facing: 1 | -1): number {
  return trunkAngle(img, aspect, facing) - tibiaAngle(img, side, aspect, facing);
}

/** Shoulder flexion overhead: ∠(hip, shoulder, wrist). 180 = the arm in line with the trunk. */
export function shoulderFlexion(img: readonly Lm[], side: Side, aspect: number): number {
  const s = SIDE[side];
  return angleAt(P_(img, s.hip, aspect), P_(img, s.shoulder, aspect), P_(img, s.wrist, aspect));
}

/**
 * Hip crease against the knee line: how far the hip joint sits ABOVE the knee, in thigh lengths (y down, so + = the
 * hip higher than the knee; ≤ 0 = at or below it). squat-audit's depth01 reads the same line.
 */
export function hipAboveKnee(img: readonly Lm[], side: Side, aspect: number): number {
  const s = SIDE[side];
  const hip = P_(img, s.hip, aspect), knee = P_(img, s.knee, aspect);
  const thigh = Math.hypot(hip.x - knee.x, hip.y - knee.y);
  return thigh > 1e-6 ? (knee.y - hip.y) / thigh : NaN;
}

/** The side nearer the lens: the one the model sees better (visibility), then the one with the smaller z. */
export function nearSide(img: readonly Lm[]): Side {
  const pts = (s: Side) => [SIDE[s].shoulder, SIDE[s].hip, SIDE[s].knee, SIDE[s].ankle].map((i) => img[i]);
  const vis = (s: Side) => pts(s).reduce((a, l) => a + (l?.v ?? 0), 0);
  const dv = vis('left') - vis('right');
  if (Math.abs(dv) > 0.2) return dv > 0 ? 'left' : 'right';
  const z = (s: Side) => pts(s).reduce((a, l) => a + (l?.z ?? 0), 0);
  return z('left') <= z('right') ? 'left' : 'right';
}

// ── front view (spec §3.2: FPPA, knee-inside ratio, pelvis, trunk lean, weight shift) ────────────────────────────

/** The lens's horizontal field of view assumed for the parallax correction (the fixture camera's, a typical webcam's). */
export const DEFAULT_LENS_HFOV_DEG = th('geom.lensHfovDeg');

/**
 * A landmark moved to where it would sit at the HIP's depth: undoes the parallax of a point nearer or further than the
 * hips. MediaPipe's image z is that point's depth against the hip midpoint on x's scale (lib/pose/landmarks.ts), so the
 * point's distance over the hips' is 1 + z·W/fx, with W/fx = 2·tan(hfov/2); the image scales about its centre by that.
 *
 * WHY (measured on the synthetic single-leg squat, geometry.test.ts): a knee bending 60° travels ~23 cm toward a lens
 * 3 m away, so it projects further from the image centre than the hip and ankle it is compared with, and a knee
 * tracking straight read 2.5° of FPPA pushed OUT — past the ±2° the spec asks of the geometry, and always in the
 * direction that hides a valgus. The correction is small (a few pixels) and z's noise barely moves it (it multiplies an
 * offset from the centre of a few hundredths of the image). [TUNE-EJ]: the lens width varies by device (a phone's front
 * camera is wider); a wrong width leaves part of the parallax, never adds any.
 */
export function atHipDepth(l: Lm, hfovDeg = DEFAULT_LENS_HFOV_DEG): Lm {
  const k = 1 + l.z * 2 * Math.tan((hfovDeg * Math.PI) / 360);
  if (!Number.isFinite(k) || k <= 0.2) return l;
  return { x: 0.5 + (l.x - 0.5) * k, y: 0.5 + (l.y - 0.5) * k, z: l.z, v: l.v };
}

/**
 * Frontal-plane projection angle: 180° − ∠(hip, knee, ankle) in the image plane, signed + when the knee sits toward
 * the midline (valgus), − when it sits outside its hip–ankle line. Hip, knee and ankle are each taken at the hip's
 * depth first (atHipDepth), so a knee coming toward the lens is not read as pushed out.
 */
export function fppa(img: readonly Lm[], side: Side, aspect: number, hfovDeg = DEFAULT_LENS_HFOV_DEG): number {
  const s = SIDE[side];
  const at = (i: number) => pt(atHipDepth(img[i], hfovDeg), aspect);
  const hip = at(s.hip), knee = at(s.knee), ankle = at(s.ankle);
  const mag = 180 - angleAt(hip, knee, ankle);
  const midX = (img[LEFT_HIP].x + img[RIGHT_HIP].x) / 2 * aspect;
  const toMid = Math.sign(midX - hip.x);
  const span = ankle.y - hip.y;
  if (!toMid || Math.abs(span) < 1e-9) return 0;
  const lineX = hip.x + (ankle.x - hip.x) * ((knee.y - hip.y) / span);
  return (knee.x - lineX) * toMid >= 0 ? mag : -mag;
}

/**
 * The knee-inside ratio: how far a knee sits INSIDE the line from its own hip to its own ankle, in hip half-widths,
 * + = toward the midline. The same formula as squat-audit.ts kneeInwardRatio (lib/babylon/nexus/neuro-mirror/rules),
 * ported rather than imported because the assessment must not pull lib/babylon; geometry.test.ts checks they agree.
 * Raw normalised x on both sides of the ratio, so the aspect cancels. 0 when unreadable (hips stacked, side-on).
 */
export function kneeInsideRatio(img: readonly Lm[], side: Side): number {
  const s = SIDE[side];
  const hip = img[s.hip], knee = img[s.knee], ankle = img[s.ankle];
  const midlineX = (img[LEFT_HIP].x + img[RIGHT_HIP].x) / 2;
  const hipHalf = Math.abs(img[LEFT_HIP].x - img[RIGHT_HIP].x) / 2;
  const span = ankle.y - hip.y;
  if (Math.abs(span) < 1e-6 || hipHalf < 1e-3) return 0;
  const toMid = Math.sign(midlineX - hip.x);
  if (toMid === 0) return 0;
  const t = (knee.y - hip.y) / span;
  const lineX = hip.x + (ankle.x - hip.x) * t;
  return ((knee.x - lineX) * toMid) / hipHalf;
}

/**
 * Pelvic tilt for a stance leg: the angle of the hip line against horizontal, + when the OTHER (free) side's hip sits
 * lower than the stance side's. The pelvic drop is this minus the same read standing on two feet (calibration).
 */
export function pelvicTilt(img: readonly Lm[], stance: Side, aspect: number): number {
  const st = P_(img, SIDE[stance].hip, aspect), fr = P_(img, SIDE[other(stance)].hip, aspect);
  return deg(Math.atan2(fr.y - st.y, Math.abs(fr.x - st.x)));
}

/** Lateral trunk lean: hip midpoint → shoulder midpoint against vertical in the image plane, unsigned (front). */
export function lateralTrunkLean(img: readonly Lm[], aspect: number): number {
  const hip = midP(P_(img, LEFT_HIP, aspect), P_(img, RIGHT_HIP, aspect));
  const sh = midP(P_(img, LEFT_SHOULDER, aspect), P_(img, RIGHT_SHOULDER, aspect));
  return Math.abs(deg(Math.atan2(sh.x - hip.x, hip.y - sh.y)));
}

/** Weight shift: hip midpoint x against the ankle midpoint, in hip widths (front). Signed; the caller takes |Δ| from standing. */
export function weightShift(img: readonly Lm[]): number {
  const hipX = (img[LEFT_HIP].x + img[RIGHT_HIP].x) / 2;
  const ankleX = (img[SIDE.left.ankle].x + img[SIDE.right.ankle].x) / 2;
  const w = Math.abs(img[LEFT_HIP].x - img[RIGHT_HIP].x);
  return w > 1e-3 ? (hipX - ankleX) / w : 0;
}

// ── height off the floor (spec §3.2: heel rise, flight / contact) ────────────────────────────────────────────────

/** A foot's lowest image point (y down): the ankle, heel or toe, whichever is lowest. */
export function footLowY(img: readonly Lm[], side: Side): number {
  const s = SIDE[side];
  return Math.max(img[s.ankle].y, img[s.heel].y, img[s.footIndex].y);
}

/** How far a foot's lowest point sits above its floor line, in standing body heights. */
export function footHeight(img: readonly Lm[], side: Side, floorY: number, bodyHeight: number): number {
  return (floorY - footLowY(img, side)) / bodyHeight;
}

/** How far a heel sits above its floor line, in standing body heights. */
export function heelHeight(img: readonly Lm[], side: Side, heelFloorY: number, bodyHeight: number): number {
  return (heelFloorY - img[SIDE[side].heel].y) / bodyHeight;
}

/** Hip midpoint's image y. */
export function hipMidY(img: readonly Lm[]): number {
  return (img[LEFT_HIP].y + img[RIGHT_HIP].y) / 2;
}

/** How far the hips have dropped from standing, as a share of the standing hip height above the floor. */
export function hipDrop(img: readonly Lm[], standHipY: number, floorY: number): number {
  const h = floorY - standHipY;
  return h > 1e-6 ? (hipMidY(img) - standHipY) / h : 0;
}

/**
 * Knee flexion estimated from the front, where the knee bends toward the lens and the image angle cannot see it. With
 * thigh ≈ shin and the hip roughly over the ankle, the hip-to-ankle height is 2L·cos(θ/2), so θ = 2·acos(h / h0) with
 * h0 the standing leg's height. An estimate, labelled as one ([TUNE-EJ]); world landmarks win when the frame has them.
 */
export function kneeFlexionFromFront(img: readonly Lm[], side: Side, standingLegY: number): number {
  const s = SIDE[side];
  const h = img[s.ankle].y - img[s.hip].y;
  if (!(standingLegY > 1e-6)) return NaN;
  return deg(2 * Math.acos(Math.max(0, Math.min(1, h / standingLegY))));
}

/** Knee flexion for a front-view test: world when present, else the leg-height estimate. */
export function kneeFlexionFront(img: readonly Lm[], world: readonly Wm[] | undefined, side: Side, standingLegY: number): number {
  if (world && world.length === img.length && world[SIDE[side].knee]) {
    const w = kneeFlexionWorld(world, side);
    if (Number.isFinite(w)) return w;
  }
  return kneeFlexionFromFront(img, side, standingLegY);
}

/** The wrists above the shoulder line (image-height units, + = above): the hands left the hips in a jump. */
export function wristsAboveShoulders(img: readonly Lm[]): number {
  const shY = (img[LEFT_SHOULDER].y + img[RIGHT_SHOULDER].y) / 2;
  return shY - Math.min(img[SIDE.left.wrist].y, img[SIDE.right.wrist].y);
}
