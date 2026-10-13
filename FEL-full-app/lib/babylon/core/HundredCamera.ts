// THE HUNDRED'S CAMERA, DAMPED (Karate Endless) — CAM-FIXES, 2026-10-13.
//
// Owner playtest (2026-10-08): "camera is still wonky and needs to zoom out a little."
//
// MEASURED (Playwright on the running rig, stepped 60 Hz, three scripted bots over ~100 s of play each; scratch cam-fixes):
//   * the camera sat 5.1 m from the fighter in almost every frame (p50 5.08 m) — also in crowded waves, because the crowd shot only
//     opened when THREE bodies stood inside 2.6 m of the fighter, so a horde of twelve at 4-8 m was framed at fight distance;
//     42 % of the foes within 12 m were off the frame or cut by its edge (desktop), and the fighter themself left it for 33 frames;
//   * the crowd shot was a hard preset flip (setPreset), with no hysteresis: the 'surrounded' test flickering at the threshold pumped the camera
//     between 4.7 m and 7.6 m, and one frame of that moved the camera 1.8-2.2 m (the director's catch-up lag is 45 % of the gap a frame);
//   * the aim point snapped: the "objective" was the NEAREST foe, so each time the nearest body changed (a KO, two bodies trading places)
//     the target jumped a metre or more in one frame — a view-yaw step of up to 30 degrees between two frames;
//   * the follow direction is the fighter's FACING, which turns on a dime (the stick reversal slews 180 degrees in 0.14 s).
//
// So the mode no longer flips presets and no longer hands the director raw inputs. This class turns the fight into SMOOTH inputs:
//   crowd01   how packed the fight is (0 = a duel, 1 = a horde), from every foe near the fighter, eased UP quickly and DOWN slowly — the
//             shot opens as the horde forms and does not pump closed the moment one body falls;
//   facing    the fighter's facing, leaned toward the crowd as it thickens, slewed at a capped rate, always a unit vector (the director's
//             facing-follow contract: KarateEndlessMode passes it as the `velocity`);
//   focus     a point toward the crowd the camera aims at: never null (so the aim cannot flip between "an objective" and "none") and eased;
//   shot      the distance / height / pitch cap / follow lag for this frame: between the shoulder shot and the crowd shot by crowd01, pulled
//             back more on a narrow (portrait) screen — a vertical-fixed lens loses width exactly there.
// Pure numbers, no Babylon: the mode feeds it and calls ctx.camDirector.tuneFollow with the result.
import { FOLLOW_PRESETS } from './CameraDirector';

export interface Foe { x: number; z: number }
export interface Flat { x: number; z: number }

/** A foe this close pulls the camera back with full weight (m), and none at CROWD_FAR. */
export const CROWD_NEAR = 3.0;
export const CROWD_FAR = 8.5;
/** Pressure (sum of foe weights) below which the shot is the plain shoulder shot, and at which the crowd shot is fully open. */
export const CROWD_P0 = 1.5;
export const CROWD_P1 = 6.0;
/** How fast the crowd shot opens / closes (fraction of the way per second). Opening is quick, closing is slow: no pumping. */
export const CROWD_OPEN_PER_SEC = 0.9;
export const CROWD_CLOSE_PER_SEC = 0.28;
/** Facing smoothing: time constant (s) and the cap on how fast the camera's heading may swing (rad/s). */
export const FACING_TAU = 0.22;
export const FACING_MAX_RATE = 3.4;
/** The camera leans this far (0..1 of the angle) from the facing toward the crowd at full crowd01. */
export const CROWD_LEAN = 0.45;
/** Focus: how far toward the crowd centroid the aim moves (0..1), the farthest it may sit from the fighter (m), its time constant (s). */
export const FOCUS_TOWARD = 0.55;
export const FOCUS_MAX_REACH = 3.6;
export const FOCUS_IDLE_AHEAD = 2.2;
export const FOCUS_TAU = 0.3;
/** Narrow screens: the extra pull-back at aspect 0.46 (a phone in portrait), as a multiple of the shoulder / crowd distance, and its ceiling. */
export const PORTRAIT_PULL_PER_ASPECT = 0.6;
export const PORTRAIT_PULL_MAX = 1.3;
/** The camera never stands farther than this from the fighter along the ground (m), whatever the screen and the crowd ask for. */
export const MAX_CAM_DISTANCE = 11;
/** The lens opens a little on a narrow screen too: distance alone cannot give a portrait phone the width of a duel's ring (a vertical-fixed
 *  lens at aspect 0.46 sees +-11 degrees sideways). +40 % of the missing aspect, capped, so a phone's vertical FOV goes 0.80 -> ~0.97 rad. */
export const PORTRAIT_FOV_PER_ASPECT = 0.4;
export const PORTRAIT_FOV_MAX = 1.25;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const smooth01 = (t: number): number => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };

/** The pull-back a narrow screen asks for: 1 at aspect >= 1, growing as it narrows. */
export function aspectPull(aspect: number): number {
  return aspect >= 1 ? 1 : clamp(1 + (1 - aspect) * PORTRAIT_PULL_PER_ASPECT, 1, PORTRAIT_PULL_MAX);
}

/** The lens multiplier for a screen: 1 at aspect >= 1, wider as it narrows. */
export function lensWiden(aspect: number): number {
  return aspect >= 1 ? 1 : clamp(1 + (1 - aspect) * PORTRAIT_FOV_PER_ASPECT, 1, PORTRAIT_FOV_MAX);
}

/** How packed the fight is around `hero`, 0..1 (no state — the target crowd01 eases toward). */
export function crowdTarget(hero: Flat, foes: readonly Foe[]): { pressure: number; target: number } {
  let pressure = 0;
  for (const f of foes) {
    const d = Math.hypot(f.x - hero.x, f.z - hero.z);
    pressure += d <= CROWD_NEAR ? 1 : d >= CROWD_FAR ? 0 : (CROWD_FAR - d) / (CROWD_FAR - CROWD_NEAR);
  }
  return { pressure, target: smooth01((pressure - CROWD_P0) / (CROWD_P1 - CROWD_P0)) };
}

export interface HundredShot {
  /** unit facing for the director's facing-follow (`velocity`), smoothed */
  facing: Flat;
  /** world XZ the camera aims at (the director's `objective`), smoothed */
  focus: Flat;
  crowd01: number;
  distance: number; height: number; pitchCapDeg: number; pitchFloorDeg: number; lag: number;
  /** the vertical FOV this screen wants (rad): `baseFov` opened by lensWiden(aspect) */
  fov: number;
}

export class HundredCamera {
  crowd01 = 0;
  private ang = 0;
  private fx = 0; private fz = 0;
  private ready = false;

  /** A declared cut (the mode's load, a respawn): the next frame starts from exactly where the fighter is, not eased from the last one. */
  reset(): void { this.ready = false; this.crowd01 = 0; }

  /** One frame. `facing` need not be unit; `aspect` is width / height; `baseFov` the lens the camera was authored with (rad). */
  update(dt: number, hero: Flat, facing: Flat, foes: readonly Foe[], aspect: number, baseFov = 0.8): HundredShot {
    const step = clamp(dt, 0, 0.1);
    const flen = Math.hypot(facing.x, facing.z);
    const fAng = flen > 1e-6 ? Math.atan2(facing.x, facing.z) : this.ang;

    // crowd01: up quickly, down slowly
    const { target } = crowdTarget(hero, foes);
    if (!this.ready) this.crowd01 = target;
    else this.crowd01 = target > this.crowd01
      ? Math.min(target, this.crowd01 + CROWD_OPEN_PER_SEC * step)
      : Math.max(target, this.crowd01 - CROWD_CLOSE_PER_SEC * step);

    // the crowd's weighted centroid (nearer bodies count more)
    let cw = 0, cx = 0, cz = 0;
    for (const f of foes) {
      const d = Math.hypot(f.x - hero.x, f.z - hero.z);
      const w = d >= CROWD_FAR ? 0 : d <= CROWD_NEAR ? 1 : (CROWD_FAR - d) / (CROWD_FAR - CROWD_NEAR);
      cw += w; cx += f.x * w; cz += f.z * w;
    }
    const haveCrowd = cw > 0.5;
    if (haveCrowd) { cx /= cw; cz /= cw; }

    // facing → leaned toward the crowd as it thickens → slewed
    let want = fAng;
    if (haveCrowd) want = fAng + wrap(Math.atan2(cx - hero.x, cz - hero.z) - fAng) * CROWD_LEAN * this.crowd01;
    if (!this.ready) this.ang = want;
    else {
      const d = wrap(want - this.ang) * (1 - Math.exp(-step / FACING_TAU));
      this.ang += clamp(d, -FACING_MAX_RATE * step, FACING_MAX_RATE * step);
    }

    // focus: toward the crowd (capped reach), else ahead of the fighter; eased, never null
    let tx: number, tz: number;
    if (haveCrowd) {
      const dx = (cx - hero.x) * FOCUS_TOWARD, dz = (cz - hero.z) * FOCUS_TOWARD, len = Math.hypot(dx, dz) || 1, k = Math.min(1, FOCUS_MAX_REACH / len);
      tx = hero.x + dx * k; tz = hero.z + dz * k;
    } else { tx = hero.x + Math.sin(this.ang) * FOCUS_IDLE_AHEAD; tz = hero.z + Math.cos(this.ang) * FOCUS_IDLE_AHEAD; }
    if (!this.ready) { this.fx = tx; this.fz = tz; }
    else { const a = 1 - Math.exp(-step / FOCUS_TAU); this.fx += (tx - this.fx) * a; this.fz += (tz - this.fz) * a; }
    this.ready = true;

    const sh = FOLLOW_PRESETS.fightShoulder, cr = FOLLOW_PRESETS.fightCrowd, k = smooth01(this.crowd01), pull = aspectPull(aspect);
    return {
      facing: { x: Math.sin(this.ang), z: Math.cos(this.ang) },
      focus: { x: this.fx, z: this.fz },
      crowd01: this.crowd01,
      distance: Math.min(MAX_CAM_DISTANCE, lerp(sh.distance, cr.distance, k) * pull),
      height: lerp(sh.height, cr.height, k) * Math.sqrt(pull),
      pitchCapDeg: lerp(sh.pitchCapDeg, cr.pitchCapDeg, k),
      pitchFloorDeg: lerp(sh.pitchFloorDeg, cr.pitchFloorDeg, k),
      lag: lerp(sh.lag, cr.lag, k),
      fov: baseFov * lensWiden(aspect),
    };
  }
}

/** The most the camera may travel in one 60 Hz frame (m). Measured on the rig: the follow's own motion peaks near 0.4 m/frame at the wide shot, so
 *  this never touches a normal frame; it exists for the ones the director's occlusion probe can still make at a wall (a whisker choice flipping
 *  moved the camera 0.87 m in one frame with the fighter standing still). Scaled by dt, so a slow frame is not clamped harder. */
export const MAX_CAM_STEP = 0.5;

/** `next`, pulled back along the move so it is at most MAX_CAM_STEP * (dt * 60) from `prev`. Returns true when it clamped. Mutates `next`. */
export function limitCameraStep(prev: { x: number; y: number; z: number }, next: { x: number; y: number; z: number }, dt: number): boolean {
  const max = MAX_CAM_STEP * clamp(dt * 60, 0.5, 6);
  const dx = next.x - prev.x, dy = next.y - prev.y, dz = next.z - prev.z, d = Math.hypot(dx, dy, dz);
  if (d <= max) return false;
  const k = max / d;
  next.x = prev.x + dx * k; next.y = prev.y + dy * k; next.z = prev.z + dz * k;
  return true;
}
