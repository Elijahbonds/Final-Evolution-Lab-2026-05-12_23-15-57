// AERO ATMOSPHERE (w3-atmos): cloud banks, skim spray, lava glow, the ring-pass shockwave. The placement and the response curves
// are pure and held here against the circuits' own functions; the mount runs on a NullEngine scene (the rig proves the picture).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene } from '@babylonjs/core';

// Babylon's DynamicTexture reaches for OffscreenCanvas, which node has not got (EffectsKit.test's shim: only the 2-D calls need to land)
class ShimCtx {
  fillStyle = ''; strokeStyle = ''; lineWidth = 0;
  clearRect(): void {} fillRect(): void {} beginPath(): void {} arc(): void {} fill(): void {} drawImage(): void {}
  createRadialGradient(): { addColorStop(): void } { return { addColorStop() {} }; }
  getImageData(): { data: Uint8ClampedArray } { return { data: new Uint8ClampedArray(4) }; }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(): ShimCtx { return new ShimCtx(); }
};
import { aeroCircuits, pointAlong } from './aeroCircuits';
import {
  LAVA_REACH, SKIM_AGL, SURFACE_Y, UNDERLIGHT_REST, cloudBanksFor, fogPulse, insideCloud, lavaGlow, lavaNear, mountAeroAtmos, overLiquid, puffFade, skimRate, underlightFor,
} from './aeroAtmos';
import { heatRegistry } from '../scene/HeatHaze';
import { allCloudSights } from '../../../tests/helpers/aeroCloudSight';

afterEach(() => vi.unstubAllGlobals());
const device = (reduced: boolean) => vi.stubGlobal('window', {
  location: { search: '' }, matchMedia: (q: string) => ({ matches: reduced && /reduce/.test(q) }), localStorage: { getItem: () => null },
});
const circuits = aeroCircuits();
const by = (theme: string) => circuits.find((c) => c.theme === theme)!;

describe('cloudBanksFor', () => {
  const c = by('canyon');
  const a = cloudBanksFor(c.line, c.floorAt, c.corridor, 6, 9), b = cloudBanksFor(c.line, c.floorAt, c.corridor, 6, 9);
  it('is the same every load, banks x puffs of them', () => { expect(a).toEqual(b); expect(a.length).toBe(54); });
  it('sits at the line\'s own height (not up in the deck) and never in the ground', () => {
    for (const p of a) {
      const floor = Math.max(c.floorAt(p.x, p.z), SURFACE_Y);
      expect(p.y - floor).toBeGreaterThanOrEqual(p.size * 0.4 + 3.99);   // the sprite's body stays above the ground / sea (an upright quad's body hangs ~0.34 of its size below its centre)
      expect(p.y - floor).toBeLessThan(110);   // (the 150 m deck is CloudDeck\'s)
    }
  });
  it('stays near the lap: every puff within the corridor\'s reach plus a bank\'s spread of the line', () => {
    const near = (x: number, z: number) => { let best = 1e9; for (let d = 0; d < c.line.length; d += 8) { const p = pointAlong(c.line, d).pos; best = Math.min(best, Math.hypot(p.x - x, p.z - z)); } return best; };
    for (const p of a) expect(near(p.x, p.z)).toBeLessThan(c.corridor * 0.4 + Math.min(45, c.corridor * 0.9) + 12);
  });
  it('puffs are big, soft and not opaque (a flight through one is a veil, not a wall)', () => { for (const p of a) { expect(p.size).toBeGreaterThanOrEqual(45); expect(p.size).toBeLessThanOrEqual(85); expect(p.alpha).toBeGreaterThanOrEqual(0.4); expect(p.alpha).toBeLessThanOrEqual(0.7); } });
  it('a different seed is a different sky', () => { expect(cloudBanksFor(c.line, c.floorAt, c.corridor, 6, 9, 12)).not.toEqual(a); });
});

describe('puffFade / insideCloud / fogPulse', () => {
  it('a puff fades OUT as the camera comes into it (no quad is ever clipped by the near plane)', () => {
    const size = 80;
    expect(puffFade(0, size)).toBe(0);
    expect(puffFade(size * 0.15, size)).toBe(0);
    expect(puffFade(size * 0.5 * 1.05, size)).toBeCloseTo(1, 3);
    let prev = -1; for (let d = 0; d <= size; d += 2) { const f = puffFade(d, size); expect(f).toBeGreaterThanOrEqual(prev - 1e-9); prev = f; }
  });
  it('and out to nothing far away, where the fog already has it', () => { expect(puffFade(1500, 80)).toBe(0); expect(puffFade(300, 80)).toBe(1); });
  it('the camera is deepest in the heart of a puff and out at its radius', () => {
    expect(insideCloud(0, 80)).toBe(1); expect(insideCloud(40, 80)).toBe(0); expect(insideCloud(100, 80)).toBe(0);
    expect(insideCloud(20, 80)).toBeGreaterThan(insideCloud(30, 80));
  });
  it('the air thickens with depth: a veil at the heart, nothing at the edge', () => {
    expect(fogPulse(0)).toEqual({ densityMul: 1, tint: 0 });
    // test changed (owner 2026-10-14 "Soften it", halved): was densityMul in (3.5, 4.5) and tint in (0.5, 0.7) - ~60 m of sight, which sank the
    // next ring to 4-8 % on three courses (see 'the next ring never disappears' below). Now 2.5x and 0.3: still a visible thickening.
    expect(fogPulse(1).densityMul).toBeCloseTo(2.5, 6);
    expect(fogPulse(1).tint).toBeCloseTo(0.3, 6);
    expect(fogPulse(0.5).densityMul).toBeLessThan(fogPulse(1).densityMul);
    expect(fogPulse(9).densityMul).toBe(fogPulse(1).densityMul);
  });
});

describe('the cloud fly-through never takes the next ring (owner 2026-10-14: soften it, the clouds still read)', () => {
  const sights = allCloudSights();
  it('measures every Aero course, with real cloud on each lap', () => {
    expect(sights.length).toBe(circuits.length);
    for (const s of sights) { expect(s.metresInCloud).toBeGreaterThan(200); expect(s.farthestRing).toBeGreaterThan(100); }
  });
  it('the next ring keeps at least a quarter of its colour from the deepest cloud, on every course', () => {
    // 0.25 is the floor: the ring still carries a clear contrast against the haze. Before the halving the worst were 0.04 (caldera), 0.06 (city), 0.08 (canyon).
    for (const s of sights) expect(s.worstRing.transmittance, `${s.id} at ${s.worstRing.metres.toFixed(0)} m`).toBeGreaterThanOrEqual(0.25);
  });
  it('and the clouds still read: the heart of a bank at least halves the open air\'s sight (measured 83-139 m against 245-347 m)', () => {
    for (const s of sights) expect(s.halfSightAtHeart).toBeLessThan((Math.sqrt(Math.LN2) / s.rho) * 0.5);   // at least a doubling of density
  });
});

describe('skimRate', () => {
  it('is none above the skim height, and none when slow', () => {
    expect(skimRate(SKIM_AGL, 1, 'desktop', false)).toBe(0);
    expect(skimRate(SKIM_AGL + 5, 1, 'desktop', false)).toBe(0);
    expect(skimRate(3, 0.2, 'desktop', false)).toBe(0);
  });
  it('grows as the plane comes down and as it goes faster', () => {
    expect(skimRate(2, 1, 'desktop', false)).toBeGreaterThan(skimRate(8, 1, 'desktop', false));
    expect(skimRate(3, 1, 'desktop', false)).toBeGreaterThan(skimRate(3, 0.4, 'desktop', false));
    expect(skimRate(0, 1, 'desktop', false)).toBeGreaterThan(300);
    expect(skimRate(SKIM_AGL / 2, 1, 'desktop', false)).toBeGreaterThan(60);   // the island's own racing line (6 m) throws a visible plume
  });
  it('a phone gets 40 %, reduced motion a third of that', () => {
    const d = skimRate(2, 1, 'desktop', false);
    expect(skimRate(2, 1, 'mobile', false)).toBeCloseTo(d * 0.4, -1);
    expect(skimRate(2, 1, 'desktop', true)).toBeCloseTo(d * 0.33, -1);
  });
  it('the island\'s own racing line dips into the skim band (the spray is part of the lap, not only of a dive)', () => {
    const c = by('island'); let low = 0;
    for (let d = 0; d < c.line.length; d += 6) if (pointAlong(c.line, d).pos.y - SURFACE_Y < SKIM_AGL) low++;
    expect(low).toBeGreaterThan(0);
  });
});

describe('lava glow', () => {
  it('is none off the lake and out of reach; full when low; falling off smoothly', () => {
    expect(lavaGlow(2, false)).toBe(0);
    expect(lavaGlow(LAVA_REACH, true)).toBe(0);
    expect(lavaGlow(0, true)).toBe(1);
    let prev = 2; for (let a = 0; a <= LAVA_REACH; a += 2) { const g = lavaGlow(a, true); expect(g).toBeLessThanOrEqual(prev + 1e-9); prev = g; }
  });
  it('the world\'s underlight rests at its authored 0.8 and about doubles at full', () => {
    expect(underlightFor(0)).toBe(UNDERLIGHT_REST);
    expect(underlightFor(1)).toBeGreaterThan(1.6);
    expect(underlightFor(9)).toBe(underlightFor(1));
  });
});

describe('overLiquid / lavaNear read the circuits\' own ground', () => {
  const wetOnLine = (theme: string) => { const c = by(theme); const out: { x: number; z: number }[] = []; for (let d = 0; d < c.line.length; d += 10) { const p = pointAlong(c.line, d).pos; if (overLiquid(theme as 'volcano', c.floorAt, p.x, p.z)) out.push({ x: p.x, z: p.z }); } return out; };
  it('the city\'s bay and the caldera\'s lake are liquid; the canyon and the glacier are never', () => {
    expect(overLiquid('city', by('city').floorAt, 0, 0)).toBe(true);   // (a tower plinth stands somewhere else)
    expect(wetOnLine('city').length).toBeGreaterThan(100);
    expect(wetOnLine('volcano').length).toBeGreaterThan(5);            // the lap crosses the lava
    expect(overLiquid('volcano', by('volcano').floorAt, 600, 600)).toBe(false);
    expect(wetOnLine('canyon').length).toBe(0); expect(wetOnLine('glacier').length).toBe(0);
  });
  it('the island\'s sea reads as liquid wherever the terrain grid puts the seabed', () => {
    const c = by('island'); let wet = 0, dry = 0;
    for (let x = -400; x <= 400; x += 25) for (let z = -400; z <= 400; z += 25) overLiquid('island', c.floorAt, x, z) ? wet++ : dry++;
    expect(wet).toBeGreaterThan(50); expect(dry).toBeGreaterThan(50);
  });
  it('lavaNear is the lake\'s share round the plane, only on the caldera', () => {
    const v = by('volcano'); const wet = wetOnLine('volcano');
    expect(Math.max(...wet.map((p) => lavaNear('volcano', v.floorAt, p.x, p.z)))).toBeGreaterThanOrEqual(0.4);
    expect(lavaNear('volcano', v.floorAt, 600, 600)).toBe(0);
    expect(lavaNear('canyon', by('canyon').floorAt, 0, 0)).toBe(0);
    let shore = 0; for (let x = -300; x <= 300; x += 10) for (let z = -300; z <= 300; z += 30) { const k = lavaNear('volcano', v.floorAt, x, z); if (k > 0 && k < 1) shore++; }
    expect(shore).toBeGreaterThan(0);   // a shore: some of the samples, not all
  });
});

describe('the mount (NullEngine)', () => {
  const flight = { x: 0, y: 6, z: 0, heading: 0.4, speed01: 1 };
  it('builds, updates, flares a ring, and disposes everything it made', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const before = { m: scene.meshes.length, ps: scene.particleSystems.length, mat: scene.materials.length };
    const at = mountAeroAtmos(scene, by('island'), { tier: 'desktop' });
    expect(at.stats.puffs).toBe(54);
    for (let i = 0; i < 5; i++) at.update(1 / 60, flight, null);
    expect(at.stats.spraying).toBe(false);   // (0, 6, 0) is an island: the sea at the origin? not asserted - the rate is held above
    at.ringPass(flight); at.update(1 / 60, flight, null);
    expect(at.stats.ringsLive).toBe(1);
    for (let i = 0; i < 60; i++) at.update(1 / 60, flight, null);
    expect(at.stats.ringsLive).toBe(0);
    at.dispose();
    expect(scene.meshes.length).toBe(before.m); expect(scene.particleSystems.length).toBe(before.ps);
  });
  it('the caldera registers a heat source and takes it away; the others register none', () => {
    device(false);
    const s1 = new Scene(new NullEngine()), s2 = new Scene(new NullEngine());
    const hot = mountAeroAtmos(s1, by('volcano')); mountAeroAtmos(s2, by('canyon'));
    expect(heatRegistry(s1).sources.length).toBe(1);
    expect(heatRegistry(s2).sources.length).toBe(0);
    hot.dispose();
    expect(heatRegistry(s1).sources.length).toBe(0);
  });
  it('over the lake the glow and the haze come up, and hand the world its underlight', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const seen: number[] = [];
    const at = mountAeroAtmos(scene, by('volcano'), { setLavaGlow: (k) => seen.push(k) });
    const v = by('volcano'); let lake = { x: 0, z: 0 }; let best = 0;
    for (let d = 0; d < v.line.length; d += 10) { const p = pointAlong(v.line, d).pos; const k = lavaNear('volcano', v.floorAt, p.x, p.z); if (k > best) { best = k; lake = { x: p.x, z: p.z }; } }
    at.update(1 / 60, { x: lake.x, y: 8, z: lake.z, heading: 0, speed01: 0.5 }, null);
    expect(at.stats.lava).toBeGreaterThan(0.4);
    expect(heatRegistry(scene).sources[0].strength).toBeGreaterThan(0.4);
    at.update(1 / 60, { x: 600, y: 8, z: 600, heading: 0, speed01: 0.5 }, null);
    expect(at.stats.lava).toBe(0);
    expect(heatRegistry(scene).sources[0].strength).toBe(0);
    expect(seen.length).toBe(2);
  });
  it('a phone gets no sprites and no spray (mobileBudget.json holds aeroaces at 0 live particles), and keeps the ring and the lava', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const before = scene.particleSystems.length;
    const hot = mountAeroAtmos(scene, by('volcano'), { tier: 'mobile' });
    expect(scene.particleSystems.length).toBe(before);   // not one particle system
    expect(hot.stats.puffs).toBe(0);
    expect(heatRegistry(scene).sources.length).toBe(1);  // the lava's haze source still registers (the pass itself is not mounted on a phone)
    const v = by('volcano'); let lake = { x: 0, z: 0 }, best = 0;
    for (let d = 0; d < v.line.length; d += 10) { const p = pointAlong(v.line, d).pos; const k = lavaNear('volcano', v.floorAt, p.x, p.z); if (k > best) { best = k; lake = { x: p.x, z: p.z }; } }
    hot.update(1 / 60, { x: lake.x, y: 3, z: lake.z, heading: 0, speed01: 1 }, null);
    expect(hot.stats.lava).toBeGreaterThan(0.4);          // the glow still comes up
    expect(hot.stats.spraying).toBe(false);               // and nothing sprays
    hot.ringPass({ x: 0, y: 6, z: 0, heading: 0, speed01: 1 }); hot.update(1 / 60, flight, null);
    expect(hot.stats.ringsLive).toBe(1);                  // the ring stays
    hot.dispose();
    const dt = mountAeroAtmos(scene, by('canyon'), { tier: 'desktop' });
    expect(scene.particleSystems.length).toBe(before + 2); // desktop: the clouds and the spray
    dt.dispose();
    expect(scene.particleSystems.length).toBe(before);
  });
  it('reduced motion: the ring does not flare', () => {
    device(true);
    const scene = new Scene(new NullEngine());
    const at = mountAeroAtmos(scene, by('canyon'));
    at.ringPass(flight); at.update(1 / 60, flight, null);
    expect(at.stats.ringsLive).toBe(0);
  });
});

describe('wired in, and presentation only', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  it('the mode mounts it after the rivals, updates it with the world, flares it at a gate, and disposes it', () => {
    const s = read('../modes/AeroAcesMode.ts');
    expect(s).toMatch(/atmos\?\.dispose\(\); atmos = mountAeroAtmos\(ctx\.scene, circuit, \{ tier: ctx\.lights\.tier, setLavaGlow: \(k\) => world\?\.setLavaGlow\(k\) \}\);/);
    expect(s).toMatch(/world\?\.update\(dt, ctx\.camera\);\n\s*atmos\?\.update\(dt, \{ x: flight\.pos\.x/);
    expect(s).toMatch(/if \(res\.gate\) atmos\?\.ringPass\(/);
    expect(s).toMatch(/atmos\?\.dispose\(\); atmos = null;\n\s*world\?\.dispose\(\); world = null;/);
  });
  it('the world hands its underlight over', () => {
    expect(read('./aeroWorlds.ts')).toContain('setLavaGlow(k) { if (underlight) underlight.intensity = underlightFor(k); },');
  });
  it('the shadow rig never casts its meshes (a ring of light is not a body)', () => {
    expect(read("../scene/LightRig.ts")).toMatch(/\|fr_shock_\|aero_fx_[|)]/);
  });
  it('imports nothing that flies, races, scores, boosts or tunes', () => {
    const imports = [...read('./aeroAtmos.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set(imports)].sort()).toEqual(['../../a11y/reducedMotion', '../scene/HeatHaze', '../visual/ShockRing', './aeroCircuits', '@babylonjs/core']);
  });
});
