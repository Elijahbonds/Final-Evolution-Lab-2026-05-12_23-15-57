// lane/hoops-shot-core: EVERYONE ON THE RIM — the 3v3 teammates, the 3v3 rivals and every dunk's base roll go through the ring,
// and each path's make RATE is kept exactly. Proven three ways:
//   1. closed form — the Weibull scale puts the make radius at the pct quantile (P(made) == pct to 1e-12) inside the clamp;
//   2. statistically — N seeded shots per path through the dice it replaced (`rand() < pct`) and through the ring, over that
//      path's real pct function and a spread of its real inputs: both within 4 σ of the expected rate, and of each other;
//   3. the tails — rimDecides clamps pct to [0.005, 0.995]; the dice did not (a rival's release can ask for more than 1).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { DUNK_PCT, rivalShotPct, LAYUP_RANGE } from './BasketballCore';
import { contestedPct } from './HoopsDefense';
import { DRIVE_CONTEST_PENALTY } from './HoopsMoves';
import { MAKE_RADIUS, scaleFor, shapeFor } from './RimDecides';
import { RIM_RADIUS } from './RimPhysics';
import {
  RING_PCT_MAX, RING_PCT_MIN, diceRate, dunkClankVelocity, dunkMissVelocity, dunkVerdict, matePct, rimDecidesExact, DUNK_RING_QUALITY,
} from './RimForAll';
import { THREEV_TIER, rivalReleasePct, type RivalRelease } from '../modes/threevthreeRules';
import { TIERS } from './Difficulty';

/** mulberry32 — a seeded uniform on [0, 1). */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

const RIM = new Vector3(0, 3.05, -0.6);
const FROM = new Vector3(1.2, 0, 4.5);
const toShooter = (): Vector3 => { const v = FROM.subtract(RIM); v.y = 0; return v; };

// ── each path's REAL pct over a spread of its real inputs ─────────────────────────────────────────────────────────────
interface Shot { pct: number; quality: number; short: number; lateral: number; dunk?: number }

/** 3v3 teammate (teammateShoots): matePct over the finish, the distance, the contest on him; his miss shape as the mode builds it. */
function mateShots(): Shot[] {
  const out: Shot[] = [];
  for (const finish of ['shot', 'alleyoop', 'putback'] as const)
    for (const dist of [1.2, 2.5, 4, 5.5, 6.9, 7.8])
      for (const c of [0, 0.25, 0.5, 0.8, 1]) {
        const style = dist < LAYUP_RANGE ? 'layup' : 'jumper';
        out.push({ pct: matePct(finish, dist, c, style), quality: Math.max(0.15, 0.85 - c * 0.5 - Math.max(0, dist - 6) * 0.05), short: c * 0.8 + Math.max(0, dist - 7) * 0.12, lateral: 0.3 });
      }
  return out;
}

/** 3v3 rival (the end of opponentPossession): rivalReleasePct at every tier, both styles, a catch-and-shoot or not, a spread of
 *  contests and of nerve (a mistake below 1 divides — 0.5 doubles the pct, past 1 for a layup: the dice made those every time). */
function rivalShots(): Shot[] {
  const out: Shot[] = [];
  for (const tier of TIERS)
    for (const style of ['layup', 'jumper'] as const)
      for (const pullUp of [false, true])
        for (const df of [0, 0.3, 0.7, 1])
          for (const mistake of [0.5, 0.8, 1, 1.4]) {
            const r: RivalRelease = { style, pullUp, distToRim: style === 'layup' ? 1.5 : 5.8, defenseFactor: df, ground: df > 0.5 ? 0.3 : 0, mistake };
            out.push({ pct: rivalReleasePct(r, THREEV_TIER[tier]), quality: Math.max(0.15, 0.85 - df * 0.5), short: df * 0.8, lateral: -0.2 });
          }
  return out;
}

/** Dunks (both modes, hero and rival): DUNK_PCT through contestDrive (a poster loses up to DRIVE_CONTEST_PENALTY), and the rival's
 *  contestedPct on top. */
function dunkShots(): Shot[] {
  const out: Shot[] = [];
  for (const base of [DUNK_PCT.dunk, DUNK_PCT.standing, DUNK_PCT.poster, DUNK_PCT.poster - DRIVE_CONTEST_PENALTY * 0.5, DUNK_PCT.poster - DRIVE_CONTEST_PENALTY])
    for (const c of [0, 0.3, 0.6, 1]) out.push({ pct: contestedPct(base, c), quality: DUNK_RING_QUALITY, short: c * 0.7, lateral: 0, dunk: c });
  return out;
}

const PATHS: [string, () => Shot[]][] = [['3v3 teammate', mateShots], ['3v3 rival', rivalShots], ['dunk', dunkShots]];

describe('closed form: the ring makes exactly pct (inside the clamp)', () => {
  it.each(PATHS)('%s — every context', (_n, shots) => {
    for (const s of shots()) {
      const p = Math.max(RING_PCT_MIN, Math.min(RING_PCT_MAX, s.pct));
      const k = shapeFor(s.quality), L = scaleFor(p, k);
      expect(1 - Math.exp(-Math.pow(MAKE_RADIUS / L, k))).toBeCloseTo(p, 12);
    }
  });
});

describe('statistical: N seeded shots per path, the dice (before) vs the ring (after)', () => {
  const N = 40_000;
  it.each(PATHS)('%s — same make rate within 4 σ', (name, shots) => {
    const ctx = shots();
    const before = seeded(0xb4f0), after = seeded(0xaf7e);
    let mb = 0, ma = 0, expected = 0;
    for (let i = 0; i < N; i++) {
      const s = ctx[i % ctx.length];
      expected += diceRate(s.pct);
      if (before() < s.pct) mb++;                                                                  // the dice this path rolled
      const v = s.dunk !== undefined ? dunkVerdict(RIM, FROM, s.pct, s.dunk, after)                                   // a dunk: the modes' own call
        : rimDecidesExact(RIM, toShooter(), s.pct, s.quality, { short: s.short, lateral: s.lateral }, after);       // the ring, as rimVerdictFor asks it
      if (v.made) ma++;
    }
    const e = expected / N, rb = mb / N, ra = ma / N;
    const sigma = Math.sqrt(Math.max(1e-6, e * (1 - e)) / N);
    // eslint-disable-next-line no-console
    console.info(`[RIM-FOR-ALL] ${name}: ${ctx.length} contexts, N ${N} — expected ${(e * 100).toFixed(2)} %, dice ${(rb * 100).toFixed(2)} %, ring ${(ra * 100).toFixed(2)} % (σ ${(sigma * 100).toFixed(2)} pts)`);
    expect(Math.abs(rb - e)).toBeLessThan(4 * sigma);
    expect(Math.abs(ra - e)).toBeLessThan(4 * sigma);
    expect(Math.abs(ra - rb)).toBeLessThan(4 * Math.SQRT2 * sigma);
  });

  it('per context too: the hardest and easiest rival release and dunk, 20k shots each', () => {
    const picks = [...rivalShots(), ...dunkShots()].sort((a, b) => a.pct - b.pct);
    for (const s of [picks[0], picks[Math.floor(picks.length / 2)], picks[picks.length - 1]]) {
      const n = 20_000, rand = seeded(Math.round(s.pct * 1e6) + 11);
      let m = 0;
      for (let i = 0; i < n; i++) if (rimDecidesExact(RIM, toShooter(), s.pct, s.quality, { short: s.short }, rand).made) m++;
      const e = diceRate(s.pct), sigma = Math.sqrt(Math.max(1e-6, e * (1 - e)) / n);
      expect(Math.abs(m / n - e)).toBeLessThan(Math.max(4 * sigma, 1 / n));
    }
  });

  it('seeded is deterministic: the same seed is the same verdicts', () => {
    const a = seeded(5), b = seeded(5);
    for (let i = 0; i < 200; i++) expect(rimDecidesExact(RIM, toShooter(), 0.5, 0.6, {}, a).radial).toBe(rimDecidesExact(RIM, toShooter(), 0.5, 0.6, {}, b).radial);
  });
});

describe('the tails the clamp would have moved — kept exact', () => {
  it('a rival release the dice made every time (pct > 1) is made every time', () => {
    const big = rivalReleasePct({ style: 'layup', pullUp: false, distToRim: 1.2, defenseFactor: 0, ground: 0, mistake: 0.5 }, THREEV_TIER.elite);
    expect(big).toBeGreaterThan(1);
    const rand = seeded(9);
    for (let i = 0; i < 5000; i++) expect(rimDecidesExact(RIM, toShooter(), big, 0.85, {}, rand).made).toBe(true);
  });

  it.each([[0.998], [0.9995], [0.003], [0.001]])('pct %f lands its own rate, not the clamp\'s', (pct) => {
    const n = 200_000, rand = seeded(Math.round(pct * 1e5) + 3);
    let m = 0;
    for (let i = 0; i < n; i++) if (rimDecidesExact(RIM, toShooter(), pct, 0.5, {}, rand).made) m++;
    const sigma = Math.sqrt(pct * (1 - pct) / n);
    expect(Math.abs(m / n - pct)).toBeLessThan(4 * sigma);
    const clamp = Math.max(RING_PCT_MIN, Math.min(RING_PCT_MAX, pct));
    expect(Math.abs(m / n - clamp)).toBeGreaterThan(Math.abs(m / n - pct));   // nearer the asked rate than the clamped one
  });

  it('pct ≤ 0 never makes; pct ≥ 1 always does', () => {
    const rand = seeded(4);
    for (let i = 0; i < 3000; i++) { expect(rimDecidesExact(RIM, toShooter(), 0, 0.5, {}, rand).made).toBe(false); expect(rimDecidesExact(RIM, toShooter(), 1, 0.5, {}, rand).made).toBe(true); }
  });

  it('the verdict and the iron still agree after a re-draw (made ⇔ inside the make radius)', () => {
    const rand = seeded(12);
    for (let i = 0; i < 3000; i++) { const v = rimDecidesExact(RIM, toShooter(), i % 2 ? 1.3 : -0.2, 0.5, {}, rand); expect(v.made).toBe(v.radial <= MAKE_RADIUS); expect(v.play).toBeTruthy(); }
  });
});

describe('the teammate pct moved verbatim', () => {
  it('matePct is the old inline expression', () => {
    for (const c of [0, 0.4, 1]) for (const d of [1.2, 5, 7.5]) {
      const st = d < LAYUP_RANGE ? 'layup' : 'jumper';
      expect(matePct('shot', d, c, st)).toBe(rivalShotPct(d, c, st));
      expect(matePct('alleyoop', d, c, st)).toBe(Math.max(0.55, 0.82 - c * 0.2));
      expect(matePct('putback', d, c, st)).toBe(Math.max(0.55, 0.82 - c * 0.2));
    }
  });
});

describe('a missed dunk bounces off the iron where the error put it', () => {
  const ts = toShooter();
  const back = ts.clone().normalize();
  it('front iron (short) comes back at the dunker; back iron goes long; side iron goes wide', () => {
    const front = dunkClankVelocity({ depthError: -0.25, lateralError: 0, descentSpeed: 5 }, ts);
    expect(front.x * back.x + front.z * back.z).toBeGreaterThan(2);
    const long = dunkClankVelocity({ depthError: 0.25, lateralError: 0, descentSpeed: 5 }, ts);
    expect(long.x * back.x + long.z * back.z).toBeLessThan(-2);
    const side = dunkClankVelocity({ depthError: 0, lateralError: 0.25, descentSpeed: 5 }, ts);
    expect(Math.abs(side.x * back.x + side.z * back.z)).toBeLessThan(1e-9);
    expect(Math.hypot(side.x, side.z)).toBeGreaterThan(2);
  });
  it('the same scale as the clank it replaced (3.2 out, 2.6 up): 2.4–4.0 out, 2.6 up', () => {
    const rand = seeded(21);
    for (let i = 0; i < 2000; i++) {
      const v = dunkVerdict(RIM, FROM, 0.3, 0.5, rand);
      const vel = dunkMissVelocity(v, FROM, RIM);
      const h = Math.hypot(vel.x, vel.z);
      expect(h).toBeGreaterThanOrEqual(2.4 - 1e-9); expect(h).toBeLessThanOrEqual(4.0 + 1e-9); expect(vel.y).toBe(2.6);
    }
    expect(RIM_RADIUS).toBeGreaterThan(0);
  });
  it('a contested dunk misses off the front more often than an open one', () => {
    const count = (c: number): number => { const r = seeded(31); let f = 0, m = 0; for (let i = 0; i < 20000; i++) { const v = dunkVerdict(RIM, FROM, 0.5, c, r); if (!v.made) { m++; if (v.profile.depthError < 0) f++; } } return f / m; };
    expect(count(1)).toBeGreaterThan(count(0) + 0.15);
  });
});

describe('the modes roll no dice for these shots any more (scan)', () => {
  const src = (f: string) => readFileSync(path.resolve(__dirname, '../modes', f), 'utf8');
  const one = src('OneVOneMode.ts'), three = src('ThreeVThreeMode.ts');
  it('no `Math.random() < pct` for a dunk, a teammate or a rival release', () => {
    for (const s of [one, three]) {
      expect(s).not.toMatch(/let made = Math\.random\(\) < c\.pct/);
      expect(s).not.toMatch(/let made = Math\.random\(\) < contestedPct\(c\.pct, contest\)/);
      expect(s).not.toContain('clankOffRim(ball, RIM)');
    }
    expect(three).not.toMatch(/Math\.random\(\) < rivalShotPct\(dist, mateContest, mateStyle\)/);
    expect(three).not.toMatch(/Math\.random\(\) < Math\.max\(0\.55, 0\.82 - mateContest \* 0\.2\)/);
    expect(three).not.toMatch(/const made = Math\.random\(\) < rivalReleasePct/);
  });
  it('the ring is asked instead, with the pct each path computed', () => {
    for (const s of [one, three]) {
      expect(s).toContain('dunkVerdict(RIM, from, c.pct, c.contested ? 1 : 0)');
      expect(s).toContain('dunkVerdict(RIM, from, contestedPct(c.pct, contest), contest)');
      expect(s).toContain('dunkMissVelocity(dunkV, from, RIM)');
      expect(s).toContain('dunkMissVelocity(dunkVF, from, RIM)');
    }
    expect(three).toContain('const mPct = matePct(finish, dist, mateContest, mateStyle);');
    expect(three).toContain('rimVerdictFor(mateMiss.from, mPct, mateMiss.quality01, mateMiss.short, mateMiss.lateral); const made = mv.made;');
    expect(three).toContain('rimVerdictFor(mateMiss.from, rPct, mateMiss.quality01, mateMiss.short, mateMiss.lateral); const made = rv.made;');
    expect(three).toContain('rimDecidesExact(RIM, toShooter, pct, q01, { short, lateral })');
  });
});
