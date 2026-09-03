import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, PBRMaterial, Scene, StandardMaterial } from '@babylonjs/core';
import { applySkinShading } from './skinShading';

function scene(): Scene {
  return new Scene(new NullEngine());
}

describe('applySkinShading', () => {
  it('turns a PBR skin material into a translucent, rougher skin and counts it', () => {
    const s = scene();
    const skin = new PBRMaterial('skin', s);
    const m = MeshBuilder.CreateBox('Body_primitive0', {}, s); m.material = skin;
    const r = applySkinShading([m], s, 'mobile');
    expect(r).toEqual({ skin: 1, cloth: 0, other: 0 });
    expect(skin.subSurface.isTranslucencyEnabled).toBe(true);
    expect(skin.subSurface.translucencyIntensity).toBeCloseTo(0.35);
    expect(skin.roughness).toBeCloseTo(0.58);
    expect(skin.metallic).toBe(0);
  });
  it('desktop tier asks for more translucency and never throws without a canvas', () => {
    const s = scene();
    const skin = new PBRMaterial('skin', s);
    const m = MeshBuilder.CreateBox('b', {}, s); m.material = skin;
    expect(() => applySkinShading([m], s, 'desktop')).not.toThrow();
    expect(skin.subSurface.translucencyIntensity).toBeCloseTo(0.55);
  });
  it('gives jersey and shorts a cloth sheen, darkens shoes, ignores unknown names', () => {
    const s = scene();
    const mk = (n: string) => { const mat = new PBRMaterial(n, s); const m = MeshBuilder.CreateBox(n, {}, s); m.material = mat; return { mat, m }; };
    const j = mk('jersey'), sh = mk('shorts'), shoes = mk('shoes'), prop = mk('ball');
    const before = shoes.mat.albedoColor.r;
    const r = applySkinShading([j.m, sh.m, shoes.m, prop.m], s, 'mobile');
    expect(r).toEqual({ skin: 0, cloth: 2, other: 1 });
    expect(j.mat.sheen.isEnabled).toBe(true);
    expect(shoes.mat.albedoColor.r).toBeLessThan(before);
    expect(prop.mat.sheen.isEnabled).toBe(false);
  });
  it('ignores StandardMaterial (the procedural body) entirely', () => {
    const s = scene();
    const m = MeshBuilder.CreateBox('skin_procAthlete_p1', {}, s); m.material = new StandardMaterial('skin_procAthlete_p1', s);
    expect(applySkinShading([m], s)).toEqual({ skin: 0, cloth: 0, other: 0 });
  });
  it('is idempotent across a shared material', () => {
    const s = scene();
    const skin = new PBRMaterial('skin', s);
    const a = MeshBuilder.CreateBox('a', {}, s); a.material = skin;
    const b = MeshBuilder.CreateBox('b', {}, s); b.material = skin;
    expect(applySkinShading([a, b], s, 'mobile').skin).toBe(1);
    expect(applySkinShading([a, b], s, 'mobile').skin).toBe(1);
  });
});
