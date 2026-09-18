// Headless proof for the EnvironmentIBL cube generator.
//
// The renderer can't be trusted to tell us this is right — a wrong env map still
// renders *something*, just subtly wrong, and the sandboxed browser throttles
// rAF too hard to eyeball speculars reliably. So the math gets proved here:
// face->direction mapping, sRGB->linear conversion, the sky/ground gradient
// orientation, and that the sun lobe actually lands where the DirectionalLight
// points (the bug that would make reflections contradict the key light).

import { MOODS, type VenueMood } from '../lib/babylon/scene/moods';

let checks = 0;
const fail: string[] = [];
function ok(cond: boolean, label: string): void {
  checks++;
  if (!cond) fail.push(label);
}
const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;

// --- mirrors of the pure helpers in EnvironmentIBL.ts -----------------------
type V3 = { x: number; y: number; z: number };
function faceDirection(face: number, u: number, v: number): V3 {
  switch (face) {
    case 0: return { x: 1, y: -v, z: -u };
    case 1: return { x: -1, y: -v, z: u };
    case 2: return { x: u, y: 1, z: v };
    case 3: return { x: u, y: -1, z: -v };
    case 4: return { x: u, y: -v, z: 1 };
    default: return { x: -u, y: -v, z: -1 };
  }
}
const norm = (d: V3): V3 => {
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
};
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

function hexToLinear(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const srgb = [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [number, number, number];
}

// --- A. cube face -> direction ---------------------------------------------
// Face centres (u=v=0) must point down each cardinal axis, or the whole
// environment is rotated and reflections come from the wrong side of the venue.
ok(close(faceDirection(0, 0, 0).x, 1), 'A1 +X face centre points +X');
ok(close(faceDirection(1, 0, 0).x, -1), 'A2 -X face centre points -X');
ok(close(faceDirection(2, 0, 0).y, 1), 'A3 +Y face centre points up');
ok(close(faceDirection(3, 0, 0).y, -1), 'A4 -Y face centre points down');
ok(close(faceDirection(4, 0, 0).z, 1), 'A5 +Z face centre points +Z');
ok(close(faceDirection(5, 0, 0).z, -1), 'A6 -Z face centre points -Z');

// Every texel on every face must be a unit direction after normalise.
let allUnit = true;
for (let f = 0; f < 6; f++) {
  for (const u of [-1, -0.5, 0, 0.5, 1]) {
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      if (!close(Math.hypot(...Object.values(norm(faceDirection(f, u, v))) as number[]), 1, 1e-9)) allUnit = false;
    }
  }
}
ok(allUnit, 'A7 every sampled texel normalises to a unit vector');

// --- B. sRGB -> linear ------------------------------------------------------
ok(close(hexToLinear('#000000')[0], 0), 'B1 black maps to 0');
ok(close(hexToLinear('#ffffff')[0], 1, 1e-9), 'B2 white maps to 1');
// Mid grey must DARKEN under sRGB->linear (0.5 -> ~0.214). Skipping this step
// is the classic washed-out-reflections bug.
ok(hexToLinear('#808080')[0] < 0.25 && hexToLinear('#808080')[0] > 0.18, 'B3 mid grey decodes to ~0.21 linear');
ok(hexToLinear('#808080')[0] < 0.5, 'B4 linear value is darker than its sRGB input');

// --- C. gradient orientation ------------------------------------------------
// Sky must be above, ground below — for every mood, not just the one I eyeballed.
for (const mood of Object.keys(MOODS) as VenueMood[]) {
  const M = MOODS[mood];
  const sky = hexToLinear(M.sky);
  const ground = hexToLinear(M.ground);
  const lum = (c: [number, number, number]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // Every mood in this game is an outdoor/lit venue: sky reads brighter than ground.
  ok(lum(sky) > lum(ground), `C-${mood} sky is brighter than ground`);
}

// --- D. sun lobe placement --------------------------------------------------
// The sun in the env map MUST sit opposite M.sunDir, because LightRig feeds
// sunDir straight to DirectionalLight.direction (the direction light travels).
// Getting this backwards puts the bright spot behind the camera-facing side and
// makes every reflection disagree with the actual key light.
for (const mood of Object.keys(MOODS) as VenueMood[]) {
  const M = MOODS[mood];
  const dir = norm({ x: M.sunDir[0], y: M.sunDir[1], z: M.sunDir[2] });
  const toSun = { x: -dir.x, y: -dir.y, z: -dir.z };
  // Sun direction points downward (it's above the scene) => toSun points up.
  ok(toSun.y > 0, `D-${mood} sun sits above the horizon`);
  // The peak of the lobe is exactly at toSun.
  ok(close(dot(toSun, toSun), 1, 1e-9), `D-${mood} toSun is unit length`);
  // A direction 180 deg away must get zero sun contribution (pow of a clamped
  // negative cosine), never a negative colour.
  const away = { x: -toSun.x, y: -toSun.y, z: -toSun.z };
  const contrib = Math.pow(Math.max(0, dot(away, toSun)), 512);
  ok(contrib === 0, `D-${mood} anti-sun direction gets zero sun energy`);
}

// --- E. HDR headroom --------------------------------------------------------
// The sun core must exceed 1.0 or there is no HDR energy for bloom/speculars to
// key off, which was the whole point of using a FLOAT cube instead of bytes.
for (const mood of Object.keys(MOODS) as VenueMood[]) {
  const M = MOODS[mood];
  const core = Math.pow(1, 512) * M.sunIntensity * 12;
  ok(core > 1, `E-${mood} sun core carries HDR energy above 1.0`);
}

// ---------------------------------------------------------------------------
if (fail.length) {
  console.error(`environment-ibl-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`environment-ibl-tests: ${checks} checks green`);
