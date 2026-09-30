// MIRROR-COACH P6 (2026-09-29): lib/health/readiness.ts — the pure read, the validation, the day rule and the coach
// view. The route's own behaviour (consent gate, one-per-day, clear) is lib/health/readiness-route.test.ts; the
// never-scored guard is lib/health/readiness-never-scored.test.ts.
import { describe, expect, it } from 'vitest';
import {
  COACH_READINESS_WINDOW_MS, LOW_ITEM_STRAIN, READINESS_EXTRA_WARMUP_MINUTES, READINESS_GUARDIAN_FEATURE,
  READINESS_ITEMS, READINESS_NOT_SCORED_LINE, READINESS_SUGGESTION, READINESS_SUGGESTIONS, ReadinessValidationError, coachReadinessView, isEmptyCheckIn,
  isPlausibleToday, localDayKey, parseReadinessAnswers, readReadiness, readinessDayLabel, readinessSuggestion, strainOf, warmupMinutesFor,
  type ReadinessHistoryRow, type ReadinessWarmupKind,
} from './readiness';
import { canUse } from '../consent/guardianGate';

describe('the four questions', () => {
  it('sleep, soreness, energy, mood — in that order, each with words at both ends', () => {
    expect(READINESS_ITEMS.map((i) => i.id)).toEqual(['sleep', 'soreness', 'energy', 'mood']);
    for (const i of READINESS_ITEMS) {
      expect(i.prompt.length, i.id).toBeGreaterThan(3);
      expect(i.anchors[1], i.id).toBeTruthy();
      expect(i.anchors[5], i.id).toBeTruthy();
    }
  });

  it('soreness is stored the natural way round (5 = very sore) and read the other way', () => {
    const soreness = READINESS_ITEMS.find((i) => i.id === 'soreness')!;
    const sleep = READINESS_ITEMS.find((i) => i.id === 'sleep')!;
    expect(soreness.anchors[5]).toBe('Very');
    expect(strainOf(soreness, 1)).toBe(0);
    expect(strainOf(soreness, 5)).toBe(4);
    expect(strainOf(sleep, 5)).toBe(0);
    expect(strainOf(sleep, 1)).toBe(4);
  });
});

describe('readReadiness — the pure read', () => {
  it('nothing answered reads as a skip: the usual warm-up, said as "no check-in", never guessed as ok', () => {
    for (const a of [null, undefined, {}, { sleep: null, soreness: null, energy: null, mood: null }]) {
      const r = readReadiness(a);
      expect(r).toEqual({
        level: 'skip', extraWarmupMinutes: 0,
        suggestion: READINESS_SUGGESTION.skip, answered: 0, lowItems: [],
      });
    }
  });

  it('a good morning reads ok with the usual warm-up', () => {
    const r = readReadiness({ sleep: 4, soreness: 2, energy: 4, mood: 5 });
    expect(r.level).toBe('ok');
    expect(r.extraWarmupMinutes).toBe(0);
    expect(r.suggestion).toBe(READINESS_SUGGESTION.ok);
    expect(r.lowItems).toEqual([]);
    expect(r.answered).toBe(4);
  });

  it('two low items read low and lengthen the warm-up', () => {
    const r = readReadiness({ sleep: 2, soreness: 4, energy: 3, mood: 3 });
    expect(r.level).toBe('low');
    expect(r.lowItems).toEqual(['sleep', 'soreness']);
    expect(r.extraWarmupMinutes).toBe(READINESS_EXTRA_WARMUP_MINUTES.low);
    // MIRROR-COACH P6 FIX: no minutes figure on the read — only the warm-up card knows the plan's real length
    expect(r).not.toHaveProperty('warmupMinutes');
    expect(r.suggestion).toBe(READINESS_SUGGESTION.low);
  });

  it('ONE low item that is not at the worst end is still an ok day (one short night is not a low day)', () => {
    const r = readReadiness({ sleep: 2, soreness: 1, energy: 4, mood: 4 });
    expect(r.level).toBe('ok');
    expect(r.lowItems).toEqual(['sleep']);   // named, but not enough on its own
  });

  it('any single item at the very worst end reads low, even answered alone', () => {
    expect(readReadiness({ sleep: 1 }).level).toBe('low');
    expect(readReadiness({ soreness: 5 }).level).toBe('low');
    expect(readReadiness({ energy: 1, mood: 5 }).level).toBe('low');
    expect(readReadiness({ mood: 1 }).lowItems).toEqual(['mood']);
  });

  it('partial answers read on what was answered; the rest never count as a middle value', () => {
    const r = readReadiness({ energy: 4 });
    expect(r).toMatchObject({ level: 'ok', answered: 1, lowItems: [] });
  });

  it('junk values are "not answered", never clamped into the scale', () => {
    const r = readReadiness({ sleep: 0, soreness: 6, energy: 2.5, mood: Number.NaN });
    expect(r.level).toBe('skip');
    expect(r.answered).toBe(0);
  });

  it('the low threshold is the one named constant', () => {
    expect(LOW_ITEM_STRAIN).toBe(3);
  });
});

describe('warm-up length', () => {
  // MIRROR-COACH P6 FIX (2026-09-29): READINESS_BASE_WARMUP_MINUTES (the Wake-Up's ten) is gone with the read's
  // warmupMinutes — the base is the warm-up builder's own (lib/coach/warmup.ts DEFAULT_WARMUP_MINUTES, 14; held together
  // in warmup.test.ts), and this module only says how many minutes a low day adds.

  it('a low day is never shorter, and skipping is never a way to a shorter warm-up than answering', () => {
    expect(READINESS_EXTRA_WARMUP_MINUTES.low).toBeGreaterThan(0);
    expect(READINESS_EXTRA_WARMUP_MINUTES.ok).toBe(0);
    expect(READINESS_EXTRA_WARMUP_MINUTES.skip).toBe(READINESS_EXTRA_WARMUP_MINUTES.ok);
  });

  it('a builder with its own base gets the same extra on top', () => {
    expect(warmupMinutesFor('low', 14)).toBe(14 + READINESS_EXTRA_WARMUP_MINUTES.low);
    expect(warmupMinutesFor('ok', 14)).toBe(14);
    expect(warmupMinutesFor('skip', 14)).toBe(14);
  });
});

describe('copy — FEL’s own words, honest about what this is', () => {
  const every = Object.values(READINESS_SUGGESTIONS).flatMap((byKind) => Object.values(byKind));
  const all = [...every, READINESS_NOT_SCORED_LINE, ...READINESS_ITEMS.flatMap((i) => [i.prompt, i.anchors[1], i.anchors[5]])].join(' ').toLowerCase();

  it('never claims to reduce risk or prevent injury, never names a condition, never diagnoses', () => {
    for (const bad of ['risk', 'prevent', 'injur', 'overtrain', 'fatigue syndrome', 'depress', 'anxiety', 'insomnia', 'diagnos', 'recover faster', 'hrv']) {
      expect(all, bad).not.toContain(bad);
    }
  });

  it('the easier day is an offer, not an order, on every kind of day', () => {
    for (const kind of ['generated', 'coach', 'none'] as const) {
      expect(readinessSuggestion('low', kind), kind).toMatch(/if the main work still feels heavy/i);
      expect(readinessSuggestion('low', kind), kind).toMatch(/builds? capacity/i);
    }
  });

  // MIRROR-COACH P6 FIX (2026-09-29, code review): this test pinned "never shared" — while a coach with the client's
  // coach_view grant sees every check-in (app/api/coach/attention; Privacy §5 says so). The line now says what
  // actually happens, and this holds it to the coach-view behaviour: coachReadinessView answers only with the grant.
  it('the card says it is not scored or paid, and exactly who can see it — the same rule coachReadinessView runs', () => {
    expect(READINESS_NOT_SCORED_LINE).toMatch(/not scored/i);
    expect(READINESS_NOT_SCORED_LINE).toMatch(/never paid/i);
    expect(READINESS_NOT_SCORED_LINE).toMatch(/never in a share link/i);
    expect(READINESS_NOT_SCORED_LINE).not.toMatch(/never shared/i);
    expect(READINESS_NOT_SCORED_LINE).toMatch(/coach sees it only if you turned on coach access/i);
    const row: ReadinessHistoryRow = { date: '2026-09-29', sleep: 3, soreness: 2, energy: 4, mood: 4, updatedAt: new Date('2026-09-29T07:00:00Z') };
    expect(coachReadinessView([row], false)).toBeNull();          // no coach access: the coach sees nothing
    expect(coachReadinessView([row], true)).not.toBeNull();       // coach access: the coach sees it — and the card says so
    expect(READINESS_NOT_SCORED_LINE).not.toMatch(/only sets today/i);
  });

  // MIRROR-COACH P6 FIX (2026-09-29, code review): "your warm-up runs 4 minutes longer" / "about 14 minutes" were said on
  // every session — also where Today generates no warm-up (coach Prep, off days) — and the number was wrong for youth and
  // pain-day plans. No line names minutes now, and only FEL's own warm-up is promised to change.
  it('no line names a number of minutes, and only the generated warm-up is said to change', () => {
    for (const t of every) expect(t).not.toMatch(/\d+\s*min/i);
    for (const level of ['ok', 'low', 'skip'] as const) {
      for (const kind of ['coach', 'none'] as const satisfies readonly ReadinessWarmupKind[]) {
        expect(readinessSuggestion(level, kind), `${level}/${kind}`).not.toMatch(/warm-up (below|runs)|longer|usual warm-up/i);
      }
    }
    expect(readinessSuggestion('low', 'generated')).toMatch(/warm-up below is set longer and gentler/);
    expect(readinessSuggestion('low', 'coach')).toMatch(/your coach's Prep/);
    expect(READINESS_SUGGESTION.low).toBe(readinessSuggestion('low', 'generated'));
  });
});

describe('parseReadinessAnswers — the POST body', () => {
  it('absent and null are "not answered"; every key comes back', () => {
    expect(parseReadinessAnswers({ sleep: 3 })).toEqual({ sleep: 3, soreness: null, energy: null, mood: null });
    expect(parseReadinessAnswers({})).toEqual({ sleep: null, soreness: null, energy: null, mood: null });
    expect(parseReadinessAnswers(null)).toEqual({ sleep: null, soreness: null, energy: null, mood: null });
  });

  it('anything off the 1–5 integer scale is refused and named, never clamped', () => {
    try {
      parseReadinessAnswers({ sleep: 7, soreness: '4', energy: 2.5, mood: 3 });
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(ReadinessValidationError);
      expect((e as ReadinessValidationError).code).toBe('invalid_answers');
      expect((e as ReadinessValidationError).details).toEqual(['sleep', 'soreness', 'energy']);
    }
  });

  it('extra keys are ignored — a score or a payout field sent along is dropped, not stored', () => {
    expect(parseReadinessAnswers({ mood: 4, score: 999, prq: 80, shards: 5 })).toEqual({ sleep: null, soreness: null, energy: null, mood: 4 });
  });

  it('isEmptyCheckIn: all four blank is a skip', () => {
    expect(isEmptyCheckIn({ sleep: null, soreness: null, energy: null, mood: null })).toBe(true);
    expect(isEmptyCheckIn({ mood: 1 })).toBe(false);
  });
});

describe('the day — one per day, editable that day', () => {
  const now = new Date('2026-09-29T11:00:00.000Z');

  it('today in UTC is today', () => {
    expect(isPlausibleToday('2026-09-29', now)).toBe(true);
  });

  it('at 11:00 UTC, UTC-12 is still on the 28th and UTC+14 already on the 30th — both are somebody’s real today', () => {
    expect(isPlausibleToday('2026-09-28', now)).toBe(true);
    expect(isPlausibleToday('2026-09-30', now)).toBe(true);
  });

  it('a day that is over everywhere cannot be written, nor one that has not started anywhere', () => {
    expect(isPlausibleToday('2026-09-27', now)).toBe(false);
    expect(isPlausibleToday('2026-10-01', now)).toBe(false);
    // at noon UTC+0 exactly, the 28th has ended even in UTC-12
    expect(isPlausibleToday('2026-09-28', new Date('2026-09-29T12:00:00.000Z'))).toBe(false);
  });

  it('refuses anything that is not a real calendar day', () => {
    for (const bad of [null, undefined, 20260929, '2026-9-29', '29/09/2026', '2026-02-30', '2026-09-29T00:00:00Z', '']) {
      expect(isPlausibleToday(bad, now), String(bad)).toBe(false);
    }
  });

  it('localDayKey reads the device’s own calendar day', () => {
    const d = new Date(2026, 8, 5, 23, 30);   // local 5 September, 23:30
    expect(localDayKey(d)).toBe('2026-09-05');
    expect(isPlausibleToday(localDayKey(new Date()))).toBe(true);
  });
});

describe('the guardian gate', () => {
  it('a readiness check-in is gated exactly like a pain check-in (decision #6): a minor needs an accepted guardian consent', () => {
    expect(READINESS_GUARDIAN_FEATURE).toBe('pain_checkin');
    const now = new Date('2026-09-29T12:00:00.000Z');
    expect(canUse(READINESS_GUARDIAN_FEATURE, { dobYear: 1990, consents: [] }, now)).toBe(true);
    expect(canUse(READINESS_GUARDIAN_FEATURE, { dobYear: 2012, consents: [] }, now)).toBe(false);
    expect(canUse(READINESS_GUARDIAN_FEATURE, { dobYear: null, consents: [] }, now)).toBe(false);   // blank = youth rules (#20)
    expect(canUse(READINESS_GUARDIAN_FEATURE, { dobYear: 2012, consents: [{ requestedAt: now, acceptedAt: now, revokedAt: null }] }, now)).toBe(true);
  });
});

describe('coachReadinessView — only with coach_view consent; otherwise nothing', () => {
  const row = (over: Partial<ReadinessHistoryRow> = {}): ReadinessHistoryRow => ({
    date: '2026-09-29', sleep: 2, soreness: 4, energy: 2, mood: 3, updatedAt: new Date('2026-09-29T07:00:00.000Z'), ...over,
  });

  it('no consent → null: not a generic line, not a count, nothing', () => {
    expect(coachReadinessView([row()], false)).toBeNull();
  });

  it('consent but no check-in → null', () => {
    expect(coachReadinessView([], true)).toBeNull();
  });

  it('consent + a low check-in → the day, the level, what is low and the numbers — and no "warm-up N min" formula', () => {
    const v = coachReadinessView([row()], true)!;
    expect(v.date).toBe('2026-09-29');
    expect(v.level).toBe('low');
    expect(v.label).toBe('Running low: sleep, soreness, energy');
    expect(v.summary).toBe('Sleep 2/5 · soreness 4/5 · energy 2/5 · mood 3/5');
    // MIRROR-COACH P6 FIX: the view used to say "the warm-up the athlete was given" — a formula (10 or 14) that was wrong
    // on coach-Prep days, off days, a picked length and every youth or pain-day plan
    expect(v).not.toHaveProperty('warmupMinutes');
    expect(v.answers).toEqual({ sleep: 2, soreness: 4, energy: 2, mood: 3 });
  });

  it('the newest DAY wins over a later save to an older day', () => {
    const v = coachReadinessView([
      row({ date: '2026-09-30', sleep: 4, soreness: 1, energy: 4, mood: 4, updatedAt: new Date('2026-09-30T06:00:00.000Z') }),
      row({ date: '2026-09-29', updatedAt: new Date('2026-09-30T06:30:00.000Z') }),   // yesterday's row, edited after
    ], true)!;
    expect(v.date).toBe('2026-09-30');
    expect(v.level).toBe('ok');
  });

  // MIRROR-COACH P6 FIX (2026-09-29, code review): the board kept rows up to 36 h old with no day on them, so yesterday
  // evening's "running low" read as this morning's. The review's trace: a row dated 2026-09-29, viewed 2026-09-30 17:00.
  it('the day is said: today, yesterday, or the date', () => {
    const now = new Date(2026, 8, 30, 17, 0);   // local 2026-09-30 17:00
    expect(readinessDayLabel('2026-09-30', now)).toBe('today');
    expect(readinessDayLabel('2026-09-29', now)).toBe('yesterday');
    expect(readinessDayLabel('2026-09-28', now)).toBe('Sep 28');
    expect(readinessDayLabel('2026-10-01', now)).toBe('Oct 1');       // a device a zone ahead: its date, said as a date
    expect(readinessDayLabel('2026-03-01', new Date(2026, 2, 1, 9))).toBe('today');
    expect(readinessDayLabel('2026-02-28', new Date(2026, 2, 1, 9))).toBe('yesterday');   // across a month end
    expect(readinessDayLabel('junk', now)).toBe('junk');
  });

  it('reads the LATEST check-in (an edit later the same day wins)', () => {
    const v = coachReadinessView([row(), row({ sleep: 4, soreness: 1, energy: 4, mood: 4, updatedAt: new Date('2026-09-29T09:00:00.000Z') })], true)!;
    expect(v.level).toBe('ok');
    expect(v.label).toBe('Checked in, good to go');
  });

  it('only answered items appear in the summary', () => {
    expect(coachReadinessView([row({ sleep: null, soreness: null, energy: 4, mood: null })], true)!.summary).toBe('Energy 4/5');
  });

  it('an all-blank row reads as nothing, never as "ok"', () => {
    expect(coachReadinessView([row({ sleep: null, soreness: null, energy: null, mood: null })], true)).toBeNull();
  });

  it('the board looks back a day and a half — this morning in every time zone, not the day before yesterday', () => {
    expect(COACH_READINESS_WINDOW_MS).toBe(36 * 3_600_000);
  });
});
