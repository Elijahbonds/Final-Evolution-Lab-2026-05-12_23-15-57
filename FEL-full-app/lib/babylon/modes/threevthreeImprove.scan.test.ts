// IMPROVE (2026-10-06) — ThreeVThreeMode wiring scan for the owner-picked threevthree items that live in the mode itself. The pure
// parts are tested where they live (threevthreeRules, proofLine, motionLayers.gate); this pins that the mode calls them, that its
// beats, its drive and its flights run on its own clock, and that nothing it defers or mounts can outlive it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.join(__dirname, 'ThreeVThreeMode.ts'), 'utf8');
const CODE = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');   // comment lines out (they name the old code)
const block = (head: string, end = '\n    },\n'): string => { const i = SRC.indexOf(head); expect(i, head).toBeGreaterThan(0); return SRC.slice(i, SRC.indexOf(end, i)); };
const fn = (name: string): string => {
  const at = SRC.indexOf(`function ${name}(`); expect(at, name).toBeGreaterThan(0);
  const rest = SRC.slice(at + 1); const end = rest.search(/\n {2}(async )?function |\n {2}return \{|\n {2}\/\/ ── /);
  return end < 0 ? rest : rest.slice(0, end);
};
const HOST = readFileSync(path.join(__dirname, '../../../components/games/three-v-three-babylon.tsx'), 'utf8');
const SPLASH = readFileSync(path.join(__dirname, '../../../components/games/boot-splash.tsx'), 'utf8');

describe('#4 #10 #17: the beats, the drive and the flights run on the mode clock and die with the mode', () => {
  it('no raw setTimeout and no onBeforeRender pass is left in the mode', () => {
    expect(CODE).not.toMatch(/\bsetTimeout\(/);
    expect(CODE).not.toMatch(/onBeforeRenderObservable/);
  });
  it('later() and the banner ride the clock; update() ticks it, then the flights, the drive and the swing, before the mic', () => {
    expect(fn('later')).toMatch(/after\(ms \/ 1000, \(\) => \{ if \(!ended && possessionToken === tok\) fn\(\); \}\);/);
    expect(fn('bannerFlash')).toMatch(/bannerUntil = modeClock \+ ms \/ 1000;/);
    expect(fn('bannerClearLater')).toMatch(/bannerUntil = modeClock \+ ms \/ 1000;/);
    const upd = block('    update(ctx: ModeContext, dt: number) {', '\n    dispose() {');
    const tick = upd.indexOf('tickClock(ctx, dt);'), fly = upd.indexOf('meFlightTick?.(stepMs); foeFlightTick?.(stepMs);');
    const drive = upd.indexOf('foeDriveTick?.(Math.min(0.05, Math.max(0, dt)));'), swing = upd.indexOf('foeSwingTick(ctx, dt);'), mic = upd.indexOf('micTick(ctx);');
    expect(tick).toBeGreaterThan(0); expect(fly).toBeGreaterThan(tick); expect(drive).toBeGreaterThan(fly); expect(swing).toBeGreaterThan(drive); expect(mic).toBeGreaterThan(swing);
    expect(upd).toMatch(/gap > 0 && gap <= FLIGHT_GAP_MS \? gap : dt \* 1000/);
  });
  it('the drive, both flights end by clearing their own tick', () => {
    const opp = fn('opponentPossession');
    expect(opp).toMatch(/foeDriveTick = \(fdt: number\): void => \{/);
    expect(opp).toMatch(/if \(k >= 1\) \{ foeDriveTick = null; res\(\); \}/);
    expect(fn('startDunk')).toMatch(/meFlightTick = \(realMs: number\): void => \{/);
    expect(fn('startDunk')).toMatch(/if \(k < 1\) return;\n\s*meFlightTick = null;/);
    expect(fn('driverDunk')).toMatch(/foeFlightTick = \(realMs: number\): void => \{/);
    expect(fn('driverDunk')).toMatch(/if \(k < 1\) return;\n\s*foeFlightTick = null;/);
  });
  it('dispose ends the mode, bumps the token, empties the queue, grounds the drive / flights / swing, and takes what load made', () => {
    const d = block('    dispose() {');
    expect(d).toMatch(/ended = true; possessionToken\+\+; timers\.length = 0; bannerUntil = 0; foeDriveTick = null; meFlightTick = null; foeFlightTick = null;/);
    expect(d).toMatch(/foePass\.active = false;/);
    for (const re of [/ambient\?\.dispose\(\)/, /mark\?\.dispose\(\)/, /shotTrail\?\.dispose\(\)/, /meter3d\?\.dispose\(\)/]) expect(d).toMatch(re);
  });
  it('a second run on the closure starts clean: the horn, the brains, the clock', () => {
    const l = block('    async load(ctx: ModeContext) {');
    expect(l).toMatch(/ended = false; buzzer = false;/);
    expect(l).toMatch(/defenderBrains\.length = 0; marks = \[\];/);
    expect(l).toMatch(/modeClock = 0; bannerUntil = 0; timers\.length = 0;/);
  });
});

describe('load (#3 #8 #15 #16)', () => {
  const load = (): string => block('    async load(ctx: ModeContext) {');
  it('#8 one ball trail, stopped while it is off; the ambient kept for dispose', () => {
    expect(load().match(/EffectsKit\.ballTrail\(/g)?.length).toBe(1);
    expect(load()).toMatch(/ambient = EffectsKit\.ambient\(ctx\.scene, 'venice'\)/);
    expect(CODE).toMatch(/if \(want === 'off'\) shotTrail\.stop\(\); else \{ applyTrail\(shotTrail, want\); shotTrail\.start\(\); \}/);
  });
  it('#16 the five AI bodies spawn together, in index order; the order-dependent picks are made before the await', () => {
    expect(load()).toMatch(/const \[mate0, mate1, foe0, foe1, foe2\] = await Promise\.all\(\[/);
    const spawn = load().slice(load().indexOf('const spawnBody = async ('), load().indexOf('localSource = new LocalInputSource();'));
    const firstAwait = spawn.indexOf('? await CharacterPipeline.spawnNpc(');
    for (const s of ['const takeNetSeat = ', 'defenderBrains.push(db); marks.push(markIndex ?? 0);']) { expect(spawn.indexOf(s), s).toBeGreaterThan(0); expect(spawn.indexOf(s), s).toBeLessThan(firstAwait); }
    expect(load()).toMatch(/bodiesAll = \[me, \.\.\.mates, \.\.\.foes\];/);
  });
  it('#3 the brains take the tier\'s poke; #15 the AI carries opt out of the idle stride; #13 the carries are a list', () => {
    expect(load()).toMatch(/new DefenderBrain\(knobs\.defenderAggression, markIndex\)/);
    expect(load()).toMatch(/knobs = THREEV_TIER\[tier\] \?\? THREEV_TIER\.pro;/);
    expect(load()).toMatch(/tierForRun\([^)]*readTier\(\)\)/);
    expect(load()).toMatch(/hoops: true, idleStride: b === me \}/);
    expect(load()).toMatch(/carryList = \[\.\.\.carries\.values\(\)\];/);
    expect(CODE).not.toMatch(/\[\.\.\.carries\.values\(\)\]\.some/);
    expect(SPLASH).toMatch(/const TIER_MODES = new Set\(\[[^\]]*'threevthree'/);
  });
  it('#14 the AI bodies\' layers go through the level of detail', () => {
    expect(load()).toMatch(/mountPostureLayer\(ctx\.scene, char\.skeleton, char\.root, \(\) => postureFeed\(body\)/);
    expect(load()).toMatch(/if \(ai\) body\.layers\.setGate\(\(\) => body\.lod === 0\);/);
    expect(fn('postureFeed')).toMatch(/if \(b\.lod === 2\) return null;/);
    expect(block('    update(ctx: ModeContext, dt: number) {', '\n    dispose() {')).toMatch(/lodTick\(ctx\);/);
  });
});

describe('#12 #11: the per-frame lists and the HUD', () => {
  it('the body lists are built once, the position lists refilled in place', () => {
    expect(fn('everyBody')).toMatch(/return bodiesAll;/);
    expect(fn('allyPositions')).not.toMatch(/\.\.\.|\.map\(/);
    expect(fn('foePositions')).not.toMatch(/\.map\(/);
  });
  it('every HUD write goes through the on-change memo (one raw setHud, inside putHud)', () => {
    expect(CODE.match(/\.setHud\(/g)?.length).toBe(1);
    expect(fn('putHud')).toMatch(/if \(out\) ctx\.setHud\(out\);/);
    for (const k of ['time', 'onBall', 'turbo', 'playerState', 'hint', 'passPreview']) expect(SRC).toMatch(new RegExp(`HUD_ON_CHANGE = new Set\\(\\[[^\\]]*'${k}'`));
  });
});

describe('the rules reach the game (#1 #2 #5 #6 #7 #9)', () => {
  it('#1 a cut-off driver swings it; the receiver carries the possession on; my body on the line picks it', () => {
    const opp = fn('opponentPossession');
    expect(opp).toMatch(/cutOff\(shooter\.char\.root\.position, driveDir, allyPositions\(\)\)/);
    expect(opp).toMatch(/kickTarget\(/);
    expect(opp).toMatch(/if \(kickTo && !driveStolen\) \{ throwSwing\(ctx, shooter, kickTo\); return; \}/);
    expect(opp).toMatch(/catchAndShoot\(openness\(/);
    expect(fn('foeSwingTick')).toMatch(/void opponentPossession\(ctx, \{ receiver: to \}\)/);
    expect(fn('foeSwingTick')).toMatch(/< SWING_PICK_M\) \{ pickSwing\(ctx, b\); return; \}/);
  });
  it('#2 their release is worth what the arc says; a goaltend awards that once', () => {
    const opp = fn('opponentPossession');
    expect(opp).toMatch(/const points = rivalPoints\(finishStyle, isThree\(shooter\.char\.root\.position, RIM\)\);/);
    expect(opp).toMatch(/foeScore \+= points; foeShotScored = true;/);
    expect(CODE).toMatch(/foeScore \+= goaltendAward\(foeShotScored, foeShotPoints\);/);
    expect(opp).toMatch(/rivalReleasePct\(\{ style: finishStyle, pullUp,/);
  });
  it('#5 #6 #7 the press and the preview share one read; the ring; the hint off the state', () => {
    expect(SRC).toMatch(/const read = passRead\(meIntent\);/);
    const cues = fn('tickCues');
    expect(cues).toMatch(/const read = passRead\(stick\);/);
    expect(cues).toMatch(/at = foePass\.active \? foePassTo : driver;/);
    expect(cues).toMatch(/hintSwap\(hintShown, want, modeClock - hintAt, turned\)/);
    expect(HOST).toMatch(/CONTROLS_OFFENCE/); expect(HOST).toMatch(/hud\.passPreview/);
  });
  it('#9 every ending posts the box score', () => {
    expect(CODE).not.toMatch(/ctx\.end\([^)]*\{ foeScore, assists \}\)/);
    expect(CODE.match(/ctx\.end\([^;]*endStats\(\)\)/g)?.length).toBe(9);
    expect(fn('resolveMyShot')).toMatch(/box\.fga\+\+;/);
  });
});
