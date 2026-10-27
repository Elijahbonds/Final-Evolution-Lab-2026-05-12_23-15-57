// OV75-1 (H-04, spec OV75-1-ROOKIE-BUMP-STRIP-GATE-2026-10-24): the 1v1 bump strip per opponent tier.
// ROOKIE: Option B (TUNE, PM 2026-10-24) — 0.06 per roll, one roll per 5000 ms (Option A, chance 0, is the alternative). PRO / ELITE: 0.18 per roll, one roll per 2500 ms, exactly as before.
// A staked or head-to-head run still plays PRO. OV-S4 MEASURES the #418 meBumpAge reset (it is not changed here).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AI_BUMP_STRIP_CHANCE, AI_BUMP_STRIP_CHANCE_BY_TIER, BUMP_STRIP_COOLDOWN_MS_BY_TIER, BUMP_STRIP_WINDOW_SEC,
  aiBumpStripChance, aiBumpStrips, bumpStripCooldownMs,
} from '../core/HoopsDefense';
import { TIERS, tierForSearch, type Tier } from '../core/Difficulty';
import { AI_REACH_COOLDOWN_SEC, AI_REACH_TELL_SEC, resolveAiReach } from '../core/ReachTell';

/** mulberry32: a seeded stream, so every draw here is the same on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SRC = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const SRC_3V3 = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('OV-S1: the tier table', () => {
  it('PRO and ELITE are AI_BUMP_STRIP_CHANCE (0.18) and 2500 ms, unchanged', () => {
    expect(AI_BUMP_STRIP_CHANCE).toBe(0.18);
    for (const t of ['pro', 'elite'] as const) {
      expect(AI_BUMP_STRIP_CHANCE_BY_TIER[t]).toBe(0.18);
      expect(AI_BUMP_STRIP_CHANCE_BY_TIER[t]).toBe(AI_BUMP_STRIP_CHANCE);
      expect(BUMP_STRIP_COOLDOWN_MS_BY_TIER[t]).toBe(2500);
      expect(aiBumpStripChance(t)).toBe(0.18);
      expect(bumpStripCooldownMs(t)).toBe(2500);
    }
  });
  it('ROOKIE never strips more often than PRO, nor rolls sooner; Option B is the default (0.06, 5000 ms)', () => {
    expect(AI_BUMP_STRIP_CHANCE_BY_TIER.rookie).toBeLessThanOrEqual(AI_BUMP_STRIP_CHANCE_BY_TIER.pro);
    expect(BUMP_STRIP_COOLDOWN_MS_BY_TIER.rookie).toBeGreaterThanOrEqual(2500);
    expect(AI_BUMP_STRIP_CHANCE_BY_TIER.rookie).toBe(0.06);   // TUNE(elijah): Option B
    expect(BUMP_STRIP_COOLDOWN_MS_BY_TIER.rookie).toBe(5000);   // TUNE(elijah): Option B
    expect(aiBumpStripChance('rookie')).toBe(0.06);
    expect(bumpStripCooldownMs('rookie')).toBe(5000);
  });
  it('every tier has a value', () => {
    for (const t of TIERS) {
      expect(Number.isFinite(AI_BUMP_STRIP_CHANCE_BY_TIER[t])).toBe(true);
      expect(Number.isFinite(BUMP_STRIP_COOLDOWN_MS_BY_TIER[t])).toBe(true);
    }
    expect(Object.keys(AI_BUMP_STRIP_CHANCE_BY_TIER).sort()).toEqual([...TIERS].sort());
    expect(Object.keys(BUMP_STRIP_COOLDOWN_MS_BY_TIER).sort()).toEqual([...TIERS].sort());
  });
});

describe('OV-S2: aiBumpStrips with a chance', () => {
  it('chance 0 never strips, even on a roll of 0; the edge is strict', () => {
    expect(aiBumpStrips(true, 1, () => 0, 0)).toBe(false);
    expect(aiBumpStrips(true, 1, () => 0.17, 0.18)).toBe(true);
    expect(aiBumpStrips(true, 1, () => 0.18, 0.18)).toBe(false);
  });
  it('the 3-argument form is the 4-argument form at 0.18 (1000 seeded draws)', () => {
    const a = mulberry32(0x5eed), b = mulberry32(0x5eed);
    for (let i = 0; i < 1000; i++) {
      const set = i % 7 !== 0, facing = (i % 11) / 5 - 1;
      expect(aiBumpStrips(set, facing, a)).toBe(aiBumpStrips(set, facing, b, 0.18));
    }
  });
});

describe('OV-S3: OneVOneMode reads the tier once per run (source scan)', () => {
  it('the bump-strip call passes bumpStripChance; the gate reads bumpStripCooldown, not the 2500 literal', () => {
    expect(SRC).toMatch(/aiBumpStrips\(foeVelLast\.length\(\) < 1\.0, facing, roll, bumpStripChance\)/);
    const gate = SRC.split('\n').find((l) => l.includes('performance.now() - lastBumpStripAt >'))!;
    expect(gate).toContain('> bumpStripCooldown)');
    expect(gate).not.toContain('> 2500)');
  });
  it('both run starts (onPlay\'s readRules consumer and the rematch reset) set both from runTier()', () => {
    const set = /bumpStripChance = aiBumpStripChance\(runTier\(\)\); bumpStripCooldown = bumpStripCooldownMs\(runTier\(\)\);/g;
    expect(SRC.match(set)).toHaveLength(2);
    const onPlay = SRC.slice(SRC.indexOf('onPlay(ctx: ModeContext)'), SRC.indexOf('async load(ctx: ModeContext)'));
    expect(onPlay).toMatch(/knobs = r\.knobs;[\s\S]*bumpStripChance = aiBumpStripChance\(runTier\(\)\)/);
    expect(SRC).toMatch(/knobs = ONEVONE_TIER\[runTier\(\)\] \?\? ONEVONE_TIER\.pro;\n\s+bumpStripChance = aiBumpStripChance\(runTier\(\)\)/);
    expect(SRC.match(/· bump strip \$\{bumpStripChance\}/g)).toHaveLength(2);
  });
  it('no bare readTier() call in 1v1; 3v3 still calls aiBumpStrips with three arguments', () => {
    expect(SRC).not.toMatch(/\breadTier\(\)/);
    const call = SRC_3V3.slice(SRC_3V3.indexOf('aiBumpStrips('));
    expect(call).toMatch(/^aiBumpStrips\(victim\.vel\.length\(\) < 1\.0, facingCos\(victim\.char\.root\.rotation\.y, victim\.char\.root\.position, me\.char\.root\.position\), roll\)\)/);
    expect(SRC_3V3.match(/aiBumpStrips\(/g)).toHaveLength(1);
  });
});

describe('OV-S4: the #418 meBumpAge reset, measured (not changed)', () => {
  const N = 10000;   // a sample size, not a game value
  /** Reach start delay after a contact: d ~ U[0, AI_REACH_COOLDOWN_SEC]. MODELING ASSUMPTION — the real delay distribution is
   *  UNMEASURED. The handler never moves the ball during the tell (movedDuringTell false: the worst case). */
  function measure(tier: Tier, withReset: boolean) {
    const rng = mulberry32(0xf751);
    let bump = 0, reach = 0;
    for (let i = 0; i < N; i++) {
      if (aiBumpStrips(true, 1, rng, aiBumpStripChance(tier))) bump++;   // worst case: set and square
      const d = rng() * AI_REACH_COOLDOWN_SEC;
      const exposed = withReset ? d <= BUMP_STRIP_WINDOW_SEC : false;
      const out = resolveAiReach({ tellSec: AI_REACH_TELL_SEC, eligible: true, inRange: true, movedDuringTell: false, exposed, onHim: false, carrierSpeed: 0, foulSpeed: 99, roll: rng });
      if (out === 'strip') reach++;
    }
    return { bump, reach };
  }
  it.each(TIERS)('%s: logs the bump strips and the reach strips with and without the reset', (tier) => {
    const w = measure(tier, true), wo = measure(tier, false);
    expect(w.bump).toBe(wo.bump);   // the two arms draw the same stream
    const delta = (w.reach - wo.reach) / N;
    console.info(`[OV-S4] ${tier} N=${N} bump strips ${w.bump}/${N} · reach strips with reset ${w.reach}/${N} · without ${wo.reach}/${N} · delta ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} (${((w.reach / wo.reach - 1) * 100).toFixed(1)} %)`);
    if (tier === 'rookie') {
      const p = aiBumpStripChance('rookie');
      expect(w.bump / N).toBeLessThanOrEqual(p + 3 * Math.sqrt((p * (1 - p)) / N));
      if (p === 0) expect(w.bump).toBe(0);
    }
  });
});

describe('OV-S5: a staked or head-to-head run is PRO', () => {
  it.each(['?arena=x', '?mp=x', '?c=x'])('%s with a ROOKIE pick strips at 0.18', (q) => {
    expect(tierForSearch(q, 'rookie')).toBe('pro');
    expect(aiBumpStripChance(tierForSearch(q, 'rookie'))).toBe(0.18);
    expect(bumpStripCooldownMs(tierForSearch(q, 'rookie'))).toBe(2500);
  });
  it('an unstaked ROOKIE pick plays its own table', () => {
    expect(aiBumpStripChance(tierForSearch('', 'rookie'))).toBe(AI_BUMP_STRIP_CHANCE_BY_TIER.rookie);
  });
});

describe('OV-S6: the cooldown caps the rolls', () => {
  /** Hard contacts every 1000 ms for 20 s through the mode's gate (now − last > cooldown), counting rolls. */
  function rolls(cooldownMs: number): number {
    let last = -Infinity, n = 0;
    for (let t = 1000; t <= 20000; t += 1000) if (t - last > cooldownMs) { last = t; n++; }
    return n;
  }
  it('ROOKIE (Option B, 5000 ms) rolls at most ⌈20000 / 5000⌉ = 4 times; PRO at most ⌈20000 / 2500⌉ = 8', () => {
    expect(rolls(bumpStripCooldownMs('rookie'))).toBeLessThanOrEqual(Math.ceil(20000 / bumpStripCooldownMs('rookie')));
    expect(rolls(bumpStripCooldownMs('rookie'))).toBeLessThanOrEqual(4);
    expect(rolls(bumpStripCooldownMs('pro'))).toBeLessThanOrEqual(8);
    expect(rolls(bumpStripCooldownMs('rookie'))).toBeLessThan(rolls(bumpStripCooldownMs('pro')));
  });
  it('a seeded ROOKIE run: strips only on a roll, never more than the rolls; Option A (chance 0) would strip none', () => {
    const run = (chance: number) => {
      const rng = mulberry32(0xf751);
      let strips = 0, n = 0, last = -Infinity;
      for (let t = 1000; t <= 20000; t += 1000) {
        if (t - last > bumpStripCooldownMs('rookie')) { last = t; n++; if (aiBumpStrips(true, 1, rng, chance)) strips++; }
      }
      return { strips, n };
    };
    const b = run(aiBumpStripChance('rookie'));
    expect(b.n).toBeLessThanOrEqual(4);
    expect(b.strips).toBeLessThanOrEqual(b.n);
    expect(run(0).strips).toBe(0);   // Option A, the alternative
  });
});
