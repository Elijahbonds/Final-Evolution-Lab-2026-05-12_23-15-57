// LIBRARY-ANATOMY (2026-10-25): the muscle view — every muscle lands on the body, on the side it shows, on both kit
// bodies; no library entry shows a blank body; and the colours stay apart for colour-blind eyes.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3, type Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { bodyMeshOf } from '@/lib/babylon/creator/shape/renderShape';
import { clearAnatomyCache, measureBody, weightsOf } from '@/lib/babylon/library/anatomyLook';
import { ATOMS, ATOM_COUNT, ATOM_GROUP, GROUP_COUNT } from '@/lib/babylon/creator/paint/bodyChart';
import { ANATOMY_PALETTE, MUSCLE_REGIONS, anatomyLegend, hexRgb, initialSide, lateralAngle, secondaryShown, type Rgb } from './anatomy';
import { muscleMap } from './demo';
import { loadLibraryFiles } from './files';
import { MUSCLES } from './vocab';

const KITS = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb' } as const;
const bodies: Partial<Record<keyof typeof KITS, Mesh>> = {};

beforeAll(async () => {
  clearAnatomyCache();
  for (const [kit, file] of Object.entries(KITS) as [keyof typeof KITS, string][]) {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(file).toString('base64'), scene, undefined, '.glb');
    bodies[kit] = bodyMeshOf(r.meshes) ?? undefined;
  }
}, 120_000);

/** Mean cos(angle from the front) of a muscle's vertices, weighted: > 0 the front, < 0 the back. */
function facing(kit: keyof typeof KITS, key: string): { verts: number; front: number } {
  const m = measureBody(bodies[kit]!)!;
  const w = weightsOf(m, key);
  let n = 0, sum = 0, ws = 0;
  for (let v = 0; v < m.cls.n; v++) {
    if (w[v] < 0.5) continue;
    n++;
    // the atom this vertex is mostly in, and its angle in that atom's group
    let best = 0, bestW = -1;
    for (let a = 0; a < ATOM_COUNT; a++) { const x = m.cls.atomW[v * ATOM_COUNT + a]; if (x > bestW) { bestW = x; best = a; } }
    const lat = lateralAngle(ATOMS[best], m.cls.ang[v * GROUP_COUNT + ATOM_GROUP[best]]);
    sum += w[v] * Math.cos((lat * Math.PI) / 180); ws += w[v];
  }
  return { verts: n, front: ws ? sum / ws : 0 };
}

describe('every muscle lands on the body (both kit bodies)', () => {
  it('each MUSCLES anatomy key has a region', () => {
    for (const m of MUSCLES) expect(MUSCLE_REGIONS[m.anatomyKey], m.id).toBeTruthy();
  });
  for (const kit of Object.keys(KITS) as (keyof typeof KITS)[]) {
    it(`${kit}: every muscle covers skin, on the side its MUSCLES view says`, () => {
      expect(bodies[kit], 'the kit body mesh').toBeTruthy();
      const out: string[] = [];
      for (const m of MUSCLES) {
        const f = facing(kit, m.anatomyKey);
        if (f.verts < 40) out.push(`${m.id}: only ${f.verts} vertices`);
        if (m.view === 'front' && f.front < 0.15) out.push(`${m.id}: should face front, faces ${f.front.toFixed(2)}`);
        if (m.view === 'back' && f.front > -0.15) out.push(`${m.id}: should face back, faces ${f.front.toFixed(2)}`);
      }
      expect(out).toEqual([]);
    });
  }
  it('the angle convention holds on the body (measured, not assumed): the outer hip sits on the outside of the thigh', () => {
    const m = measureBody(bodies.male!)!;
    const meanLat = (key: string, atom: 'thighL' | 'thighR') => {
      const w = weightsOf(m, key), a = ATOMS.indexOf(atom), g = ATOM_GROUP[a];
      let s = 0, n = 0;
      for (let v = 0; v < m.cls.n; v++) if (w[v] > 0.6 && m.cls.atomW[v * ATOM_COUNT + a] > 0.8) { s += lateralAngle(atom, m.cls.ang[v * GROUP_COUNT + g]); n++; }
      return n ? s / n : 0;
    };
    for (const atom of ['thighL', 'thighR'] as const) {
      expect(meanLat('abductors', atom), atom).toBeGreaterThan(40);
      expect(meanLat('adductors', atom), atom).toBeLessThan(-40);
    }
  });
});

describe('no library entry shows a blank body', () => {
  it('every entry has a primary muscle, and every one it names colours skin', () => {
    const m = measureBody(bodies.male!)!;
    const blank: string[] = [];
    for (const e of loadLibraryFiles()) {
      const map = muscleMap(e);
      if (!map.primary.length) { blank.push(`${e.id}: no primary muscle`); continue; }
      // a vertex shows the primary colour when it is more primary than body (weight > 0.5)
      let lit = 0;
      const ws = map.primary.map((k) => weightsOf(m, k));
      for (let v = 0; v < m.cls.n; v++) if (ws.some((w) => w[v] > 0.5)) lit++;
      if (lit < 40) blank.push(`${e.id}: ${lit} primary vertices`);
    }
    expect(blank.slice(0, 10)).toEqual([]);
  });
  it('the legend names every muscle, primary first; the view opens on the side most primaries show', () => {
    const rows = anatomyLegend({ primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower-back', 'glutes'] });
    expect(rows.map((r) => `${r.tier}:${r.label}`)).toEqual(['primary:Hamstrings', 'primary:Glutes', 'secondary:Lower back']);
    expect(initialSide(['hamstrings', 'glutes'])).toBe('back');
    expect(initialSide(['quads', 'chest'])).toBe('front');
    expect(initialSide([])).toBe('front');
  });
});

// ── colour-blind safety ──────────────────────────────────────────────────────────────────────────────────────────────
// Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB.
const CVD: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab(rgb: Rgb, m?: number[][]): Rgb {
  let [r, g, b] = rgb.map(lin);
  if (m) [r, g, b] = m.map((row) => Math.max(0, Math.min(1, row[0] * r + row[1] * g + row[2] * b)));
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the palette stays apart for colour-blind eyes', () => {
  it('body, primary and secondary differ by ΔE ≥ 20 for normal vision and under protanopia, deuteranopia and tritanopia', () => {
    const cols = { base: hexRgb(ANATOMY_PALETTE.base), primary: hexRgb(ANATOMY_PALETTE.primary), secondary: secondaryShown() };
    const worst: string[] = [];
    for (const [name, m] of [['normal', undefined], ...Object.entries(CVD)] as [string, number[][] | undefined][]) {
      const L = Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, lab(c, m)])) as Record<keyof typeof cols, Rgb>;
      for (const [a, b] of [['base', 'primary'], ['base', 'secondary'], ['primary', 'secondary']] as const) {
        const d = dE(L[a], L[b]);
        if (d < 20) worst.push(`${name} ${a}/${b} ΔE ${d.toFixed(1)}`);
      }
    }
    expect(worst).toEqual([]);
  });
});
