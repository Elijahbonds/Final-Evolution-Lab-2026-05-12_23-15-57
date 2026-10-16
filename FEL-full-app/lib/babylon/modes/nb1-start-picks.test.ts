// HONEST-START NB-1: opening /play/onevone or /play/threevthree runs load() at page load, while the start screen is still
// up, so the OPPONENT (and 1v1's WIN BY 2) pick made on that screen only took effect on a rematch. Now the harness calls
// the mode's onPlay as READY becomes 'playing', and both modes read the picks again there, before the first update().
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DefenderBrain } from '../core/BasketballCore';

const src = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const harness = src('../core/ModeHarness.ts');
const one = src('OneVOneMode.ts');
const three = src('ThreeVThreeMode.ts');

describe('NB-1: the start screen picks apply to the game about to be played', () => {
  it('the harness calls onPlay once, as READY becomes playing (every way in: tap, key, pad, body) and before any update', () => {
    expect(harness).toMatch(/onPlay\?\(ctx: ModeContext\): void;/);
    const wake = harness.slice(harness.indexOf('function wake('), harness.indexOf('function wake(') + 600);
    expect(wake).toMatch(/if \(phase !== 'ready'\) return;[\s\S]*setPhase\('playing'\);\s*\n\s*try \{ def\.onPlay\?\.\(ctx\); \}/);
    expect(harness.match(/def\.onPlay\?\.\(/g)).toHaveLength(1);
  });

  it('a defender brain built at load takes the pick at start', () => {
    const b = new DefenderBrain(0.7);
    b.setAggression(0.45);
    expect(b.aggressionNow).toBe(0.45);
  });

  it('1v1: onPlay reads the tier and the win rule as load does; onPlay re-arms the rival and the HUD', () => {
    const on = one.slice(one.indexOf('    onPlay(ctx: ModeContext) {'), one.indexOf('    onPlay(ctx: ModeContext) {') + 900);
    expect(on).toContain('readRules()');
    expect(on).toContain('foeBrain?.setAggression(knobs.defenderAggression)');
    expect(on).toContain('nerveTheAttacker()');
    expect(on).toContain('putHud(ctx, { winBy2: winCond.winBy2 })');
    expect(on).toMatch(/if \(myScore !== 0 \|\| foeScore !== 0\) return;/);
    expect(one).toMatch(/function readRules\(\)[\s\S]{0,200}runTier\(\)[\s\S]{0,300}readWinBy2Pick\(\)/);   // QA #262: the pick through runTier (PRO when staked)
  });

  it('3v3: onPlay reads the tier as load does (PRO on staked / head-to-head runs kept); onPlay re-arms every defender', () => {
    expect(three).toMatch(/const runTier = \(\) => tierForRun\(typeof window !== 'undefined' \? window\.location\.search : '', readTier\(\)\);/);
    const on = three.slice(three.indexOf('    onPlay() {'), three.indexOf('    onPlay() {') + 700);
    expect(on).toContain('runTier()');
    expect(on).toContain('for (const db of defenderBrains) db.setAggression(knobs.defenderAggression)');
    expect(on).toMatch(/if \(myScore !== 0 \|\| foeScore !== 0\) return;/);
  });
});
