// The pilot's statistics on data with known answers (docs/JUMP-PILOT-PROTOCOL.md §7): Bland-Altman by hand, ICC(2,1)
// against Shrout & Fleiss's own worked example (1979, Table 2: 0.29), test–retest by hand, the pass bar, and the pairing
// of an app CSV with a plate CSV on synthetic data whose bias and spread are built in.
import { describe, expect, it } from 'vitest';
import { analyzePilot, blandAltman, icc21, passBar, reliability, reportMarkdown } from './pilotStats';
import { toCsv } from '@/lib/csv/csv';

describe('Bland-Altman', () => {
  it('bias, SD and the 95 % limits, by hand', () => {
    const ba = blandAltman([10, 12, 14, 16], [9, 12, 13, 14]);   // d = 1, 0, 1, 2
    expect(ba.n).toBe(4);
    expect(ba.bias).toBeCloseTo(1, 10);
    expect(ba.sd).toBeCloseTo(Math.sqrt(2 / 3), 10);
    expect(ba.loaLow).toBeCloseTo(1 - 1.96 * Math.sqrt(2 / 3), 10);
    expect(ba.loaHigh).toBeCloseTo(1 + 1.96 * Math.sqrt(2 / 3), 10);
  });
  it('refuses lists that do not pair', () => {
    expect(() => blandAltman([1, 2], [1])).toThrow();
    expect(() => blandAltman([1], [1])).toThrow();
  });
});

describe('ICC(2,1)', () => {
  it('Shrout & Fleiss 1979, Table 2 (six targets, four judges): 0.29', () => {
    const t = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]];
    expect(icc21(t)).toBeCloseTo(0.29, 2);
  });
  it('perfect agreement is 1; a constant offset costs agreement (absolute, not consistency): 2/3 by hand', () => {
    expect(icc21([[1, 1], [2, 2], [3, 3]])).toBeCloseTo(1, 10);
    expect(icc21([[1, 2], [2, 3], [3, 4]])).toBeCloseTo(2 / 3, 10);
  });
});

describe('test–retest', () => {
  it('typical error, CV, MDC95, by hand', () => {
    const r = reliability([40, 50, 60], [42, 49, 63]);   // d = 2, −1, 3
    const sd = Math.sqrt(26 / 6), te = sd / Math.SQRT2;
    expect(r.te).toBeCloseTo(te, 10);
    expect(r.cvPct).toBeCloseTo((te / (304 / 6)) * 100, 10);
    expect(r.mdc95).toBeCloseTo(1.96 * Math.SQRT2 * te, 10);
    expect(r.meanChange).toBeCloseTo(4 / 3, 10);
    expect(r.icc).toBeGreaterThan(0.9);
  });
});

describe('the pass bar', () => {
  const ba = (bias: number, sd: number) => ({ n: 40, bias, sd, loaLow: bias - 1.96 * sd, loaHigh: bias + 1.96 * sd, meanRef: 40 });
  it('|bias| ≤ 1 cm, both limits within ±3 cm, ICC ≥ 0.97 — each can fail alone', () => {
    expect(passBar(ba(0.5, 1), 0.98)).toEqual({ pass: true, bias: true, loa: true, icc: true });
    expect(passBar(ba(1.2, 0.5), 0.98)).toMatchObject({ pass: false, bias: false });
    expect(passBar(ba(0, 1.6), 0.98)).toMatchObject({ pass: false, loa: false });
    expect(passBar(ba(0, 1), 0.96)).toMatchObject({ pass: false, icc: false });
  });
});

describe('pairing the files', () => {
  // 40 people × 2 sessions × 3 trials; the plate's height spread like adults (25–60 cm); the app = plate + a built-in
  // bias + an alternating ±0.5 cm, so the bias and SD are known exactly
  const build = (bias: number) => {
    const app: (string | number | null)[][] = [], plate: (string | number | null)[][] = [];
    let i = 0;
    for (let p = 1; p <= 40; p++) for (const s of [1, 2]) for (let t = 1; t <= 3; t++) {
      const h = 25 + ((p * 7) % 35) + t * 0.4 + (s === 2 ? 0.3 : 0);
      const d = bias + (i++ % 2 ? 0.5 : -0.5);
      plate.push([`P${p}`, s, 'cmjHips', t, h, Math.sqrt(2 * 9.81 * h / 100)]);
      app.push([`P${p}`, s, 'cmjHips', t, 'video', 'yes', h + d, Math.sqrt(2 * 9.81 * (h + d) / 100)]);
    }
    app.push(['P1', 1, 'cmjHips', 9, 'video', 'no', 80, null]);   // refused by the app: counted, not paired
    plate.push(['P99', 1, 'cmjHips', 1, 40, null]);               // a plate trial the app missed
    return {
      app: toCsv(['participant', 'session', 'test', 'trial', 'source', 'valid', 'height_tov_cm', 'v0_mps'], app),
      plate: toCsv(['participant', 'session', 'test', 'trial', 'height_cm', 'v0_mps'], plate),
    };
  };
  it('a 0.3 cm bias with ±0.5 cm spread passes; the bias and SD come back exactly', () => {
    const { app, plate } = build(0.3);
    const r = analyzePilot(app, plate);
    expect(r.pairs).toBe(240);
    expect(r.refused).toBe(1);
    expect(r.unpaired).toEqual({ test: 0, ref: 1 });
    const h = r.validity.find((g) => g.measure === 'height')!;
    expect(h.group).toBe('cmjHips · video');
    expect(h.ba.bias).toBeCloseTo(0.3, 10);
    expect(h.ba.sd).toBeCloseTo(Math.sqrt((240 / 239) * 0.25), 10);
    expect(h.icc).toBeGreaterThan(0.99);
    expect(h.verdict!.pass).toBe(true);
    const v = r.validity.find((g) => g.measure === 'v0')!;
    expect(v.verdict).toBeNull();
    expect(v.ba.bias).toBeGreaterThan(0);
    // retest: best per session, both methods; the plate's built-in session change is +0.3 cm
    const pr = r.retest.find((x) => x.who === 'plate' && x.measure === 'height')!;
    expect(pr.r.n).toBe(40);
    expect(pr.r.meanChange).toBeCloseTo(0.3, 10);
    expect(reportMarkdown(r)).toContain('| cmjHips · video | Jump height (cm) | 240 |');
    expect(reportMarkdown(r)).toContain('PASS');
  });
  it('a 2 cm bias fails on the bias (and says which)', () => {
    const { app, plate } = build(2);
    const h = analyzePilot(app, plate).validity.find((g) => g.measure === 'height')!;
    expect(h.verdict).toMatchObject({ pass: false, bias: false });
    expect(reportMarkdown(analyzePilot(app, plate))).toMatch(/FAIL \(bias/);
  });
});
