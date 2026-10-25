// lib/library/anatomy.ts — LIBRARY-ANATOMY (2026-10-25): the exercise library's muscle view, as data and maths.
//
// Owner decision (2026-10-25): every exercise shows its muscles on a 3D body — Muscle & Motion's whole product is that
// view; ours puts it on the athlete's own avatar. Primary muscles strong, secondary light, a front/back toggle and a
// legend that names each one, readable on a phone, colour-blind safe.
//
// HOW A MUSCLE FINDS ITS SKIN (chosen over a separate anatomy body, which would be a new asset to download and would not
// be the athlete's own build; measured in the lane report, 2026-10-25): the avatar's
// body already knows where everything is. The Creator's paint chart (lib/babylon/creator/paint/bodyChart.ts) splits
// every vertex of the kit body by its SKIN WEIGHTS into 18 atoms (thigh, shin, upper arm, torso front/back …) and gives
// it chart coordinates on its limb's cylinder: `t` along the limb (metres; up the body, towards the shoulder on an arm)
// and the angle around it. A muscle here is a window on those coordinates — an atom, a band along it, an arc around it
// ("the back of the thigh, hip to just above the knee") — soft at the edges. No UVs and no hand-painted masks: the same
// definition lands on the male and the female kit, at any build the Creator gives them, because the chart is measured
// on the body it colours.
//
// ANGLES. `lat` below is measured round the limb from its FRONT: 0 front, +90 the outside (lateral), ±180 the back,
// −90 the inside (medial). The chart's own angle grows to the right as you look at the surface, which is lateral on the
// left leg and the right arm and medial on the other two (measured on the kit body, exercise library rig 2026-10-25);
// `lateralAngle` does that conversion. The torso is symmetric: its windows read |angle| (0 front, 180 back).
//
// Pure. No Babylon: the stage (lib/babylon/library/anatomyLook.ts) reads the body and hands the arrays in.

import { ATOMS, ATOM_COUNT, ATOM_GROUP, GROUP_COUNT, type Atom, type Classified } from '@/lib/babylon/creator/paint/bodyChart';
import { MUSCLES, type MuscleId } from './vocab';

// ── the palette ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The muscle view's colours, from the app's own accents (#FFD700 gold, #00E5FF cyan) on a neutral slate body.
 * Gold against cyan is a yellow–blue pair, the axis that survives protanopia and deuteranopia, and the two differ in
 * lightness as well as hue, so tritanopia keeps them apart too; `anatomy.test.ts` simulates all three (Machado 2009)
 * and holds every pair apart. Colour is never the only cue: the legend names every muscle under "Main" and "Also".
 */
export const ANATOMY_PALETTE = {
  /** the body: a mid slate so both highlights read against it and the silhouette reads against the dark stage */
  base: '#6B7280',
  /** primary (strong) — the app's gold */
  primary: '#FFD700',
  /** secondary (light) — the app's cyan, mixed half-way to the body so it reads as the lighter of the two */
  secondary: '#00E5FF',
  /** how much of the secondary colour shows (the rest is the body): "light" */
  secondaryStrength: 0.62,
} as const;

export type Rgb = [number, number, number];
export const hexRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
};
const lerp3 = (a: Rgb, b: Rgb, u: number): Rgb => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
/** The secondary swatch as it shows on the body (and in the legend). */
export const secondaryShown = (): Rgb => lerp3(hexRgb(ANATOMY_PALETTE.base), hexRgb(ANATOMY_PALETTE.secondary), ANATOMY_PALETTE.secondaryStrength);
export const rgbHex = (c: Rgb): string => `#${c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;

// ── the regions ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** One piece of a muscle: atoms, a band along them (0 = the far end: knee, wrist, hips; 1 = the near end: hip, shoulder,
 *  neck — the atom's own measured extent) and an arc round them (degrees, see ANGLES above). */
export interface RegionPart {
  atoms: readonly Atom[];
  u?: readonly [number, number];
  /** limbs: centre and half-width of the arc, in `lat` degrees */
  arc?: readonly [number, number];
  /** torso: a band of |angle| (0 front … 180 back) */
  abs?: readonly [number, number];
}

const LEGS = ['thighL', 'thighR'] as const;
const SHINS = ['shinL', 'shinR'] as const;
const UPPER_ARMS = ['upperArmL', 'upperArmR'] as const;
const TORSO = ['torsoFront', 'torsoBack'] as const;

/**
 * Every MUSCLES anatomy key → where it is on the body. Tuned on the rig against the kit body (shots in the lane's
 * scratchpad); anatomy.test.ts holds each one to a minimum area on the side its MUSCLES `view` says.
 */
export const MUSCLE_REGIONS: Readonly<Record<string, readonly RegionPart[]>> = {
  neck: [{ atoms: ['neck'] }],
  traps: [{ atoms: TORSO, u: [0.80, 1.01], abs: [112, 181] }, { atoms: ['neck'], u: [-0.01, 0.55], abs: [100, 181] }],
  delts: [{ atoms: UPPER_ARMS, u: [0.70, 1.01] }, { atoms: TORSO, u: [0.86, 1.01], abs: [62, 118] }],
  'rear-delts': [{ atoms: UPPER_ARMS, u: [0.60, 1.01], arc: [150, 62] }, { atoms: TORSO, u: [0.86, 1.01], abs: [112, 150] }],
  'rotator-cuff': [{ atoms: TORSO, u: [0.70, 0.88], abs: [118, 160] }],
  chest: [{ atoms: TORSO, u: [0.68, 0.91], abs: [0, 64] }],
  serratus: [{ atoms: TORSO, u: [0.56, 0.74], abs: [58, 96] }],
  biceps: [{ atoms: UPPER_ARMS, u: [0.14, 0.76], arc: [0, 60] }],
  triceps: [{ atoms: UPPER_ARMS, u: [0.10, 0.80], arc: [180, 72] }],
  forearms: [{ atoms: ['forearmL', 'forearmR', 'handL', 'handR'] }],
  lats: [{ atoms: TORSO, u: [0.48, 0.80], abs: [100, 152] }],
  'mid-back': [{ atoms: TORSO, u: [0.58, 0.83], abs: [150, 181] }],
  'lower-back': [{ atoms: TORSO, u: [0.34, 0.58], abs: [142, 181] }],
  abs: [{ atoms: TORSO, u: [0.34, 0.68], abs: [0, 36] }],
  obliques: [{ atoms: TORSO, u: [0.36, 0.64], abs: [34, 100] }],
  'deep-core': [{ atoms: TORSO, u: [0.30, 0.50], abs: [0, 98] }],
  diaphragm: [{ atoms: TORSO, u: [0.58, 0.70], abs: [0, 74] }],
  'hip-flexors': [{ atoms: TORSO, u: [0.16, 0.36], abs: [14, 62] }, { atoms: LEGS, u: [0.84, 1.01], arc: [0, 48] }],
  glutes: [{ atoms: TORSO, u: [0.04, 0.36], abs: [118, 181] }, { atoms: LEGS, u: [0.90, 1.01], arc: [180, 70] }],
  'glute-med': [{ atoms: TORSO, u: [0.24, 0.42], abs: [94, 136] }],
  adductors: [{ atoms: LEGS, u: [0.34, 0.99], arc: [-68, 50] }],
  abductors: [{ atoms: TORSO, u: [0.14, 0.34], abs: [76, 118] }, { atoms: LEGS, u: [0.70, 1.01], arc: [90, 42] }],
  quads: [{ atoms: LEGS, u: [0.08, 0.88], arc: [12, 78] }],
  hamstrings: [{ atoms: LEGS, u: [0.06, 0.88], arc: [180, 66] }],
  calves: [{ atoms: SHINS, u: [0.46, 0.96], arc: [180, 78] }],
  soleus: [{ atoms: SHINS, u: [0.12, 0.54], arc: [180, 88] }],
  tibialis: [{ atoms: SHINS, u: [0.24, 0.94], arc: [24, 40] }],
  foot: [{ atoms: ['footL', 'footR'] }],
};

/** Soft edges: along the limb (fraction of the atom) and round it (degrees). */
const SOFT_U = 0.035;
const SOFT_DEG = 9;

const smooth = (e0: number, e1: number, x: number): number => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
/** 1 inside [lo, hi], easing to 0 over `soft` outside it. */
const band = (lo: number, hi: number, x: number, soft: number): number => smooth(lo - soft, lo + soft, x) * (1 - smooth(hi - soft, hi + soft, x));
/** The shortest signed difference a − b in degrees (−180..180]. */
const dAng = (a: number, b: number): number => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; };

const ATOM_IX = new Map<string, number>(ATOMS.map((a, i) => [a, i]));
/** 'L' / 'R' / null for a centre atom. */
const sideOf = (a: Atom): 'L' | 'R' | null => (a.endsWith('L') ? 'L' : a.endsWith('R') ? 'R' : null);
const isArm = (a: Atom): boolean => a.startsWith('upperArm') || a.startsWith('forearm') || a.startsWith('hand');

/** The chart angle (radians) of a vertex in an atom's group → `lat` degrees (0 front, +90 outside, ±180 back). */
export function lateralAngle(atom: Atom, angRad: number): number {
  const deg = (angRad * 180) / Math.PI;
  const s = sideOf(atom);
  if (!s) return Math.abs(deg);
  // legs: + is the outside on the left; arms: + is the outside on the right (measured, see ANGLES)
  const plusIsLateral = isArm(atom) ? s === 'R' : s === 'L';
  return plusIsLateral ? deg : -deg;
}

/** The per-atom [tMin, tMax] a band's 0..1 runs over (bodyChart's measured extent). */
export type AtomExtent = ArrayLike<number>;

/** One muscle's weight per vertex (0..1), from a classified body and its chart's atom extents. */
export function muscleWeights(key: string, c: Pick<Classified, 'n' | 'atomW' | 'ang' | 't'>, extent: AtomExtent): Float32Array {
  const out = new Float32Array(c.n);
  const parts = MUSCLE_REGIONS[key];
  if (!parts) return out;
  // a part's atoms partition the skin weights, so their contributions ADD (a vertex half upper arm, half torso at the
  // shoulder is wholly "delts" when both halves are in the region); parts are separate shapes, so a vertex takes the max
  const part1 = new Float32Array(c.n);
  for (const part of parts) {
    part1.fill(0);
    for (const atom of part.atoms) {
      const a = ATOM_IX.get(atom);
      if (a === undefined) continue;
      const g = ATOM_GROUP[a];
      const t0 = extent[a * 4], t1 = extent[a * 4 + 1], span = t1 - t0 || 1;
      for (let v = 0; v < c.n; v++) {
        const w = c.atomW[v * ATOM_COUNT + a];
        if (w <= 0.02) continue;
        let k = w;
        if (part.u) { const u = (c.t[v * GROUP_COUNT + g] - t0) / span; k *= band(part.u[0], part.u[1], u, SOFT_U); }
        if (k > 0 && (part.arc || part.abs)) {
          const lat = lateralAngle(atom, c.ang[v * GROUP_COUNT + g]);
          if (part.arc) k *= 1 - smooth(part.arc[1] - SOFT_DEG, part.arc[1] + SOFT_DEG, Math.abs(dAng(lat, part.arc[0])));
          if (part.abs) k *= band(part.abs[0], part.abs[1], Math.abs(lat), SOFT_DEG);
        }
        part1[v] += k;
      }
    }
    for (let v = 0; v < c.n; v++) { const k = Math.min(1, part1[v]); if (k > out[v]) out[v] = k; }
  }
  return out;
}

/**
 * The body's vertex colours (RGBA) for one exercise: the slate body, the secondary muscles mixed in light, the primary
 * muscles over them strong. `weights(key)` is the per-vertex weight of one muscle (cached by the caller per body).
 */
export function anatomyColors(n: number, map: { primary: readonly string[]; secondary: readonly string[] }, weights: (key: string) => Float32Array): Float32Array {
  const base = hexRgb(ANATOMY_PALETTE.base), p = hexRgb(ANATOMY_PALETTE.primary), s = hexRgb(ANATOMY_PALETTE.secondary);
  const wp = new Float32Array(n), ws = new Float32Array(n);
  for (const k of map.primary) { const w = weights(k); for (let v = 0; v < n; v++) if (w[v] > wp[v]) wp[v] = w[v]; }
  for (const k of map.secondary) { const w = weights(k); for (let v = 0; v < n; v++) if (w[v] > ws[v]) ws[v] = w[v]; }
  const out = new Float32Array(n * 4);
  const S = ANATOMY_PALETTE.secondaryStrength;
  for (let v = 0; v < n; v++) {
    const a = wp[v], b = ws[v] * S * (1 - a);
    for (let i = 0; i < 3; i++) out[v * 4 + i] = base[i] * (1 - a - b) + p[i] * a + s[i] * b;
    out[v * 4 + 3] = 1;
  }
  return out;
}

// ── what the view shows ─────────────────────────────────────────────────────────────────────────────────────────────

export interface LegendRow { id: string; label: string; tier: 'primary' | 'secondary'; view: 'front' | 'back' | 'both' }

const INFO = new Map<string, (typeof MUSCLES)[number]>(MUSCLES.map((m) => [m.id, m]));
const BY_ANATOMY_KEY = new Map<string, (typeof MUSCLES)[number]>(MUSCLES.map((m) => [m.anatomyKey, m]));

/** The legend for an entry: every primary muscle, then every secondary one, named, with the side it shows best on. */
export function anatomyLegend(e: { primaryMuscles: readonly MuscleId[]; secondaryMuscles: readonly MuscleId[] }): LegendRow[] {
  const rows: LegendRow[] = [];
  const seen = new Set<string>();
  for (const [tier, list] of [['primary', e.primaryMuscles], ['secondary', e.secondaryMuscles]] as const) {
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      const m = INFO.get(id);
      rows.push({ id, label: m?.label ?? id, tier, view: m?.view ?? 'both' });
    }
  }
  return rows;
}

/** The side the view opens on: where most of the primary muscles show (a tie, or no primary: the front). */
export function initialSide(primaryAnatomyKeys: readonly string[]): 'front' | 'back' {
  let front = 0, back = 0;
  for (const k of primaryAnatomyKeys) {
    const v = BY_ANATOMY_KEY.get(k)?.view;
    if (v === 'front') front++;
    else if (v === 'back') back++;
  }
  return back > front ? 'back' : 'front';
}
