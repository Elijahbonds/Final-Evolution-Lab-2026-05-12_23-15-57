// lane/hoops-shot-core: distance narrows the green (1v1 / 3v3 hero), and the finer release grades — on the REAL ShotMeter.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ShotMeter, SHOT_QUALITY_PCT } from './BasketballCore';
import { DIST_GREEN, distanceGreenFactor, releaseGradeLabel } from './ShotWindow';
import { PERFECT_BAND_SHARE } from './shotBands';

/** The real meter, started for an uncontested jumper with no gather, narrowed for `distM`: the green and perfect half-widths in ms. */
function windowAt(distM: number, contest = 0, style: 'jumper' | 'layup' | 'fadeaway' = 'jumper'): { greenMs: number; perfectMs: number; m: ShotMeter } {
  const m = new ShotMeter();
  m.start(contest, style, 0);
  m.narrowBy(distanceGreenFactor(distM, style));
  return { greenMs: m.greenHalfSec * 1000, perfectMs: m.greenHalfSec * PERFECT_BAND_SHARE * 1000, m };
}

describe('distance narrows the green (TUNED new)', () => {
  it('the factor: untouched inside nearM, the shootout\'s 22 % at farM, monotonic between', () => {
    expect(distanceGreenFactor(0)).toBe(1);
    expect(distanceGreenFactor(DIST_GREEN.nearM)).toBe(1);
    expect(distanceGreenFactor(DIST_GREEN.farM)).toBeCloseTo(1 - 0.22, 10);
    expect(distanceGreenFactor(12)).toBeCloseTo(1 - 0.22, 10);   // never narrower than the deepest rack
    let prev = 1;
    for (let d = 0; d <= 9; d += 0.25) { const f = distanceGreenFactor(d); expect(f).toBeLessThanOrEqual(prev + 1e-12); prev = f; }
  });

  it('only a jump shot narrows: every finish keeps its tuned bar', () => {
    for (const s of ['layup', 'floater', 'hook', 'reverse', 'mikan', 'upAndUnder', 'fingerRoll', 'scoop', 'spinLayup', 'hangLayup'] as const) {
      expect(distanceGreenFactor(7.5, s)).toBe(1);
    }
    expect(distanceGreenFactor(7.5, 'fadeaway')).toBeLessThan(1);
  });

  it('measured on the real meter at 2, 4, 6 and 7.5 m (uncontested jumper): ±65 → ±60 → ±54 → ±51 ms', () => {
    const rows = [2, 4, 6, 7.5].map((d) => ({ d, ...windowAt(d) }));
    // eslint-disable-next-line no-console
    console.info(rows.map((r) => `${r.d} m: green ±${r.greenMs.toFixed(1)} ms, perfect ±${r.perfectMs.toFixed(1)} ms`).join(' · '));
    expect(rows[0].greenMs).toBeCloseTo(64.8, 1);   // the shipped ±65 ms: 0.09 × 0.72 s
    expect(rows[1].greenMs).toBeCloseTo(59.6, 1);
    expect(rows[2].greenMs).toBeCloseTo(54.4, 1);
    expect(rows[3].greenMs).toBeCloseTo(50.5, 1);
    expect(rows[0].perfectMs).toBeCloseTo(22.7, 1);  // the shipped ±23 ms
    expect(rows[3].perfectMs).toBeCloseTo(17.7, 1);
  });

  it('the rise is not touched (it paces the release clip): same duration and green centre at every distance', () => {
    const near = windowAt(2).m, far = windowAt(7.5).m;
    expect(far.durationSec).toBe(near.durationSec);
    expect(far.riseSec).toBe(near.riseSec);
    expect(far.greenCenter01).toBe(near.greenCenter01);
  });

  it('perfect timing still pays the same: a release on the centre is perfect at every distance, and perfect is still 0.97', () => {
    for (const d of [2, 4, 6, 7.5]) {
      const { m } = windowAt(d);
      m.update(m.greenCenter01 * m.durationSec);
      expect(m.release()).toBe('perfect');
    }
    expect(SHOT_QUALITY_PCT.perfect).toBe(0.97);
    expect(SHOT_QUALITY_PCT.good).toBe(0.8);
  });

  it('narrowBy never widens and never closes the window', () => {
    const m = new ShotMeter(); m.start(0, 'jumper', 0); const h = m.greenHalfWidth01;
    m.narrowBy(1.5); expect(m.greenHalfWidth01).toBe(h);
    m.narrowBy(0.1); expect(m.greenHalfWidth01).toBeCloseTo(h * 0.5, 12);
  });
});

describe('the finer release grades (the odds do not change)', () => {
  it('a good release names its side and its miss in ms', () => {
    expect(releaseGradeLabel('good', -0.031, 0.065)).toBe('SLIGHTLY EARLY (−31 ms)');
    expect(releaseGradeLabel('good', 0.04, 0.065)).toBe('SLIGHTLY LATE (+40 ms)');
  });

  it('every other grade keeps its own words (null here: the mode says GREEN / EARLY / LATE / WAY LATE as before)', () => {
    for (const q of ['perfect', 'early', 'late', 'brick', 'held'] as const) expect(releaseGradeLabel(q, 0.04, 0.065)).toBeNull();
  });

  it('an offset that is not a good release claims nothing (a non-meter release path)', () => {
    expect(releaseGradeLabel('good', 0.2, 0.065)).toBeNull();      // outside the green
    expect(releaseGradeLabel('good', 0.005, 0.065)).toBeNull();    // inside the perfect band
    expect(releaseGradeLabel('good', NaN, 0.065)).toBeNull();
  });

  it('on the real meter: a release between the perfect band and the green edge grades good, and the label agrees', () => {
    const m = new ShotMeter(); m.start(0, 'jumper', 0);
    const target = m.greenCenter01 * m.durationSec - m.greenHalfSec * 0.7;   // early, inside the green, outside perfect
    m.update(target);
    const q = m.release();
    expect(q).toBe('good');
    expect(releaseGradeLabel(q, m.offsetSec, m.greenHalfSec)).toBe(`SLIGHTLY EARLY (−${Math.round(m.greenHalfSec * 0.7 * 1000)} ms)`);
  });
});

describe('the hooks are in both modes (one line each)', () => {
  const src = (f: string) => readFileSync(path.resolve(__dirname, '../modes', f), 'utf8');
  it.each([['OneVOneMode.ts', 'me.root.position'], ['ThreeVThreeMode.ts', 'me.char.root.position']])('%s narrows at meterStart and names the good release', (f, hero) => {
    const s = src(f);
    expect(s).toContain(`shotMeter.narrowBy(distanceGreenFactor(distXZ(${hero}, RIM_FLOOR), style ?? 'jumper'))`);
    expect(s).toContain('releaseGradeLabel(quality, shotMeter.offsetSec, shotMeter.greenHalfSec)');
  });
});
