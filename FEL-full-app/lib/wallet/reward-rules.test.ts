import { describe, expect, it } from 'vitest';
import { DEFAULT_REWARD_RULES, REASON, computeGrant, type RewardRuleConfig } from './reward-rules';

const rule = (o: Partial<RewardRuleConfig> = {}): RewardRuleConfig => ({
  reasonCode: 'TEST', currency: 'coins', formula: 'flat',
  baseAmount: 10, scaleNum: 0, minGrant: 1, maxGrant: 100,
  perMinuteCap: 0, perDayCurrencyCap: 0, active: true, ...o,
});

/**
 * THE MONEY FORMULA. Every coin and shard this app has ever granted came through computeGrant, and until now it had
 * no test of its own — the one place in the codebase where a wrong number is a real loss.
 */
describe('computeGrant', () => {
  it('a flat rule pays its base, whatever the payload says', () => {
    expect(computeGrant(rule({ baseAmount: 7 }), {})).toBe(7);
    expect(computeGrant(rule({ baseAmount: 7 }), { score: 9999 })).toBe(7);
  });

  it('a scoreLinear rule scales with the score and rounds to a whole unit', () => {
    const r = rule({ formula: 'scoreLinear', baseAmount: 2, scaleNum: 0.01, maxGrant: 1000 });
    expect(computeGrant(r, { score: 100 })).toBe(3);     // 2 + 1
    expect(computeGrant(r, { score: 250 })).toBe(5);     // 2 + 2.5 → 4.5 → 5
    expect(computeGrant(r, { score: 0 })).toBe(2);
  });

  it('NEVER pays out on a junk score — the anti-cheat case', () => {
    const r = rule({ formula: 'scoreLinear', baseAmount: 2, scaleNum: 0.01, minGrant: 0 });
    for (const score of [NaN, Infinity, -Infinity, 'lots', null, undefined, {}]) {
      const out = computeGrant(r, { score } as Record<string, unknown>);
      expect(Number.isFinite(out), `score=${String(score)}`).toBe(true);
      expect(out).toBeGreaterThanOrEqual(0);
    }
  });

  it('a negative score can never make a negative grant', () => {
    const r = rule({ formula: 'scoreLinear', baseAmount: 1, scaleNum: 0.5, minGrant: 0 });
    expect(computeGrant(r, { score: -1000 })).toBe(0);
  });

  it('the cap holds', () => {
    const r = rule({ formula: 'scoreLinear', baseAmount: 0, scaleNum: 1, maxGrant: 50 });
    expect(computeGrant(r, { score: 10_000 })).toBe(50);
  });

  it('maxGrant 0 means UNCAPPED, not "pay nothing" — the reading that would zero every reward', () => {
    const r = rule({ formula: 'scoreLinear', baseAmount: 0, scaleNum: 1, maxGrant: 0, minGrant: 0 });
    expect(computeGrant(r, { score: 640 })).toBe(640);
  });

  it('the floor is applied AFTER the cap, so a misconfigured rule pays its floor', () => {
    // minGrant above maxGrant is a configuration error; this records what the code does with it rather than
    // pretending it cannot happen — the floor wins, so the player is never paid nothing by a bad table.
    const r = rule({ baseAmount: 1, minGrant: 20, maxGrant: 5 });
    expect(computeGrant(r, {})).toBe(20);
  });
});

/**
 * THE TABLE ITSELF. A rule with a nonsense bound is a live economy bug that no unit test of computeGrant would
 * catch, because computeGrant is only as sane as what it is handed.
 */
describe('the shipped reward table', () => {
  const entries = Object.entries(DEFAULT_REWARD_RULES);

  it('every rule names itself correctly — a mismatched key pays the wrong reason', () => {
    for (const [key, r] of entries) expect(r.reasonCode, key).toBe(key);
  });

  it('every rule pays a real currency', () => {
    for (const [key, r] of entries) expect(['coins', 'shards', 'lc'], key).toContain(r.currency);
  });

  it('no rule can pay a negative amount, and no bound is negative', () => {
    for (const [key, r] of entries) {
      expect(r.baseAmount, key).toBeGreaterThanOrEqual(0);
      expect(r.minGrant, key).toBeGreaterThanOrEqual(0);
      expect(r.maxGrant, key).toBeGreaterThanOrEqual(0);
      expect(r.perMinuteCap, key).toBeGreaterThanOrEqual(0);
      expect(r.perDayCurrencyCap, key).toBeGreaterThanOrEqual(0);
    }
  });

  it('no EARN rule is floored above its own cap', () => {
    for (const [key, r] of entries) {
      if (r.maxGrant > 0) expect(r.minGrant, `${key}: floor ${r.minGrant} over cap ${r.maxGrant}`).toBeLessThanOrEqual(r.maxGrant);
    }
  });

  it('a scoreLinear rule actually scales, and a flat rule does not pretend to', () => {
    for (const [key, r] of entries) {
      if (r.formula === 'scoreLinear') expect(r.scaleNum, key).toBeGreaterThan(0);
      else expect(r.scaleNum, key).toBe(0);
    }
  });

  it('the daily cap is never below a single grant — a cap that cannot pay once is a broken reward', () => {
    for (const [key, r] of entries) {
      if (r.perDayCurrencyCap > 0) {
        const single = computeGrant(r, { score: 0 });
        expect(r.perDayCurrencyCap, `${key}: day cap ${r.perDayCurrencyCap} under one grant of ${single}`)
          .toBeGreaterThanOrEqual(single);
      }
    }
  });

  it('the rewards this pass added are present and bounded', () => {
    for (const code of [REASON.REFERRAL_BONUS, REASON.MOVEMENT_SCREEN_COMPLETED]) {
      const r = DEFAULT_REWARD_RULES[code];
      expect(r, code).toBeTruthy();
      expect(r.currency).toBe('shards');
      expect(r.maxGrant).toBeGreaterThan(0);
      expect(computeGrant(r, {})).toBeGreaterThan(0);
    }
  });
});
