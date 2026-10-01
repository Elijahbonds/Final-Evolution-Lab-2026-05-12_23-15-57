import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  flightOf, freshBlitz, NORMAL_FEEL, postedScore, scriptedCueRun, skipGap, TARGET, windowOpenFrac,
} from './TiebreakBlitz';

const host = readFileSync(path.resolve(__dirname, '../../../components/games/tiebreak-game.tsx'), 'utf8');

/** Half-width of the hit window in milliseconds, at the READY grade the scripted runs use. */
function halfMs(lead: number, rally: number): number {
  const flight = flightOf(rally, 0.95, NORMAL_FEEL);
  const open = windowOpenFrac(lead, rally, NORMAL_FEEL);
  return (flight * (1 - open) / 2) * 1000;
}

function cueBatch(errorSec: number) {
  let wins = 0;
  const runs = [];
  for (let seed = 1; seed <= 40; seed++) {
    const run = scriptedCueRun(seed, errorSec);
    runs.push(run);
    if (run.myPts === TARGET && run.myPts > run.aiPts) wins++;
  }
  return { wins, runs };
}

describe('Tiebreak Blitz — the point is the window, not the clock', () => {
  it('holds about 1.4s between points, a readable beat', () => {
    expect(TARGET).toBe(7);
    expect(NORMAL_FEEL.gapSec).toBeGreaterThanOrEqual(1.2);
    expect(NORMAL_FEEL.gapSec).toBeLessThanOrEqual(1.6);
  });

  it('a press during the result beat skips the hold', () => {
    const s = freshBlitz();
    s.awaiting = false;
    s.gap = NORMAL_FEEL.gapSec;
    expect(skipGap(s)).toBe(true);
    expect(s.gap).toBe(0);
    expect(skipGap(s)).toBe(false);
    s.awaiting = true;
    s.gap = NORMAL_FEEL.gapSec;
    expect(skipGap(s)).toBe(false);
  });

  it('opens near ±90ms and closes to a ±40–45ms floor', () => {
    expect(halfMs(0, 0)).toBeGreaterThanOrEqual(85);
    expect(halfMs(0, 0)).toBeLessThanOrEqual(95);
    expect(halfMs(6, 8)).toBeGreaterThanOrEqual(40);
    expect(halfMs(6, 8)).toBeLessThanOrEqual(45);
  });

  it('±60ms wins about half to two thirds, ±90ms wins fewer, and neither sweeps', () => {
    for (const [error, lo, hi] of [[0.06, 20, 28], [0.09, 6, 14]] as const) {
      const { wins, runs } = cueBatch(error);
      const label = `±${Math.round(error * 1000)}ms`;
      expect(wins, `${label} wins ${wins}/40`).toBeGreaterThanOrEqual(lo);
      expect(wins, `${label} wins ${wins}/40`).toBeLessThanOrEqual(hi);
      for (const run of runs) {
        expect(run.over).toBe(true);
        expect(run.myPts >= TARGET || run.aiPts >= TARGET).toBe(true);
        expect(run.aiPts).toBeGreaterThan(0);
        expect(run.myPts).toBeGreaterThan(0);
        expect(run.myPts === TARGET && run.aiPts === 0).toBe(false);
        expect(Number.isFinite(postedScore(run.myPts, run.bestRally))).toBe(true);
      }
    }
  });

  it('perfect timing still wins the match', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = scriptedCueRun(seed, 0);
      expect(run.over, `seed ${seed} ends`).toBe(true);
      expect(run.myPts, `seed ${seed} player`).toBe(TARGET);
      expect(run.myPts, `seed ${seed} beats the opponent`).toBeGreaterThan(run.aiPts);
      expect(Number.isFinite(postedScore(run.myPts, run.bestRally))).toBe(true);
    }
  });

  it('the host is a 3D court, and the arena ceiling strings stay live', () => {
    expect(host).not.toContain("getContext('2d')");
    expect(host).not.toContain('/backdrops/tennis.jpg');
    expect(host).not.toContain('felTiebreak');
    expect(host).toMatch(/useStartWake\(!started/);
    expect(host).toContain('const TARGET = 7;');
    expect(host).toContain('score: myPts,');
    expect(host).toContain('Math.random() < 0.16 + rally * 0.05');
    expect(host).not.toContain('COMING LEFT');
  });
});
