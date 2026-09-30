import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NORMAL_FEEL, scriptedNormalRun, TARGET } from './TiebreakBlitz';

const host = readFileSync(path.resolve(__dirname, '../../../components/games/tiebreak-game.tsx'), 'utf8');

describe('Tiebreak Blitz — a normal rally is a contest', () => {
  it('seeds 1–40 each end cleanly, both sides score, and none finish inside a minute', () => {
    expect(TARGET).toBe(7);
    expect(NORMAL_FEEL.gapSec).toBe(4);
    for (let seed = 1; seed <= 40; seed++) {
      const run = scriptedNormalRun(seed);
      expect(run.over, `seed ${seed} ends`).toBe(true);
      expect(run.elapsed, `seed ${seed} elapsed`).toBeGreaterThanOrEqual(60);
      expect(run.myPts, `seed ${seed} player`).toBeGreaterThan(0);
      expect(run.aiPts, `seed ${seed} opponent`).toBeGreaterThan(0);
      expect(run.myPts === 7 && run.aiPts === 0, `seed ${seed} is not a sweep`).toBe(false);
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
