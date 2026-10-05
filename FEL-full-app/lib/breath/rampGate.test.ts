// MIRROR-COACH P7 (2026-09-29): the Dial-Up Breath's gate, one gate at a time (lib/breath/rampGate.ts). Every case
// starts from ONE fully eligible adult and breaks exactly one thing, so each reason is proven alone: age known / unknown
// / minor, consent, the intake missing / stale / red flag (cleared too) / each blocking answer / each skip, today's pain
// decision, today's readiness, FEL's weekly limit (rolling week, one per session, a day apart), not a key set, an off
// day, not on today's session, and mid-set.
import { describe, expect, it } from 'vitest';
import { INTAKE_IDS, INTAKE_QUESTIONS, INTAKE_VERSION, RED_FLAG_QUESTION_IDS } from '../health/intake';
import type { PainDecision } from '../health/painRule';
import { isPlausibleToday } from '../health/readiness';
import { isRunnablePacer, pacerAt, pacerEndSec } from './pacer';
import {
  RAMP_HISTORY_DAYS, RAMP_LIMIT, RAMP_MUST_ANSWER_NO, RAMP_PACER, RAMP_REFUSED_COPY, RAMP_RUN_SEC, RAMP_STICKY_YES, consentOldEnough, keySetStarted,
  mostCarefulReadiness, painAllowsRamp, plausibleTodayKeys, rampGate, rampIntakeHistoryReasons, rampIntakeReasons, rampLimitReasons, rampRaceReasons,
  rampUsesLeft, usesInWindow, type RampFacts,
} from './rampGate';

const NOW = new Date('2026-09-29T15:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

/** Every blocking question answered an explicit "no". */
const CLEAN_ANSWERS = Object.fromEntries(RAMP_MUST_ANSWER_NO.map((id) => [id, false]));

const facts = (over: Partial<RampFacts> = {}): RampFacts => ({
  dobYear: 1990,
  healthDataConsent: true,
  healthDataSince: daysAgo(9),
  intake: { version: INTAKE_VERSION, createdAt: daysAgo(9), answers: { ...CLEAN_ANSWERS, [INTAKE_IDS.birthYear]: 1990 }, redFlags: [], clearedAt: null },
  intakeHistory: [],
  painDecision: null,
  readiness: null,
  uses: [],
  target: { sessionId: 's1', isKeySet: true, sessionKind: 'training', setStarted: false },
  ...over,
});
const gate = (over: Partial<RampFacts> = {}, now = NOW) => rampGate(facts(over), now);
const withAnswers = (answers: Record<string, unknown>) => ({ intake: { ...facts().intake!, answers } });

describe('the control: one fully eligible adult', () => {
  it('passes every gate, with both uses left', () => {
    expect(gate()).toEqual({ eligible: true, reasons: [], usesLeft: 2 });
  });
});

describe('age (lib/mirror/youth.ts isMinorForMirror — the one age truth)', () => {
  it('a blank birth year is youth: age_unknown (decision #20)', () => {
    expect(gate({ dobYear: null })).toMatchObject({ eligible: false, reasons: ['age_unknown'] });
    expect(gate({ dobYear: undefined }).reasons).toEqual(['age_unknown']);
  });
  it('a nonsense birth year is unknown, not an adult', () => {
    expect(gate({ dobYear: 1800 }).reasons).toEqual(['age_unknown']);
  });
  it('under 18: minor — and a year-only birth date turning 18 THIS year is still a minor', () => {
    expect(gate({ dobYear: 2012 }).reasons).toEqual(['minor']);
    expect(gate({ dobYear: 2009 }).reasons).toEqual(['minor']);
    expect(gate({ dobYear: 2008 }).reasons).toEqual(['minor']);   // 2026 − 2008 = 18: the birthday may still be ahead
    expect(gate({ dobYear: 2007 }).eligible).toBe(true);          // 19 by calendar year: certainly 18+
  });
});

describe('consent (P5 lib/health/consent.ts)', () => {
  it('no live health_data consent: no, and the health facts are not judged at all', () => {
    // even with a red-flag intake and a stop in the facts, the only health reason is the missing consent: the server
    // does not read those rows without it (rampServer.ts), and the gate does not judge what it was not allowed to read
    const v = gate({ healthDataConsent: false, intake: null, painDecision: 'stop_see_clinician', readiness: 'low' });
    expect(v).toMatchObject({ eligible: false, reasons: ['no_health_consent'] });
  });
});

describe('the intake (P5 lib/health/intake.ts)', () => {
  it('none on file: intake_missing', () => {
    expect(gate({ intake: null }).reasons).toEqual(['intake_missing']);
  });
  it('an old question set, or one over a year old: intake_stale', () => {
    expect(gate({ intake: { ...facts().intake!, version: '2025-01-01' } }).reasons).toEqual(['intake_stale']);
    expect(gate({ intake: { ...facts().intake!, createdAt: daysAgo(400) } }).reasons).toEqual(['intake_stale']);
  });
  it('a red flag: red_flag — and a self-attested clearance does NOT open it (the conservative reading)', () => {
    const flagged = { ...facts().intake!, redFlags: [INTAKE_IDS.clinicianToldToAvoid] };
    expect(gate({ intake: flagged }).reasons).toEqual(['red_flag']);
    expect(gate({ intake: { ...flagged, clearedAt: daysAgo(2) } }).reasons).toEqual(['red_flag']);
  });
  it('a "yes" on each of the cardio, blood-pressure, dizziness/fainting and pregnancy answers keeps it off, one at a time', () => {
    for (const id of [INTAKE_IDS.dizzinessFaintingChestPain, INTAKE_IDS.heartOrBpCondition, INTAKE_IDS.heartRateOrBalanceMedicine, INTAKE_IDS.pregnancyOrPostpartum]) {
      expect(gate(withAnswers({ ...CLEAN_ANSWERS, [id]: true })).reasons, id).toContain('intake_answer');
      expect(gate(withAnswers({ ...CLEAN_ANSWERS, [id]: true })).eligible, id).toBe(false);
    }
    // pregnancy is not a red flag on the intake (never a stop for training) — so it is 'intake_answer' alone here
    expect(gate(withAnswers({ ...CLEAN_ANSWERS, [INTAKE_IDS.pregnancyOrPostpartum]: true })).reasons).toEqual(['intake_answer']);
    expect(gate(withAnswers({ ...CLEAN_ANSWERS, [INTAKE_IDS.heartRateOrBalanceMedicine]: true })).reasons).toEqual(['intake_answer']);
  });
  it('a skip is not a "no": each blocking question left unanswered keeps it off (intake_unanswered)', () => {
    for (const id of RAMP_MUST_ANSWER_NO) {
      const answers = { ...CLEAN_ANSWERS }; delete (answers as Record<string, unknown>)[id];
      expect(gate(withAnswers(answers)).reasons, id).toEqual(['intake_unanswered']);
      expect(gate(withAnswers({ ...CLEAN_ANSWERS, [id]: null })).reasons, id).toEqual(['intake_unanswered']);
    }
    expect(gate(withAnswers({})).reasons).toEqual(['intake_unanswered']);
    expect(gate(withAnswers(null as never)).reasons).toEqual(['intake_unanswered']);
  });
  it("answers the ramp does not gate on (pain now, a recent injury) do not change it — the pain loop handles those", () => {
    expect(gate(withAnswers({ ...CLEAN_ANSWERS, [INTAKE_IDS.currentPain]: true, [INTAKE_IDS.recentInjuryOrSurgery]: true })).eligible).toBe(true);
  });
  it('rampIntakeReasons alone, for a report: every intake reason at once', () => {
    expect(rampIntakeReasons({ version: 'old', createdAt: daysAgo(500), answers: { [INTAKE_IDS.heartOrBpCondition]: true }, redFlags: [INTAKE_IDS.heartOrBpCondition] }, NOW))
      .toEqual(['intake_stale', 'red_flag', 'intake_answer', 'intake_unanswered']);
  });
});

describe('the blocking questions are the intake\'s own ids, never re-typed', () => {
  it('every INTAKE_IDS value is a real question, and the question set reads its ids from the map', () => {
    const ids = INTAKE_QUESTIONS.map((q) => q.id);
    expect([...Object.values(INTAKE_IDS)].sort()).toEqual([...ids].sort());
  });
  it('the ramp blocks on the four named answers plus every red-flag question', () => {
    expect(RAMP_MUST_ANSWER_NO).toEqual(expect.arrayContaining([
      INTAKE_IDS.dizzinessFaintingChestPain, INTAKE_IDS.heartOrBpCondition, INTAKE_IDS.heartRateOrBalanceMedicine, INTAKE_IDS.pregnancyOrPostpartum,
      ...RED_FLAG_QUESTION_IDS,
    ]));
    expect(new Set(RAMP_MUST_ANSWER_NO).size).toBe(RAMP_MUST_ANSWER_NO.length);
    for (const id of RAMP_MUST_ANSWER_NO) expect(INTAKE_QUESTIONS.find((q) => q.id === id)?.type, id).toBe('yes_no');
  });
  it('no string literal of a question id in the gate\'s source', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync(new URL('./rampGate.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const id of Object.values(INTAKE_IDS)) expect(code, id).not.toContain(`'${id}'`);
  });
});

describe("today's pain decision (P5's rule, P6's read)", () => {
  const all: PainDecision[] = ['continue', 'easier_variation', 'step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'];
  it('none, or continue: allowed', () => {
    expect(gate({ painDecision: null }).eligible).toBe(true);
    expect(gate({ painDecision: 'continue' }).eligible).toBe(true);
  });
  it('step-down and both stops keep it off (the brief), and so does an easier-variation day (assumption: stop sooner)', () => {
    for (const d of all.filter((x) => x !== 'continue')) {
      expect(gate({ painDecision: d }).reasons, d).toEqual(['pain_today']);
      expect(painAllowsRamp(d), d).toBe(false);
    }
  });
});

describe("today's readiness (P6)", () => {
  it("a 'low' day keeps it off; ok, skip and no check-in do not", () => {
    expect(gate({ readiness: 'low' }).reasons).toEqual(['readiness_low']);
    for (const r of ['ok', 'skip', null] as const) expect(gate({ readiness: r }).eligible, String(r)).toBe(true);
  });
  it('the most careful of two plausible todays wins', () => {
    expect(mostCarefulReadiness(['ok', 'low'])).toBe('low');
    expect(mostCarefulReadiness(['skip', 'ok'])).toBe('ok');
    expect(mostCarefulReadiness([])).toBeNull();
  });
  it('plausibleTodayKeys: every day that is today somewhere (UTC−12 … UTC+14), each one accepted by P6\'s own day rule', () => {
    const keys = plausibleTodayKeys(NOW);
    expect(keys).toEqual(['2026-09-29', '2026-09-30']);   // 15:00 UTC: +14 h is already tomorrow in Kiribati
    for (const k of keys) expect(isPlausibleToday(k, NOW), k).toBe(true);
    // 11:00 UTC: still yesterday at UTC−12 and already tomorrow at UTC+14 — three calendar days are "today" somewhere
    const three = plausibleTodayKeys(new Date('2026-09-29T11:00:00Z'));
    expect(three).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    for (const k of three) expect(isPlausibleToday(k, new Date('2026-09-29T11:00:00Z')), k).toBe(true);
  });
});

describe("FEL's weekly limit (RAMP_LIMIT, one constant)", () => {
  it('is the conservative dose the brief names: 2 in any 7 days, one key set per session, a day apart — and a consent record a full window old', () => {
    // MIRROR-COACH P7 FIX (2026-09-29): firstUseAfterDays is a new field (the erase-and-re-opt-in reset), not a loosening
    expect(RAMP_LIMIT).toEqual({ perWindow: 2, windowDays: 7, perSession: 1, minHoursBetween: 24, firstUseAfterDays: 7 });
    expect(RAMP_LIMIT.firstUseAfterDays).toBe(RAMP_LIMIT.windowDays);
  });
  it('two uses in the rolling week: weekly_limit, none left', () => {
    const v = gate({ uses: [{ createdAt: daysAgo(2), sessionId: 's0' }, { createdAt: daysAgo(5), sessionId: 's-1' }] });
    expect(v).toEqual({ eligible: false, reasons: ['weekly_limit'], usesLeft: 0 });
  });
  it('a rolling week, not a calendar one: a use 7 days and a minute ago no longer counts', () => {
    expect(gate({ uses: [{ createdAt: new Date(daysAgo(7).getTime() - 60_000), sessionId: 's0' }, { createdAt: daysAgo(3), sessionId: 's-1' }] }))
      .toEqual({ eligible: true, reasons: [], usesLeft: 1 });
  });
  it('one key set per session: this session already had one → this_session', () => {
    expect(gate({ uses: [{ createdAt: daysAgo(2), sessionId: 's1' }] }).reasons).toEqual(['this_session']);
  });
  it('a day apart: one 3 hours ago (another session) → too_soon; 25 hours ago → fine', () => {
    expect(gate({ uses: [{ createdAt: hoursAgo(3), sessionId: 's0' }] }).reasons).toEqual(['too_soon']);
    expect(gate({ uses: [{ createdAt: hoursAgo(25), sessionId: 's0' }] })).toEqual({ eligible: true, reasons: [], usesLeft: 1 });
  });
  it('a use stamped in the future (a skewed clock) is ignored, not counted forever', () => {
    expect(usesInWindow([{ createdAt: new Date(NOW.getTime() + 3_600_000), sessionId: 's0' }], NOW)).toEqual([]);
  });
  it('string timestamps (JSON) count the same as Dates', () => {
    expect(rampUsesLeft([{ createdAt: daysAgo(1).toISOString(), sessionId: 's0' }], NOW)).toBe(1);
    expect(rampLimitReasons([{ createdAt: hoursAgo(2).toISOString(), sessionId: 's1' }], 's1', NOW)).toEqual(['this_session', 'too_soon']);
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): erase the log (and the ledger with it), re-take the intake, dial up again —
// the weekly limit was only as strong as the athlete's willingness to press erase. The oldest grant FEL holds must be
// a full window old, so every erased use has rolled out of the window before the next one is offered.
describe('the limit cannot be reset by erasing: a consent record a full window old (RAMP_LIMIT.firstUseAfterDays)', () => {
  it('no grant on the ledger, or one under 7 days old: consent_new; 7 days: fine', () => {
    expect(gate({ healthDataSince: null }).reasons).toEqual(['consent_new']);
    expect(gate({ healthDataSince: NOW }).reasons).toEqual(['consent_new']);
    expect(gate({ healthDataSince: new Date(daysAgo(7).getTime() + 60_000) }).reasons).toEqual(['consent_new']);
    expect(gate({ healthDataSince: daysAgo(7) }).eligible).toBe(true);
    expect(consentOldEnough(daysAgo(8).toISOString(), NOW)).toBe(true);
    expect(consentOldEnough('not a date', NOW)).toBe(false);
  });
  it('the erase scenario: uses on Monday and Tuesday, erase + fresh opt-in on Wednesday → refused until both uses are out of the window', () => {
    const erasedUses = [{ createdAt: daysAgo(2), sessionId: 'mon' }, { createdAt: daysAgo(1), sessionId: 'tue' }];
    // after the erase the log is empty and the only grant is today's
    expect(gate({ uses: [], healthDataSince: NOW }).reasons).toEqual(['consent_new']);
    // the first moment the gate opens again, the erased uses would have rolled out of the window anyway
    const opens = new Date(NOW.getTime() + RAMP_LIMIT.firstUseAfterDays * 86_400_000);
    expect(gate({ uses: [], healthDataSince: NOW }, opens).eligible).toBe(true);
    expect(rampLimitReasons(erasedUses, 's1', opens)).toEqual([]);
  });
  it('without consent it is not judged: the only health reason stays no_health_consent', () => {
    expect(gate({ healthDataConsent: false, healthDataSince: null }).reasons).toEqual(['no_health_consent']);
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): the gate read only the newest intake, so a clean re-take a minute after a
// "yes" on "has a doctor EVER told you about a heart or blood-pressure condition" opened the breath at once.
describe('a re-take does not erase a lasting "yes" (intake_history)', () => {
  const newest = () => facts().intake!;
  const earlier = (answers: Record<string, unknown>, redFlags: string[] = [], at = daysAgo(30)) => ({ createdAt: at, answers: { ...CLEAN_ANSWERS, ...answers }, redFlags });
  it('the sticky answers are the intake\'s own ids: effort dizziness/fainting, a heart or blood-pressure condition, heart-rate medicine', () => {
    expect([...RAMP_STICKY_YES].sort()).toEqual([INTAKE_IDS.dizzinessFaintingChestPain, INTAKE_IDS.heartOrBpCondition, INTAKE_IDS.heartRateOrBalanceMedicine].sort());
    expect(RAMP_STICKY_YES).not.toContain(INTAKE_IDS.pregnancyOrPostpartum);
    expect(RAMP_HISTORY_DAYS).toBe(365);
  });
  it('an earlier "yes" on each sticky answer keeps it off after a clean re-take', () => {
    for (const id of RAMP_STICKY_YES) {
      expect(gate({ intakeHistory: [newest(), earlier({ [id]: true })] }).reasons, id).toEqual(['intake_history']);
    }
  });
  it('an earlier red flag keeps it off — cleared or not', () => {
    expect(gate({ intakeHistory: [earlier({ [INTAKE_IDS.clinicianToldToAvoid]: true }, [INTAKE_IDS.clinicianToldToAvoid])] }).reasons).toEqual(['intake_history']);
  });
  it('an earlier pregnancy "yes" does not: that answer resolves, and the newest intake is the one read for it', () => {
    expect(gate({ intakeHistory: [newest(), earlier({ [INTAKE_IDS.pregnancyOrPostpartum]: true })] }).eligible).toBe(true);
  });
  it('an earlier "yes" over a year old no longer counts (the intake\'s own yearly clock)', () => {
    expect(gate({ intakeHistory: [earlier({ [INTAKE_IDS.heartOrBpCondition]: true }, [INTAKE_IDS.heartOrBpCondition], daysAgo(RAMP_HISTORY_DAYS + 1))] }).eligible).toBe(true);
    expect(gate({ intakeHistory: [earlier({ [INTAKE_IDS.heartOrBpCondition]: true }, [INTAKE_IDS.heartOrBpCondition], daysAgo(RAMP_HISTORY_DAYS - 1))] }).reasons).toEqual(['intake_history']);
  });
  it('only intakes EARLIER than the newest are read here: the newest\'s own "yes" is intake_answer, not history', () => {
    const yes = { ...newest(), answers: { ...CLEAN_ANSWERS, [INTAKE_IDS.heartRateOrBalanceMedicine]: true } };
    expect(gate({ intake: yes, intakeHistory: [yes] }).reasons).toEqual(['intake_answer']);
    expect(rampIntakeHistoryReasons([earlier({ [INTAKE_IDS.heartOrBpCondition]: true })], null, NOW)).toEqual([]);
    expect(rampIntakeHistoryReasons([], newest(), NOW)).toEqual([]);
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): the race check compared only against uses ordered BEFORE its own.
describe('the race check (rampRaceReasons): two racers can no longer both keep a use', () => {
  it('the interleaving the review found: A stamps first but commits late, so B never sees A — only one may stay', () => {
    const a = { id: 'bl-a', createdAt: NOW, sessionId: 's1' };
    const b = { id: 'bl-b', createdAt: new Date(NOW.getTime() + 5), sessionId: 's1' };
    // B's read (A not yet committed): B sees only itself and keeps
    expect(rampRaceReasons([b], 'bl-b', 's1', NOW)).toEqual([]);
    // A's read (B committed): A sees B — AFTER it by insert time, which the old rule ignored — and must back out
    expect(rampRaceReasons([a, b], 'bl-a', 's1', NOW)).toEqual(['this_session', 'too_soon']);
  });
  it('a lone use keeps its row; an older use from another day that already passed the gate is no conflict', () => {
    expect(rampRaceReasons([{ id: 'x', createdAt: NOW, sessionId: 's1' }], 'x', 's1', NOW)).toEqual([]);
    expect(rampRaceReasons([{ id: 'old', createdAt: daysAgo(3), sessionId: 's0' }, { id: 'x', createdAt: NOW, sessionId: 's1' }], 'x', 's1', NOW)).toEqual([]);
  });
  it('a racer that backs out says so in words that promise nothing', () => {
    expect(RAMP_REFUSED_COPY.raced).toMatch(/same moment/);
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): "Already used today" was false for yesterday evening's use refused this
// morning — the rule is a rolling 24 hours.
describe('the too-soon refusal says what the rule is', () => {
  it('names the rolling hours, never "today"', () => {
    expect(RAMP_REFUSED_COPY.too_soon).toContain(`${RAMP_LIMIT.minHoursBetween} hours`);
    expect(RAMP_REFUSED_COPY.too_soon).not.toMatch(/today/i);
  });
});

describe('the set (P2 isKeySet, Today\'s own session)', () => {
  it('not on today\'s session at all: not_today', () => {
    expect(gate({ target: null }).reasons).toEqual(['not_today']);
  });
  it('not the flagged key set: not_key_set', () => {
    expect(gate({ target: { ...facts().target!, isKeySet: false } }).reasons).toEqual(['not_key_set']);
  });
  it('an off day: off_day', () => {
    expect(gate({ target: { ...facts().target!, sessionKind: 'recovery' } }).reasons).toEqual(['off_day']);
  });
  it('mid-set — a set of it already logged: set_started (before the first set only, never during one)', () => {
    expect(gate({ target: { ...facts().target!, setStarted: true } }).reasons).toEqual(['set_started']);
  });
  it('keySetStarted: any logged value, or a completed log; empty rows are not a start', () => {
    expect(keySetStarted(null)).toBe(false);
    expect(keySetStarted({ setLogs: [] })).toBe(false);
    expect(keySetStarted({ setLogs: [{ reps: null, weightKg: null, rir: null, effort: null, workSeconds: null }] })).toBe(false);
    for (const k of ['reps', 'weightKg', 'rir', 'effort', 'workSeconds']) {
      expect(keySetStarted({ setLogs: [{ reps: null, weightKg: null, rir: null, effort: null, workSeconds: null, [k]: 0 }] }), k).toBe(true);
    }
    expect(keySetStarted({ completedAt: NOW, setLogs: [] })).toBe(true);
  });
});

describe('everything at once', () => {
  it('a minor with no consent, over the limit, on the wrong set: every reason named, in order', () => {
    const v = gate({ dobYear: 2012, healthDataConsent: false, uses: [{ createdAt: hoursAgo(2), sessionId: 's1' }, { createdAt: daysAgo(3), sessionId: 's0' }], target: { sessionId: 's1', isKeySet: false, sessionKind: 'recovery', setStarted: true } });
    expect(v).toEqual({ eligible: false, reasons: ['minor', 'no_health_consent', 'weekly_limit', 'this_session', 'too_soon', 'not_key_set', 'off_day', 'set_started'], usesLeft: 0 });
  });
});

describe('the breath itself runs on the one pacer', () => {
  it('RAMP_PACER is a runnable PacerSpec: 3 s to get ready, five 1-in / 1-out breaths, 13 s in all', () => {
    expect(isRunnablePacer(RAMP_PACER)).toBe(true);
    expect(RAMP_PACER).toEqual({ from: 3, inSec: 1, holdSec: 0, outSec: 1, rounds: 5 });
    expect(RAMP_RUN_SEC).toBe(13);
    expect(pacerEndSec(RAMP_PACER)).toBe(RAMP_RUN_SEC);
    expect(pacerAt(RAMP_PACER, 2.9)).toBeNull();
    expect(pacerAt(RAMP_PACER, 3)).toMatchObject({ phase: 'in', round: 1, left: 1 });
    expect(pacerAt(RAMP_PACER, 4.5)).toMatchObject({ phase: 'out', round: 1 });
    expect(pacerAt(RAMP_PACER, 12.5)).toMatchObject({ phase: 'out', round: 5 });
    expect(pacerAt(RAMP_PACER, 13)).toBeNull();
  });
  it('no hold: a sharp breath is never held (breath-holding under a heavy set is not what this is)', () => {
    expect(RAMP_PACER.holdSec).toBe(0);
  });
});
