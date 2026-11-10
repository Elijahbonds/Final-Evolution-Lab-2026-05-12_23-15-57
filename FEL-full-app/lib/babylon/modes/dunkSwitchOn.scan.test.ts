// DUNK SWITCH-ON (owner 2026-11-10, "turn all 4 on"): the landing and the run-up switches, as DunkMode wires them. Each OFF value
// restores the old behaviour exactly; the play-changing switches (slam variants, over-the-ring) are pinned in DunkSlamVariant.test,
// DunkOverRing.test and DunkUnlocks.verifiedJump.test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LAND_ABSORB_DEEP, LAND_ABSORB_MIN_MPS, RUNWAY_STRIDE_SCALE } from '../core/DunkFlagship';
import { LAND_ABSORB_DEEP_CLIP } from '../anim/authored/dunkLandAbsorb';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };

describe('the deep landing (dunk.landAbsorbDeep)', () => {
  it('is ON by default; off plays the landing clip exactly as before, with no leg absorb', () => {
    expect(LAND_ABSORB_DEEP).toBe(1);
    const land = fn('landNow');
    // the swap only ever replaces the old absorb clip, and only with the knob on
    expect(land).toContain("const deep = landingClip === DUNK_LAND_ABSORB_CLIP && feel('dunk.landAbsorbDeep', LAND_ABSORB_DEEP) >= 0.5;");
    expect(land).toContain('const clip = deep ? LAND_ABSORB_DEEP_CLIP : landingClip;');
    expect(land).toMatch(/if \(deep && ikScene && player\) \{ landAbsorb \?\?= mountLandingAbsorb\(ikScene, player\.skeleton, player\.root, \{ auto: false, intensity: LAND_ABSORB_INTENSITY \}\); landAbsorb\.impact\(Math\.max\(dropVy, LAND_ABSORB_MIN_MPS\)\); \}/);
    expect(land).toContain("playClip(clip, { ...(fadeSec !== undefined ? { fadeSec } : {}), onEnd: () => { playClip(SPORT_CLIP.idle, { loop: true }); setWin('run'); } });");
    expect(DUNK.split('mountLandingAbsorb(').length - 1).toBe(1);   // mounted nowhere else: off, nothing new runs on the legs
    expect(LAND_ABSORB_DEEP_CLIP).toBe('dunk_land_absorb_deep');
    expect(LAND_ABSORB_MIN_MPS).toBeGreaterThan(2.6);   // past the absorb's free speed (anim/LandingAbsorb ABSORB.freeMps): a rim landing always sinks
    const reg = readFileSync(path.join(__dirname, '../anim/clipRegistry.ts'), 'utf8');
    expect(reg).toContain("'dunk_land_absorb_deep'");
  });
});

describe('the run-up stride (dunk.runwayStrideScale)', () => {
  it('TUNED 1 → 1.1 (owner 2026-11-10); the knob at 1 is the old pace', () => {
    expect(RUNWAY_STRIDE_SCALE).toBe(1.1);
    expect(DUNK).toContain("mps / (RUNWAY_STRIDE_MPS * feel('dunk.runwayStrideScale', RUNWAY_STRIDE_SCALE))");
  });
});
