// lane/hoops-shot-core: ELITE's player shot clock — 12 s in 1v1, 14 s in 3v3, on the scorebug; resets on a rim touch and a change of
// possession; a violation turns the ball over; ROOKIE, PRO and every staked run are untimed; the AI's own timer is untouched.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PLAYER_SHOT_CLOCK_SEC, PlayerShotClock, playerShotClockSec, shotClockText } from './ShotClock';
import { SHOT_CLOCK_SEC } from './BasketballCore';
import { judge, rule } from './Ref';
import { tierForSearch } from './Difficulty';
import { tierForRun } from '../modes/threevthreeRules';

const run = (c: PlayerShotClock, sec: number, f: { token: number; ours: boolean; live: boolean }, dt = 1 / 60): number => {
  let horns = 0;
  for (let t = 0; t < sec - 1e-9; t += dt) if (c.tick(dt, f)) horns++;
  return horns;
};

describe('which runs have a clock', () => {
  it('ELITE only: 12 s in 1v1, 14 s in 3v3; ROOKIE and PRO untimed', () => {
    expect(PLAYER_SHOT_CLOCK_SEC).toEqual({ '1v1': 12, '3v3': 14 });
    expect(playerShotClockSec('1v1', 'elite')).toBe(12);
    expect(playerShotClockSec('3v3', 'elite')).toBe(14);
    for (const t of ['rookie', 'pro'] as const) { expect(playerShotClockSec('1v1', t)).toBe(0); expect(playerShotClockSec('3v3', t)).toBe(0); }
  });
  it('a staked / head-to-head run plays PRO, so it is untimed whatever was picked', () => {
    for (const q of ['?arena=1', '?mp=abc', '?c=xyz']) {
      expect(playerShotClockSec('1v1', tierForSearch(q, 'elite'))).toBe(0);
      expect(playerShotClockSec('3v3', tierForRun(q, 'elite'))).toBe(0);
    }
    expect(playerShotClockSec('1v1', tierForSearch('', 'elite'))).toBe(12);
  });
  it('the AI\'s internal timer is unchanged', () => { expect(SHOT_CLOCK_SEC).toBe(6); });
});

describe('the clock', () => {
  it('runs out at exactly its seconds of live ball, and sounds once', () => {
    const c = new PlayerShotClock(() => 12);
    const f = { token: 1, ours: true, live: true };
    expect(run(c, 11.9, f)).toBe(0);
    expect(c.remaining).toBeGreaterThan(0);
    expect(run(c, 0.2, f)).toBe(1);
    expect(run(c, 3, f)).toBe(0);   // never twice
  });
  it('stops while the ball is not live in our hands (a shot up, a loose ball, a dead ball)', () => {
    const c = new PlayerShotClock(() => 12);
    run(c, 6, { token: 1, ours: true, live: true });
    const left = c.remaining;
    expect(run(c, 30, { token: 1, ours: true, live: false })).toBe(0);
    expect(c.remaining).toBeCloseTo(left, 9);
  });
  it('a rim touch resets it', () => {
    const c = new PlayerShotClock(() => 14);
    run(c, 10, { token: 1, ours: true, live: true });
    c.rimTouch();
    expect(c.remaining).toBe(14);
  });
  it('a change of possession resets it (the mode\'s token), and so does our ball coming back', () => {
    const c = new PlayerShotClock(() => 12);
    run(c, 10, { token: 1, ours: true, live: true });
    c.tick(0.016, { token: 2, ours: true, live: true });
    expect(c.remaining).toBeGreaterThan(11.9);
    run(c, 10, { token: 2, ours: true, live: true });
    c.tick(0.016, { token: 2, ours: false, live: false });   // their ball, the same token (a seam)
    c.tick(0.016, { token: 2, ours: true, live: true });     // ours again
    expect(c.remaining).toBeGreaterThan(11.9);
  });
  it('their ball: it does not run and is not shown', () => {
    const shown: string[] = [];
    const c = new PlayerShotClock(() => 12, (v) => shown.push(v));
    expect(run(c, 30, { token: 1, ours: false, live: true })).toBe(0);
    expect(shown).toEqual(['']);
  });
  it('untimed (0 s): never sounds, never shown', () => {
    const shown: string[] = [];
    const c = new PlayerShotClock(() => 0, (v) => shown.push(v));
    expect(run(c, 60, { token: 1, ours: true, live: true })).toBe(0);
    expect(shown).toEqual(['']);
  });
  it('the scorebug value: whole seconds, then tenths under 5, published only when it changes', () => {
    expect(shotClockText(12)).toBe('12');
    expect(shotClockText(11.01)).toBe('12');
    expect(shotClockText(5.0)).toBe('5');
    expect(shotClockText(4.95)).toBe('5.0');
    expect(shotClockText(0.04)).toBe('0.1');
    expect(shotClockText(0)).toBe('0.0');
    const shown: string[] = [];
    const c = new PlayerShotClock(() => 12, (v) => shown.push(v));
    run(c, 12.1, { token: 1, ours: true, live: true });
    expect(shown[0]).toBe('12');
    expect(shown).toContain('6');
    expect(shown).toContain('5.0');   // whole seconds down to 6, then the broadcast's tenths from 5.0
    expect(shown).toContain('4.9');
    expect(shown[shown.length - 1]).toBe('0.0');
    expect(new Set(shown).size).toBe(shown.length);   // no repeats
  });
});

describe('the violation is the Ref\'s', () => {
  it('SHOT CLOCK: a whistle, a dead ball, the other side\'s ball', () => {
    const r = rule('shot_clock');
    expect(r.whistle).toBe(true); expect(r.deadBall).toBe(true); expect(r.shots).toBe(0);
    expect(judge('shot_clock', { offense: 'me' }).ball).toBe('foe');
    expect(judge('shot_clock', { offense: 'me' }).banner).toBe('SHOT CLOCK');
  });
});

describe('the hooks (scan)', () => {
  const src = (f: string) => readFileSync(path.resolve(__dirname, '../modes', f), 'utf8');
  it.each([
    ['OneVOneMode.ts', "playerShotClockSec('1v1', runTier())", "startDefense(ctx, `${call.banner} — DEFEND!`)"],
    ['ThreeVThreeMode.ts', "playerShotClockSec('3v3', runTier())", 'void opponentPossession(ctx);'],
  ])('%s: built on the run\'s tier, ticked on the possession token, reset on the iron, turned over by the Ref', (f, sec, turnover) => {
    const s = src(f);
    expect(s).toContain(sec);
    expect(s).toMatch(/shotClock\.tick\(dt, \{ token: possessionToken, ours: [^}]+\}\)\) \{ shotClockViolation\(ctx\); return; \}/);
    expect(s).toContain('shotClock.rimTouch();');
    const v = s.slice(s.indexOf('function shotClockViolation'), s.indexOf('function shotClockViolation') + 700);
    expect(v).toContain("judge('shot_clock', { offense: 'me' })");
    expect(v).toContain(turnover);
  });
  it('both scorebugs carry it', () => {
    for (const f of ['basketball-babylon.tsx', 'three-v-three-babylon.tsx']) {
      expect(readFileSync(path.resolve(__dirname, '../../../components/games', f), 'utf8')).toContain("<HoopsShotClock value={hud.shotClock} />");
    }
  });
});
