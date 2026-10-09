// IMPROVE (2026-10-06) — DunkMode wiring scan for the owner-picked dunk items that live in the mode itself. The pure parts are
// tested where they live (core/DunkAssist, scene/DunkReplayCam, scene/mergeByMaterial, visual/EffectsKit, core/DunkStakes); this
// pins that the mode actually calls them, and that the deferred callbacks cannot outlive it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };

describe('the triple cut', () => {
  it('sets `cutting` before it plays, so the old re-fly stands aside', () => {
    const at = DUNK.indexOf('replay.playCuts(');
    expect(DUNK.lastIndexOf('cutting = true;', at)).toBeGreaterThan(DUNK.lastIndexOf('function finishAttempt(', at));
  });
  it('a pad A / B during the cut stops it (not "THE JUDGES ARE SCORING")', () => {
    expect(DUNK).toMatch(/if \(e\.pressed && cutting\) \{ replay\.stop\(\);/);
    expect(DUNK.indexOf('if (e.pressed && cutting)')).toBeLessThan(DUNK.indexOf("'THE JUDGES ARE SCORING');"));
  });
  it('holds through a pause: the cut and its safety net read the harness phase', () => {
    expect(DUNK).toMatch(/paused: harnessPaused/);
    expect(DUNK).toMatch(/pausableDelay\([^;]*harnessPaused\)/);
  });
});

describe('the deferred callbacks die with the mode', () => {
  it('dispose bumps the generation, and the retry / advance / reveal / celebration callbacks run through it', () => {
    expect(fn('later')).toMatch(/gen === modeGen/);
    expect(DUNK).toMatch(/dispose\(\) \{\n\s*modeGen\+\+;/);
    expect(DUNK).not.toMatch(/setTimeout\(\(\) => \{ clearBanner\(ctx\); void (retryThisDunk|advanceAfterJudging)/);
    expect(DUNK).not.toMatch(/setTimeout\(\(\) => void advanceAfterJudging/);
    expect(DUNK).toMatch(/liveCelebTimer = later\(/);
    expect(DUNK).toMatch(/if \(!alive\(gen\)\) return;/);
  });
  it('the reveal advances from its own end on the mode clock, and A held hurries it', () => {
    expect(DUNK).toMatch(/reveal\.update\(dt \* \(revealHold \? REVEAL_HOLD_SPEED : 1\)\)/);
    expect(DUNK).toMatch(/if \(revealTail >= 0 && !reveal\.active\)/);
    expect(fn('advanceAfterJudging')).toMatch(/revealTail = -1/);
  });
});

describe('the practice runway', () => {
  it('a practice attempt never reaches the judges, the stakes or the score', () => {
    const fa = fn('finishAttempt');
    const branch = fa.indexOf('finishPractice(ctx, made)');
    expect(branch).toBeGreaterThan(0);
    for (const later of ['spendAttempt(', 'judgeDunk(', 'playerTotal +=', 'replay.playCuts(']) expect(fa.indexOf(later), later).toBeGreaterThan(branch);
    const fp = fn('finishPractice');
    for (const never of ['spendAttempt', 'judgeDunk', 'playerTotal', 'dunkInRound', 'makes', 'misses']) expect(fp, never).not.toContain(never);
  });
  it('R1 on the runway toggles it (not the keyboard Shift boost)', () => {
    expect(DUNK).toMatch(/e\.btn === 'R1' && e\.pressed && e\.src !== 'key' && phase === 'approach' && turn === 'player'\) togglePractice\(ctx\)/);
  });
});

describe('the runway', () => {
  it('X steps the prop families; the near-the-line hint is sent on change only', () => {
    expect(DUNK).toMatch(/nextPropCategory\(prop, PROP_RING, propAllowed, propMemory\)/);
    expect(DUNK).not.toMatch(/prop = PROPS\[\(PROPS\.indexOf\(prop\) \+ 1\) % PROPS\.length\]/);
    expect(DUNK).toMatch(/if \(line !== lineHint\) \{ lineHint = line; ctx\.setHud\(\{ hint: line \}\); \}/);
  });
  it('a prop pick is built once it settles, and the run takes a pending one at once', () => {
    expect(DUNK).not.toMatch(/SoundKit\.play\('uiTick', \{ pitch: 1\.3 \}\);\n\s*void setupProp\(ctx\);/);
    expect(fn('beginRun')).toMatch(/flushPropSetup\(ctx\)/);
  });
  it('the trail is disposed with the mode, and OFF stops it', () => {
    expect(DUNK).toMatch(/trail\?\.dispose\(\); trail = null;/);
    expect(fn('trailLook')).toMatch(/trail\.stop\(\)/);
  });
});
