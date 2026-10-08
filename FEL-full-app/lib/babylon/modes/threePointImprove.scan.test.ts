// IMPROVE (2026-10-06): the 3-Point Contest's owner-picked items, wired — a structural scan of ThreePointMode and its host
// (load() mounts a venue, a character pipeline and a skeleton, heavier than these wiring facts need; the rules themselves are
// proved in threePointRules.test.ts, the instancing in meshyProps.instanced.test.ts, the pause render in pausedRender.test.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from '@/lib/testing/sourceScan';

const CODE = stripComments(readFileSync('lib/babylon/modes/ThreePointMode.ts', 'utf8'));
const HOST = stripComments(readFileSync('components/games/three-point-babylon.tsx', 'utf8'));
const SPLASH = stripComments(readFileSync('components/games/boot-splash.tsx', 'utf8'));
const fn = (name: string): string => {
  const at = CODE.indexOf(`function ${name}(`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = CODE.indexOf('{', CODE.indexOf(')', at)); i < CODE.length; i++) {
    if (CODE[i] === '{') depth++;
    else if (CODE[i] === '}') { depth--; if (depth === 0) return CODE.slice(at, i + 1); }
  }
  return '';
};
const update = CODE.slice(CODE.indexOf('update(ctx: ModeContext, dt: number): void {'), CODE.indexOf('dispose(): void {'));

describe('#1 next ball up at release', () => {
  it('the release launches a flight and schedules the next ball NEXT_UP_SEC later; the run\'s last ball waits for its landing', () => {
    expect(update).toMatch(/launchFlight\(\); shotWin = 'release'/);
    expect(fn('launchFlight')).toMatch(/nextUpIn = f\.endsRun \? -1 : NEXT_UP_SEC;/);
    expect(update).toMatch(/nextUpIn -= dt;\s*if \(nextUpIn < 0\) advanceBall\(ctx\);/);
    expect(fn('finishFlight')).toMatch(/if \(ends && ctx\) advanceBall\(ctx\);/);
    expect(fn('advanceBall')).not.toMatch(/setTrail\('off'\)/);   // the trail is the flight's, ended with it
  });
  it('the flights step before the board returns early, so a ball in the air at the horn still lands (quietly)', () => {
    expect(update.indexOf('stepFlights(ctx, dt);')).toBeGreaterThan(0);
    expect(update.indexOf('stepFlights(ctx, dt);')).toBeLessThan(update.indexOf("if (S.phase === 'standings') {"));
    expect(fn('endRun')).toMatch(/f\.quiet = true; f\.call = null;/);
    expect(fn('stepFlights')).toMatch(/if \(!f\.quiet\) pushHud/);
  });
  it('the release lets go of the hand\'s ball (the carry and the motion layers read it) and hides it; a celebrate never cuts a set', () => {
    expect(fn('launchFlight')).toMatch(/releaseBall\(ball\);[\s\S]*ball\.setEnabled\(false\);/);
    expect(fn('contactMake')).toMatch(/S\.phase === 'flight' && !pick/);
  });
});

describe('#2 #3 #4 #5 #6 #7 the contest reads', () => {
  it('#2 a press on the board skips it (through the shot latch)', () => {
    expect(CODE).toMatch(/if \(S\.phase === 'standings'\) return boardPress\(ctx, e\);/);
    expect(fn('boardPress')).toMatch(/if \(!shotLatch\.press\(\)\) return;\s*if \(canSkipStandings\(S\.boardAge\)\) skipStandings\(ctx\);/);
    expect(fn('skipStandings')).toMatch(/while \(S\.revealQueue\.length\) revealNext/);
  });
  it('#3 the cut shows in qualifying runs only; #4 the pips; #5 the money rack; #7 the form tag', () => {
    expect(CODE).toMatch(/cut: S\.round === 'qualifying' && S\.phase !== 'standings' && S\.phase !== 'done' \? S\.cut : null/);
    expect(fn('applyShotOutcome')).toMatch(/S\.pips = pushPip\(S\.pips, S\.rack, S\.ballIdx, quality\);/);
    expect(CODE).toMatch(/const isMoneyBall = \(i: number, rack: number = S\.rack\): boolean => moneyBall\(rack, i, S\.round === 'practice' \? NO_MONEY_RACK : S\.moneyRack\);/);
    expect(CODE).toMatch(/form: formTag\(f\.skill\)/);
    for (const k of ['hud.cut', 'hud.relPips', 'hud.moneyRack', 'r.form']) expect(HOST).toContain(k);
  });
  it('#6 the practice rack: no clock, no momentum, then qualifying from scratch', () => {
    expect(update).toMatch(/if \(S\.round !== 'practice'\) S\.clock -= dt;/);
    expect(fn('applyShotOutcome')).toMatch(/if \(S\.round !== 'practice'\) \{\s*ctx\.momentum\.report/);
    expect(fn('advanceBall')).toMatch(/if \(S\.round === 'practice'\) \{ endPractice\(ctx\); return; \}/);
    expect(fn('endPractice')).toMatch(/resetRun\(\);[\s\S]*S\.best = 0;/);
  });
  it('#5 #6 #8 the READY screen offers the options (the rules ones never on a staked run); the pause offers the shot input', () => {
    expect(SPLASH).toMatch(/props\.modeId === 'threepoint' && \(props\.phase === 'ready' \|\| props\.phase === 'loading'\) && <ThreePointOptions \/>/);
    expect(HOST).toMatch(/phase === 'paused' && \([\s\S]{0,300}<ThreePointOptions variant="pause" \/>/);
    expect(fn('beginShootPhase')).toMatch(/shotInputMode = readShotInputMode\(\);/);   // a switch takes effect from the next ball
  });
});

describe('#9 #10 #12 #13 #14 #15 the teardown and the hot path', () => {
  it('#9 a stale teardown returns before it touches the venue or the camera box (module state: the newer load\'s)', () => {
    const d = CODE.slice(CODE.indexOf('dispose(): void {'));
    const guard = d.indexOf('if (disposeCount < loadCount) return;');
    expect(guard).toBeGreaterThan(0);
    expect(d.indexOf('modeVenue?.dispose?.()')).toBeGreaterThan(guard);
    expect(d.indexOf('camBoundsMesh?.dispose()')).toBeGreaterThan(guard);
  });
  it('#10 only changed keys go to the host, and the host merges them', () => {
    expect(fn('pushHud')).toMatch(/hudMemo\.has\(k\) && hudMemo\.get\(k\) === x\) continue;/);
    expect(fn('pushHud')).not.toMatch(/toFixed/);
    expect(HOST).toMatch(/setHud\(\(prev\) => \(\{ \.\.\.prev, \.\.\.h \}\)\)/);
    expect(HOST).not.toMatch(/\{ setHud\(h\); return; \}/);
  });
  it('#12 one frozen rack material; the picked rack ball goes home and freezes again', () => {
    expect(CODE).not.toMatch(/new StandardMaterial\(`rackMat_/);
    expect(CODE).toMatch(/rackMat\.freeze\(\);/);
    expect(fn('advanceBall')).toMatch(/thawTree\(rackBall\);/);
    expect(fn('finishPick')).toMatch(/rackHome\[p\.r\]\?\.\[p\.b\][\s\S]*freezeTree\(p\.mesh\);/);
  });
  it('#13 the sideline is parked during a run and plays on the board', () => {
    expect(update).toMatch(/sidelinePark\(false\);/);
    expect(update).toMatch(/sidelinePark\(true\);/);
    expect(fn('sidelinePark')).toMatch(/g\.pause\(\)/);
  });
  it('#14 no per-frame allocation on the jog, the meter or the pick', () => {
    expect(update).not.toMatch(/player\.root\.position = Vector3\.Lerp\(/);
    expect(update).not.toMatch(/new Vector3\(0, 1\.72, 0\)/);
    expect(update).toMatch(/Vector3\.LerpToRef\(pick\.from, pickTarget\(\), k, pick\.mesh\.position\);/);
    expect(fn('pickTarget')).toMatch(/pick\.hand \?\?= boneNode/);
  });
  it('#15 the trail is stopped while off', () => {
    expect(fn('setTrail')).toMatch(/if \(level === 'off'\) \{ trail\.stop\(\); return; \}/);
  });
});
