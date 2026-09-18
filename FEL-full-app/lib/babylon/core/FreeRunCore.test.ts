import { describe, it, expect } from 'vitest';
import {
  verbsFor, stepSpeed, gradeDrop, speedAfterLanding, trickPoints, trickCompletes, FREERUN_TRICKS, TIERS, tierById,
  timeBonus, runGrade, RUN_MAX, VAULT_GATE, SPRINT_GATE, ROLL_WINDOW_S,
} from './FreeRunCore';
import { coursePieces, courseLength, checkpoints, respawnFor, overGap, routeAt } from '../modes/freeRunCourse';
import { SKETCHY_SCORE_MULT } from './LandingSystem';

const env = (o: Partial<Parameters<typeof verbsFor>[2]> = {}) => ({ vaultAhead: false, wallAhead: false, ledgeAhead: false, barAhead: false, ...o });

describe('FreeRun — momentum gates the verbs', () => {
  it('walking cannot vault or wall-run; running can vault; sprinting unlocks the wall', () => {
    expect(verbsFor('ground', 1.5, env({ vaultAhead: true, wallAhead: true }))).toEqual(['JUMP', 'PRECISION']);
    expect(verbsFor('ground', VAULT_GATE, env({ vaultAhead: true, barAhead: true }))).toEqual(['JUMP', 'VAULT', 'SLIDE', 'PRECISION']);
    expect(verbsFor('ground', SPRINT_GATE, env({ wallAhead: true }))).toContain('WALL RUN');
    expect(verbsFor('ground', SPRINT_GATE - 0.1, env({ wallAhead: true }))).not.toContain('WALL RUN');
  });
  it('in the air: wall kick off a wall, cat leap only at sprint speed with a ledge, roll always', () => {
    expect(verbsFor('air', 4, env({ wallAhead: true }))).toEqual(['WALL KICK', 'ROLL']);
    expect(verbsFor('air', 6, env({ ledgeAhead: true }))).toEqual(['CAT LEAP', 'ROLL']);
    expect(verbsFor('air', 4, env({ ledgeAhead: true }))).toEqual(['ROLL']);
    expect(verbsFor('wallrun', 6, env())).toEqual(['WALL KICK']);
    expect(verbsFor('down', 0, env())).toEqual([]);
  });
  it('speed builds and coasts, capped at the run max', () => {
    let s = 0;
    for (let i = 0; i < 60; i++) s = stepSpeed(s, 99, 1 / 60);
    expect(s).toBeGreaterThan(5);
    for (let i = 0; i < 600; i++) s = stepSpeed(s, 99, 1 / 60);
    expect(s).toBe(RUN_MAX);
    for (let i = 0; i < 60; i++) s = stepSpeed(s, 0, 1 / 60);
    expect(s).toBeLessThan(RUN_MAX);
    for (let i = 0; i < 600; i++) s = stepSpeed(s, 0, 1 / 60);
    expect(s).toBe(0);
  });
});

describe('FreeRun — landings and tricks on Skate\'s model', () => {
  it('drops: soft is clean, big needs a timed roll, huge unrolled is a bail', () => {
    expect(gradeDrop(1, null)).toBe('clean');
    expect(gradeDrop(3, ROLL_WINDOW_S / 2)).toBe('clean');
    expect(gradeDrop(3, null)).toBe('sketchy');
    expect(gradeDrop(3, ROLL_WINDOW_S + 0.2)).toBe('sketchy');
    expect(gradeDrop(6, null)).toBe('bail');
    expect(gradeDrop(6, 0.1)).toBe('clean');
    expect(speedAfterLanding(6, 'clean')).toBe(6);
    expect(speedAfterLanding(6, 'sketchy')).toBe(3);
    expect(speedAfterLanding(6, 'bail')).toBe(0);
  });
  it('difficulty × launch × execution; a bail pays nothing; chained lines out-pay the same tricks alone', () => {
    const t = FREERUN_TRICKS.front;
    expect(trickPoints(t, 'ground', 'clean')).toBe(150);
    expect(trickPoints(t, 'wallkick', 'clean')).toBe(225);
    expect(trickPoints(t, 'ground', 'sketchy')).toBe(Math.round(150 * SKETCHY_SCORE_MULT));
    expect(trickPoints(t, 'drop', 'bail')).toBe(0);
    // Skate's ComboChain pays the Nth link N×: two tricks chained = 150×1 + 180×2 = 510 vs 330 apart
    const chained = trickPoints(FREERUN_TRICKS.front, 'ground', 'clean') * 1 + trickPoints(FREERUN_TRICKS.back, 'ground', 'clean') * 2;
    const apart = trickPoints(FREERUN_TRICKS.front, 'ground', 'clean') + trickPoints(FREERUN_TRICKS.back, 'ground', 'clean');
    expect(chained).toBeGreaterThan(apart);
    expect(trickCompletes(FREERUN_TRICKS.spin, 0.3)).toBe(false);
    expect(trickCompletes(FREERUN_TRICKS.spin, 0.7)).toBe(true);
  });
  it('tiers, time bonus and the run grade', () => {
    expect(TIERS).toHaveLength(3);
    expect(tierById(9).id).toBe(1);
    expect(timeBonus(40, tierById(1))).toBe(375);
    expect(timeBonus(70, tierById(1))).toBe(0);
    expect(runGrade(10, tierById(2))).toBe('C');
    expect(runGrade(10000, tierById(2))).toBe('S');
  });
});

describe('FreeRun — the course', () => {
  it('runs start to finish with both routes, checkpoints in order, wider gaps at higher tiers', () => {
    for (const tier of TIERS) {
      const p = coursePieces(tier);
      expect(p.filter((q) => q.kind === 'start')).toHaveLength(1);
      expect(p.filter((q) => q.kind === 'finish')).toHaveLength(1);
      expect(courseLength(p)).toBeGreaterThan(50);
      expect(p.some((q) => q.route === 'high')).toBe(true);
      expect(p.some((q) => q.route === 'low')).toBe(true);
      expect(p.filter((q) => q.kind === 'gap')).toHaveLength(tier.gaps);
      const cps = checkpoints(p);
      expect(cps.map((c) => c.index)).toEqual([1, 2]);
      expect(cps[0].z).toBeLessThan(cps[1].z);
      // every piece except gaps sits at or above the ground; ground slabs tile without a hole between them
      const slabs = p.filter((q) => q.kind === 'ground').sort((a, b) => a.z - b.z);
      for (let i = 1; i < slabs.length; i++) {
        const prevEnd = slabs[i - 1].z + slabs[i - 1].d / 2, start = slabs[i].z - slabs[i].d / 2;
        const gapBetween = start - prevEnd;
        if (gapBetween > 0.01) expect(p.some((q) => q.kind === 'gap' && Math.abs(q.z - (prevEnd + gapBetween / 2)) < 0.01)).toBe(true);
      }
    }
    expect(coursePieces(TIERS[2]).find((q) => q.kind === 'gap')!.d).toBeGreaterThan(coursePieces(TIERS[0]).find((q) => q.kind === 'gap')!.d);
  });
  it('respawn returns to the last checkpoint; over-gap and route tests read positions', () => {
    const p = coursePieces(TIERS[0]);
    expect(respawnFor(p, 0)).toEqual({ x: 0, y: 0, z: 3 });
    expect(respawnFor(p, 1).z).toBeGreaterThan(10);
    const gap = p.find((q) => q.kind === 'gap')!;
    expect(overGap(p, 0, gap.z)).toBe(true);
    expect(overGap(p, 0, gap.z + gap.d)).toBe(false);
    expect(routeAt(6.5, 3.6)).toBe('high');
    expect(routeAt(0, 0)).toBe('low');
  });
});
