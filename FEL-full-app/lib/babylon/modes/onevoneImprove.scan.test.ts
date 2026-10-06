// IMPROVE (2026-10-06) — OneVOneMode wiring scan for the owner-picked onevone items that live in the mode itself. The pure parts are
// tested where they live (onevoneRules, ShotMeter3D, basketballTree.improve, proofLine); this pins that the mode calls them, that
// its beats and its flights run on its own clock, and that nothing it defers or mounts can outlive it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.join(__dirname, 'OneVOneMode.ts'), 'utf8');
const CODE = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');   // comment lines out (they name the old code)
const block = (head: string, end = '\n    },\n'): string => { const i = SRC.indexOf(head); expect(i, head).toBeGreaterThan(0); return SRC.slice(i, SRC.indexOf(end, i)); };
const fn = (name: string): string => { const i = SRC.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return SRC.slice(i, SRC.indexOf('\n  }\n', i)); };
const CARRY = readFileSync(path.join(__dirname, '../anim/ballCarry.ts'), 'utf8');
const HOST = readFileSync(path.join(__dirname, '../../../components/games/basketball-babylon.tsx'), 'utf8');
const SPLASH = readFileSync(path.join(__dirname, '../../../components/games/boot-splash.tsx'), 'utf8');
const TOGGLE = readFileSync(path.join(__dirname, '../../../components/games/onevone-win-by-2.tsx'), 'utf8');

describe('the beats and the flights run on the mode clock and die with the mode (#5 #6 #13)', () => {
  it('no raw setTimeout, and no flight on onBeforeRender, is left in the mode', () => {
    expect(CODE).not.toMatch(/\bsetTimeout\(/);
    expect(CODE).not.toMatch(/onBeforeRenderObservable/);
  });
  it('later() and the banner ride the clock; update() ticks it, then the flights, before anything reads the possession', () => {
    expect(fn('later')).toMatch(/after\(ms \/ 1000, \(\) => \{ if \(!ended && possessionToken === tok\) fn\(\); \}\);/);
    expect(fn('bannerFlash')).toMatch(/bannerUntil = modeClock \+ ms \/ 1000;/);
    const upd = block('    update(ctx: ModeContext, dt: number) {', '\n    dispose() {');
    const tick = upd.indexOf('tickClock(ctx, dt);'), fly = upd.indexOf('meFlightTick?.(stepMs); foeFlightTick?.(stepMs);'), mic = upd.indexOf('micTick(ctx);');
    expect(tick).toBeGreaterThan(0); expect(fly).toBeGreaterThan(tick); expect(mic).toBeGreaterThan(fly);
    expect(upd).toMatch(/gap > 0 && gap <= FLIGHT_GAP_MS \? gap : dt \* 1000/);
    expect(upd).toMatch(/tickHint\(ctx\);/);
  });
  it('both flights end by clearing their own tick', () => {
    expect(fn('startDunk')).toMatch(/meFlightTick = \(realMs: number\): void => \{/);
    expect(fn('startDunk')).toMatch(/if \(k < 1\) return;\n\s*meFlightTick = null;/);
    expect(fn('foeDunk')).toMatch(/foeFlightTick = \(realMs: number\): void => \{/);
    expect(fn('foeDunk')).toMatch(/if \(k < 1\) return;\n\s*foeFlightTick = null;/);
  });
  it('dispose ends the mode, bumps the token, empties the queue, grounds the flights, and takes what load made', () => {
    const d = block('    dispose() {');
    expect(d).toMatch(/ended = true; possessionToken\+\+; timers\.length = 0; bannerUntil = 0; meFlightTick = null; foeFlightTick = null;/);
    for (const re of [/ambient\?\.dispose\(\)/, /net\?\.dispose\(\); net = null;/, /shotTrail\?\.dispose\(\)/, /meter3d\?\.dispose\(\)/]) expect(d).toMatch(re);
  });
});

describe('load (#7 #8 #12 #20)', () => {
  const load = (): string => block('    async load(ctx: ModeContext) {');
  it('one ball trail, stopped while it is off; the ambient kept for dispose', () => {
    expect(load().match(/EffectsKit\.ballTrail\(/g)?.length).toBe(1);
    expect(load()).toMatch(/shotTrail = EffectsKit\.ballTrail\(ctx\.scene, ball\); shotTrail\.stop\(\);/);
    expect(load()).toMatch(/ambient = EffectsKit\.ambient\(ctx\.scene, 'venice'\)/);
    expect(CODE).toMatch(/if \(want === 'off'\) shotTrail\.stop\(\); else \{ applyTrail\(shotTrail, want\); shotTrail\.start\(\); \}/);
  });
  it('the netplay socket the rival is built from is not closed during load', () => {
    const l = load().split('\n').filter((x) => !/^\s*\/\//.test(x)).join('\n');
    expect(l).not.toMatch(/net\?\.dispose\(\)/);
    expect(l).toMatch(/new PlayerSlot\('foe', net\.sourceFor\('foe'\), false\)/);
  });
});

describe('the rules reach the game (#1 #2 #3 #4 #10)', () => {
  it('#2 the OPPONENT pick sets the rival: his poke and his patience; the splash offers the pick on 1v1', () => {
    expect(SRC).toMatch(/knobs = ONEVONE_TIER\[readTier\(\)\] \?\? ONEVONE_TIER\.pro;/);
    expect(SRC).toMatch(/new DefenderBrain\(knobs\.defenderAggression, null, roll\)/);
    expect(SRC).toMatch(/attacker\.patience = attackerPatience\(nerve\(rivalStanding\(\)\)\.aggression, knobs\)/);
    expect(SPLASH).toMatch(/const TIER_MODES = new Set\(\[[^\]]*'onevone'/);
  });
  it('#3 win-by-2 asks the rule, from the READY screen\'s pick (or the dev seam); first to 11 is untouched', () => {
    const g = fn('checkGameOver');
    expect(g).toMatch(/if \(winCond\.winBy2\) \{\n\s*const w = gameWinner\(myScore, foeScore, winCond\);/);
    expect(SRC).toMatch(/winBy2Requested\(window\.location\.search, \{ picked: readWinBy2Pick\(\), dev: process\.env\.NODE_ENV === 'development' \}\)/);
    // owner 2026-10-06: the pick is on the 1v1 READY screen, and the toggle draws nothing on a staked / head-to-head run
    expect(SPLASH).toMatch(/props\.modeId === 'onevone' && \(props\.phase === 'ready' \|\| props\.phase === 'loading'\) && <OneVOneWinBy2 \/>/);
    expect(TOGGLE).toMatch(/winBy2Offered\(window\.location\.search\)/);
    expect(TOGGLE).toMatch(/if \(!offered\) return null;/);
    expect(TOGGLE).toMatch(/writeWinBy2Pick\(next\)/);
  });
  it('#4 the box score rides both endings', () => {
    const g = fn('checkGameOver');
    expect(g.match(/ctx\.end\('WIN', myScore, \{ foeScore, momentum, \.\.\.box \}\)/g)?.length).toBe(2);
    expect(g.match(/ctx\.end\('LOSS', myScore, \{ foeScore, \.\.\.box \}\)/g)?.length).toBe(2);
    expect(fn('releaseJumper')).toMatch(/box\.fga\+\+;/);
    expect(fn('startDunk')).toMatch(/box\.fga\+\+;/);
    expect(fn('micAnkles')).toMatch(/if \(size !== 'shook'\) box\.ankles\+\+;/);
  });
  it('#1 the hint is one line from the state, drawn by the host; the full list is on the pause screen', () => {
    expect(fn('tickHint')).toMatch(/const want = hintFor\(\{/);
    expect(CODE).not.toMatch(/HINT_OFFENCE|HINT_DEFENCE/);
    expect(HOST).toMatch(/typeof hud\.hint === 'string' && hud\.hint && phase === 'playing'/);
    expect(HOST).toMatch(/phase === 'paused' && \(/);
    expect(HOST).toMatch(/\{CONTROLS_OFFENCE\}/);
  });
  it('#10 every graded release becomes a pip on the HUD', () => {
    expect(fn('releaseJumper')).toMatch(/pips = pushPip\(pips, quality\); putHud\(ctx, \{ shotPips: pips \}\);/);
    expect(HOST).toMatch(/hud\.shotPips\.split\(''\)\.map/);
  });
});

describe('perf (#9 #11 #14 #15 #16)', () => {
  it('#11 the per-frame HUD keys go through the on-change memo, every write of them', () => {
    expect(CODE).not.toMatch(/ctx\.setHud\(\{[^}]*\b(turbo|shotMeterT|shotMeterGreen|playerState|hint|shotPips):/);
    expect(fn('putHud')).toMatch(/if \(hudMemo\.has\(k\) && hudMemo\.get\(k\) === v\) continue;/);
  });
  it('#9 every anim tree update hands the tree this frame\'s dt', () => {
    const calls = SRC.match(/AnimTree\.update\(\{\n\s*dtSec: dt,/g)?.length ?? 0;
    expect(calls).toBe(SRC.match(/AnimTree\.update\(\{/g)?.length);
    expect(calls).toBeGreaterThan(0);
  });
  it('#14 #15 camRel, driveBody and the possession loops build no vectors', () => {
    expect(fn('camRel')).toMatch(/forwardFlatToRef\(_camF\)/);
    expect(fn('camRel')).not.toMatch(/forwardFlat\(\)|\.scale\(/);
    expect(fn('driveBody')).not.toMatch(/\.clone\(\)|vel\.scale\(/);
    expect(CODE).not.toMatch(/foeMove\.vel\.clone\(\)/);
    expect(CODE).not.toMatch(/RIM\.subtract\(me\.root\.position\)\) > 0/);
    expect(CODE).not.toMatch(/me\.root\.position\.add\(new Vector3\(0, 1\.72, 0\)\)/);
  });
  it('#16 the rival\'s carry skips the stride clock while he is not dribbling (an opt-in: other callers unchanged)', () => {
    expect(SRC).toMatch(/foeCarry = mountBallCarry\(\{[^}]*idleStride: false \}\)/);
    expect(CARRY).toMatch(/if \(opts\.idleStride === false && !active && releaseLeft <= 0 && holdK <= 1e-3 && holdTarget <= 0\) \{ rootSeen = false; lockHz = 0; return; \}/);
  });
});
