// vis-foundation-2 A9.14 — material detail: the floor grain gets relief, wet ground grows puddles, skin shines with effort.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MeshBuilder, NullEngine, PBRMaterial, Scene, TransformNode } from '@babylonjs/core';
import { DETAIL_LEVELS, DETAIL_RELIEF, detailLevelsFor, encodeDetail } from './groundTextures';
import { PUDDLE_ROUGHNESS, puddleShare, wetSurface } from './WetSurface';
import { SKIN_DRY, SKIN_SWEAT, SWEAT_FALL_S, setSkinSweat, sweatStep } from '../core/skinShading';

/** A size×size RGBA grain with a bright vertical ridge at x = size/2. */
function ridge(size: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = x === size / 2 ? 220 : 100; const o = (y * size + x) * 4;
    d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
  }
  return d;
}

describe('the floor grain has relief (detail map: R albedo, G normal y, B roughness, A normal x)', () => {
  it('slopes become the normal; a flat grain stays flat; the tile stays seamless', () => {
    const s = 8, d = ridge(s);
    encodeDetail(d, s, DETAIL_RELIEF.asphalt);
    const at = (x: number, y: number) => (y * s + x) * 4;
    expect(d[at(s / 2 - 1, 3) + 3]).toBeLessThan(128);   // climbing the ridge: the normal leans away
    expect(d[at(s / 2 + 1, 3) + 3]).toBeGreaterThan(128);
    expect(d[at(1, 3) + 3]).toBe(128); expect(d[at(1, 3) + 1]).toBe(128);   // flat ground: no lean
    expect(d[at(s / 2, 3) + 2]).toBeLessThan(d[at(1, 3) + 2]);   // the bright ridge is smoother (B lower)
    const flat = new Uint8ClampedArray(4 * 4 * 4).fill(90);
    encodeDetail(flat, 4, DETAIL_RELIEF.grass);
    for (let i = 0; i < 16; i++) { expect(flat[i * 4]).toBe(128); expect(flat[i * 4 + 1]).toBe(128); expect(flat[i * 4 + 2]).toBe(128); expect(flat[i * 4 + 3]).toBe(128); }
  });
  it('the floors take the relief on the wave-2 modes; the held hoops floors keep the flat grain', () => {
    expect(detailLevelsFor('asphalt', 'football')).toEqual(DETAIL_LEVELS.asphalt);
    expect(detailLevelsFor('grass', null)).toEqual(DETAIL_LEVELS.grass);
    expect(detailLevelsFor('concrete', 'onevone')).toEqual({ bump: 0, rough: 0 });
    for (const k of Object.keys(DETAIL_LEVELS) as (keyof typeof DETAIL_LEVELS)[]) { expect(DETAIL_LEVELS[k].bump).toBeLessThanOrEqual(0.6); expect(DETAIL_LEVELS[k].bump).toBeGreaterThan(0); }
    const src = fs.readFileSync(path.resolve(__dirname, 'groundTextures.ts'), 'utf8');
    expect(src).toContain('mat.detailMap.bumpLevel = lv.bump;');
  });
});

describe('puddles', () => {
  it('none until the ground is properly wet, then growing to about a third', () => {
    expect(puddleShare(0)).toBe(0);
    expect(puddleShare(0.1)).toBe(0);
    expect(puddleShare(0.5)).toBeGreaterThan(0);
    expect(puddleShare(1)).toBeLessThanOrEqual(0.34);
    expect(puddleShare(1)).toBeGreaterThan(puddleShare(0.5));
    expect(PUDDLE_ROUGHNESS).toBeLessThan(0.1);
  });
  it('a plugin on the ground material, enabled once, driven by one uniform; it comes off again', () => {
    const s = new Scene(new NullEngine());
    const m = new PBRMaterial('field', s);
    const h = wetSurface(m);
    const p = m.pluginManager!.getPlugin('FELWetSurface') as unknown as { isEnabled: boolean; wet: number };
    expect(p.isEnabled).toBe(true);
    h.set(0.8); expect(p.wet).toBe(0.8);
    expect(wetSurface(m)).toBeTruthy(); expect(m.pluginManager!.getPlugin('FELWetSurface')).toBe(p);   // one per material
    h.dispose(); expect(p.isEnabled).toBe(false);
  });
  it('WeatherFx puts them on its wet grounds when it rains, and not on the held hoops modes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'premium/WeatherFx.ts'), 'utf8');
    expect(src).toContain('puddles: puddles && kit.precipitating ? wetSurface(mat) : null');
    expect(src).toContain('const puddles = wave2Look(sceneModeId(scene));');
    expect(src).toContain('w.puddles?.set(wet)');
  });
});

describe('sweat', () => {
  it('builds with effort, never past it, and dries slower than it built', () => {
    let s = 0;
    for (let i = 0; i < 120; i++) s = sweatStep(s, 1, 0.5);   // a minute flat out
    expect(s).toBeGreaterThan(0.9); expect(s).toBeLessThanOrEqual(1);
    let half = 0; for (let i = 0; i < 400; i++) half = sweatStep(half, 0.5, 0.5);
    expect(half).toBeCloseTo(0.5, 6);
    const rest = sweatStep(1, 0, 10);
    expect(rest).toBeCloseTo(1 - 10 / SWEAT_FALL_S, 6);
  });
  it('writes the shaded skin only: roughness down, specular up', () => {
    const sc = new Scene(new NullEngine());
    const root = new TransformNode('hero', sc);
    const mk = (name: string, shaded: boolean) => { const m = MeshBuilder.CreateBox(name, {}, sc); const mat = new PBRMaterial(name, sc); mat.roughness = 0.58; if (shaded) mat.metadata = { felShaded: true }; m.material = mat; m.parent = root; return mat; };
    const skin = mk('skin_body', true), jersey = mk('jersey', true), raw = mk('skin_unshaded', false);
    expect(setSkinSweat(root, 1)).toBe(1);
    expect(skin.roughness).toBeCloseTo(SKIN_SWEAT.roughness, 9); expect(skin.specularIntensity).toBeCloseTo(SKIN_SWEAT.specular, 9);
    expect(jersey.roughness).toBe(0.58); expect(raw.roughness).toBe(0.58);
    setSkinSweat(root, 0);
    expect(skin.roughness).toBeCloseTo(SKIN_DRY.roughness, 9);
  });
});
