import { describe, it, expect } from 'vitest';
import { NullEngine, Scene, FreeCamera, Vector3, PBRMaterial } from '@babylonjs/core';
import { mountOcean, oceanShade, DEFAULT_OCEAN_WAVES } from './OceanSurface';

const scene = () => { const s = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 3, -20), s); return s; };

describe('OceanSurface — a living sea that stays a sea', () => {
  it('the swell is a real swell but never a storm: total amplitude under a metre', () => {
    const amp = DEFAULT_OCEAN_WAVES.reduce((a, w) => a + w.steep / ((2 * Math.PI) / w.length), 0);
    expect(amp).toBeGreaterThan(0.6); expect(amp).toBeLessThan(1.1);
  });

  it('the height moves with time, calms to the shore, and is flat past it', () => {
    const s = scene();
    const o = mountOcean(s, { deep: '#1f6f6b', foam: '#ffffff', horizon: '#8fd6cf', shoreZ: 120 });
    const cam = s.activeCamera!;
    const a = o.heightAt(5, -40);
    o.update(0.5, cam);
    const b = o.heightAt(5, -40);
    expect(Math.abs(a - b)).toBeGreaterThan(0.001);
    for (let z = -200; z < 60; z += 7) expect(Math.abs(o.heightAt(3, z) + 0.08)).toBeLessThan(1.2);
    expect(o.heightAt(3, 125)).toBeCloseTo(-0.08, 5);             // past the shore: the sea is under the sand
    o.dispose(); s.dispose();
  });

  // IMPROVE (2026-10-06, surf item 5): the pocket and the whitewater are painted into the face by local z (oceanShade `bands`)
  it('a band is opt-in: only a surface given bands compiles the band code, and the code is well formed', () => {
    const s = scene();
    const opts = { foam: '#ffffff', horizon: '#8fd6cf', shoreZ: 120 };
    type P = { prepareDefines(d: Record<string, unknown>): void; getCustomCode(t: string): Record<string, string> | null };
    const pluginOf = (m: PBRMaterial) => m.pluginManager!.getPlugin('FELOcean') as unknown as P;
    const banded = new PBRMaterial('banded', s);
    oceanShade(banded, { ...opts, bands: [{ from: 9, to: 1, color: '#ff0000', mix: 0.16 }, { from: -3.4, to: -0.9, color: '#ffffff', mix: 0.5, chop: 0.8 }] });
    const plain = new PBRMaterial('plain', s);
    oceanShade(plain, opts);
    const d1: Record<string, unknown> = {}, d2: Record<string, unknown> = {};
    pluginOf(banded).prepareDefines(d1); pluginOf(plain).prepareDefines(d2);
    expect(d1).toMatchObject({ FEL_OCEAN: true, FEL_OCEAN_BAND: true });
    expect(d2).toMatchObject({ FEL_OCEAN: true, FEL_OCEAN_BAND: false });
    const v = pluginOf(banded).getCustomCode('vertex')!, f = pluginOf(banded).getCustomCode('fragment')!;
    expect(v.CUSTOM_VERTEX_DEFINITIONS).toContain('varying float vFelLocalZ;');
    expect(f.CUSTOM_FRAGMENT_DEFINITIONS).toContain('varying float vFelLocalZ;');
    expect(v.CUSTOM_VERTEX_UPDATE_POSITION).toContain('vFelLocalZ = positionUpdated.z;');
    expect(f.CUSTOM_FRAGMENT_UPDATE_ALPHA).toContain('felBandIn(felBandA, vFelLocalZ)');
    for (const code of [...Object.values(v), ...Object.values(f)]) {
      const n = (re: RegExp) => (code.match(re) ?? []).length;
      expect(n(/\{/g)).toBe(n(/\}/g));
      expect(n(/\(/g)).toBe(n(/\)/g));
      expect(n(/#ifdef /g)).toBe(n(/#endif/g));
    }
    s.dispose();
  });

  it('the near grid follows the camera in whole cells, and never walks up the beach', () => {
    const s = scene();
    const o = mountOcean(s, { deep: '#1f6f6b', foam: '#ffffff', horizon: '#8fd6cf', shoreZ: 120 });
    const cam = s.activeCamera!;
    cam.position.set(13.3, 3, 57.1); o.update(1 / 60, cam);
    expect(o.near.position.x % 2).toBeCloseTo(0, 5);
    cam.position.set(0, 3, 400); o.update(1 / 60, cam);
    expect(o.near.position.z).toBeLessThanOrEqual(120);
    o.dispose(); s.dispose();
  });
});
