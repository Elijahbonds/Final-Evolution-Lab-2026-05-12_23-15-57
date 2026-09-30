import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  freshBlitz, NORMAL_FEEL, postedScore, scriptedCueRun, skipGap, TARGET,
} from './TiebreakBlitz';

const host = readFileSync(path.resolve(__dirname, '../../../components/games/tiebreak-game.tsx'), 'utf8');

/** On-cue timing error, in seconds. A realistic human is late or early by about this much. */
const HUMAN_ERROR = [0.06, 0.075, 0.09];

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

  it('on-cue human timing loses points and does not sweep, and the match posts', () => {
    for (const error of HUMAN_ERROR) {
      for (let seed = 1; seed <= 40; seed++) {
        const run = scriptedCueRun(seed, error);
        const label = `±${Math.round(error * 1000)}ms seed ${seed}`;
        expect(run.over, `${label} ends`).toBe(true);
        expect(run.myPts >= TARGET || run.aiPts >= TARGET, `${label} reaches 7`).toBe(true);
        expect(run.aiPts, `${label} opponent takes a point`).toBeGreaterThan(0);
        expect(run.myPts, `${label} player takes a point`).toBeGreaterThan(0);
        expect(run.myPts === TARGET && run.aiPts === 0, `${label} is not 7-0`).toBe(false);
        expect(Number.isFinite(postedScore(run.myPts, run.bestRally)), `${label} posts`).toBe(true);
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
    expect(host).toContain('score: myPts * 120 + bestRally * 30');
    expect(host).toContain('Math.random() < 0.16 + rally * 0.05');
    expect(host).not.toContain('COMING LEFT');
  });
});
