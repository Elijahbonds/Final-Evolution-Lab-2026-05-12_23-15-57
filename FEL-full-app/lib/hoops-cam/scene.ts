// lib/hoops-cam/scene.ts — basketball on the camera (BBS, 2026-10-26): a synthetic court, filmed, with known truth.
//
// WHY. There is no recorded basketball video in this repo (and none may be committed: lib/pose/recordingsGuard.ts), and
// the owner's rule is "no accuracy claims". So the ball detector, the make/miss read and the dribble counter are
// measured here, on frames DRAWN from a physical simulation whose truth is known: where the ball is in every frame,
// which shots went in (by the physics, not by intent), where the shooter stood, when each dribble hit the floor. The
// rates this gives are rates on drawn frames. They say the chain works and where it breaks; they are not a claim about a
// real gym, and the copy never says otherwise (copy.ts).
//
// WHAT IS DRAWN (pinhole camera, metres, y up; the rim's centre is (0, 3.05, 0), the court runs toward +z):
//   the floor     hardwood planks with a painted key and lines (indoor) or patched asphalt (outdoor); the wall,
//                 padding and ceiling lights, or sky, a tree line and a fence;
//   the hoop      a backboard (white, bordered), an orange rim (a torus of splats), a white net, a pole outdoors;
//   the shooter   capsules and a head in the look's skin and jersey (an orange jersey is a distractor fixture), posed
//                 by a small keyframe body — hold and dribble, gather, dip, jump, set point, release, land;
//   the ball      an orange sphere, shaded, with dark seams, motion-blurred over the look's exposure, hidden behind
//                 the rim's front, the net and the board where they are nearer the lens;
//   the sensor    the look's light and tint, per-pixel noise, 8-bit clipping; frame times with jitter and drops.
// The ball's flight is integrated at 2 ms with gravity, the backboard, the rim as a torus, the net's drag and squeeze,
// and the floor. A make is the ball's centre crossing the rim's plane downward inside the ring and reaching the net's
// bottom without coming back up.
//
// The pose the app would read is the drawn body's joints projected (BlazePose's 33 points, a little jitter), so the
// shot chart's spot and the face/torso masks run on the same numbers they would get live.
//
// Pure: no DOM. Deterministic for a seed.
import type { Lm } from '@/lib/pose/landmarks';
import { rng } from '@/lib/vbt/rng';
import type { Rgb } from './frame';

export type V3 = [number, number, number];

// ── the court (metres; FIBA/NBA hoop sizes) ─────────────────────────────────────────────────────────────────────────
export const RIM_Y = 3.05;
/** The ring's radius to the centre of its tube (an 18-inch ring). */
export const RIM_R = 0.2286;
const RIM_TUBE = 0.009;
export const BALL_R = 0.12;
/** The backboard's face (the ring's centre is 0.375 m out from it). */
export const BOARD_Z = -0.375;
const BOARD = { x0: -0.915, x1: 0.915, y0: 2.9, y1: 3.97 };
const NET_LEN = 0.42;
const NET_BOTTOM_R = 0.13;
const BASELINE_Z = -1.575;
const G = 9.81;

// ── vectors ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const smooth = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };

// ── the camera ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface CamSpec { pos: V3; look: V3; hfovDeg: number; w: number; h: number }
export interface Cam { pos: V3; r: V3; u: V3; f: V3; fx: number; cx: number; cy: number; w: number; h: number }

export function makeCam(s: CamSpec): Cam {
  const f = norm(sub(s.look, s.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  return { pos: s.pos, r, u, f, fx: (s.w / 2) / Math.tan((s.hfovDeg * Math.PI) / 360), cx: s.w / 2, cy: s.h / 2, w: s.w, h: s.h };
}

/** A world point in the frame's pixels, with its depth along the lens axis (null behind the camera). */
export function project(cam: Cam, p: V3): { x: number; y: number; z: number } | null {
  const d = sub(p, cam.pos);
  const z = dot(d, cam.f);
  if (z < 0.05) return null;
  return { x: cam.cx + (cam.fx * dot(d, cam.r)) / z, y: cam.cy - (cam.fx * dot(d, cam.u)) / z, z };
}

// ── the look: light, colours, sensor ───────────────────────────────────────────────────────────────────────────────
export type RGB3 = [number, number, number];
export interface Look {
  kind: 'indoor' | 'outdoor';
  /** Overall exposure (1 = a lit gym or a sunny court; dusk ~0.45). */
  light: number;
  tint: RGB3;
  /** Sensor noise, SD per channel (0–255). */
  noise: number;
  /** Exposure time (ms): the ball smears over it. */
  shutterMs: number;
  skin: RGB3;
  jersey: RGB3;
  shorts: RGB3;
  ball: RGB3;
}

export const LOOKS = {
  gym: { kind: 'indoor', light: 1, tint: [1.04, 1, 0.92], noise: 3, shutterMs: 8, skin: [150, 100, 72], jersey: [235, 235, 240], shorts: [30, 40, 90], ball: [200, 92, 38] },
  gymOrange: { kind: 'indoor', light: 1, tint: [1.04, 1, 0.92], noise: 3, shutterMs: 8, skin: [205, 160, 130], jersey: [225, 110, 35], shorts: [225, 110, 35], ball: [200, 92, 38] },
  gymDim: { kind: 'indoor', light: 0.6, tint: [1.08, 0.98, 0.85], noise: 6, shutterMs: 16, skin: [110, 70, 50], jersey: [40, 40, 45], shorts: [40, 40, 45], ball: [200, 92, 38] },
  sun: { kind: 'outdoor', light: 1.08, tint: [1, 1, 1.02], noise: 2, shutterMs: 2, skin: [190, 140, 110], jersey: [200, 40, 40], shorts: [30, 30, 30], ball: [190, 95, 45] },
  dusk: { kind: 'outdoor', light: 0.45, tint: [1.1, 0.95, 0.85], noise: 8, shutterMs: 20, skin: [150, 105, 80], jersey: [60, 90, 170], shorts: [30, 30, 30], ball: [190, 95, 45] },
} satisfies Record<string, Look>;

// ── the frame buffer: colour + depth ───────────────────────────────────────────────────────────────────────────────
interface Buf { w: number; h: number; c: Float32Array; z: Float32Array }
const newBuf = (w: number, h: number): Buf => ({ w, h, c: new Float32Array(w * h * 3), z: new Float32Array(w * h).fill(1e9) });
const lit = (look: Look, c: RGB3, k = 1): RGB3 => [c[0] * look.light * look.tint[0] * k, c[1] * look.light * look.tint[1] * k, c[2] * look.light * look.tint[2] * k];

/** A depth-tested disc (a sphere's splat) with an anti-aliased edge; alpha < 1 blends (the net's strings). */
function splat(b: Buf, x: number, y: number, rpx: number, z: number, col: RGB3, alpha = 1): void {
  const r = Math.max(0.5, rpx);
  const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(b.w - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(b.h - 1, Math.ceil(y + r + 1));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
      const cov = clamp01(r - d + 0.5) * alpha;
      if (cov <= 0) continue;
      const i = py * b.w + px;
      if (z >= b.z[i]) continue;
      if (cov >= 0.999) b.z[i] = z;
      const k = i * 3;
      b.c[k] += (col[0] - b.c[k]) * cov; b.c[k + 1] += (col[1] - b.c[k + 1]) * cov; b.c[k + 2] += (col[2] - b.c[k + 2]) * cov;
    }
  }
}

/** A 3D capsule (a limb, a string), as splats along it. */
function capsule(b: Buf, cam: Cam, a: V3, c: V3, rad: number, col: RGB3, alpha = 1): void {
  const pa = project(cam, a), pc = project(cam, c);
  if (!pa || !pc) return;
  const len = Math.hypot(pc.x - pa.x, pc.y - pa.y);
  const n = Math.max(2, Math.ceil(len / 0.7));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const p = project(cam, lerp3(a, c, u));
    if (p) splat(b, p.x, p.y, (cam.fx * rad) / p.z, p.z, col, alpha);
  }
}

// ── the static court (floor, walls or sky, the hoop): drawn once per camera ───────────────────────────────────────
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function floorColour(look: Look, x: number, z: number): RGB3 {
  const line = (d: number) => Math.abs(d) < 0.025;
  const rimD = Math.hypot(x, z);
  const inKey = Math.abs(x) < 2.45 && z > BASELINE_Z && z < BASELINE_Z + 5.8;
  const lines = line(Math.abs(x) - 2.45) && z > BASELINE_Z && z < BASELINE_Z + 5.8
    || line(z - (BASELINE_Z + 5.8)) && Math.abs(x) < 2.45
    || line(Math.hypot(x, z - (BASELINE_Z + 5.8)) - 1.8) && z > BASELINE_Z + 5.8
    || line(z - BASELINE_Z)
    || line(rimD - 6.75) && z > BASELINE_Z + 1.4 || line(Math.abs(x) - 6.6) && z > BASELINE_Z && z <= BASELINE_Z + 1.4 + 0.3;
  if (look.kind === 'indoor') {
    if (lines) return [235, 232, 225];
    const plank = Math.floor(x / 0.07), seg = Math.floor((z + plank * 0.37) / 1.3);
    const v = (hash(plank, seg) - 0.5) * 24 + (hash(Math.floor(x * 40), Math.floor(z * 6)) - 0.5) * 8;
    const base: RGB3 = inKey ? [150, 70, 50] : [192, 132, 80];
    return [base[0] + v, base[1] + v * 0.75, base[2] + v * 0.5];
  }
  if (lines) return [215, 215, 210];
  const v = (hash(Math.floor(x * 30), Math.floor(z * 30)) - 0.5) * 22 + (hash(Math.floor(x * 2), Math.floor(z * 2)) - 0.5) * 14;
  return [92 + v, 94 + v, 98 + v];
}

function backdrop(look: Look, cam: Cam, dir: V3): { col: RGB3; z: number } {
  if (look.kind === 'indoor') {
    // a box gym: the wall behind the hoop at z −4, side walls at x ±12, the far wall at z 30, the ceiling at 9 m
    const hits: { t: number; wall: string }[] = [];
    const tryPlane = (axis: 0 | 1 | 2, at: number, wall: string) => { if (Math.abs(dir[axis]) > 1e-6) { const t = (at - cam.pos[axis]) / dir[axis]; if (t > 0) hits.push({ t, wall }); } };
    tryPlane(2, -4, 'back'); tryPlane(2, 30, 'far'); tryPlane(0, 12, 'side'); tryPlane(0, -12, 'side'); tryPlane(1, 9, 'ceil');
    const hit = hits.sort((a, b) => a.t - b.t)[0];
    const p = add(cam.pos, mul(dir, hit.t));
    if (hit.wall === 'ceil') {
      const lightOn = (Math.abs(((p[0] % 4) + 4) % 4 - 2) < 0.5) && (Math.abs(((p[2] % 5) + 5) % 5 - 2.5) < 0.6);
      return { col: lightOn ? [255, 252, 240] : [175, 175, 170], z: hit.t };
    }
    if (p[1] < 2) return { col: [40 + hash(Math.floor(p[0] * 2 + p[2] * 2), 3) * 10, 62, 140], z: hit.t };   // padding
    if (hit.wall === 'far' && p[1] < 5) {                                                                      // bleachers
      const row = Math.floor(p[1] / 0.45), seat = Math.floor((p[0] + 20) / 0.5);
      const h = hash(row, seat);
      return { col: h < 0.15 ? [150 + h * 400, 60, 50] : h < 0.3 ? [60, 60, 150] : [120, 110, 100], z: hit.t };
    }
    return { col: [190 + hash(Math.floor(p[1] * 3), 7) * 8, 185, 168], z: hit.t };
  }
  // outdoors: sky, a tree line on the horizon, a chain-link fence at 14 m
  const elev = Math.asin(dir[1]);
  const az = Math.atan2(dir[0], dir[2]);
  const treeTop = 0.06 + 0.05 * Math.sin(az * 7) + 0.03 * Math.sin(az * 23 + 1);
  if (elev < treeTop) {
    const v = hash(Math.floor(az * 300), Math.floor(elev * 300)) * 40;
    const col: RGB3 = [35 + v * 0.5, 80 + v, 35 + v * 0.3];
    const fence = Math.abs(Math.sin(az * 400)) < 0.18 || Math.abs(Math.sin(elev * 500)) < 0.12;
    return { col: elev < 0.02 && fence ? [140, 140, 140] : col, z: 40 };
  }
  const k = clamp01(elev / 0.8);
  return { col: [205 - 90 * k, 222 - 55 * k, 240 - 10 * k], z: 1e6 };
}

export interface StaticCourt { buf: Buf; cam: Cam; look: Look }

/** The parts of the picture that never move, with their depth (drawn once per fixture). */
export function drawCourt(spec: CamSpec, look: Look): StaticCourt {
  const cam = makeCam(spec);
  const b = newBuf(cam.w, cam.h);
  for (let y = 0; y < cam.h; y++) {
    for (let x = 0; x < cam.w; x++) {
      const dir = norm(add(add(cam.f, mul(cam.r, (x + 0.5 - cam.cx) / cam.fx)), mul(cam.u, -(y + 0.5 - cam.cy) / cam.fx)));
      let col: RGB3, z: number;
      const tFloor = dir[1] < -1e-4 ? -cam.pos[1] / dir[1] : Infinity;
      const back = backdrop(look, cam, dir);
      if (tFloor < back.z && tFloor < 60) {
        const p = add(cam.pos, mul(dir, tFloor));
        col = floorColour(look, p[0], p[2]);
        // the light falls off away from the hoop indoors; outdoors a soft shadow of the board
        if (look.kind === 'indoor') col = mul(col as V3, 1 - Math.min(0.25, Math.hypot(p[0], p[2]) / 60)) as RGB3;
        z = tFloor * dot(dir, cam.f);
      } else { col = back.col; z = back.z * dot(dir, cam.f); }
      // the backboard (a plane at BOARD_Z, its rectangle), nearer than whatever is behind it
      if (Math.abs(dir[2]) > 1e-6) {
        const t = (BOARD_Z - cam.pos[2]) / dir[2];
        if (t > 0) {
          const p = add(cam.pos, mul(dir, t));
          const zb = t * dot(dir, cam.f);
          if (p[0] > BOARD.x0 && p[0] < BOARD.x1 && p[1] > BOARD.y0 && p[1] < BOARD.y1 && zb < z) {
            const edge = Math.min(p[0] - BOARD.x0, BOARD.x1 - p[0], p[1] - BOARD.y0, BOARD.y1 - p[1]) < 0.05;
            const sq = Math.abs(p[0]) < 0.295 && p[1] > RIM_Y + 0.15 && p[1] < RIM_Y + 0.6
              && (Math.abs(Math.abs(p[0]) - 0.295) < 0.025 || Math.abs(p[1] - (RIM_Y + 0.15)) < 0.025 || Math.abs(p[1] - (RIM_Y + 0.6)) < 0.025);
            col = edge || sq ? [25, 25, 28] : [232, 234, 236];
            z = zb;
          }
        }
      }
      const i = y * cam.w + x;
      const c = lit(look, col);
      b.c[i * 3] = c[0]; b.c[i * 3 + 1] = c[1]; b.c[i * 3 + 2] = c[2];
      b.z[i] = z;
    }
  }
  // the pole (outdoors) and the arm to the board
  if (look.kind === 'outdoor') {
    capsule(b, cam, [0, 0, BASELINE_Z - 0.6], [0, BOARD.y0 + 0.3, BASELINE_Z - 0.6], 0.07, lit(look, [70, 75, 80]));
    capsule(b, cam, [0, BOARD.y0 + 0.3, BASELINE_Z - 0.6], [0, BOARD.y0 + 0.3, BOARD_Z - 0.02], 0.05, lit(look, [70, 75, 80]));
  }
  // the ring: a torus of splats
  for (let k = 0; k < 160; k++) {
    const a = (k / 160) * Math.PI * 2;
    const p = project(cam, [Math.cos(a) * RIM_R, RIM_Y, Math.sin(a) * RIM_R]);
    if (p) splat(b, p.x, p.y, (cam.fx * RIM_TUBE) / p.z, p.z, lit(look, [212, 72, 22]));
  }
  // the net: 12 strings twisting down, two rings
  const strings = 12;
  for (let k = 0; k < strings; k++) {
    const a0 = (k / strings) * Math.PI * 2, a1 = a0 + Math.PI / strings;
    capsule(b, cam, [Math.cos(a0) * RIM_R, RIM_Y, Math.sin(a0) * RIM_R], [Math.cos(a1) * NET_BOTTOM_R, RIM_Y - NET_LEN, Math.sin(a1) * NET_BOTTOM_R], 0.004, lit(look, [240, 240, 240]), 0.85);
    capsule(b, cam, [Math.cos(a0) * RIM_R, RIM_Y, Math.sin(a0) * RIM_R], [Math.cos(a0 - Math.PI / strings) * NET_BOTTOM_R, RIM_Y - NET_LEN, Math.sin(a0 - Math.PI / strings) * NET_BOTTOM_R], 0.004, lit(look, [240, 240, 240]), 0.85);
  }
  return { buf: b, cam, look };
}

// ── the shooter's body (a keyframed stick body) ────────────────────────────────────────────────────────────────────
/** What the body is doing at one instant. */
export interface BodyState {
  /** Feet position on the floor and the direction faced (unit, on the floor). */
  at: { x: number; z: number };
  face: { x: number; z: number };
  /** How far the hips have sunk (m), how high the feet are off the floor (m). */
  dip: number;
  air: number;
  /** The arms: 0 = holding the ball at the chest, 1 = set point, 2 = released (arms up), −1 = dribbling at the side. */
  arms: number;
  /** For a dribble: the ball hand (+1 right, −1 left) and its height (m). */
  hand: number;
  handY: number;
}

export interface Joints3 {
  head: V3; nose: V3; neck: V3;
  sh: [V3, V3]; el: [V3, V3]; wr: [V3, V3]; hip: [V3, V3]; kn: [V3, V3]; an: [V3, V3]; toe: [V3, V3];
}

/** The body's joints ([left, right] by the body's own sides). */
export function bodyJoints(s: BodyState, heightM: number): Joints3 {
  const k = heightM / 1.85;
  const F: V3 = norm([s.face.x, 0, s.face.z]);
  const R = cross(F, [0, 1, 0]);                      // the body's right
  const base: V3 = [s.at.x, s.air, s.at.z];
  const P = (side: number, up: number, fwd: number): V3 => add(base, add(add(mul(R, side * k), [0, up * k, 0]), mul(F, fwd * k)));
  const d = s.dip / k;
  const sides = [-1, 1] as const;
  const an = sides.map((sd) => P(sd * 0.13, 0.08, 0)) as [V3, V3];
  const toe = sides.map((sd) => P(sd * 0.14, 0.03, 0.17)) as [V3, V3];
  const kn = sides.map((sd) => P(sd * 0.12, 0.5 - d * 0.55, d * 0.6)) as [V3, V3];
  const hip = sides.map((sd) => P(sd * 0.1, 0.95 - d, -d * 0.3)) as [V3, V3];
  const sh = sides.map((sd) => P(sd * 0.2, 1.5 - d, -d * 0.1)) as [V3, V3];
  const neck = P(0, 1.55 - d, -d * 0.1);
  const head = P(0, 1.7 - d, -d * 0.05);
  const nose = P(0, 1.69 - d, 0.1);
  // arms, by pose; the right hand shoots (the guide hand is the left)
  const armAt = (side: number, a: number): [V3, V3] => {
    const sd = side;
    if (a < 0) {
      // dribbling: the ball hand low at its side, the other hand guarding up front
      const ball = sd === s.hand;
      return ball ? [P(sd * 0.3, 1.15 - d, 0.1), P(sd * 0.32, s.handY / k, 0.25)] : [P(sd * 0.28, 1.2 - d, 0.15), P(sd * 0.25, 1.25 - d, 0.35)];
    }
    const hold: [V3, V3] = [P(sd * 0.25, 1.15 - d, 0.18), P(sd * 0.12, 1.2 - d, 0.33)];
    const set: [V3, V3] = sd > 0 ? [P(0.2, 1.62 - d, 0.2), P(0.1, 1.86 - d, 0.18)] : [P(-0.25, 1.55 - d, 0.2), P(-0.08, 1.8 - d, 0.22)];
    const rel: [V3, V3] = sd > 0 ? [P(0.15, 1.82 - d, 0.18), P(0.1, 2.12 - d, 0.24)] : [P(-0.22, 1.6 - d, 0.2), P(-0.1, 1.85 - d, 0.25)];
    if (a <= 1) return [lerp3(hold[0], set[0], a), lerp3(hold[1], set[1], a)];
    return [lerp3(set[0], rel[0], a - 1), lerp3(set[1], rel[1], a - 1)];
  };
  const L = armAt(-1, s.arms), Rr = armAt(1, s.arms);
  return { head, nose, neck, sh, el: [L[0], Rr[0]], wr: [L[1], Rr[1]], hip, kn, an, toe };
}

/** Where the ball sits in the hands at this arm pose (the set point's ball is just over the forehead). */
export function ballInHands(s: BodyState, heightM: number): V3 {
  const j = bodyJoints(s, heightM);
  if (s.arms < 0) { const w = j.wr[s.hand > 0 ? 1 : 0]; return [w[0], w[1] - 0.14, w[2]]; }
  const mid = lerp3(j.wr[0], j.wr[1], 0.5);
  const F: V3 = norm([s.face.x, 0, s.face.z]);
  return add(add(mid, mul(F, 0.12)), [0, s.arms >= 1 ? 0.1 : 0, 0]);
}

function drawBody(b: Buf, cam: Cam, look: Look, j: Joints3): void {
  const skin = lit(look, look.skin), jersey = lit(look, look.jersey), shorts = lit(look, look.shorts), shoe = lit(look, [30, 30, 32]);
  for (const i of [0, 1] as const) {
    capsule(b, cam, j.an[i], j.toe[i], 0.05, shoe);
    capsule(b, cam, j.kn[i], j.an[i], 0.055, skin);
    capsule(b, cam, j.hip[i], j.kn[i], 0.075, shorts);
  }
  // the torso: a wide capsule from the hips' middle to the neck, and the shoulders' bar
  const hipMid = lerp3(j.hip[0], j.hip[1], 0.5), shMid = lerp3(j.sh[0], j.sh[1], 0.5);
  capsule(b, cam, hipMid, shMid, 0.17, jersey);
  capsule(b, cam, j.sh[0], j.sh[1], 0.08, jersey);
  capsule(b, cam, j.neck, j.head, 0.05, skin);
  const ph = project(cam, j.head);
  if (ph) splat(b, ph.x, ph.y, (cam.fx * 0.105) / ph.z, ph.z, skin);
  for (const i of [0, 1] as const) {
    capsule(b, cam, j.sh[i], j.el[i], 0.045, skin);
    capsule(b, cam, j.el[i], j.wr[i], 0.04, skin);
  }
}

/** BlazePose's 33 image points for the drawn body (normalised 0..1; the player's left is LEFT_*), with jitter. */
export function poseOf(cam: Cam, j: Joints3, jitter: () => number, sd = 0.002): Lm[] {
  const P = (p: V3, v = 0.95): Lm => {
    const q = project(cam, p);
    if (!q) return { x: 0, y: 0, z: 0, v: 0 };
    const inside = q.x >= 0 && q.x <= cam.w && q.y >= 0 && q.y <= cam.h;
    return { x: q.x / cam.w + jitter() * sd, y: q.y / cam.h + jitter() * sd, z: 0, v: inside ? v : 0.2 };
  };
  const nose = P(j.nose), eyeL = P(add(j.head, [0, 0.03, 0]), 0.9), eyeR = eyeL;
  const out: Lm[] = new Array(33);
  out[0] = nose;
  for (const i of [1, 2, 3, 4, 5, 6, 9, 10]) out[i] = i === 2 || i === 5 ? eyeL : nose;
  out[7] = P(j.head, 0.8); out[8] = P(j.head, 0.8);
  void eyeR;
  out[11] = P(j.sh[0]); out[12] = P(j.sh[1]);
  out[13] = P(j.el[0]); out[14] = P(j.el[1]);
  out[15] = P(j.wr[0]); out[16] = P(j.wr[1]);
  for (const [i, s] of [[17, 0], [18, 1], [19, 0], [20, 1], [21, 0], [22, 1]] as const) out[i] = P(j.wr[s], 0.8);
  out[23] = P(j.hip[0]); out[24] = P(j.hip[1]);
  out[25] = P(j.kn[0]); out[26] = P(j.kn[1]);
  out[27] = P(j.an[0]); out[28] = P(j.an[1]);
  out[29] = P(j.an[0], 0.85); out[30] = P(j.an[1], 0.85);
  out[31] = P(j.toe[0], 0.85); out[32] = P(j.toe[1], 0.85);
  return out;
}

// ── the ball's flight ──────────────────────────────────────────────────────────────────────────────────────────────
export interface FlightSample { t: number; p: V3 }
export interface Flight {
  samples: FlightSample[];
  /** By the physics: the ball went down through the ring. */
  made: boolean;
  /** When it crossed the ring's plane going down (ms from release), or null. */
  crossMs: number | null;
  /** Touched the ring or the board. */
  touched: boolean;
}

/** The release speed that carries the ball from p0 to the target at launch angle θ (null when it cannot). */
export function launch(p0: V3, target: V3, thetaDeg: number): V3 | null {
  const dx = target[0] - p0[0], dz = target[2] - p0[2], D = Math.hypot(dx, dz), dy = target[1] - p0[1];
  const th = (thetaDeg * Math.PI) / 180, c = Math.cos(th);
  const den = 2 * c * c * (D * Math.tan(th) - dy);
  if (den <= 0) return null;
  const v = Math.sqrt((G * D * D) / den);
  return [(v * c * dx) / D, v * Math.sin(th), (v * c * dz) / D];
}

/** The ball from release, integrated at 2 ms for `ms`. */
export function fly(p0: V3, v0: V3, ms = 3200): Flight {
  const dt = 0.002;
  let p: V3 = [...p0], v: V3 = [...v0];
  const samples: FlightSample[] = [{ t: 0, p: [...p] }];
  let crossMs: number | null = null, made = false, touched = false, downInside = false;
  for (let k = 1; k * dt * 1000 <= ms; k++) {
    const prev = p;
    v = [v[0], v[1] - G * dt, v[2]];
    p = add(p, mul(v, dt));
    // the backboard's face
    if (p[2] - BALL_R < BOARD_Z && prev[2] - BALL_R >= BOARD_Z && p[0] > BOARD.x0 && p[0] < BOARD.x1 && p[1] > BOARD.y0 - 0.05 && p[1] < BOARD.y1) {
      p = [p[0], p[1], BOARD_Z + BALL_R]; v = [v[0] * 0.9, v[1] * 0.9, -v[2] * 0.62]; touched = true;
    }
    // the ring, as a torus
    const rh = Math.hypot(p[0], p[2]);
    const C: V3 = rh > 1e-6 ? [(p[0] / rh) * RIM_R, RIM_Y, (p[2] / rh) * RIM_R] : [RIM_R, RIM_Y, 0];
    const dv = sub(p, C), dist = Math.hypot(dv[0], dv[1], dv[2]);
    if (dist < BALL_R + RIM_TUBE) {
      const n = mul(dv, 1 / dist);
      p = add(C, mul(n, BALL_R + RIM_TUBE));
      const vn = dot(v, n);
      if (vn < 0) { const vt = sub(v, mul(n, vn)); v = add(mul(vt, 0.85), mul(n, -0.5 * vn)); }
      touched = true;
    }
    // through the ring's plane going down
    if (prev[1] >= RIM_Y && p[1] < RIM_Y) {
      if (Math.hypot(p[0], p[2]) < RIM_R) { downInside = true; if (crossMs === null) crossMs = k * dt * 1000; }
    }
    if (prev[1] < RIM_Y && p[1] >= RIM_Y) downInside = false;   // came back up: not (yet) a make
    // the net: slows the ball and squeezes it to its narrowing cone
    if (p[1] < RIM_Y && p[1] > RIM_Y - NET_LEN && Math.hypot(p[0], p[2]) < RIM_R + 0.03 && downInside) {
      const depth = (RIM_Y - p[1]) / NET_LEN;
      const rr = Math.max(0.02, RIM_R - depth * (RIM_R - NET_BOTTOM_R) - BALL_R * 0.55);
      const h = Math.hypot(p[0], p[2]);
      if (h > rr) { p = [(p[0] / h) * rr, p[1], (p[2] / h) * rr]; v = [v[0] * 0.5, v[1], v[2] * 0.5]; }
      v = mul(v, 1 - 5 * dt);
    }
    if (downInside && p[1] < RIM_Y - NET_LEN + 0.05) made = true;
    // the floor
    if (p[1] - BALL_R < 0) { p = [p[0], BALL_R, p[2]]; v = [v[0] * 0.9, -v[1] * 0.72, v[2] * 0.9]; }
    if (k % 2 === 0) samples.push({ t: k * dt * 1000, p: [...p] });
  }
  return { samples, made, crossMs: made ? crossMs : null, touched };
}

const flightAt = (f: Flight, ms: number): V3 => {
  const s = f.samples;
  if (ms <= 0) return s[0].p;
  const i = Math.min(s.length - 2, Math.floor(ms / 4));
  const a = s[Math.max(0, i)], b = s[Math.max(0, i) + 1];
  const u = clamp01((ms - a.t) / Math.max(1e-6, b.t - a.t));
  return lerp3(a.p, b.p, u);
};

// ── drawing the ball ───────────────────────────────────────────────────────────────────────────────────────────────
/** The ball over the exposure (samples along its path), shaded, seamed, behind whatever is nearer. Returns its truth. */
function drawBall(b: Buf, cam: Cam, look: Look, path: V3[], spin: number): { x: number; y: number; r: number; visible: boolean } | null {
  const mid = path[Math.floor(path.length / 2)];
  const pm = project(cam, mid);
  if (!pm) return null;
  const rpx = (cam.fx * BALL_R) / pm.z;
  const x0 = Math.max(0, Math.floor(Math.min(...path.map((p) => project(cam, p)?.x ?? pm.x)) - rpx - 2));
  const x1 = Math.min(cam.w - 1, Math.ceil(Math.max(...path.map((p) => project(cam, p)?.x ?? pm.x)) + rpx + 2));
  const y0 = Math.max(0, Math.floor(Math.min(...path.map((p) => project(cam, p)?.y ?? pm.y)) - rpx - 2));
  const y1 = Math.min(cam.h - 1, Math.ceil(Math.max(...path.map((p) => project(cam, p)?.y ?? pm.y)) + rpx + 2));
  if (x1 < x0 || y1 < y0) return { x: pm.x, y: pm.y, r: rpx, visible: false };
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const cov = new Float32Array(W * H), col = new Float32Array(W * H * 3);
  const base = lit(look, look.ball), seam = lit(look, [45, 28, 22]);
  let shown = 0;
  for (const p of path) {
    const q = project(cam, p);
    if (!q) continue;
    const r = (cam.fx * BALL_R) / q.z;
    for (let py = Math.max(y0, Math.floor(q.y - r - 1)); py <= Math.min(y1, Math.ceil(q.y + r + 1)); py++) {
      for (let px = Math.max(x0, Math.floor(q.x - r - 1)); px <= Math.min(x1, Math.ceil(q.x + r + 1)); px++) {
        const dx = (px + 0.5 - q.x) / r, dy = (py + 0.5 - q.y) / r, d2 = dx * dx + dy * dy;
        const c = clamp01(r - Math.sqrt(d2) * r + 0.5);
        if (c <= 0) continue;
        const i = py * cam.w + px;
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        if (q.z - nz * BALL_R >= b.z[i]) continue;               // behind the ring, the net, the board, a body part
        // shading: lit from above and the camera's side; seams: two great circles turned by the spin
        const shade = 0.6 + 0.5 * Math.max(0, -dy * 0.6 + nz * 0.5 - dx * 0.2);
        const ca = Math.cos(spin), sa = Math.sin(spin);
        const sx = dx * ca - dy * sa, sy = dx * sa + dy * ca;
        const onSeam = Math.abs(sx) < 0.07 || Math.abs(sy) < 0.06 || Math.abs(Math.hypot(sx - 0.9, sy) - 0.75) < 0.06;
        const cc = onSeam ? seam : base;
        const k = (py - y0) * W + (px - x0);
        const w = c / path.length;
        cov[k] += w;
        col[k * 3] += cc[0] * shade * w; col[k * 3 + 1] += cc[1] * shade * w; col[k * 3 + 2] += cc[2] * shade * w;
      }
    }
  }
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const k = (py - y0) * W + (px - x0), c = Math.min(1, cov[k]);
      if (c <= 0) continue;
      shown += c;
      const i = (py * cam.w + px) * 3;
      b.c[i] = b.c[i] * (1 - c) + col[k * 3]; b.c[i + 1] = b.c[i + 1] * (1 - c) + col[k * 3 + 1]; b.c[i + 2] = b.c[i + 2] * (1 - c) + col[k * 3 + 2];
    }
  }
  const inside = pm.x >= 0 && pm.x < cam.w && pm.y >= 0 && pm.y < cam.h;
  return { x: pm.x, y: pm.y, r: rpx, visible: inside && shown > 0.35 * Math.PI * rpx * rpx };
}

// ── a fixture: a camera, a look, a shooter and a list of shots ─────────────────────────────────────────────────────
export type Aim = 'make' | 'short' | 'long' | 'left' | 'right' | 'air' | 'bank';
export interface ShotPlan { spot: { x: number; z: number }; aim: Aim; dribbles?: number; thetaDeg?: number }

export interface Fixture {
  id: string;
  name: string;
  cam: CamSpec;
  look: Look;
  fps: number;
  shooterHeightM: number;
  shots: ShotPlan[];
  seed: number;
  /** Frame-time jitter (ms SD) and the share of frames dropped. */
  jitterMs?: number;
  dropShare?: number;
}

export interface ShotTruth {
  index: number;
  /** Release (ms, the film's clock). */
  releaseT: number;
  made: boolean;
  touched: boolean;
  aim: Aim;
  spot: { x: number; z: number };
  /** Distance from the ring's centre on the floor (m). */
  distM: number;
}

export interface DribbleTruth { t: number; hand: number; cross: boolean }

export interface FilmFrame {
  t: number;
  rgb: Rgb;
  pose: Lm[] | null;
  /** Where the ball truly is in this frame (px), when it is in the picture at all. */
  ball: { x: number; y: number; r: number; visible: boolean } | null;
}

interface Segment {
  from: number; to: number;
  body: (t: number) => BodyState;
  ball: (t: number) => V3 | null;
  spin: (t: number) => number;
}

const SHOT = { hold: 400, dribble: 520, gather: 300, dip: 260, toRelease: 150, flight: 450 };
const AFTER_MS = 2600;
const CUT_MS = 600;

function aimPoint(spot: { x: number; z: number }, aim: Aim, R: () => number): V3 {
  const toRim = norm([-spot.x, 0, -spot.z]);
  const side: V3 = [toRim[2], 0, -toRim[0]];
  const j = () => (R() - 0.5) * 0.06;
  const c: V3 = [j(), RIM_Y + 0.02, j()];
  switch (aim) {
    case 'make': return c;
    case 'short': return add(c, mul(toRim, -(0.27 + R() * 0.06)));
    case 'long': return add(c, mul(toRim, 0.27 + R() * 0.05));
    case 'left': return add(c, mul(side, 0.3 + R() * 0.05));
    case 'right': return add(c, mul(side, -(0.3 + R() * 0.05)));
    case 'air': return add(add(c, mul(toRim, -(0.75 + R() * 0.3))), [0, -0.2, 0]);
    case 'bank': return [Math.sign(spot.x || 1) * 0.16, RIM_Y + 0.42, BOARD_Z + BALL_R + 0.01];
  }
}

/** The fixture's timeline: each shot's body and ball, and the truth. */
export function planFixture(fx: Fixture): { segments: Segment[]; shots: ShotTruth[]; durationMs: number } {
  const R = rng(fx.seed).u;
  const segments: Segment[] = [];
  const shots: ShotTruth[] = [];
  let t0 = 300;
  fx.shots.forEach((plan, index) => {
    const face = norm([-plan.spot.x, 0, -plan.spot.z]);
    const at = plan.spot;
    const nDrib = plan.dribbles ?? 2;
    const tGather = t0 + SHOT.hold + nDrib * SHOT.dribble;
    const tDip = tGather + SHOT.gather;
    const tOff = tDip + SHOT.dip;
    const tRel = tOff + SHOT.toRelease;
    const tLand = tOff + SHOT.flight;
    const body = (t: number): BodyState => {
      const s: BodyState = { at, face: { x: face[0], z: face[2] }, dip: 0, air: 0, arms: 0, hand: 1, handY: 0.95 };
      if (t < tGather && nDrib > 0 && t >= t0 + SHOT.hold) {
        const u = ((t - t0 - SHOT.hold) % SHOT.dribble) / SHOT.dribble;
        return { ...s, arms: -1, dip: 0.08, handY: 0.98 - 0.25 * Math.sin(Math.PI * Math.min(1, Math.abs(1 - 2 * u))) };
      }
      if (t < tDip) return { ...s, arms: t < tGather ? 0 : smooth((t - tGather) / SHOT.gather) * 0.2 };
      if (t < tOff) { const u = (t - tDip) / SHOT.dip; return { ...s, dip: 0.14 * Math.sin(Math.PI * u * 0.5 + (u > 0.5 ? 0 : 0)), arms: 0.2 + 0.6 * u }; }
      if (t < tLand) {
        const u = (t - tOff) / SHOT.flight;
        const air = 4 * 0.25 * u * (1 - u);
        return { ...s, air, arms: t < tRel ? 0.8 + 0.2 * ((t - tOff) / SHOT.toRelease) : 1 + smooth((t - tRel) / 120) };
      }
      const u = (t - tLand) / 900;
      return { ...s, dip: 0.08 * Math.max(0, 1 - u * 3), arms: u < 0.6 ? 2 : Math.max(0, 2 - (u - 0.6) * 5) };
    };
    const relBody = body(tRel);
    const p0 = ballInHands(relBody, fx.shooterHeightM);
    const theta = plan.thetaDeg ?? 50 + R() * 6;
    const v0 = launch(p0, aimPoint(plan.spot, plan.aim, R), theta) ?? [0, 6, -6];
    const flight = fly(p0, v0, AFTER_MS);
    const dribbleBall = (t: number): V3 => {
      const u = ((t - t0 - SHOT.hold) % SHOT.dribble) / SHOT.dribble;
      const s = Math.abs(1 - 2 * u);
      const j = bodyJoints(body(t), fx.shooterHeightM);
      const w = j.wr[1];
      const y = BALL_R + (0.84 - BALL_R) * (1 - (1 - s) * (1 - s));
      return [w[0], y, w[2]];
    };
    const ball = (t: number): V3 | null => {
      if (t < tRel) {
        if (t >= t0 + SHOT.hold && t < tGather && nDrib > 0) return dribbleBall(t);
        return ballInHands(body(t), fx.shooterHeightM);
      }
      return flightAt(flight, t - tRel);
    };
    const end = tRel + AFTER_MS;
    segments.push({ from: t0, to: end, body, ball, spin: (t) => (t < tRel ? 0 : -((t - tRel) / 1000) * 12) });
    shots.push({ index, releaseT: tRel, made: flight.made, touched: flight.touched, aim: plan.aim, spot: plan.spot, distM: Math.hypot(plan.spot.x, plan.spot.z) });
    t0 = end + CUT_MS;
  });
  return { segments, shots, durationMs: t0 };
}

/** The noise table every frame draws a window of (N(0,1) values). */
let NOISE: Float32Array | null = null;
function noiseTable(): Float32Array {
  if (NOISE) return NOISE;
  const R = rng(99), n = 1 << 20;
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) t[i] = R.n();
  NOISE = t;
  return t;
}

/** Render the static court + one instant's body and ball into RGBA, with sensor noise. */
export function renderFrame(court: StaticCourt, body: { state: BodyState; heightM: number } | null, ballPath: V3[] | null, spin: number, seed: number):
  { rgb: Rgb; ball: FilmFrame['ball']; joints: Joints3 | null } {
  const { cam, look } = court;
  const b: Buf = { w: court.buf.w, h: court.buf.h, c: new Float32Array(court.buf.c), z: new Float32Array(court.buf.z) };
  let joints: Joints3 | null = null;
  if (body) { joints = bodyJoints(body.state, body.heightM); drawBody(b, cam, look, joints); }
  const ball = ballPath ? drawBall(b, cam, look, ballPath, spin) : null;
  const data = new Uint8ClampedArray(cam.w * cam.h * 4);
  const N = noiseTable(), mask = N.length - 1;
  let o = Math.floor(rng(seed).u() * N.length);
  for (let i = 0, p = 0; i < cam.w * cam.h; i++, p += 4) {
    data[p] = b.c[i * 3] + N[o++ & mask] * look.noise;
    data[p + 1] = b.c[i * 3 + 1] + N[o++ & mask] * look.noise;
    data[p + 2] = b.c[i * 3 + 2] + N[o++ & mask] * look.noise;
    data[p + 3] = 255;
  }
  return { rgb: { w: cam.w, h: cam.h, data }, ball, joints };
}

/** The frame times of a take: the camera's rate, jittered, a share dropped. */
export function frameTimes(durationMs: number, fps: number, seed: number, jitterMs = 2, dropShare = 0.02): number[] {
  const R = rng(seed ^ 0x5bd1);
  const out: number[] = [];
  for (let t = 0; t < durationMs; t += 1000 / fps) {
    if (R.u() < dropShare) continue;
    out.push(Math.round((t + R.n() * jitterMs) * 10) / 10);
  }
  return out;
}

/**
 * Film the fixture: every frame, in order, to `onFrame` (the frames are not kept: a take is ~3 k frames of 400 kB).
 * Returns the truth.
 */
export function filmFixture(fx: Fixture, onFrame: (f: FilmFrame) => void, o: { maxShots?: number; onPlan?: (shots: ShotTruth[]) => void } = {}): { shots: ShotTruth[]; durationMs: number } {
  const fixture = o.maxShots ? { ...fx, shots: fx.shots.slice(0, o.maxShots) } : fx;
  const plan = planFixture(fixture);
  o.onPlan?.(plan.shots);
  const court = drawCourt(fx.cam, fx.look);
  const cam = court.cam;
  const J = rng(fx.seed ^ 0x77).n;
  const times = frameTimes(plan.durationMs, fx.fps, fx.seed, fx.jitterMs ?? 2, fx.dropShare ?? 0.02);
  let n = 0;
  for (const t of times) {
    const seg = plan.segments.find((s) => t >= s.from && t < s.to) ?? null;
    let path: V3[] | null = null, state: BodyState | null = null, spin = 0;
    if (seg) {
      state = seg.body(t);
      spin = seg.spin(t);
      const K = 5, exp = fx.look.shutterMs;
      const pts: V3[] = [];
      for (let k = 0; k < K; k++) { const p = seg.ball(t - exp / 2 + (exp * k) / (K - 1)); if (p) pts.push(p); }
      path = pts.length ? pts : null;
    }
    const r = renderFrame(court, state ? { state, heightM: fx.shooterHeightM } : null, path, spin, fx.seed * 7919 + n++);
    onFrame({ t, rgb: r.rgb, pose: r.joints ? poseOf(cam, r.joints, J) : null, ball: r.ball });
  }
  return { shots: plan.shots, durationMs: plan.durationMs };
}

// ── the bench's fixtures ───────────────────────────────────────────────────────────────────────────────────────────
const W169 = 427, H169 = 240;

/** A ring of shooting spots at these distances (m) and angles (degrees off the line through the ring, + to the right). */
export function spots(list: [distM: number, angDeg: number][]): { x: number; z: number }[] {
  return list.map(([d, a]) => ({ x: Math.round(d * Math.sin((a * Math.PI) / 180) * 100) / 100, z: Math.round(Math.max(0.6, d * Math.cos((a * Math.PI) / 180)) * 100) / 100 }));
}

const SPOTS = spots([[4.6, 0], [3, -45], [5.5, 30], [2.2, 10], [6.9, -20], [4.2, 60], [5, -70], [3.5, 25], [6.8, 75], [2.8, -15], [4.6, 5], [6, -40]]);
const AIMS: Aim[] = ['make', 'short', 'make', 'make', 'long', 'left', 'make', 'bank', 'right', 'make', 'air', 'make'];
const plans = (n: number, rot = 0): ShotPlan[] => Array.from({ length: n }, (_, k) => ({
  spot: SPOTS[(k + rot) % SPOTS.length], aim: AIMS[k % AIMS.length], dribbles: k % 3 === 0 ? 0 : k % 3,
}));

/** The six (and more) camera set-ups the bench reports on. Every name says how the phone stands. */
export const FIXTURES: Fixture[] = [
  {
    id: 'gym-side45', name: 'Gym · phone on a tripod 45° to the side of the shooter, 1.2 m high',
    cam: { pos: [-6.5, 1.2, 7.5], look: [0, 2.0, 2.4], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.gym, fps: 30, shooterHeightM: 1.85, shots: plans(12), seed: 11,
  },
  {
    id: 'gym-sideline', name: 'Gym · phone on the sideline, square to the shot line, 1.0 m high',
    cam: { pos: [-8.5, 1.0, 3.2], look: [0, 2.0, 3.0], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.gym, fps: 30, shooterHeightM: 1.8, shots: plans(12, 3), seed: 12,
  },
  {
    id: 'gym-behind', name: 'Gym · phone behind the shooter, on the line through the ring, 1.3 m high',
    cam: { pos: [0.4, 1.3, 11], look: [0, 2.2, 1.5], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.gym, fps: 30, shooterHeightM: 1.85, shots: plans(12, 6), seed: 13,
  },
  {
    id: 'outdoor-sun', name: 'Outdoors in sun · phone 45° off, on a fence post 1.4 m high',
    cam: { pos: [6.8, 1.4, 7.2], look: [0, 2.0, 2.4], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.sun, fps: 30, shooterHeightM: 1.75, shots: plans(12, 1), seed: 14,
  },
  {
    id: 'outdoor-dusk', name: 'Outdoors at dusk · dim, noisy, long exposure, 45° off',
    cam: { pos: [-6.2, 1.2, 7.8], look: [0, 2.0, 2.4], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.dusk, fps: 30, shooterHeightM: 1.8, shots: plans(12, 2), seed: 15,
  },
  {
    id: 'phone-low', name: 'Gym · phone low on the floor against a bag (0.3 m), tilted up, 45° off',
    cam: { pos: [-5.8, 0.3, 7.0], look: [0, 2.4, 2.0], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.gym, fps: 30, shooterHeightM: 1.85, shots: plans(12, 4), seed: 16,
  },
  {
    id: 'phone-high', name: 'Gym · phone high on the bleachers (3 m), looking down, 45° off',
    cam: { pos: [-7.5, 3.0, 9.0], look: [0, 1.6, 2.5], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.gymDim, fps: 30, shooterHeightM: 1.85, shots: plans(12, 5), seed: 17,
  },
  {
    id: 'gym-orange-kit', name: 'Gym · an orange kit (a ball-coloured jersey and shorts), 45° off, 60 fps',
    cam: { pos: [-6.5, 1.2, 7.5], look: [0, 2.0, 2.4], hfovDeg: 66, w: W169, h: H169 },
    look: LOOKS.gymOrange, fps: 60, shooterHeightM: 1.8, shots: plans(12, 7), seed: 18,
  },
  {
    id: 'portrait-side45', name: 'Gym · phone upright (portrait), 45° off, 1.2 m high',
    cam: { pos: [-7.5, 1.2, 8.8], look: [0, 2.0, 2.4], hfovDeg: 42, w: 135, h: 240 },
    look: LOOKS.gym, fps: 30, shooterHeightM: 1.85, shots: plans(12, 8), seed: 19,
  },
];

// ── dribbling (BBS-02): a player facing the phone, a plain ball ─────────────────────────────────────────────────────
export type DribbleKind = 'pound' | 'cross' | 'pound-left';
export interface DribbleFixture {
  id: string; name: string; cam: CamSpec; look: Look; fps: number; heightM: number; seed: number;
  /** The sets in order: a kind, how many bounces, the rate (bounces a second), the dribble's height (m). */
  sets: { kind: DribbleKind; n: number; hz: number; handY: number }[];
}

export const DRIBBLE_FIXTURES: DribbleFixture[] = [
  {
    id: 'living-room', name: 'Indoors · phone propped at 0.9 m, 3 m away, the player facing it',
    cam: { pos: [0, 0.9, 3.2], look: [0, 0.8, 0], hfovDeg: 66, w: W169, h: H169 }, look: LOOKS.gym, fps: 30, heightM: 1.8, seed: 31,
    sets: [{ kind: 'pound', n: 12, hz: 2.4, handY: 0.85 }, { kind: 'cross', n: 10, hz: 1.8, handY: 0.75 }, { kind: 'pound-left', n: 8, hz: 2.2, handY: 0.8 }],
  },
  {
    id: 'driveway', name: 'Outdoors in sun · phone on a step, 3.5 m away',
    cam: { pos: [0.3, 0.5, 3.6], look: [0, 0.9, 0], hfovDeg: 66, w: W169, h: H169 }, look: LOOKS.sun, fps: 30, heightM: 1.7, seed: 32,
    sets: [{ kind: 'pound', n: 15, hz: 3.0, handY: 0.6 }, { kind: 'cross', n: 12, hz: 2.0, handY: 0.7 }],
  },
  {
    id: 'dim-garage', name: 'A dim garage · noisy, long exposure, 60 fps',
    cam: { pos: [0, 1.0, 3.0], look: [0, 0.8, 0], hfovDeg: 66, w: W169, h: H169 }, look: LOOKS.gymDim, fps: 60, heightM: 1.75, seed: 33,
    sets: [{ kind: 'pound', n: 12, hz: 2.6, handY: 0.8 }, { kind: 'cross', n: 10, hz: 2.2, handY: 0.7 }],
  },
];

/** Film a dribble fixture; returns the bounces' truth (floor contacts, the hand after, whether it crossed). */
export function filmDribbles(fx: DribbleFixture, onFrame: (f: FilmFrame) => void): { bounces: DribbleTruth[]; durationMs: number } {
  const court = drawCourt(fx.cam, fx.look);
  const cam = court.cam;
  const J = rng(fx.seed ^ 0x77).n;
  // the body faces the camera, standing at the origin; its right is the camera's left
  const face = norm([fx.cam.pos[0], 0, fx.cam.pos[2]]);
  type Piece = { from: number; to: number; hand0: number; hand1: number; handY: number };
  const pieces: Piece[] = [];
  const bounces: DribbleTruth[] = [];
  let t = 800, hand = fx.sets[0]?.kind === 'pound-left' ? -1 : 1;
  for (const s of fx.sets) {
    if (s.kind === 'pound-left') hand = -1; else if (s.kind === 'pound') hand = 1;
    const T = 1000 / s.hz;
    for (let k = 0; k < s.n; k++) {
      const next = s.kind === 'cross' ? -hand : hand;
      pieces.push({ from: t, to: t + T, hand0: hand, hand1: next, handY: s.handY });
      bounces.push({ t: Math.round(t + T / 2), hand: next, cross: next !== hand });
      hand = next;
      t += T;
    }
    t += 900;                                                 // a pause between sets, the ball held
    pieces.push({ from: t - 900, to: t, hand0: hand, hand1: hand, handY: -1 });
  }
  const durationMs = t + 500;
  const k = fx.heightM / 1.85;
  const stateAt = (tt: number): { body: BodyState; ball: V3 } => {
    const base: BodyState = { at: { x: 0, z: 0 }, face: { x: face[0], z: face[2] }, dip: 0.12, air: 0, arms: -1, hand, handY: 0.9 };
    const p = pieces.find((q) => tt >= q.from && tt < q.to) ?? null;
    if (!p || p.handY < 0) {
      const b: BodyState = { ...base, arms: 0, dip: 0.05 };
      return { body: b, ball: ballInHands(b, fx.heightM) };
    }
    const u = (tt - p.from) / (p.to - p.from);
    const s = Math.abs(1 - 2 * u);
    const handNow = u < 0.5 ? p.hand0 : p.hand1;
    const yTop = p.handY * k;
    const y = BALL_R + (yTop - BALL_R) * (1 - (1 - s) * (1 - s));
    const R = cross(norm([face[0], 0, face[2]]), [0, 1, 0]);
    const side = (h: number) => h * 0.3 * k;
    const xSide = u < 0.5 ? side(p.hand0) * (1 - (1 - s) * 0.6) : side(p.hand1) * (1 - (1 - s) * 0.6);
    const lateral = p.hand0 !== p.hand1 ? side(p.hand0) + (side(p.hand1) - side(p.hand0)) * smooth(u) : xSide;
    const pos = add(add(mul(R, lateral), mul(face, 0.3 * k)), [0, y, 0]);
    const body: BodyState = { ...base, hand: handNow, handY: Math.max(y + 0.12, 0.55 * k) };
    return { body, ball: pos };
  };
  let n = 0;
  for (const tt of frameTimes(durationMs, fx.fps, fx.seed)) {
    const st = stateAt(tt);
    const pts: V3[] = [];
    for (let q = 0; q < 5; q++) pts.push(stateAt(tt - fx.look.shutterMs / 2 + (fx.look.shutterMs * q) / 4).ball);
    const r = renderFrame(court, { state: st.body, heightM: fx.heightM }, pts, 0, fx.seed * 131 + n++);
    onFrame({ t: tt, rgb: r.rgb, pose: r.joints ? poseOf(cam, r.joints, J) : null, ball: r.ball });
  }
  return { bounces, durationMs };
}

/** The ring as the picture shows it (the truth a user's two taps would give): normalised box. */
export function rimTruth(spec: CamSpec): { x: number; y: number; hw: number; hh: number } {
  const cam = makeCam(spec);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const p = project(cam, [Math.cos(a) * RIM_R, RIM_Y, Math.sin(a) * RIM_R]);
    if (!p) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x: (x0 + x1) / 2 / cam.w, y: (y0 + y1) / 2 / cam.h, hw: (x1 - x0) / 2 / cam.w, hh: Math.max(1, (y1 - y0) / 2) / cam.h };
}
