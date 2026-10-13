// vis-hoops-dunk — the wiring guard. The hoops visual modules are PRESENTATION: they take numbers a mode already has (a slam's
// accuracy, a streak, a judge's card, the totals) and draw. None of them may import anything that scores, judges, grades, times or
// tunes — a ring of light that could change a result would be a gameplay change inside a visual pass.
//
// Also pinned, because they are this lane's promises and are checked nowhere else:
//   · the lane lifted the look hold for exactly dunk, dunkduel and threepoint (the court modes stay held for their own lane);
//   · the modes' own replay (dunk's triple cut) and 3-Point's corner camera and tree fade are still wired;
//   · the visual calls in the three modes sit on state they only READ (no assignment from a hoops handle into the mode's state).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WAVE2_HELD_MODES, wave2Look } from '../scene/lookPolicy';

const ROOT = join(__dirname, '..', '..', '..');   // FEL-full-app/
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const importsOf = (src: string): string[] => [...src.matchAll(/^\s*import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

const HOOPS_DIR = 'lib/babylon/hoops';
const VISUAL_FILES = readdirSync(join(ROOT, HOOPS_DIR)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => `${HOOPS_DIR}/${f}`);

/** Modules that score, judge, grade, time, pay or tune: a presentation file importing one is wired into gameplay. */
const FORBIDDEN = /(?:^|\/)(?:JudgePanel|DunkSystem|DunkStakes|DunkField|DunkRivalSim|DunkRivals|DunkChallenges|DunkUnlocks|DunkOriginality|DunkBeats|ContinuousNight|DunkCard|dunkDuelRules|modeConfigs|threePointRules|shootoutHud|RimDecides|BallPhysics|ShotMeter|CourtMovement|CameraDirector|ModeHarness|InputBus|gameFeel|MomentumBus|SoundKit|sessionStore|prq|policies)(?:\.\w+)?$|\/modes\/|\/lib\/sessions\//;

describe('the hoops visual modules import nothing that scores, judges, times or tunes', () => {
  it('there are modules to guard', () => { expect(VISUAL_FILES.length).toBeGreaterThanOrEqual(10); });
  for (const f of VISUAL_FILES) {
    it(f, () => {
      const bad = importsOf(read(f)).filter((i) => FORBIDDEN.test(i));
      expect(bad, `${f} imports ${bad.join(', ')}`).toEqual([]);
    });
  }
  it('the guard itself catches a scoring import (mutation control)', () => {
    expect(importsOf("import { x } from '../core/JudgePanel';\nimport y from './b';")).toEqual(['../core/JudgePanel', './b']);
    for (const bad of ['../core/JudgePanel', '../core/DunkSystem', '../core/threePointRules', '../core/shootoutHud', '../core/CameraDirector', '../core/modeConfigs', '../modes/DunkMode', '../core/RimDecides']) expect(FORBIDDEN.test(bad), bad).toBe(true);
    for (const ok of ['./hoopsLook', '../visual/ShockRing', '../visual/EffectsKit', '../../a11y/reducedMotion', '@babylonjs/core']) expect(FORBIDDEN.test(ok), ok).toBe(false);
  });
});

describe('the look hold: this lane lifted dunk, dunkduel and threepoint, and only those', () => {
  it('they take the shared look; the court modes (another lane\'s) are still held', () => {
    for (const m of ['dunk', 'dunkduel', 'threepoint']) expect(wave2Look(m), m).toBe(true);
    for (const m of ['onevone', 'threevthree', 'carnival']) expect(wave2Look(m), m).toBe(false);
    for (const m of ['dunk', 'dunkduel', 'threepoint', 'basketball_dunk']) expect(WAVE2_HELD_MODES.has(m), m).toBe(false);
  });
});

describe('what the modes keep', () => {
  it('dunk keeps its own triple cut (DunkReplayCam), dunkduel plays it too, and both ask for the bars around it', () => {
    for (const f of ['lib/babylon/modes/DunkMode.ts', 'lib/babylon/modes/DunkDuelMode.ts']) {
      const src = read(f);
      expect(src, f).toContain("from '../scene/DunkReplayCam'");
      expect(src, f).toMatch(/playCuts\(/);
      expect(src, f).toMatch(/setCinematic\(ctx\.scene, 1\)/);
      expect(src, f).toMatch(/setCinematic\(ctx\.scene, 0\)/);
    }
  });
  it('threepoint keeps the corner camera (#220) and the tree fade, with their tests present', () => {
    const src = read('lib/babylon/modes/ThreePointMode.ts');
    expect(src).toContain('widenCamBounds(ctx.camDirector)');
    expect(src).toMatch(/threePointOcclusion/);
    expect(read('lib/babylon/modes/ThreePointMode.cornerCamera.test.ts').length).toBeGreaterThan(200);
  });
  it('each mode mounts and disposes what it adds (the handle is taken down with the mode)', () => {
    const want: [string, RegExp[]][] = [
      ['lib/babylon/modes/DunkMode.ts', [/rimFx = mountRimFx\(/, /rimFx\?\.dispose\(\); rimFx = null/, /judgesTable = mountJudgesTable\(/, /judgesTable\?\.dispose\(\); judgesTable = null/]],
      ['lib/babylon/modes/DunkDuelMode.ts', [/rimFx = mountRimFx\(/, /rimFx\?\.dispose\(\); rimFx = null/, /dressing = mountDuelDressing\(/, /dressing\?\.dispose\(\); dressing = null/]],
      ['lib/babylon/modes/ThreePointMode.ts', [/rimFx = mountRimFx\(/, /rimFx\?\.dispose\(\); rimFx = null/, /dressing = mountShootoutDressing\(/, /dressing\?\.dispose\(\); dressing = null/]],
    ];
    for (const [f, res] of want) for (const re of res) expect(read(f), `${f} ${re}`).toMatch(re);
  });
  it('the hoops calls read the mode\'s state and never assign into it', () => {
    // a call into a hoops handle is a statement on its own: nothing is written from it into the mode (no `x = rimFx…`, no `+= dressing…`)
    for (const f of ['lib/babylon/modes/DunkMode.ts', 'lib/babylon/modes/DunkDuelMode.ts', 'lib/babylon/modes/ThreePointMode.ts']) {
      const bad = read(f).split('\n').filter((l) => /(?<![=!<>])=\s*(?:await\s+)?(?:rimFx|judgesTable|dressing)\??\.(?!dispose)/.test(l) || /[+\-*/]=\s*(?:rimFx|judgesTable|dressing)\??\./.test(l));
      expect(bad, `${f}: ${bad.join(' | ')}`).toEqual([]);
    }
  });
});
