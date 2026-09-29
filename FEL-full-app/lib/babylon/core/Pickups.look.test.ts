// SKATE-SCORE (SK-6, 2026-09-29): the "olive dot particles" over the plaza were the skate coins — the shared metal coin,
// dark olive in Venice's golden-hour haze. Skate asks for its own look; every other field keeps the coin it had.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene, Vector3, type PBRMaterial } from '@babylonjs/core';
import { CoinField, COIN_LOOK_DEFAULT } from './Pickups';
import { SKATE_COIN_LOOK } from '../modes/skatePlaza';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

function built(look?: ConstructorParameters<typeof CoinField>[1]): { diameter: number; mat: PBRMaterial } {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const field = new CoinField(scene, look);
  field.line(new Vector3(-2, 0.4, 0), new Vector3(2, 0.4, 0), 3);
  field.update(1 / 60, new Vector3(0, 0, -50));
  const coin = scene.getMeshByName('coin')!;
  // the disc's own geometry (the master's bounding box may be refreshed to span its thin instances)
  const pos = coin.getVerticesData('position')!;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { lo = Math.min(lo, pos[i]); hi = Math.max(hi, pos[i]); }
  return { diameter: hi - lo, mat: coin.material as PBRMaterial };
}

describe('SK-6: the coin look', () => {
  it('a field with no look is the coin every mode had: 0.34 m, metal 0.9, glow 0.22 of the gold', () => {
    expect(COIN_LOOK_DEFAULT).toEqual({ diameter: 0.34, glow: 0.22, metallic: 0.9 });
    const { diameter, mat } = built();
    expect(diameter).toBeCloseTo(0.34, 3);
    expect(mat.metallic).toBe(0.9);
    expect(mat.emissiveColor.r / mat.albedoColor.r).toBeCloseTo(0.22, 6);
  });
  it('the skate plaza\'s coin is bigger, less mirror and more self-lit, so it reads as gold across the park', () => {
    const { diameter, mat } = built(SKATE_COIN_LOOK);
    expect(diameter).toBeCloseTo(SKATE_COIN_LOOK.diameter!, 3);
    expect(SKATE_COIN_LOOK.diameter!).toBeGreaterThan(COIN_LOOK_DEFAULT.diameter);
    expect(mat.metallic).toBe(SKATE_COIN_LOOK.metallic);
    expect(SKATE_COIN_LOOK.metallic!).toBeLessThan(COIN_LOOK_DEFAULT.metallic);
    expect(mat.emissiveColor.r / mat.albedoColor.r).toBeCloseTo(SKATE_COIN_LOOK.glow!, 6);
    expect(SKATE_COIN_LOOK.glow!).toBeGreaterThan(COIN_LOOK_DEFAULT.glow);
  });
  it('only skate asks for it: every other CoinField is built with the default look', () => {
    const skate = readFileSync(path.join(__dirname, '../modes/SkateRunMode.ts'), 'utf8');
    expect(skate).toContain('new CoinField(ctx.scene, SKATE_COIN_LOOK)');
    for (const f of ['../modes/BoardRunMode.ts', '../modes/carnivalEvents.ts', '../modes/FootballRushMode.ts']) {
      const src = readFileSync(path.join(__dirname, f), 'utf8');
      expect(src, f).toMatch(/new CoinField\(ctx\.scene\);/);
    }
  });
});
