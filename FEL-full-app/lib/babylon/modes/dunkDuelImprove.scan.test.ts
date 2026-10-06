// IMPROVE (2026-10-06) — DunkDuelMode wiring scan for the owner-picked dunkduel items that live in the mode itself. The pure parts
// are tested where they live (dunkDuelRules, visual/EffectsKit, scene/DunkReplayCam); this pins that the duel actually calls
// them, that its beats run on its own clock, and that nothing it defers can outlive it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DUEL = readFileSync(path.join(__dirname, 'DunkDuelMode.ts'), 'utf8');
const fn = (name: string): string => { const i = DUEL.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUEL.slice(i, DUEL.indexOf('\n  }\n', i)); };
const block = (head: string): string => { const i = DUEL.indexOf(head); expect(i, head).toBeGreaterThan(0); return DUEL.slice(i, DUEL.indexOf('\n    },\n', i)); };

describe('two duellists you can tell apart (#1 #2 #10)', () => {
  it('P2 wears the P2 jersey; each body gets its own ring in its colour; the ball is dressed', () => {
    expect(DUEL).toMatch(/tintGarmentSlot\(p2, SLOT_KEYS\.jersey, P_HEX\[1\]\)/);
    expect(DUEL).toMatch(/mountPlayerRing\(ctx\.scene, p1\.root, \{ color: P_HEX\[0\]/);
    expect(DUEL).toMatch(/mountPlayerRing\(ctx\.scene, p2\.root, \{ color: P_HEX\[1\]/);
    expect(DUEL).toMatch(/void dressBall\(ball, 'basketball'\)/);
  });
});

describe('the beats run on the mode clock and die with the mode (#11 #13 #14)', () => {
  it('no raw setTimeout is left in the duel', () => {
    expect(DUEL).not.toMatch(/\bsetTimeout\(/);
  });
  it('the hand-off card moves on from phaseSec in update(), and the verdict from judgeHold', () => {
    expect(fn('handoffTick')).toMatch(/phaseSec < \(firstCard\(\) \? HANDOFF_FIRST_SEC : HANDOFF_SEC\)/);
    const upd = block('    update(ctx: ModeContext, dt: number) {');
    expect(upd).toMatch(/runLater\(ctx, dt\);/);
    expect(upd).toMatch(/handoffTick\(ctx\);/);
    expect(upd).toMatch(/if \(judgeHold < 0\) \{[^\n]*advance\(ctx\);/);
  });
  it('dispose ends the mode, bumps the generation, empties the queue, and takes what load made', () => {
    const d = block('    dispose() {');
    for (const re of [/ended = true; modeGen\+\+; later\.length = 0;/, /replay\?\.dispose\(\)/, /trail\?\.dispose\(\)/, /ambient\?\.dispose\(\)/,
      /meter3d\?\.dispose\(\)/, /for \(const r of rings\) r\.dispose\(\)/, /postureOf\.delete\(p1\)/]) expect(d).toMatch(re);
    expect(DUEL).toMatch(/ambient = EffectsKit\.ambient\(ctx\.scene, 'venice'\)/);
  });
  it('the replay’s await stops at a disposed mode', () => {
    const m = fn('makeShow');
    expect(m.indexOf('if (gen !== modeGen) return;')).toBeGreaterThan(m.indexOf('await Promise.race('));
  });
});

describe('the make, replayed and judged on stage (#6 #12)', () => {
  it('the triple cut plays with `cutting` set, holds through a pause, and A / B stop it before the hand-off card reads them', () => {
    const m = fn('makeShow');
    expect(m.indexOf('cutting = true')).toBeLessThan(m.indexOf('rec.playCuts('));
    expect(m).toMatch(/paused,\n/);
    expect(m).toMatch(/pausableDelay\(tripleCutSec\(\) \* 1000 \+ 1200, paused\)/);
    const skip = DUEL.indexOf("if (cutting && e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B')) { replay?.stop();");
    expect(skip).toBeGreaterThan(0);
    expect(skip).toBeLessThan(DUEL.indexOf("if (phase === 'handoff' && e.t === 'button' && e.pressed) {"));
  });
  it('the cards are staged: no reveal lands in finishAttempt, the reveal starts after the cut, the banner and scoreboard on the total', () => {
    expect(fn('finishAttempt')).not.toMatch(/judgeReveal: made \? scores/);
    expect(fn('makeShow')).toMatch(/reveal\.start\(revealScores\)/);
    expect(fn('revealTick')).toMatch(/beat\.kind === 'total'\) \{\n\s*ctx\.setHud\(\{ hint: '', p1Score: totals\[0\], p2Score: totals\[1\] \}\);\n\s*setBanner\(ctx, verdictBanner\);/);
  });
});

describe('the flight (#3 #7 #8)', () => {
  it('NOW! lands on the window’s centre, and the slam meter runs with the flight', () => {
    expect(DUEL).toMatch(/!beatCalled && !slamPress\.spent && clipTime >= EASTBAY_TIMING\.extend\) \{\n\s*beatCalled = true;\n\s*ctx\.setHud\(\{ hint: 'NOW!' \}\);/);
    expect(fn('launchDunk')).toMatch(/meter3d\?\.begin\(slamGreen\(\)\)/);
    expect(DUEL).toMatch(/meter3d\.set\(clipTime \/ meterSpan/);
  });
  it('tricks are B / Y / X with a direction — A stays the slam', () => {
    expect(DUEL).toMatch(/\(e\.btn === 'B' \|\| e\.btn === 'X' \|\| e\.btn === 'Y'\)\) airTrickPress\(ctx, e\);/);
    expect(fn('fireTrick')).toMatch(/flight\.take\(trick\)/);
    expect(fn('fireTrick')).toMatch(/flight\.recognizer\.spend\(\)/);
  });
  it('the judges read FLASHY through styleTierFor and add each trick’s difficulty', () => {
    const f = fn('finishAttempt');
    expect(f).toMatch(/const tier = styleTierFor\(style, airTricks\.length, STYLE_TIER\);/);
    expect(f).toMatch(/\(tier \+ PROP_BONUS\[prop\][^\n]*airDifficulty\)/);
    expect(f).not.toMatch(/STYLE_TIER\[style\]/);
  });
});

describe('the match (#4 #5 #9)', () => {
  it('a dunk-off dunk never adds to the totals; the rules pick the next turn', () => {
    expect(fn('finishAttempt')).toMatch(/if \(!inDunkOff\) totals\[activeIdx\] \+= dunkTotal;/);
    expect(fn('advance')).toMatch(/const next = duelNext\(duelState\(\)\);/);
  });
  it('the reported score stays inside the server bound', () => {
    expect(fn('advance')).toMatch(/reportedScore\(totals\[0\], dunksEach, DUNKS_EACH\)/);
  });
  it('the first card’s B steps the length; the deciding dunk carries its number on the card', () => {
    expect(DUEL).toMatch(/firstCard\(\) && e\.t === 'button' && e\.btn === 'B' && e\.pressed\) \{\n\s*dunksEach = nextMatchLength\(dunksEach\);/);
    expect(fn('dunkNumLine')).toMatch(/duelNeed\(st, activeIdx\)/);
  });
});

describe('per-frame allocations (#16–#20)', () => {
  it('the approach plays its loop only on a change', () => {
    expect(DUEL).toMatch(/if \(runClip !== loopClip\) playClip\(runClip, \{ loop: true \}\);/);
    expect(fn('playClip')).toMatch(/loopClip = opts\.loop \? name : null;/);
  });
  it('the stick, the charge facing and the reach use scratch vectors', () => {
    expect(fn('stickVel')).not.toMatch(/new Vector3|Vector3\.Zero\(\)/);
    expect(DUEL).not.toMatch(/faceVel\(new Vector3/);
    expect(DUEL).not.toMatch(/hd\.add\(handIkTarget\.subtract\(hd\)/);
  });
  it('the bench body’s stance eases at BENCH_TICK_SEC, its bone write every frame', () => {
    const h = fn('handIkApply');
    expect(h).toMatch(/if \(benchAcc >= BENCH_TICK_SEC\) \{ Lb\.tick\(benchAcc, benchFeed\(b\)\); benchAcc = 0; \}/);
    expect(h).toMatch(/Lb\.apply\(pdt,/);
  });
});
