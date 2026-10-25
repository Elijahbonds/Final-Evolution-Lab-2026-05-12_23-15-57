// COACH-READINESS: the coach's rule on top of the measured day — every reason, the two kinds, the two actions, which
// rule applies (athlete > team > default, the most protective team), and what a coach may set.
import { describe, expect, it } from 'vitest';
import { applyRule, athleteRead, cleanRule, DEFAULT_RULE, draftTrigger, ruleFor, SOLO_RULE } from '@/lib/coach/readiness/rules';
import { DRAFT_LOW_CHECKS, DROP_PCT } from '@/lib/coach/readiness/thresholds';
import type { PriorCheck, ReadinessFacts, ReadinessRule, StoredRule } from '@/lib/coach/readiness/types';

const base = { n: 6, bestCm: 40, meanCm: 39, dayTeCm: 1.2, days: [] };
const facts = (o: Partial<ReadinessFacts>): ReadinessFacts => ({ baseline: base, dropPct: 0, meanDropPct: 0, realChangeCm: 2.2, belowReal: false, aboveReal: false, feel: null, ...o });
const prev = (day: string, belowReal: boolean): PriorCheck => ({ day, bestCm: 37, meanCm: 36, teCm: 1.4, jumps: 3, poseHz: 60, belowReal, band: 'normal' });
const T = '2026-10-25';
const rule = (o: Partial<ReadinessRule>): ReadinessRule => ({ ...DEFAULT_RULE, source: 'athlete', ...o });

describe('applyRule', () => {
  it('drop_pct: a real drop at or past the line is Low; under it, a real dip (Normal)', () => {
    expect(applyRule(facts({ belowReal: true, dropPct: 9 }), rule({ dropPct: 8 }), null, T)).toMatchObject({ band: 'low', reason: 'low_drop', ease: true });
    expect(applyRule(facts({ belowReal: true, dropPct: 6 }), rule({ dropPct: 8 }), null, T)).toMatchObject({ band: 'normal', reason: 'dip_small', ease: false });
  });

  it('a low feel tips a real dip under the line to Low, never a noise dip', () => {
    expect(applyRule(facts({ belowReal: true, dropPct: 6, feel: 2 }), rule({ dropPct: 8 }), null, T)).toMatchObject({ band: 'low', reason: 'low_drop_feel' });
    expect(applyRule(facts({ belowReal: false, dropPct: 6, feel: 1 }), rule({ dropPct: 3 }), null, T)).toMatchObject({ band: 'normal', reason: 'dip_noise' });
    expect(applyRule(facts({ belowReal: true, dropPct: 6, feel: 3 }), rule({ dropPct: 8 }), null, T).band).toBe('normal');
  });

  it('low_twice: Low only when the check before (within 3 days) was below the smallest real change too', () => {
    const r = rule({ kind: 'low_twice' });
    const f = facts({ belowReal: true, dropPct: 12 });
    expect(applyRule(f, r, null, T).band).toBe('normal');
    expect(applyRule(f, r, prev('2026-10-24', false), T).band).toBe('normal');
    expect(applyRule(f, r, prev('2026-10-24', true), T)).toMatchObject({ band: 'low', reason: 'low_twice' });
    expect(applyRule(f, r, prev('2026-10-20', true), T).band).toBe('normal'); // a 5-day gap is a fresh start
  });

  it('tell me only: Low is said, the day is not eased', () => {
    expect(applyRule(facts({ belowReal: true, dropPct: 15 }), rule({ action: 'tell' }), null, T)).toMatchObject({ band: 'low', ease: false });
  });

  it('up past the noise is Ready, unless the athlete said they feel low', () => {
    expect(applyRule(facts({ aboveReal: true, dropPct: -6 }), DEFAULT_RULE, null, T)).toMatchObject({ band: 'ready', reason: 'up' });
    expect(applyRule(facts({ aboveReal: true, dropPct: -6, feel: 2 }), DEFAULT_RULE, null, T)).toMatchObject({ band: 'normal', reason: 'feel_caps' });
  });

  it('no baseline: building, whatever the rule', () => {
    expect(applyRule(facts({ baseline: null, belowReal: true, dropPct: 30 }), rule({ dropPct: 3 }), null, T).band).toBe('building');
  });

  it('the default and the solo rule (new, owner call): a drop of DROP_PCT.default %, ease', () => {
    expect(DEFAULT_RULE).toEqual({ kind: 'drop_pct', dropPct: DROP_PCT.default, action: 'ease', source: 'default' });
    expect(DROP_PCT.default).toBe(5);
    expect(SOLO_RULE.action).toBe('ease');
  });
});

describe('which rule applies', () => {
  const R = (o: Partial<StoredRule>): StoredRule => ({ coachId: 'c1', scope: 'athlete', scopeId: 'a1', kind: 'drop_pct', dropPct: 10, action: 'tell', updatedAt: '', ...o });
  it('the athlete\'s own, else a team\'s (the most protective of several), else the default', () => {
    const rules = [R({ scope: 'team', scopeId: 't1', dropPct: 12, action: 'tell' }), R({ scope: 'team', scopeId: 't2', dropPct: 8, action: 'ease' })];
    expect(ruleFor([...rules, R({})], 'a1', ['t1', 't2'])).toMatchObject({ source: 'athlete', dropPct: 10, action: 'tell' });
    expect(ruleFor(rules, 'a1', ['t1', 't2'])).toMatchObject({ source: 'team', dropPct: 8, action: 'ease' });
    expect(ruleFor(rules, 'a1', ['t1'])).toMatchObject({ source: 'team', dropPct: 12 });
    expect(ruleFor(rules, 'a1', [])).toEqual(DEFAULT_RULE);
    expect(ruleFor([R({ scopeId: 'someone-else' })], 'a1', [])).toEqual(DEFAULT_RULE);
  });

  it('several coaches: the athlete sees Low if any coach\'s rule reads Low, the easing one first', () => {
    const f = facts({ belowReal: true, dropPct: 9 });
    const tell = applyRule(f, rule({ action: 'tell', dropPct: 6 }), null, T);
    const ease = applyRule(f, rule({ action: 'ease', dropPct: 8 }), null, T);
    const strict = applyRule(f, rule({ dropPct: 15 }), null, T);
    expect(athleteRead([strict, tell, ease], strict)).toBe(ease);
    expect(athleteRead([strict], strict).band).toBe('normal');
  });
});

describe('what a coach may set', () => {
  it('kinds, actions and the percent inside DROP_PCT, in half steps', () => {
    expect(cleanRule({ kind: 'drop_pct', action: 'ease', dropPct: 7.5 })).toEqual({ ok: true, rule: { kind: 'drop_pct', action: 'ease', dropPct: 7.5 } });
    expect(cleanRule({ kind: 'low_twice', action: 'tell' })).toEqual({ ok: true, rule: { kind: 'low_twice', action: 'tell', dropPct: DROP_PCT.default } });
    expect(cleanRule({ kind: 'drop_pct', action: 'ease', dropPct: DROP_PCT.min - 1 })).toEqual({ ok: false, error: 'bad_drop_pct' });
    expect(cleanRule({ kind: 'drop_pct', action: 'ease', dropPct: DROP_PCT.max + 1 })).toEqual({ ok: false, error: 'bad_drop_pct' });
    expect(cleanRule({ kind: 'drop_pct', action: 'ease', dropPct: 7.3 })).toEqual({ ok: false, error: 'bad_drop_pct' });
    expect(cleanRule({ kind: 'harder', action: 'ease' })).toEqual({ ok: false, error: 'bad_kind' });
    expect(cleanRule({ kind: 'drop_pct', action: 'push' })).toEqual({ ok: false, error: 'bad_action' });
  });
});

describe('the weekly draft\'s signal', () => {
  it(`fires at ${DRAFT_LOW_CHECKS} Low checks in a week`, () => {
    expect(draftTrigger(null)).toBeNull();
    expect(draftTrigger({ lowDays: DRAFT_LOW_CHECKS - 1, days: 5 })).toBeNull();
    expect(draftTrigger({ lowDays: DRAFT_LOW_CHECKS, days: 5 })).toBe(`Their daily jump check read Low on ${DRAFT_LOW_CHECKS} of their last 5 checks.`);
  });
});
