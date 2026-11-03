// GAMEPLAY-CLEAN P2 #8 — the skate play screen names the next few open goals, not all nine (openGoalsLine).
import { describe, expect, it } from 'vitest';
import { GOALS_SHOWN, openGoalsLine, SKATE_GOALS } from './ParkGoals';

const list = (doneIdx: number[]) => SKATE_GOALS.map((g, i) => ({ label: g.label, done: doneIdx.includes(i) }));

describe('openGoalsLine', () => {
  it('names the next GOALS_SHOWN open goals in order, and how many more wait', () => {
    const line = openGoalsLine(list([0]));
    const parts = line.split(' · ');
    expect(parts).toHaveLength(GOALS_SHOWN + 1);
    expect(parts[0]).toBe(`○ ${SKATE_GOALS[1].label}`);
    expect(parts[GOALS_SHOWN]).toBe(`+${SKATE_GOALS.length - 1 - GOALS_SHOWN} MORE`);
    expect(line).not.toContain('✓');
  });
  it('the last few: no "more"; all done: nothing', () => {
    const all = SKATE_GOALS.map((_, i) => i);
    expect(openGoalsLine(list(all.slice(0, -2))).split(' · ')).toHaveLength(2);
    expect(openGoalsLine(list(all))).toBe('');
  });
  it('fits the play screen budget: at most a dozen-odd words', () => {
    const words = openGoalsLine(list([])).split(/\s+/).filter((w) => /\w/.test(w)).length;
    expect(words).toBeLessThanOrEqual(16);
  });
});
