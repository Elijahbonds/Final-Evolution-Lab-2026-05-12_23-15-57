// The five combat modes are wired to the visual pass (lane/vis-combat, 2026-10-13): a source scan, the way the *.improve tests hold
// the owner's IMPROVE items — a refactor that drops a mount, a tick or a dispose fails here, not on the owner's TV.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MODES = path.resolve(__dirname, '../modes');
const src = (f: string): string => readFileSync(path.join(MODES, f), 'utf8');
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const FILES = ['KarateEndlessMode.ts', 'KarateVSMode.ts', 'ShowdownMode.ts', 'DuelMode.ts', 'MixedCombatMode.ts'] as const;

describe('every combat mode mounts, ticks and disposes the visual pass', () => {
  for (const f of FILES) {
    it(`${f}: one mount at load, a tick every frame, a dispose, and the hits go through it`, () => {
      const s = src(f);
      expect(count(s, /mountCombatFx\(ctx\.scene\)/g), 'one mountCombatFx').toBe(1);
      expect(count(s, /mountPresentation\(ctx\.scene, ctx\.lights\?\.pipeline\)/g), 'one mountPresentation').toBe(1);
      expect(s, 'fx ticks').toMatch(/fx\?\.tick\(/);
      expect(s, 'fx disposes').toMatch(/fx\?\.dispose\(\); fx = null/);
      expect(s, 'presentation disposes').toMatch(/pres\?\.dispose\(\); pres = null/);
      expect(count(s, /\bfx\.hit\(|\bfx\?\.hit\(/g), 'hit sites').toBeGreaterThanOrEqual(f === 'KarateEndlessMode.ts' ? 2 : 3);   // (the Horde has two: a body hit, a blow taken)
      expect(s, 'an aura is driven').toMatch(/fx\??\.aura\('me'/);
    });
  }
  it('Karate VS and Mixed Combat tick the arena in every phase (it ticked only in the fight), and not twice', () => {
    for (const f of ['KarateVSMode.ts', 'MixedCombatMode.ts']) expect(count(src(f), /arenaHandle\?\.tick\(/g), f).toBe(1);
    expect(src('KarateVSMode.ts')).toMatch(/fx\?\.tick\(dt\); arenaHandle\?\.tick\(dt\);/);
  });
  it('the Duel ticks its arena now (it never did: the cage\'s rope glow and the pit\'s flicker were frozen)', () => {
    expect(src('DuelMode.ts')).toMatch(/fx\?\.tick\(dt\); arenaHandle\?\.tick\(dt\);/);
  });
});

describe('what each mode does with it', () => {
  it('Karate VS and Mixed: the DRAGON is a super beat (grade, speed lines, impact frame); parry / guard / break read apart', () => {
    for (const f of ['KarateVSMode.ts', 'MixedCombatMode.ts']) {
      const s = src(f);
      expect(s, f).toMatch(/function dragonBeat\(/);
      expect(s, f).toMatch(/if \(special\) dragonBeat\(/);
      for (const k of ["'parry'", "'guard'", "'break'"]) expect(s, `${f} ${k}`).toContain(k);
    }
  });
  it('Showdown: the ultimate swings the grade, the partner blinks in, a slam cracks the floor, the gate is a door that breaks into timber', () => {
    const s = src('ShowdownMode.ts');
    expect(s).toMatch(/pres\?\.grade\(by === 'me' \? 'gold' : 'crimson'/);
    expect(s).toMatch(/fx\?\.blink\(blinkFrom/);
    expect(s).toMatch(/fx\.slam\(/);
    expect(s).toMatch(/gateMaterial\(ctx\.scene, arena\)/);
    expect(s).toMatch(/fx\?\.debris\(/);
    expect(s, 'the gate is not a StandardMaterial any more').not.toMatch(/new StandardMaterial/);
  });
  it('Duel and Mixed: a weapon streaks in each fighter\'s colour; a ring-out is a plume and a slow fall', () => {
    const d = src('DuelMode.ts'), m = src('MixedCombatMode.ts');
    expect(count(d, /mountWeaponTrail\(/g)).toBe(2);
    expect(count(m, /mountWeaponTrail\(/g)).toBe(2);
    expect(d).toMatch(/how === 'ringout'[\s\S]{0,300}fx\?\.puff[\s\S]{0,200}slowMo\(0\.5, 700\)/);
    expect(m).toMatch(/fx\?\.puff\(victim[\s\S]{0,300}slowMo\(0\.5, 700\)/);
  });
  it('Karate Endless: a materialising agent rings the floor; HUD and pickup meshes cast no shadow', () => {
    const s = src('KarateEndlessMode.ts');
    expect(s).toMatch(/fx\?\.ring\(pos, 1\.5/);
    expect(count(s, /uncastShadow\(/g), 'bar, cue, arrow, pickup, shock ring').toBeGreaterThanOrEqual(5);
  });
});

describe('visual only: no play-camera call and no feel number came with the pass', () => {
  it('no new camera director call in any mode file (setFixed / setPreset / snapTo counts are what the lane found)', () => {
    // counts measured at the lane's base (d607bd3a); a visual pass adds none. A mode that needs a cinematic camera routes to the broadcast kit.
    const base: Record<string, number> = { 'KarateEndlessMode.ts': 1, 'KarateVSMode.ts': 1, 'ShowdownMode.ts': 4, 'DuelMode.ts': 1, 'MixedCombatMode.ts': 1 };
    for (const f of FILES) expect(count(src(f), /camDirector\.(setFixed|setPreset|snapTo)\(/g), f).toBeLessThanOrEqual(base[f]);
  });
});
