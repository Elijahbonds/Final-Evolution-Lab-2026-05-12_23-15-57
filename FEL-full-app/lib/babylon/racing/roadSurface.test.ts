// ROAD SURFACE (w3-atmos): the kart's asphalt grain, kerb ribs and wet gloss. The levels and profiles are pure; the road's grain
// is asserted through the floor-grain layer it calls (mocked: the layer's own tests live with groundTextures).
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const applied = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../visual/groundTextures', () => ({ applyFloorDetailToMesh: (...a: unknown[]) => { applied.calls.push(a); return true; } }));

import { PBRMaterial, NullEngine, Scene } from '@babylonjs/core';
import { ROAD_DRY, ROAD_WET, RIBS, asphaltRoad, markWetGloss, ribKerb, ribNormal, ribSlope, wetGloss } from './roadSurface';

describe('wetGloss', () => {
  it('is the dry level at 0, the wet level at 1, and between linearly', () => {
    expect(wetGloss(0.35, 1, 0)).toBe(0.35);
    expect(wetGloss(0.35, 1, 1)).toBe(1);
    expect(wetGloss(0.35, 1, 0.5)).toBeCloseTo(0.675, 6);
  });
  it('clamps a lying wetness and survives NaN', () => {
    expect(wetGloss(0.2, 1, 7)).toBe(1); expect(wetGloss(0.2, 1, -3)).toBe(0.2); expect(wetGloss(0.2, 1, NaN)).toBe(0.2);
  });
  it('a soaked road reflects more than the dry tarmac ever did (it was env 0.35 / spec 0.22)', () => {
    expect(ROAD_WET.env).toBeGreaterThan(ROAD_DRY.env * 2); expect(ROAD_WET.spec).toBeGreaterThan(ROAD_DRY.spec * 3);
  });
});

describe('the rib profile', () => {
  it('has RIBS ribs: the slope crosses zero twice a rib (the crest and the trough) and is periodic', () => {
    let crossings = 0, prev = ribSlope(0.0001);
    for (let v = 0.001; v <= 1; v += 0.001) { const s = ribSlope(v); if (Math.sign(s) !== Math.sign(prev) && prev !== 0) crossings++; prev = s; }
    expect(crossings).toBeGreaterThanOrEqual(RIBS * 2 - 1); expect(crossings).toBeLessThanOrEqual(RIBS * 2 + 1);
    expect(ribSlope(0.3)).toBeCloseTo(ribSlope(1.3), 9);
  });
  it('encodes a tangent-space normal: x flat, z up, y leaning with the slope, every channel a legal byte', () => {
    for (let v = 0; v < 1; v += 0.01) { const [r, g, b] = ribNormal(v); expect(r).toBe(0.5); expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1); expect(b).toBeGreaterThan(0.5); expect(b).toBeLessThanOrEqual(1); }
    expect(ribNormal(0)[1]).toBeCloseTo(0.5, 6);   // a crest or a trough is flat
  });
  it('leans one way up a rib and the other way down it', () => {
    const up = ribNormal(0.02)[1], down = ribNormal(0.02 + 1 / RIBS / 2)[1];
    expect(Math.sign(up - 0.5)).not.toBe(Math.sign(down - 0.5));
  });
});

describe('asphaltRoad / markWetGloss / ribKerb', () => {
  it('asks the floor-grain layer for the asphalt grain at the road\'s width (its UV is one road width a tile)', () => {
    const scene = new Scene(new NullEngine());
    const road = { name: 'kart_road' } as never;
    expect(asphaltRoad(scene, road, 9)).toBe(true);
    const [s, m, detail, size] = applied.calls[0] as [unknown, unknown, { kind: string; blend: number }, [number, number]];
    expect(s).toBe(scene); expect(m).toBe(road); expect(detail.kind).toBe('asphalt'); expect(size).toEqual([18, 18]);
    applied.calls.length = 0; asphaltRoad(scene, road, 1);
    expect((applied.calls[0] as unknown[])[3]).toEqual([4, 4]);   // a floor of 4 m a tile: never a vanishing one
  });
  it('a phone keeps the paint alone: one more 512 px texture would raise the kart\'s frozen texture row', () => {
    const scene = new Scene(new NullEngine());
    (scene.metadata ??= {}).felTier = 'mobile';
    applied.calls.length = 0;
    expect(asphaltRoad(scene, { name: 'kart_road' } as never, 9)).toBe(false);
    expect(applied.calls.length).toBe(0);
    scene.metadata.felTier = 'high';
    expect(asphaltRoad(scene, { name: 'kart_road' } as never, 9)).toBe(true);
  });
  it('markWetGloss flags the material with the levels it lerps to and the ones it was dry', () => {
    const scene = new Scene(new NullEngine());
    const mat = new PBRMaterial('t', scene); mat.environmentIntensity = 0.35; mat.specularIntensity = 0.22;
    markWetGloss(mat);
    expect(mat.metadata.felWetGloss).toEqual({ env: ROAD_WET.env, spec: ROAD_WET.spec, dryEnv: 0.35, drySpec: 0.22 });
  });
  it('ribKerb leaves the kerb flat, and says so, where a canvas cannot be made (a headless scene)', () => {
    const scene = new Scene(new NullEngine());
    const mat = new PBRMaterial('k', scene);
    expect(ribKerb(scene, mat)).toBe(false);
    expect(mat.bumpTexture).toBeFalsy();
  });
});

describe('wired in, and presentation only', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  it('the road takes its grain and its flag at the merge, the kerbs their ribs', () => {
    const k = read('../modes/VelocityKartMode.ts');
    expect(k).toMatch(/merged\.isPickable = false;\n\s*asphaltRoad\(ctx\.scene, merged, half\);[^\n]*\n\s*markWetGloss\(tarmac\);/);
    expect(read('./kartDressing.ts')).toMatch(/ribKerb\(scene, red\); ribKerb\(scene, white\);/);
  });
  it('the weather\'s wet pass finds the road and lifts its reflections, and puts them back', () => {
    const w = read('../premium/WeatherFx.ts');
    expect(w).toMatch(/GROUND_RE = \/[^\n]*\|\^kart_road\$\/i;/);
    expect(w).toContain('w.m.environmentIntensity = wetGloss(w.gloss.dryEnv, w.gloss.env, wet);');
    expect(w).toContain('w.m.environmentIntensity = w.gloss.dryEnv; w.m.specularIntensity = w.gloss.drySpec;');
  });
  it('the kart reads the weather for its LOOKS only: rain, storm, fog from the URL, and none of the gameplay modifiers', () => {
    const k = read('../modes/VelocityKartMode.ts');
    expect(k).toMatch(/readWeatherUrl\(\)/);
    expect(k).toMatch(/mountWeatherFx\(ctx\.scene, ctx\.lights, weather, \{ tier: ctx\.lights\.tier, keepSky: true, fogHex: hazeColor\(course\.mood\) \}\)/);   // the air is the course's haze, not its dark clear colour
    for (const m of ['gripMult', 'boardDragMult', 'ballWindAccel', 'flightWind', 'gustWind', 'airDensityMult', 'wet01']) expect(k, m).not.toContain(`weather.${m}`);
    expect(k).toMatch(/weatherFx\?\.dispose\(\); weatherFx = null; weather = null;/);
  });
  it('imports nothing that drives, races, scores or tunes', () => {
    const imports = [...read('./roadSurface.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(imports)].sort()).toEqual(['../visual/groundTextures', '@babylonjs/core']);
  });
});
