// vis-board (wave 2) — the snow's pieces: the Night Park's lamps, the gate flash, the sparkle's tier and mood rules.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { GATE_EVERY, LAMP_H, buildSlopeLamps, lampSpots, lampsForTier } from './slopeLamps';
import { FLASH_POOL, FLASH_SEC, GateFlash, flashAlpha } from './GateFlash';
import { GLINT_BY_MOOD, SHADE_BY_MOOD, sparkleWanted, applySnowSparkle } from './SnowSparkle';
import { fixtureRole } from '../scene/FixtureLights';
import { glowCandidate } from '../scene/EmissiveGlow';
import { MOODS } from '../scene/moods';

const scene = () => { const sc = new Scene(new NullEngine()); new FreeCamera('cam', new Vector3(0, 3, -6), sc); return sc; };
const markers = Array.from({ length: 30 }, (_, i) => new Vector3(i % 2 ? 4 : -4, -i * 4, 18 + i * 20));

describe('the Night Park lamps', () => {
  it('a pole each side every few gates, outside the rider\'s clamp, on the snow under the gate', () => {
    const s = lampSpots(markers, 20);
    expect(s).toHaveLength(Math.ceil(30 / GATE_EVERY) * 2);
    for (const p of s) { expect(Math.abs(p.x)).toBe(22); expect(p.y).toBe(markers[p.gate].y); expect(p.z).toBe(markers[p.gate].z); }
    expect(new Set(s.map((p) => p.side))).toEqual(new Set([-1, 1]));
  });
  it('a phone stands every other pole', () => {
    const all = lampSpots(markers, 20);
    expect(lampsForTier(all, 'mobile').length).toBe(all.length / 2);
    expect(lampsForTier(all, 'desktop')).toHaveLength(all.length);
  });
  it('every head is a lamp the shared rig lights and glows; the pole and the rest are not', () => {
    const sc = scene();
    const made = buildSlopeLamps(sc, markers, 20, 'desktop');
    const heads = made.filter((m) => m.name.startsWith('lhead_'));
    expect(heads).toHaveLength(lampSpots(markers, 20).length);
    const spots = lampSpots(markers, 20);
    heads.forEach((h, i) => { expect(fixtureRole(h.name, h.material?.name)).toBe('lamp'); expect(glowCandidate(h.name, h.material?.name, 0.9, false)).toBe(true); expect(h.position.y).toBeCloseTo(spots[i].y + LAMP_H + 0.05, 5); });
    const pole = made.find((m) => m.name === 'slope_lamp_pole')!;
    expect(fixtureRole(pole.name, pole.material?.name)).toBeNull();
    expect(pole.thinInstanceCount).toBe(heads.length);
    expect(made.every((m) => !m.isPickable)).toBe(true);
  });
});

describe('the gate flash', () => {
  it('lights at once, falls fast then slowly, and is gone at its end', () => {
    expect(flashAlpha(-0.1)).toBe(0);
    expect(flashAlpha(0.06 * FLASH_SEC)).toBeGreaterThan(flashAlpha(0.5 * FLASH_SEC));
    expect(flashAlpha(0.5 * FLASH_SEC)).toBeGreaterThan(flashAlpha(0.9 * FLASH_SEC));
    expect(flashAlpha(FLASH_SEC)).toBe(0);
    expect(flashAlpha(0)).toBe(0);   // it fades UP from nothing in the first few frames, never pops
  });
  it('a pool of a few: the oldest is reused, each ends by itself, and dispose takes them all', () => {
    const sc = scene();
    const f = new GateFlash(sc);
    for (let i = 0; i < FLASH_POOL + 2; i++) f.fire(0, 0, i * 20, 3.8, '#34d399');
    expect(f.live).toBe(FLASH_POOL);
    expect(sc.meshes.filter((m) => m.name.startsWith('gate_flash_')).length).toBe(FLASH_POOL);
    for (let i = 0; i < 40; i++) f.update(1 / 60);
    expect(f.live).toBe(0);
    expect(sc.meshes.filter((m) => m.name.startsWith('gate_flash_') && m.isEnabled())).toHaveLength(0);
    f.dispose();
    expect(sc.meshes.filter((m) => m.name.startsWith('gate_flash_'))).toHaveLength(0);
  });
});

describe('the snow sparkle', () => {
  it('desktop and high only', () => {
    expect(sparkleWanted('mobile')).toBe(false); expect(sparkleWanted('desktop')).toBe(true); expect(sparkleWanted('high')).toBe(true); expect(sparkleWanted(undefined)).toBe(false);
    expect(applySnowSparkle(scene(), [], 'alpine', 'mobile')).toBeNull();
  });
  it('the sun makes it: a clear day glints, a flat or a night sky barely', () => {
    for (const m of Object.keys(MOODS) as (keyof typeof MOODS)[]) { expect(GLINT_BY_MOOD[m]).toBeGreaterThanOrEqual(0); expect(SHADE_BY_MOOD[m]).toBeGreaterThanOrEqual(0); expect(GLINT_BY_MOOD[m]).toBeLessThanOrEqual(1); }
    expect(GLINT_BY_MOOD.alpine).toBeGreaterThan(GLINT_BY_MOOD.overcast);
    expect(GLINT_BY_MOOD.alpine).toBeGreaterThan(GLINT_BY_MOOD.nightGame);
    expect(GLINT_BY_MOOD.indoorArena).toBe(0);
  });
});
