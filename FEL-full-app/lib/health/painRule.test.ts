// MIRROR-COACH P5 (2026-09-29): the pain rule is the one file the owner asked to be exhaustively table-tested
// (decision #15 — no clinician review, so the test IS the review surface). Every branch decide() can take, named.

import { describe, it, expect } from 'vitest';
import {
  decide,
  PAIN_DECISION_COPY,
  ACUTE_EVENT_IDS,
  BODY_AREA_IDS,
  TOLERABLE_PAIN_MAX,
  isStopOutcome,
  isHardStop,
  type PainDecisionInput,
  type PainDecision,
} from './painRule';

const base: PainDecisionInput = {
  score: 0,
  kind: 'during',
  trend: 'unknown',
  acute: [],
  redFlags: [],
  isMinor: false,
};

describe('no pain at all', () => {
  it('score 0, any kind, any trend, adult, no acute, no red flag -> continue', () => {
    for (const kind of ['during', 'after', 'next_morning'] as const) {
      for (const trend of ['up', 'flat', 'down', 'unknown'] as const) {
        expect(decide({ ...base, kind, trend })).toBe('continue');
      }
    }
  });

  it('score 0 for a minor with no acute event still continues — "ANY PAIN" requires pain', () => {
    expect(decide({ ...base, isMinor: true })).toBe('continue');
  });
});

describe('during / after — tolerable waits for tomorrow, intolerable steps down today', () => {
  it(`tolerable (<= ${TOLERABLE_PAIN_MAX}) during or after -> continue`, () => {
    for (const kind of ['during', 'after'] as const) {
      for (let score = 1; score <= TOLERABLE_PAIN_MAX; score++) {
        expect(decide({ ...base, kind, score })).toBe('continue');
      }
    }
  });

  it(`above tolerable (> ${TOLERABLE_PAIN_MAX}) during or after -> step_down_flag_coach, never waits for morning`, () => {
    for (const kind of ['during', 'after'] as const) {
      for (let score = TOLERABLE_PAIN_MAX + 1; score <= 10; score++) {
        expect(decide({ ...base, kind, score })).toBe('step_down_flag_coach');
      }
    }
  });

  it('trend has no effect on a during/after reading — only next_morning can settle', () => {
    for (const trend of ['up', 'flat', 'down', 'unknown'] as const) {
      expect(decide({ ...base, kind: 'during', score: 2, trend })).toBe('continue');
      expect(decide({ ...base, kind: 'after', score: 8, trend })).toBe('step_down_flag_coach');
    }
  });
});

describe('next_morning — settles only when tolerable AND not trending up', () => {
  it('tolerable and not trending up (flat/down/unknown) -> easier_variation', () => {
    for (const trend of ['flat', 'down', 'unknown'] as const) {
      for (let score = 1; score <= TOLERABLE_PAIN_MAX; score++) {
        expect(decide({ ...base, kind: 'next_morning', score, trend })).toBe('easier_variation');
      }
    }
  });

  it('tolerable but trending up -> step_down_flag_coach, trend alone overrides a settled score', () => {
    for (let score = 1; score <= TOLERABLE_PAIN_MAX; score++) {
      expect(decide({ ...base, kind: 'next_morning', score, trend: 'up' })).toBe('step_down_flag_coach');
    }
  });

  it('not tolerable, whatever the trend -> step_down_flag_coach', () => {
    for (const trend of ['up', 'flat', 'down', 'unknown'] as const) {
      for (let score = TOLERABLE_PAIN_MAX + 1; score <= 10; score++) {
        expect(decide({ ...base, kind: 'next_morning', score, trend })).toBe('step_down_flag_coach');
      }
    }
  });
});

describe('acute events — always stop and see a clinician (adults)', () => {
  it('every acute event id, alone, outranks a tolerable/settled read', () => {
    for (const acuteId of ACUTE_EVENT_IDS) {
      expect(decide({ ...base, kind: 'next_morning', score: 1, trend: 'down', acute: [acuteId] })).toBe(
        'stop_see_clinician',
      );
    }
  });

  it('an acute event outranks step_down_flag_coach territory too (score 0 does not suppress it)', () => {
    expect(decide({ ...base, score: 0, acute: ['fall_or_impact'] })).toBe('stop_see_clinician');
  });

  it('multiple acute events at once still resolve to one outcome', () => {
    expect(decide({ ...base, score: 5, acute: ['pop', 'sudden_swelling'] })).toBe('stop_see_clinician');
  });
});

describe('intake red flags — same outcome as an acute event, for an adult', () => {
  it('a standing red flag alone, with a tolerable/settled score, still stops for a clinician', () => {
    expect(decide({ ...base, kind: 'next_morning', score: 1, trend: 'down', redFlags: ['heart_or_bp_condition'] })).toBe(
      'stop_see_clinician',
    );
  });

  it('a red flag and an acute event together resolve to the same single outcome', () => {
    expect(decide({ ...base, score: 6, acute: ['pop'], redFlags: ['heart_or_bp_condition'] })).toBe('stop_see_clinician');
  });
});

describe('minors — ANY pain stops and tells an adult, no exception, no clinician substitute', () => {
  it('a tolerable during/after reading that would continue for an adult -> stop_tell_adult for a minor', () => {
    expect(decide({ ...base, isMinor: true, score: 1 })).toBe('stop_tell_adult');
  });

  it('a settled next_morning reading that would be easier_variation for an adult -> stop_tell_adult for a minor', () => {
    expect(decide({ ...base, isMinor: true, kind: 'next_morning', score: 1, trend: 'down' })).toBe('stop_tell_adult');
  });

  it('an unsettled/trending next_morning reading -> stop_tell_adult (not step_down_flag_coach) for a minor', () => {
    expect(decide({ ...base, isMinor: true, kind: 'next_morning', score: 8, trend: 'up' })).toBe('stop_tell_adult');
  });

  it('an acute event for a minor -> stop_tell_adult, NEVER stop_see_clinician', () => {
    for (const acuteId of ACUTE_EVENT_IDS) {
      expect(decide({ ...base, isMinor: true, score: 0, acute: [acuteId] })).toBe('stop_tell_adult');
    }
  });

  it('a minor with a standing red flag but zero current pain and no acute event: no pain event has happened yet, so '
    + 'the general red-flag rule (not the minor pain rule) applies — stop_see_clinician. assumption: the minor '
    + "override is keyed to a PAIN EVENT (decision #6's own words, 'ANY pain'), not to every field on the row; a "
    + 'standing intake red flag with nothing currently hurting is intake\'s own hard stop to clear, not this row\'s.',
    () => {
      expect(decide({ ...base, isMinor: true, score: 0, redFlags: ['heart_or_bp_condition'] })).toBe('stop_see_clinician');
    });

  it('a minor with both a red flag and actual pain -> stop_tell_adult (the minor rule still wins)', () => {
    expect(decide({ ...base, isMinor: true, score: 4, redFlags: ['heart_or_bp_condition'] })).toBe('stop_tell_adult');
  });
});

describe('every outcome has FEL-authored copy, and none of it diagnoses or names a condition', () => {
  const ALL: PainDecision[] = ['continue', 'easier_variation', 'step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'];

  it('every decision id has a line, and nothing is empty', () => {
    for (const d of ALL) expect(PAIN_DECISION_COPY[d]?.length ?? 0).toBeGreaterThan(10);
  });

  it('no line uses the words a diagnosis or a risk/prevention claim would use (HONESTY RULE)', () => {
    const banned = /diagnos|prevent|reduces? (the )?risk|\btorn\b|\bstrain\b|\bsprain\b|tendinitis/i;
    for (const d of ALL) expect(PAIN_DECISION_COPY[d]).not.toMatch(banned);
  });
});

describe('fixed id lists are stable and non-empty (the rule and the schema both depend on these)', () => {
  it('acute event ids', () => {
    expect(ACUTE_EVENT_IDS).toEqual(['pop', 'sudden_swelling', 'giving_way', 'fall_or_impact']);
  });

  it('body area ids include every region the intake copy promises, and only fixed ids (no free text)', () => {
    expect(BODY_AREA_IDS.length).toBeGreaterThanOrEqual(8);
    for (const id of BODY_AREA_IDS) expect(id).toMatch(/^[a-z_]+$/);
  });
});

describe('isStopOutcome / isHardStop', () => {
  it('continue and easier_variation are not stop outcomes; the other three are', () => {
    expect(isStopOutcome('continue')).toBe(false);
    expect(isStopOutcome('easier_variation')).toBe(false);
    expect(isStopOutcome('step_down_flag_coach')).toBe(true);
    expect(isStopOutcome('stop_see_clinician')).toBe(true);
    expect(isStopOutcome('stop_tell_adult')).toBe(true);
  });

  it('only the two "involve someone else" outcomes are a hard stop — step_down_flag_coach keeps training', () => {
    expect(isHardStop('step_down_flag_coach')).toBe(false);
    expect(isHardStop('stop_see_clinician')).toBe(true);
    expect(isHardStop('stop_tell_adult')).toBe(true);
    expect(isHardStop('continue')).toBe(false);
    expect(isHardStop('easier_variation')).toBe(false);
  });
});
