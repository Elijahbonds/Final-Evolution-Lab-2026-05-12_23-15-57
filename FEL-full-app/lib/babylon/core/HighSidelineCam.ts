// HIGH SIDELINE — the 1v1 play camera that does not chase (lane/hoops-cam, 2026-11-21).
//
// Owner, 2026-11-21: "There needs to be improvements to the camera in the 1v1 mode. When it follows it's hard to play. When it's
// stationary like 2k high camera angle it's easier."
//
// The follow camera ('hoops' preset, fitTwo) stands behind the ball-handler on the line to the rim, so every cut, crossover and
// drive past the rim swings it round the player (up to MAX_BEARING_RATE, 2.2 rad/s), and with it the meaning of the stick: the
// stick is camera-relative, so "up" is a different court direction after every swing. This view is the opposite: it stands high
// and off to one side of the half court, behind the play, and it NEVER ROTATES. Its look direction, pitch and lens are fixed for
// the court; all it may do is TRUCK (slide without turning), slowly and critically damped, after the play. So screen-up is always
// toward the rim, and a stick direction means the same court direction for the whole game.
//
// How it moves (all pure, below):
//   - The BASE focus sits HIGH_CAM_FOCUS_M out from the rim on the court's long axis. The eye stands HIGH_CAM_DIST_M back from
//     it, HIGH_CAM_HEIGHT_M up, swung HIGH_CAM_SIDE_DEG off the long axis toward one sideline (0 = straight behind the play on the
//     centre line, 90 = a pure sideline view).
//   - The focus wants to follow the play (the midpoint of the two players) by HIGH_CAM_PAN_SHARE, along the camera's own ground
//     axes (screen-right and screen-forward).
//   - Then a FIT: the screen-right truck is clamped so the hero, the rival and the rim all stay inside the frame with a margin of
//     HIGH_CAM_MARGIN of the half-frame. On a wide screen the base view already holds the whole half court, so the fit rarely
//     acts; on a phone held upright (a narrow lens) it is what keeps the play in frame.
//   - The focus reaches that want through a critically damped spring with time constant HIGH_CAM_PAN_SEC: no overshoot, no snap,
//     no step in velocity when the play changes direction.
//
// Every number here is NEW and a feel number (flagged in the lane report), each behind a feel knob. `hoops.oneVOneCam` 0 gives the
// follow camera back exactly as it shipped. No Babylon import: the math is plain numbers, so it is unit-tested on its own
// (HighSidelineCam.test.ts); CameraDirector owns the camera and calls into it.

import { feel } from '../../feel-panel/feel';

/** `hoops.oneVOneCam`: 1 = this view in 1v1 (owner 2026-11-21, ships ON); 0 = the follow camera exactly as it shipped. */
export const ONEVONE_CAM = 1;
/** `hoops.highCamHeightM`: the eye's height over the floor (m). */
export const HIGH_CAM_HEIGHT_M = 6.8;
/** `hoops.highCamDistM`: the eye's ground distance back from the focus (m). */
export const HIGH_CAM_DIST_M = 11.2;
/** `hoops.highCamSideDeg`: how far the eye is swung off the court's long axis toward the sideline (degrees; 0 behind, 90 side-on). */
export const HIGH_CAM_SIDE_DEG = 32;
/** `hoops.highCamFocusM`: the resting focus, this far out from the rim along the long axis (m). */
export const HIGH_CAM_FOCUS_M = 3.8;
/** `hoops.highCamPanShare`: how much of the play's offset from the resting focus the camera trucks after (0 = never, 1 = all). */
export const HIGH_CAM_PAN_SHARE = 0.3;
/** `hoops.highCamPanSec`: the truck's time constant (s) — a critically damped spring; bigger = slower and softer. */
export const HIGH_CAM_PAN_SEC = 0.55;
/** `hoops.highCamMargin`: the share of the half-frame kept clear round the hero, the rival and the rim (0..0.5). */
export const HIGH_CAM_MARGIN = 0.14;
/** `hoops.highCamPunch`: how much of a camera punch (CameraDirector.pulse) this view takes, as a share of the follow's push-in. */
export const HIGH_CAM_PUNCH = 0.25;
/** The point the view aims at, this far over the focus (m): about a player's hip, so the floor and the rim share the frame. */
export const HIGH_CAM_TARGET_Y = 1.0;
/** `hoops.highCamPullMax`: when the hero, the rival and the rim cannot all fit across the screen (a phone held upright, the play out on
 *  a wing), the camera may back away along its own look — never turning — up to this many times its resting distance. */
export const HIGH_CAM_PULL_MAX = 1.6;
/** The closest the eye may come in along its look when scenery stands between it and the play (a share of its resting distance).
 *  The clear-view guard (CameraDirector.highClear) pulls it in, never turns it. */
export const HIGH_CAM_PULL_MIN = 0.45;
/** Room kept between the eye and the scenery it was pulled in front of (m). */
export const HIGH_CAM_CLEAR_M = 0.8;
/** `hoops.highCamPortraitLift`: on a phone held upright, the share of the screen's height at the bottom the players are kept out of
 *  (the touch deck's buttons sit there). Wider screens keep HIGH_CAM_BAND_WIDE; between the two it blends by the screen's shape. */
export const HIGH_CAM_PORTRAIT_LIFT = 0.34;
/** The bottom band on a wide screen (the hint line and the shot meter): a share of the screen's height. */
export const HIGH_CAM_BAND_WIDE = 0.1;
/** How far the depth truck may go from the resting focus (m): toward the rim, and away from it. */
export const HIGH_CAM_DEPTH_IN_M = 1.5, HIGH_CAM_DEPTH_OUT_M = 4.5;

export interface P2 { x: number; z: number }
export interface P3 { x: number; y: number; z: number }

/** The half court this view frames: the rim's floor point and the long axis (unit, rim → half-court line), plus which sideline. */
export interface CourtFrame {
  rimX: number; rimZ: number;
  axisX: number; axisZ: number;
  /** +1 / −1: which side of the long axis the eye stands (+1 = the axis turned a quarter clockwise seen from above). */
  side: 1 | -1;
}

export interface HighCamParams {
  height: number; dist: number; sideDeg: number; focusM: number;
  panShare: number; panSec: number; margin: number; pullMax: number; portraitLift: number; targetY: number;
}

/** The shipped parameters, each read through its feel knob (per frame: the panel's values take effect on the next frame). */
export function highCamParams(): HighCamParams {
  return {
    height: feel('hoops.highCamHeightM', HIGH_CAM_HEIGHT_M),
    dist: feel('hoops.highCamDistM', HIGH_CAM_DIST_M),
    sideDeg: feel('hoops.highCamSideDeg', HIGH_CAM_SIDE_DEG),
    focusM: feel('hoops.highCamFocusM', HIGH_CAM_FOCUS_M),
    panShare: feel('hoops.highCamPanShare', HIGH_CAM_PAN_SHARE),
    panSec: feel('hoops.highCamPanSec', HIGH_CAM_PAN_SEC),
    margin: feel('hoops.highCamMargin', HIGH_CAM_MARGIN),
    pullMax: feel('hoops.highCamPullMax', HIGH_CAM_PULL_MAX),
    portraitLift: feel('hoops.highCamPortraitLift', HIGH_CAM_PORTRAIT_LIFT),
    targetY: HIGH_CAM_TARGET_Y,
  };
}

/** The view's fixed ground basis: `back` points from the focus to the eye, `fwd` = −back (the look on the ground), `right` = screen right. */
export interface HighBasis { back: P2; fwd: P2; right: P2 }

export function highBasis(c: CourtFrame, sideDeg: number): HighBasis {
  const a = Math.hypot(c.axisX, c.axisZ) > 1e-6 ? { x: c.axisX / Math.hypot(c.axisX, c.axisZ), z: c.axisZ / Math.hypot(c.axisX, c.axisZ) } : { x: 0, z: 1 };
  const perp = { x: c.side * a.z, z: -c.side * a.x };
  const th = (Math.max(0, Math.min(90, sideDeg)) * Math.PI) / 180;
  const back = { x: a.x * Math.cos(th) + perp.x * Math.sin(th), z: a.z * Math.cos(th) + perp.z * Math.sin(th) };
  const fwd = { x: -back.x, z: -back.z };
  // Babylon is left-handed with +y up: screen right = up × forward = (fwd.z, 0, −fwd.x)
  return { back, fwd, right: { x: fwd.z, z: -fwd.x } };
}

/** The resting focus (on the floor). */
export function restFocus(c: CourtFrame, p: HighCamParams): P2 {
  const n = Math.hypot(c.axisX, c.axisZ) || 1;
  return { x: c.rimX + (c.axisX / n) * p.focusM, z: c.rimZ + (c.axisZ / n) * p.focusM };
}

/** The view's offset from its resting pose: `x` the truck along screen-right, `z` along screen-forward (m), `pull` the scale on the
 *  eye's distance from its look target (1 = resting; > 1 = backed away along the look). */
export interface HighOff { x: number; z: number; pull: number }

/** Eye and look target for an offset from the resting pose. */
export function highPose(c: CourtFrame, p: HighCamParams, off: HighOff): { eye: P3; target: P3 } {
  const b = highBasis(c, p.sideDeg), f0 = restFocus(c, p);
  const fx = f0.x + b.right.x * off.x + b.fwd.x * off.z, fz = f0.z + b.right.z * off.x + b.fwd.z * off.z;
  const k = Math.max(HIGH_CAM_PULL_MIN, off.pull);
  return { eye: { x: fx + b.back.x * p.dist * k, y: p.targetY + (p.height - p.targetY) * k, z: fz + b.back.z * p.dist * k }, target: { x: fx, y: p.targetY, z: fz } };
}

/** Where a world point lands on screen for a pose: x, y in −1..1 (0 = centre, +y = up), `ahead` false when it is behind the eye. */
export function project(pose: { eye: P3; target: P3 }, vfov: number, aspect: number, q: P3): { x: number; y: number; ahead: boolean } {
  const v = { x: pose.target.x - pose.eye.x, y: pose.target.y - pose.eye.y, z: pose.target.z - pose.eye.z };
  const vl = Math.hypot(v.x, v.y, v.z) || 1; v.x /= vl; v.y /= vl; v.z /= vl;
  // right = up × v (left-handed), normalised; camera up = v × right
  let r = { x: v.z, y: 0, z: -v.x }; const rl = Math.hypot(r.x, r.z) || 1; r = { x: r.x / rl, y: 0, z: r.z / rl };
  const u = { x: v.y * r.z - v.z * r.y, y: v.z * r.x - v.x * r.z, z: v.x * r.y - v.y * r.x };
  const d = { x: q.x - pose.eye.x, y: q.y - pose.eye.y, z: q.z - pose.eye.z };
  const zc = d.x * v.x + d.y * v.y + d.z * v.z;
  const tv = Math.tan(vfov / 2);
  const xc = d.x * r.x + d.z * r.z, yc = d.x * u.x + d.y * u.y + d.z * u.z;
  return { x: xc / (Math.max(1e-6, zc) * tv * aspect), y: yc / (Math.max(1e-6, zc) * tv), ahead: zc > 0.05 };
}

/** Where the touch deck and the HUD sit: the share of the screen's HEIGHT kept clear at the bottom for the bodies (y ≥ this), on a
 *  wide screen and on a phone held upright (its deck of buttons covers the lower third: measured on the 390 × 844 rig). */
export function bottomBand(aspect: number, p: HighCamParams): number {
  const upright = Math.max(0, Math.min(1, (1 - aspect) / (1 - 390 / 844)));   // 0 at square and wider, 1 at a 390 × 844 phone
  return HIGH_CAM_BAND_WIDE + (p.portraitLift - HIGH_CAM_BAND_WIDE) * upright;
}

/**
 * The offset this view WANTS for the play. The pan share of the play's offset (the midpoint of the two bodies) gives the wanted
 * truck along screen-right (x) and screen-forward (z). Then the FIT, against `must` (the points that must stay on screen, in priority
 * order, the rim last):
 *   - up and down the screen every point stays inside the frame by the margin, and above the bottom band (the touch deck);
 *   - across the screen every point stays inside 1 − margin of the half frame.
 * The truck along screen-right moves every point's screen-x by the same amount and leaves its height on screen alone (right ⟂ the
 * look), so for each depth truck the points allow an interval of side trucks; the depth truck moves points up and down. The search
 * takes the depth truck nearest the wanted one that fits, at the least back-away (pull) that fits; when nothing fits up to pullMax,
 * the last point (the rim) is let go first, then the rival.
 */
export function highWant(c: CourtFrame, p: HighCamParams, play: P2, must: readonly P3[], vfov: number, aspect: number): HighOff {
  const b = highBasis(c, p.sideDeg), f0 = restFocus(c, p);
  const dx = play.x - f0.x, dz = play.z - f0.z;
  const share = Math.max(0, Math.min(1, p.panShare));
  const axWant = share * (dx * b.right.x + dz * b.right.z);
  const azWant = Math.max(-HIGH_CAM_DEPTH_OUT_M, Math.min(HIGH_CAM_DEPTH_IN_M, share * (dx * b.fwd.x + dz * b.fwd.z)));
  const k = 1 - Math.max(0, Math.min(0.45, p.margin));   // |screen x| ≤ 1 − margin (the margin is a share of the half frame)
  const yLo = -1 + 2 * Math.max(0, Math.min(0.6, bottomBand(aspect, p)));
  const tvv = Math.tan(vfov / 2), th = tvv * Math.max(0.1, aspect);
  /** The side-truck interval [lo, hi] at this depth truck and pull for the first n points; lo > hi when it does not fit. */
  const fit = (az: number, pull: number, n: number): [number, number] => {
    const pose = highPose(c, p, { x: 0, z: az, pull });
    const v = { x: pose.target.x - pose.eye.x, y: pose.target.y - pose.eye.y, z: pose.target.z - pose.eye.z };
    const vl = Math.hypot(v.x, v.y, v.z) || 1; v.x /= vl; v.y /= vl; v.z /= vl;
    const u = { x: v.y * b.right.z, y: v.z * b.right.x - v.x * b.right.z, z: -v.y * b.right.x };   // camera up (left-handed: look × right)
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < n; i++) {
      const q = must[i];
      const d = { x: q.x - pose.eye.x, y: q.y - pose.eye.y, z: q.z - pose.eye.z };
      const zc = d.x * v.x + d.y * v.y + d.z * v.z;
      if (zc < 0.5) return [1, 0];
      const y = (d.x * u.x + d.y * u.y + d.z * u.z) / (zc * tvv);
      if (y > k || y < yLo) return [1, 0];
      const xc = d.x * b.right.x + d.z * b.right.z, half = k * zc * th;
      lo = Math.max(lo, xc - half); hi = Math.min(hi, xc + half);
    }
    return [lo, hi];
  };
  const ok = (az: number, pull: number, n: number) => { const [l, h] = fit(az, pull, n); return l <= h; };
  const pullMax = Math.max(1, p.pullMax), PULLS = 8, AZ_STEP = 0.25;
  const azs: number[] = [];
  for (let a = -HIGH_CAM_DEPTH_OUT_M; a <= HIGH_CAM_DEPTH_IN_M + 1e-9; a += AZ_STEP) azs.push(a);
  azs.push(azWant); azs.sort((x, y) => Math.abs(x - azWant) - Math.abs(y - azWant));
  for (let n = must.length; n > 0; n--) {
    for (let i = 0; i <= PULLS; i++) {
      if (i > 0 && pullMax <= 1) break;
      let pull = 1 + ((pullMax - 1) * i) / PULLS;
      const az0 = azs.find((a) => ok(a, pull, n));
      if (az0 === undefined) continue;
      // refine: the depth truck nearest the wanted one (bisect toward it), then the least pull between this step and the last
      let az = az0;
      if (Math.abs(az - azWant) > 1e-9 && !ok(azWant, pull, n)) {
        let bad = azWant, good = az;
        for (let j = 0; j < 8; j++) { const m = (bad + good) / 2; if (ok(m, pull, n)) good = m; else bad = m; }
        az = good;
      } else az = ok(azWant, pull, n) ? azWant : az;
      if (i > 0) {
        let bad = 1 + ((pullMax - 1) * (i - 1)) / PULLS, good = pull;
        for (let j = 0; j < 8; j++) { const m = (bad + good) / 2; if (ok(az, m, n)) good = m; else bad = m; }
        pull = good;
      }
      const [l, h] = fit(az, pull, n);
      return { x: Math.max(l, Math.min(h, axWant)), z: az, pull };
    }
  }
  return { x: axWant, z: azWant, pull: 1 };
}

/** Whether every `must` point is on screen at this offset — inside the margin across, inside the frame up and down, and above the
 *  bottom band (the same rules as the fit). The director cuts a reset that would not, and lets the truck catch up faster while not. */
export function highFits(c: CourtFrame, p: HighCamParams, off: HighOff, must: readonly P3[], vfov: number, aspect: number): boolean {
  const pose = highPose(c, p, off);
  const k = 1 - Math.max(0, Math.min(0.45, p.margin)), yLo = -1 + 2 * Math.max(0, Math.min(0.6, bottomBand(aspect, p)));
  for (const q of must) {
    const s = project(pose, vfov, aspect, q);
    if (!s.ahead || Math.abs(s.x) > k + 0.02 || s.y > k + 0.02 || s.y < yLo - 0.02) return false;
  }
  return true;
}
/** The side trucks [lo, hi] at which every one of `pts` sits inside |screen x| ≤ edge, at this depth truck and pull (lo > hi: none).
 *  The director's EDGE PUSH: the hero is never left past the frame's edge by the soft truck's lag (a sprint across an upright phone). */
export function highSideSpan(c: CourtFrame, p: HighCamParams, z: number, pull: number, pts: readonly P3[], vfov: number, aspect: number, edge: number): [number, number] {
  const b = highBasis(c, p.sideDeg), pose = highPose(c, p, { x: 0, z, pull });
  const v = { x: pose.target.x - pose.eye.x, y: pose.target.y - pose.eye.y, z: pose.target.z - pose.eye.z };
  const vl = Math.hypot(v.x, v.y, v.z) || 1; v.x /= vl; v.y /= vl; v.z /= vl;
  const th = Math.tan(vfov / 2) * Math.max(0.1, aspect);
  let lo = -Infinity, hi = Infinity;
  for (const q of pts) {
    const d = { x: q.x - pose.eye.x, y: q.y - pose.eye.y, z: q.z - pose.eye.z };
    const zc = Math.max(0.5, d.x * v.x + d.y * v.y + d.z * v.z), xc = d.x * b.right.x + d.z * b.right.z, half = edge * zc * th;
    lo = Math.max(lo, xc - half); hi = Math.min(hi, xc + half);
  }
  return [lo, hi];
}
/** The edge push's edge: |screen x| this far out (between the fit's 1 − margin and the frame's edge). */
export const HIGH_CAM_EDGE = 0.92;
/** The edge push's top speed (m/s): above a sprint (~7), so a running hero is held, but a slide, never a jump. */
export const HIGH_CAM_PUSH_MPS = 9;

/** While a point is off its spot the truck runs at this share of its time constant (a catch-up; the follow's lag runs 1.6× there). */
export const HIGH_CAM_CATCHUP = 0.4;

/** The truck's state: the offset and its rates. */
export interface HighState extends HighOff { vx: number; vz: number; vp: number }

/** One critically damped step toward `want` (exact for a constant want over dt, so a slow phone frame cannot overshoot). */
export function highStep(s: HighState, want: HighOff, dt: number, panSec: number): HighState {
  if (!(panSec > 0) || dt <= 0) return { x: want.x, z: want.z, pull: want.pull, vx: 0, vz: 0, vp: 0 };
  const w = 1 / panSec, e = Math.exp(-w * Math.min(0.25, dt)), t = Math.min(0.25, dt);
  const ax = (x: number, v: number, g: number): [number, number] => {
    const x0 = x - g, c = v + w * x0;
    return [g + (x0 + c * t) * e, (v - w * c * t) * e];
  };
  const [x, vx] = ax(s.x, s.vx, want.x), [z, vz] = ax(s.z, s.vz, want.z), [pull, vp] = ax(s.pull, s.vp, want.pull);
  return { x, z, pull, vx, vz, vp };
}
