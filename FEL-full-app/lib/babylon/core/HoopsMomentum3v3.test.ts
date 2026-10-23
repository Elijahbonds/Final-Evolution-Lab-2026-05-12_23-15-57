// lane/hoops-shot-core (owner, 2026-10-20): the momentum multiplier in 3v3 — the 1v1's 0.94–1.10 on the 3v3 hero's make chance,
// with the hot hand's shot trail. One bus model, one multiplier, both modes.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MomentumBus } from './MomentumBus';
import { SHOT_QUALITY_PCT } from './BasketballCore';
import { contestedPct, fatiguePct } from './HoopsDefense';

const src = (f: string) => readFileSync(path.resolve(__dirname, '../modes', f), 'utf8');
/** The hero's pct line, as both modes now write it. */
const heroPct = (q: keyof typeof SHOT_QUALITY_PCT, mod: number, bus: MomentumBus, contest = 0, fatigue = 0) =>
  fatiguePct(contestedPct(SHOT_QUALITY_PCT[q] * mod * bus.multiplier(), contest), fatigue);

describe('the 3v3 hero reads the momentum multiplier, like the 1v1', () => {
  it('both modes put mbus.multiplier() in the same place of the hero\'s pct', () => {
    const line = 'fatiguePct(contestedPct(SHOT_QUALITY_PCT[quality] * pctMod * mbus.multiplier(), shotContest), meFatigue01)';
    expect(src('OneVOneMode.ts')).toContain(line);
    expect(src('ThreeVThreeMode.ts')).toContain(line);
  });

  it('the range is the 1v1\'s: ×0.94 cold (the bus at rest) … ×1.10 on fire', () => {
    const b = new MomentumBus();
    expect(b.multiplier()).toBeCloseTo(0.94, 12);
    for (let i = 0; i < 20; i++) b.report({ kind: 'big_make', weight: 10 });
    expect(b.multiplier()).toBeCloseTo(1.10, 12);
  });

  it('what it does to a good jumper: 0.752 at rest, 0.88 on fire (was 0.80 flat in 3v3)', () => {
    const cold = new MomentumBus(), hot = new MomentumBus();
    for (let i = 0; i < 20; i++) hot.report({ kind: 'big_make', weight: 10 });
    expect(heroPct('good', 1, cold)).toBeCloseTo(0.752, 6);
    expect(heroPct('good', 1, hot)).toBeCloseTo(0.88, 6);
  });

  it('the hot hand\'s shot trail is on in 3v3 at the 1v1\'s line (momentum ≥ 70)', () => {
    for (const f of ['OneVOneMode.ts', 'ThreeVThreeMode.ts']) expect(src(f)).toMatch(/arc\.active && momentum >= 70 \? 'hang' : 'off'/);
  });
});
