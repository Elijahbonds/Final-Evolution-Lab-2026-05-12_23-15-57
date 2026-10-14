// CHI RIMS (w3-atmos): a lit edge on a skinned body - the ink hull recoloured HDR. Pure looks, and the real handle against a
// NullEngine scene with skinned meshes: the edge comes up with the meter, the ink returns EXACTLY when it lets go, and nothing
// is drawn that was not drawn already (no new mesh, no new material).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Color3, Mesh, MeshBuilder, NullEngine, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { edgeLevel, mountChiRim, rimLook, rimPulse } from './ChiRim';
import { INK_WIDTH } from './AnimeInk';

afterEach(() => vi.unstubAllGlobals());
const device = (reduced: boolean) => vi.stubGlobal('window', {
  location: { search: '' }, matchMedia: (q: string) => ({ matches: reduced && /reduce/.test(q) }), localStorage: { getItem: () => null },
});

describe('rimLook', () => {
  it('is off below the hint and on above it', () => {
    expect(rimLook(0, 'desktop').on).toBe(false);
    expect(rimLook(0.03, 'desktop').on).toBe(false);
    expect(rimLook(0.25, 'desktop').on).toBe(true);
    expect(rimLook(NaN, 'desktop').on).toBe(false);
  });
  it('a fuller meter is a brighter, wider edge, and the edge is HDR (over 1: what the bloom keys on)', () => {
    const a = rimLook(0.25, 'desktop'), b = rimLook(1, 'desktop');
    expect(b.gain).toBeGreaterThan(a.gain);
    expect(b.width).toBeGreaterThan(a.width);
    expect(a.gain).toBeGreaterThan(1);
  });
  it('the line is never thinner than the ink it replaces, and never a slab', () => {
    for (const l of [0.04, 0.5, 1]) { const w = rimLook(l, 'desktop').width; expect(w).toBeGreaterThanOrEqual(INK_WIDTH); expect(w).toBeLessThan(0.05); }
  });
  it('a phone (a smaller bloom) draws the same width with more gain', () => {
    expect(rimLook(1, 'mobile').width).toBe(rimLook(1, 'desktop').width);
    expect(rimLook(1, 'mobile').gain).toBeGreaterThan(rimLook(1, 'desktop').gain);
  });
});

describe('rimPulse / edgeLevel', () => {
  it('breathes within +-12 % and holds still when calm', () => {
    for (let t = 0; t < 3; t += 0.05) { const p = rimPulse(t, false); expect(p).toBeGreaterThanOrEqual(0.88 - 1e-9); expect(p).toBeLessThanOrEqual(1.12 + 1e-9); expect(rimPulse(t, true)).toBe(1); }
  });
  it('an arrival blazes at once and is gone at its life', () => {
    expect(edgeLevel(0, 0.8)).toBe(1);
    expect(edgeLevel(0.4, 0.8)).toBeCloseTo(0.25, 6);
    expect(edgeLevel(0.8, 0.8)).toBe(0);
    expect(edgeLevel(9, 0.8)).toBe(0);
    expect(edgeLevel(-1, 0.8)).toBe(0);
    expect(edgeLevel(0.1, 0)).toBe(0);
  });
});

function body(scene: Scene, name: string, n = 3): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode(name, scene);
  const sk = new Skeleton(`${name}_sk`, `${name}_sk`, scene);
  const meshes: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = MeshBuilder.CreateBox(`${name}_m${i}`, {}, scene);
    m.parent = root; m.skeleton = sk;
    m.renderOutline = true; m.outlineColor = Color3.FromHexString('#1a1230'); m.outlineWidth = INK_WIDTH;   // what autoInk gave it
    meshes.push(m);
  }
  const prop = MeshBuilder.CreateBox(`${name}_prop`, {}, scene); prop.parent = root;   // an unskinned child: not a body part
  return { root, meshes };
}
const step = (rim: ReturnType<typeof mountChiRim>, sec: number) => { for (let t = 0; t < sec; t += 1 / 60) rim.tick(1 / 60); };

describe('mountChiRim on a skinned body', () => {
  it('lights every skinned mesh of the root and not its props, and leaves the scene\'s meshes and materials as they were', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'hero');
    const before = scene.meshes.length, mats = scene.materials.length;
    const rim = mountChiRim(scene);
    rim.set('me', root, 1, '#ffd36b'); step(rim, 1.5);
    for (const m of meshes) {
      expect(m.renderOutline).toBe(true);
      expect(m.outlineWidth).toBeGreaterThan(INK_WIDTH);
      expect(Math.max(m.outlineColor.r, m.outlineColor.g, m.outlineColor.b)).toBeGreaterThan(1);   // HDR
      expect(m.outlineColor.r).toBeGreaterThan(m.outlineColor.b);                                   // the chi colour (gold), not the ink
    }
    expect(rim.active.length).toBe(meshes.length);
    expect(scene.meshes.length).toBe(before);   // no new mesh: no new draw
    expect(scene.materials.length).toBe(mats);
  });

  it('lets go: the ink comes back EXACTLY as it was (colour, width, on)', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'hero');
    meshes[1].renderOutline = false;   // a body whose ink was off stays off
    const ink = Color3.FromHexString('#1a1230');
    const rim = mountChiRim(scene);
    rim.set('me', root, 1); step(rim, 1);
    expect(meshes[1].renderOutline).toBe(true);   // the rim needs the hull
    rim.clear(); step(rim, 3);
    for (const m of meshes) { expect(m.outlineColor.r).toBeCloseTo(ink.r, 6); expect(m.outlineColor.g).toBeCloseTo(ink.g, 6); expect(m.outlineColor.b).toBeCloseTo(ink.b, 6); expect(m.outlineWidth).toBe(INK_WIDTH); }
    expect(meshes[0].renderOutline).toBe(true);
    expect(meshes[1].renderOutline).toBe(false);
    expect(rim.active.length).toBe(0);
  });

  it('a level below the hint never takes the ink', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'hero');
    const rim = mountChiRim(scene);
    rim.set('me', root, 0.02); step(rim, 1);
    expect(rim.active.length).toBe(0);
    expect(meshes[0].outlineWidth).toBe(INK_WIDTH);
  });

  it('it swells and subsides, it does not pop', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'hero');
    const rim = mountChiRim(scene);
    rim.set('me', root, 1); rim.tick(1 / 60);
    const first = meshes[0].outlineWidth;
    step(rim, 1.5);
    expect(meshes[0].outlineWidth).toBeGreaterThan(first);
    expect(first).toBeLessThan(rimLook(1, 'desktop').width);
  });

  it('two fighters keep their own colours', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const a = body(scene, 'a'), b = body(scene, 'b');
    const rim = mountChiRim(scene);
    rim.set('me', a.root, 1, '#ffd36b'); rim.set('foe', b.root, 1, '#3ec6ff'); step(rim, 1.5);
    expect(a.meshes[0].outlineColor.r).toBeGreaterThan(a.meshes[0].outlineColor.b);
    expect(b.meshes[0].outlineColor.b).toBeGreaterThan(b.meshes[0].outlineColor.r);
    rim.set('foe', b.root, 0); step(rim, 3);
    expect(b.meshes[0].outlineWidth).toBe(INK_WIDTH);
    expect(a.meshes[0].outlineWidth).toBeGreaterThan(INK_WIDTH);   // the other is untouched
  });

  it('flash: an arrival blazes, settles and returns the ink; a mesh that goes away mid-flash is no error', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'agent');
    const rim = mountChiRim(scene);
    rim.flash(root, '#22d3ee', 0.8); rim.tick(1 / 60);
    expect(meshes[0].outlineWidth).toBeGreaterThan(INK_WIDTH);
    expect(meshes[0].outlineColor.b).toBeGreaterThan(meshes[0].outlineColor.r);
    step(rim, 1);
    expect(meshes[0].outlineWidth).toBe(INK_WIDTH);
    expect(rim.active.length).toBe(0);
    rim.flash(root, '#22d3ee', 0.8); rim.tick(1 / 60); meshes[2].dispose();
    expect(() => step(rim, 1)).not.toThrow();
  });

  it('a flash on a body that holds an edge does not strip the held edge when it ends', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'hero');
    const rim = mountChiRim(scene);
    rim.set('me', root, 1); rim.flash(root, '#22d3ee', 0.3);
    const widths: number[] = [];
    for (let i = 0; i < 60; i++) { rim.tick(1 / 60); widths.push(meshes[0].outlineWidth); }   // through the flash's end: never one frame of bare ink
    expect(Math.min(...widths)).toBeGreaterThan(INK_WIDTH);
  });

  it('reduced motion: the edge still shows (it is the read) but it holds still, and an arrival is softer', () => {
    device(true);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'hero');
    const rim = mountChiRim(scene);
    rim.set('me', root, 1); step(rim, 6);
    const g1 = meshes[0].outlineColor.r; rim.tick(0.05); const g2 = meshes[0].outlineColor.r;
    expect(g1).toBeGreaterThan(0.1);
    expect(g2).toBeCloseTo(g1, 4);   // no breathing (the full-motion pulse is +-12 %)
  });

  it('dispose restores everything', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const { root, meshes } = body(scene, 'hero');
    const rim = mountChiRim(scene);
    rim.set('me', root, 1); step(rim, 1); rim.dispose();
    expect(meshes[0].outlineWidth).toBe(INK_WIDTH);
  });
});

describe('wired in, and presentation only', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  it('CombatFx drives the rim from its aura, lets it go with the auras, ticks it and disposes it', () => {
    const s = read('../combat/combatFx.ts');
    expect(s).toMatch(/aura\(key, root, level, color\) \{\s*rim\.set\(key, root, level, color\);/);
    expect(s).toMatch(/clearAuras\(\) \{ rim\.clear\(\);/);
    expect(s).toMatch(/tick\(dt\) \{\s*rim\.tick\(dt\);/);
    expect(s).toContain('owned.push(rim);');
    expect(s).toMatch(/edge\(root, color, life\) \{ rim\.flash\(root, color, life\); \}/);
  });
  it('the Hundred\'s agents blaze as they materialise (a lightFx batch spawn skips it, like the ring)', () => {
    expect(read('../modes/KarateEndlessMode.ts')).toMatch(/if \(!lightFx\) \{\s*fx\?\.ring\([^\n]*\n\s*fx\?\.edge\(char\.root, '#22d3ee', 0\.9\);/);
  });
  it('the module imports nothing that scores, judges, times or tunes', () => {
    const imports = [...read('./ChiRim.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(imports)].sort()).toEqual(['../../a11y/reducedMotion', '@babylonjs/core']);
  });
});
