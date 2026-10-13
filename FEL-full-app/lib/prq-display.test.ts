// QA P0-01 (2026-09-27): a fresh account's header read "PRQ 52 · READY" with 0/8 attributes measured, because every
// badge printed prqScore() of the random attributes a new profile is seeded with. The badge prints prqDisplay now.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { prqDisplay, readPrqDisplay, PRQ_UNMEASURED_COLOR } from './prq-display';
import { prqScore, prqGrade } from './prq';

describe('prqDisplay', () => {
  it('nothing measured: no score, no grade, "PRQ —"', () => {
    const d = prqDisplay({ score: 0, measured: 0, total: 8 });
    expect(d.score).toBeNull();
    expect(d.grade).toBeNull();
    expect(d.label).toBe('PRQ —');
    expect(d.badge).toBe('PRQ — · NOT MEASURED');
    expect(d.coverage).toBe('0/8');
    expect(d.color).toBe(PRQ_UNMEASURED_COLOR);
  });

  it('no read at all (a failed query) is NOT MEASURED, never a number', () => {
    for (const t of [null, undefined]) {
      const d = prqDisplay(t);
      expect(d.score).toBeNull();
      expect(d.label).toBe('PRQ —');
      expect(d.total).toBe(8);
    }
  });

  it('2 of 8 measured: the traceable mean and its coverage', () => {
    const d = prqDisplay({ score: 57.5, measured: 2, total: 8 });
    expect(d.score).toBe(57.5);
    expect(d.grade?.key).toBe('READY');
    expect(d.label).toBe('PRQ 58');
    expect(d.coverage).toBe('2/8');
    expect(d.badge).toBe('PRQ 58 · READY · 2/8');
    expect(d.color).toBe(prqGrade(57.5).color);
  });

  it('all 8 measured: the grade, and no coverage suffix', () => {
    const d = prqDisplay({ score: 71.2, measured: 8, total: 8 });
    expect(d.badge).toBe('PRQ 71 · PRIMED');
    expect(d.coverage).toBe('8/8');
  });
});

describe('readPrqDisplay (the client side of /api/profile)', () => {
  it('reads the route\'s prqDisplay', () => {
    expect(readPrqDisplay({ prq: 52, prqDisplay: { score: 60, measured: 3, total: 8 } }).badge).toBe('PRQ 60 · PRIMED · 3/8');
  });

  it('a null score is NOT MEASURED', () => {
    expect(readPrqDisplay({ prq: 52, prqDisplay: { score: null, measured: 0, total: 8 } }).label).toBe('PRQ —');
  });

  it('a body with no prqDisplay never falls back to the seeded prq', () => {
    const d = readPrqDisplay({ prq: 52, grade: prqGrade(52) });
    expect(d.score).toBeNull();
    expect(d.badge).not.toMatch(/52/);
  });
});

describe('the formula is untouched', () => {
  it('prqScore / prqGrade for a fixed input are what they were', () => {
    const attrs = { strength: 40, speed: 50, endurance: 60, agility: 70, power: 45, flexibility: 55, recovery: 65, mental: 51 };
    expect(prqScore(attrs)).toBe(54.5);
    expect(prqGrade(54.5).key).toBe('READY');
    expect(prqScore(null)).toBe(0);
  });
});

// Source scan: every badge surface prints the display, none prints the seeded `prq` again. A render test would need
// each page's fetch and session mounted; the regression this guards is one expression.
describe('every PRQ badge reads prqDisplay', () => {
  const read = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8');
  const SURFACES = [
    'components/games/game-shell.tsx', 'components/shell/status-rail.tsx', 'components/ladder-view.tsx',
    'components/profile-view.tsx', 'components/games/who-scene-it-game.tsx', 'components/games/brain-brawl-game.tsx',
    'components/kitchens/fuel-view.tsx',
  ];

  it.each(SURFACES)('%s never prints the seeded prq', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/PRQ \{Math\.round\((profile|data|prq)[^)]*\)/);
    expect(src).not.toMatch(/PRQ \{prq(\.toFixed\(\d\))?\}/);
    expect(src).not.toMatch(/\{Math\.round\(data\.prq\)\}/);
    expect(src).toMatch(/prq-display/);
  });
});
