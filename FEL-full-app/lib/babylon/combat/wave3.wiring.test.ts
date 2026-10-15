// Wave 3 presentation (lane/w3-present) is wired where it says, and it is PRESENTATION ONLY: a source scan, the way the *.improve and
// combatFx.wiring tests hold the owner's items — a refactor that drops a mount, a dispose or a guard fails here, not on the owner's TV.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MODES = path.resolve(__dirname, '../modes');
const src = (f: string): string => readFileSync(path.join(MODES, f), 'utf8');
const here = (f: string): string => readFileSync(path.join(__dirname, f), 'utf8');
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe('the new combat modules import nothing that scores, judges, times or tunes', () => {
  const ALLOWED: Record<string, RegExp> = {
    'fightShots.ts': /^(\.\.\/scene\/broadcastShots)$/,
    'dragonCutter.ts': /^(\.\/fightShots|\.\/cinemaRig)$/,
    'koReplay.ts': /^(\.\.\/core\/ModeHarness)$/,   // (a type: ModeContext, for playKoReplay)
    'cinemaRig.ts': /^(@babylonjs\/core|\.\.\/scene\/broadcastShots|\.\/fightShots)$/,
  };
  for (const [f, ok] of Object.entries(ALLOWED)) {
    it(`${f}: only ${ok.source}`, () => {
      const imports = [...here(f).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(imports.length).toBeGreaterThan(0);
      for (const i of imports) expect(i, `${f} imports ${i}`).toMatch(ok);
    });
  }
  it('koReplay.ts imports ModeHarness as a TYPE only (it must not pull the harness into a pure module)', () => {
    expect(here('koReplay.ts')).toMatch(/import type \{ ModeContext \} from '\.\.\/core\/ModeHarness'/);
  });
});

describe('Karate VS: the fight intro, the slam text, the DRAGON cut and the KO replay', () => {
  const s = src('KarateVSMode.ts');
  it('mounts the cinematic layer once at load and disposes it', () => {
    expect(count(s, /mountCinemaRig\(ctx\.scene, ctx\.camera\)/g)).toBe(1);
    expect(s).toMatch(/cin\?\.dispose\(\); cin = null/);
  });
  it('the round-start beat is UNCHANGED (READY_SEC 0.9) and the walk-in is round 1 only, once a match, never under reduced motion', () => {
    expect(s).toMatch(/const READY_SEC = 0\.9;/);
    expect(s).toMatch(/if \(round === 1 && !introPlayed && cin && motionPolicy\(\)\.travel\) \{ beginWalkIn\(ctx\); return; \}/);
    expect(s).toMatch(/introPlayed = false/);   // a new match plays it again
  });
  it('any press skips the intro (and is not a strike); the walk-in ends in the same ready beat', () => {
    expect(s).toMatch(/if \(phase === 'walkIn'\) \{ if \(e\.t === 'button' && e\.pressed && e\.btn !== 'START'\) endWalkIn\(ctx, true\); return; \}/);
    expect(s).toMatch(/function endWalkIn[\s\S]{0,400}readyBeat\(ctx\)/);
  });
  it('the slam text: ROUND n on the ready beat, FIGHT! on the fight, K.O. / TIME! on the verdict', () => {
    expect(s).toMatch(/function readyBeat[\s\S]{0,700}slam\(ctx, roundCall\(\)\)/);
    expect(s).toMatch(/banner\(ctx, 'FIGHT!', 0\.6\);\s*slam\(ctx, 'FIGHT!'\)/);
    expect(s).toMatch(/slam\(ctx, why === 'TIME' \? 'TIME!' : 'K\.O\.'\)/);
  });
  it('the slam key clears itself after SLAM_SEC on the mode clock (the host\'s own timer takes the text off the screen)', () => {
    expect(s).toMatch(/const SLAM_SEC = 1\.2;/);
    expect(s).toMatch(/if \(slamLeft > 0\) \{ slamLeft -= dt; if \(slamLeft <= 0\) ctx\.setHud\(\{ slam: '' \}\); \}/);
  });
  it('the DRAGON cut: mine cuts in at the wind-up and lands with the blow; the rival\'s only at the blow; a swing that never lands is aborted', () => {
    expect(s).toMatch(/if \(special && mine\) dragonStart\(true, hitDelay \/ 1000\)/);
    expect(s).toMatch(/if \(special\) \{ if \(phase !== 'fighting'\) dragon\.abort\(\); else if \(mine\) dragon\.blow\(\); else dragonStart\(false, 0\); \}/);
    expect(s).toMatch(/if \(dragon\.step\(dt\) === 'aborted'\) cin\?\.stop\(\)/);
    expect(s).toMatch(/if \(!dragon\.landed\) dragon\.abort\(\)/);
  });
  it('the KO replay: the two fighters are the cast, the cue is armed with whether the round decides the match, stepped only in the round-over beat', () => {
    expect(s).toMatch(/replay: true,/);
    expect(s).toMatch(/replayCast: \(\) => \(\{ bodies: \[player\.root, rival\.root\] \}\)/);
    expect(s).toMatch(/decidesMatch: myWins >= ROUNDS_TO_WIN \|\| foeWins >= ROUNDS_TO_WIN/);
    expect(s).toMatch(/if \(phase === 'roundOver' && !dragon\.active && !cin\?\.active\) \{ const plan = koCue\.step\(dt\)/);
    expect(s).toMatch(/koCue\.cancel\(\); dragon\.cancel\(\); cin\?\.cancel\(\);/);   // a new round starts on the play camera
  });
  it('the play camera is untouched: no new director call, no tuneFollow, no setBaseFov', () => {
    expect(count(s, /camDirector\.(setFixed|setPreset|snapTo)\(/g)).toBeLessThanOrEqual(1);
    expect(s).not.toMatch(/camDirector\.(tuneFollow|setBaseFov|establish|suspended)/);
  });
});

describe('Karate Endless: the 100th-KO finisher is a cinematic over the Hundred camera, which is untouched', () => {
  const s = src('KarateEndlessMode.ts');
  it('fires once, on the 100th KO, through the cinematic layer; under reduced motion only the call and the grade', () => {
    expect(s).toMatch(/const HUNDREDTH_KO = 100;/);
    expect(s).toMatch(/if \(totalKos === HUNDREDTH_KO && !finDone\) hundredth\(ctx, /);
    expect(s).toMatch(/function hundredth[\s\S]{0,300}finDone = true;[\s\S]{0,300}if \(!cin \|\| !motionPolicy\(\)\.travel\) return;/);
    expect(count(s, /mountCinemaRig\(ctx\.scene, ctx\.camera\)/g)).toBe(1);
    expect(s).toMatch(/cin\?\.dispose\(\); cin = null/);
  });
  it('uses the mode\'s existing finisher slow-mo beat (no new tuned number)', () => {
    expect(s).toMatch(/matrix\(ctx, 'finisher'\)/);
  });
  it('the Hundred camera\'s own calls are exactly as they were: one HundredCamera.update, one tuneFollow, one setBaseFov, no new snap or preset', () => {
    expect(count(s, /hundredCam\.update\(/g)).toBe(1);
    expect(count(s, /camDirector\.tuneFollow\(/g)).toBe(1);
    expect(count(s, /camDirector\.setBaseFov\(/g)).toBe(1);
    expect(count(s, /camDirector\.(setFixed|setPreset|snapTo)\(/g)).toBeLessThanOrEqual(1);
  });
});

describe('Showdown, Duel and Mixed: KO (and ring-out) replays, never the match-deciding round', () => {
  for (const [f, decides] of [['ShowdownMode.ts', /decidesMatch: false/], ['DuelMode.ts', /decidesMatch: myWins >= ROUNDS_TO_WIN \|\| foeWins >= ROUNDS_TO_WIN/], ['MixedCombatMode.ts', /decidesMatch: myWins >= ROUNDS_TO_WIN \|\| foeWins >= ROUNDS_TO_WIN/]] as const) {
    it(`${f}: replay on, the two fighters as the cast, the cue armed in endRound, stepped in the round-over beat, reset with the match`, () => {
      const s = src(f);
      expect(s).toMatch(/replay: true,/);
      expect(s).toMatch(/replayCast: \(\) => \(\{ bodies: \[player\.root, rival\.root\] \}\)/);
      expect(s).toMatch(/koCue\.arm\(\{/);
      expect(s).toMatch(decides);
      expect(s).toMatch(/if \(phase === 'roundOver'\) \{ const plan = koCue\.step\(dt\); if \(plan\) playKoReplay\(ctx, plan\); \}/);
      expect(s).toMatch(/koCue\.reset\(\)/);
    });
  }
  it('Showdown\'s armed finish is only what ended the round after its own match-over early return', () => {
    const s = src('ShowdownMode.ts');
    expect(s.indexOf("setPhase('matchOver')")).toBeLessThan(s.indexOf('koCue.arm({'));   // the match-deciding round returned before the arm
  });
  it('Mixed tells a ring-out, a fire pit, a blow and the bell apart', () => {
    const s = src('MixedCombatMode.ts');
    expect(s).toMatch(/kind: wasRingOut \? 'ringout' : burnedKo \? 'hazard' : \(playerWon \? foeState\.hp : meState\.hp\) <= 0 \? 'ko' : 'time'/);
  });
});

describe('no mode this lane touched calls the play camera any more than before', () => {
  it('the count of setFixed / setPreset / snapTo calls per file is the base\'s (combatFx.wiring holds the ceiling; this holds the floor of the changes)', () => {
    const base: Record<string, number> = { 'KarateEndlessMode.ts': 1, 'KarateVSMode.ts': 1, 'ShowdownMode.ts': 4, 'DuelMode.ts': 1, 'MixedCombatMode.ts': 1 };
    for (const [f, n] of Object.entries(base)) expect(count(src(f), /camDirector\.(setFixed|setPreset|snapTo)\(/g), f).toBeLessThanOrEqual(n);
  });
});
