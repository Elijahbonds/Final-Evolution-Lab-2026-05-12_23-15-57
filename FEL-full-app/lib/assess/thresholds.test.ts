import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROTOCOL_VERSION, THRESHOLDS, THRESHOLDS_VERSION, THRESHOLD_IDS, bandOf, isProvisional, th, type Band,
} from './thresholds';

describe('the threshold register', () => {
  it('carries the owner-set versions', () => {
    expect(THRESHOLDS_VERSION).toBe('jump-screen-0.2-proposed');   // SCREEN-SHIP: bumped (the draft's bands, A2 reps)
    expect(PROTOCOL_VERSION).toBe('jump-screen-1.0');
  });

  it('NOTHING IS SIGNED OFF: every entry is signedOff false, from the spec, the repo, the research draft or the Squad', () => {
    for (const id of THRESHOLD_IDS) {
      const t = THRESHOLDS[id];
      expect(t.signedOff, id).toBe(false);
      expect(['spec-TUNE-EJ', 'repo-TUNE(elijah)', 'research-advisor-draft-2026-09-28', 'Screening Squad 2026-09-28'], id).toContain(t.source);
      expect(t.spec, id).toMatch(/§|draft|A2-/);
      expect(t.label.length, id).toBeGreaterThan(10);
      if (t.source === 'repo-TUNE(elijah)') expect((t as { repo?: string }).repo, id).toBeTruthy();
    }
  });

  it('the values reused from the repo are the repo\'s own numbers, still unsigned', () => {
    // SCREEN-SHIP: t1.valgus is the Screening Squad's now (0.4 / 0.8 hip half-widths), no longer the repo's 0.35 / 0.70
    expect(THRESHOLDS['t1.valgus'].source).toBe('Screening Squad 2026-09-28');
    expect(bandOf('t1.valgus')).toMatchObject({ good: 0.4, fault: 0.8, faultOp: '>' });
    expect(bandOf('t1.lateralShift').fault).toBe(0.3);
    expect(th('gate.minConfidence')).toBe(0.6);
    expect(th('prq.verticalJump')).toEqual({ floor: 12, ceiling: 40 });
    expect(th('gate.minPoseHz')).toBe(24);
    expect(th('geom.heelRiseRepo')).toBe(0.012);
  });

  it('every band is well formed: good ≠ poor, and a fault line sits between them or at an end', () => {
    for (const id of THRESHOLD_IDS) {
      const v = THRESHOLDS[id].value as unknown;
      if (!v || typeof v !== 'object' || !('good' in v)) continue;
      const b = v as Band;
      expect(b.good, id).not.toBe(b.poor);
      if (b.fault === null) continue;
      const lo = Math.min(b.good, b.poor), hi = Math.max(b.good, b.poor);
      expect(b.fault, id).toBeGreaterThanOrEqual(lo);
      expect(b.fault, id).toBeLessThanOrEqual(hi);
      // the fault fires on the POOR side: a higher-is-better band faults with < / <=, a lower-is-better one with > / >=
      const higherBetter = b.good > b.poor;
      expect(higherBetter ? ['<', '<='] : ['>', '>='], id).toContain(b.faultOp);
    }
  });

  it('the weights are the spec\'s', () => {
    const w1 = th('t1.weights');
    expect(Object.values(w1).reduce((a, b) => a + b, 0)).toBe(100);
    expect(w1.valgusLeft + w1.valgusRight).toBe(20);
    expect(Object.values(th('t3.weights')).reduce((a, b) => a + b, 0)).toBe(100);
    expect(th('score.meanWorst')).toEqual({ mean: 0.7, worst: 0.3 });
    const f = th('prq.flexWeights');
    expect(f.t2 + f.t1Mobility).toBeCloseTo(1, 10);
    expect(f.t2 / f.t1Mobility).toBeCloseTo(0.5 / 0.3, 10);   // the spec's 0.5 : 0.3, renormalized without T4
  });

  it('a score is provisional while anything it used is unsigned — today, always', () => {
    expect(isProvisional(['t1.valgus'])).toBe(true);
    expect(isProvisional([])).toBe(true);
  });

  it('bandOf refuses a non-band id', () => {
    expect(() => bandOf('gate.minConfidence')).toThrow(/not a band/);
  });
});

describe('the sign-off sheet (docs/MIRROR-ASSESS-THRESHOLDS.md) matches the register', () => {
  const doc = readFileSync(join(__dirname, '../../docs/MIRROR-ASSESS-THRESHOLDS.md'), 'utf8');
  const fmt = (v: unknown): string => {
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object' && 'good' in v) {
      const b = v as Band;
      return `good ${b.good} · poor ${b.poor}${b.fault !== null ? ` · fault ${b.faultOp} ${b.fault}` : ''}`;
    }
    return Object.entries(v as object).map(([k, x]) => `${k} ${x}`).join(' · ');
  };

  it('every threshold has a row with its current value and an empty sign-off cell, and the versions are named', () => {
    expect(doc).toContain(THRESHOLDS_VERSION);
    expect(doc).toContain(PROTOCOL_VERSION);
    for (const id of THRESHOLD_IDS) {
      const row = doc.split('\n').find((l) => l.startsWith(`| \`${id}\` |`));
      expect(row, id).toBeDefined();
      expect(row!, id).toContain(`| ${fmt(THRESHOLDS[id].value)} |`);
      expect(row!.endsWith('| no | |'), id).toBe(true);
    }
  });
});
