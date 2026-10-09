// lib/prq-engine.ts — PRQ RECOVERY (MIRROR-COACH P9, 2026-09-30; owner decision #12, phase rule (a)).
//
// Recovery used to rise only, and trivia raised it (lib/prq.ts MODE_ATTRS brainBrawl / whoSceneIt). Now it rises from
// recovery work (cool-downs, off days, easy-cardio minutes) under a per-UTC-day cap and falls toward 50 with a named
// half-life when none happens. These pin the curve, the cap, the fall, the anchor, the composition of settles (a settle
// in two steps equals one), that trivia no longer counts, and that no self-report can be an input.
import { describe, expect, it } from 'vitest';
import {
  EASY_CARDIO_HALF_MINUTES, EASY_CARDIO_MAX_CREDIT, EASY_CARDIO_MAX_MINUTES_PER_EVENT, PRQ_BASELINE, RECOVERY_CREDIT_COOLDOWN,
  RECOVERY_CREDIT_OFF_DAY, RECOVERY_DAILY_CAP, RECOVERY_DECIMALS, RECOVERY_HALF_LIFE_DAYS, RECOVERY_RULE_SINCE_MS, RECOVERY_SOURCES,
  decayRecovery, easyCardioCredit, isRecoveryEvent, recoveryAnchor, recoveryCredits, recoveryDayStart, settleRecovery,
  type RecoveryEvent,
} from './prq-engine';
import { MODE_ATTRS, PRQ_ATTRS, computePrqDelta } from './prq';

const H = 60 * 60 * 1000;
const DAY = 24 * H;
/** 2026-10-05T00:00Z — a day well after the rule's start, so the anchor clamp is not in play unless a test wants it. */
const T0 = Date.UTC(2026, 9, 5);
const cool = (at: number, ref = `c${at}`): RecoveryEvent => ({ source: 'cooldown', at, ref });
const off = (at: number, ref = `o${at}`): RecoveryEvent => ({ source: 'offDay', at, ref });
const cardio = (at: number, minutes: number, ref = `w${at}`): RecoveryEvent => ({ source: 'easyCardio', at, minutes, ref });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('the named constants (one place to read the rule)', () => {
  it('are the documented, conservative values', () => {
    expect(RECOVERY_HALF_LIFE_DAYS).toBe(14);
    expect(RECOVERY_DAILY_CAP).toBe(2);
    expect(RECOVERY_CREDIT_COOLDOWN).toBe(0.6);
    expect(RECOVERY_CREDIT_OFF_DAY).toBe(1);
    expect(EASY_CARDIO_MAX_CREDIT).toBe(0.8);
    expect(EASY_CARDIO_HALF_MINUTES).toBe(10);
    expect(RECOVERY_DECIMALS).toBe(4);
    expect(new Date(RECOVERY_RULE_SINCE_MS).toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(RECOVERY_SOURCES).toEqual(['cooldown', 'offDay', 'easyCardio']);
  });
  it('the steady states the comment claims: daily work at the cap holds ~91; 3 cool-downs + 1 off day a week ~60', () => {
    expect(PRQ_BASELINE + RECOVERY_DAILY_CAP / (1 - 2 ** (-1 / RECOVERY_HALF_LIFE_DAYS))).toBeCloseTo(91.4, 1);
    const weekly = 3 * RECOVERY_CREDIT_COOLDOWN + RECOVERY_CREDIT_OFF_DAY + easyCardioCredit(12);
    expect(PRQ_BASELINE + weekly / (1 - 2 ** (-7 / RECOVERY_HALF_LIFE_DAYS))).toBeCloseTo(61.1, 1);
    // and simulated rather than solved: a year of that week, settled once a day, ends in the same place
    let v = PRQ_BASELINE, t = T0;
    for (let d = 0; d < 364; d++) {
      const day = T0 + d * DAY, dow = d % 7;
      const ev = dow === 0 || dow === 2 || dow === 4 ? [cool(day + 18 * H)] : dow === 5 ? [off(day + 10 * H), cardio(day + 10 * H, 12)] : [];
      const s = settleRecovery(v, t, ev, day + DAY - 1);
      v = s.value; t = day + DAY - 1;
    }
    expect(v).toBeGreaterThan(58);
    expect(v).toBeLessThan(63);
  });
});

describe('FALL: the part above 50 halves every RECOVERY_HALF_LIFE_DAYS', () => {
  it('80 → 65 after one half-life, 57.5 after two, continuous in between', () => {
    expect(decayRecovery(80, T0, T0 + 14 * DAY)).toBeCloseTo(65, 10);
    expect(decayRecovery(80, T0, T0 + 28 * DAY)).toBeCloseTo(57.5, 10);
    expect(decayRecovery(80, T0, T0 + 7 * DAY)).toBeCloseTo(50 + 30 * Math.SQRT1_2, 10);
    expect(decayRecovery(80, T0, T0 + 1 * H)).toBeLessThan(80);
  });
  it('never below 50, and a value at or under 50 does not move by itself (it never RISES without work)', () => {
    expect(decayRecovery(80, T0, T0 + 3650 * DAY)).toBeGreaterThanOrEqual(PRQ_BASELINE);
    expect(decayRecovery(50, T0, T0 + 30 * DAY)).toBe(50);
    expect(decayRecovery(42, T0, T0 + 30 * DAY)).toBe(42);
  });
  it('no time, or time running backwards, changes nothing', () => {
    expect(decayRecovery(80, T0, T0)).toBe(80);
    expect(decayRecovery(80, T0, T0 - DAY)).toBe(80);
  });
  it('settleRecovery with no events: the same fall, written to 4 decimals', () => {
    const s = settleRecovery(80, T0, [], T0 + 14 * DAY);
    expect(s).toMatchObject({ value: 65, changed: true, gained: 0, credited: [] });
    expect(s.decayed).toBeCloseTo(15, 4);
    expect(settleRecovery(42, T0, [], T0 + 90 * DAY)).toMatchObject({ value: 42, changed: false });
  });
  it('a player seen every 3 minutes still falls (the 4-decimal store): 480 settles over a day = one settle over the day', () => {
    let v = 80, t = T0;
    for (let i = 1; i <= 480; i++) { const now = T0 + i * 3 * 60 * 1000; v = settleRecovery(v, t, [], now).value; t = now; }
    expect(v).toBeLessThan(80);
    expect(v).toBeCloseTo(settleRecovery(80, T0, [], T0 + DAY).value, 1);   // 1.45 points in the day; the steps agree to rounding
    expect(80 - v).toBeGreaterThan(1.4);
    // at 2 decimals the same loop would have stalled: each 3-minute step on a 30-point margin is ~0.003
    expect(80 - decayRecovery(80, T0, T0 + 3 * 60 * 1000)).toBeLessThan(0.005);
  });
});

describe('RISE: cool-downs, off days and easy-cardio minutes', () => {
  it('a completed cool-down is +0.6, an off day +1', () => {
    expect(settleRecovery(50, T0, [cool(T0 + H)], T0 + H).value).toBe(50.6);
    expect(settleRecovery(50, T0, [off(T0 + H)], T0 + H).value).toBe(51);
  });
  it('easy cardio: a saturating curve of the day\'s minutes (10 → 0.40, 20 → 0.60, 30 → 0.70, never 0.80)', () => {
    expect(easyCardioCredit(0)).toBe(0);
    expect(easyCardioCredit(10)).toBeCloseTo(0.4, 10);
    expect(easyCardioCredit(20)).toBeCloseTo(0.6, 10);
    expect(easyCardioCredit(30)).toBeCloseTo(0.7, 10);
    expect(easyCardioCredit(10_000)).toBeLessThanOrEqual(EASY_CARDIO_MAX_CREDIT);
    expect(easyCardioCredit(-5)).toBe(0);
    expect(easyCardioCredit(Number.NaN)).toBe(0);
    for (let m = 1; m < 120; m++) expect(easyCardioCredit(m)).toBeGreaterThan(easyCardioCredit(m - 1));
  });
  it('a day\'s minutes are summed before the curve: two 10-minute walks earn 0.60, not 0.80', () => {
    const c = recoveryCredits([cardio(T0 + 8 * H, 10), cardio(T0 + 18 * H, 10)]);
    expect(sum(c.map((x) => x.credit))).toBeCloseTo(0.6, 10);
    expect(c[0].credit).toBeCloseTo(0.4, 10);
    expect(c[1].credit).toBeCloseTo(0.2, 10);
    // …and a new UTC day starts a new curve
    const d = recoveryCredits([cardio(T0 + 8 * H, 10), cardio(T0 + DAY + 8 * H, 10)]);
    expect(d.map((x) => x.credit)).toEqual([expect.closeTo(0.4, 10), expect.closeTo(0.4, 10)]);
  });
  it('one session carries at most EASY_CARDIO_MAX_MINUTES_PER_EVENT into the curve', () => {
    const big = recoveryCredits([cardio(T0, 100_000)])[0];
    expect(big.raw).toBeCloseTo(easyCardioCredit(EASY_CARDIO_MAX_MINUTES_PER_EVENT), 10);
  });
  it('credit lands at the event\'s time and decays from there to now', () => {
    const s = settleRecovery(50, T0, [cool(T0 + H)], T0 + H + 14 * DAY);
    expect(s.value).toBeCloseTo(50.3, 4);
    expect(s.gained).toBe(0.6);
  });
  it('never past 100', () => {
    expect(settleRecovery(99.9, T0, [off(T0 + H), cool(T0 + 2 * H)], T0 + 2 * H).value).toBeLessThanOrEqual(100);
    expect(settleRecovery(99.9, T0, [off(T0 + H)], T0 + H).value).toBe(100);
  });
});

describe('CAP: RECOVERY_DAILY_CAP per UTC day, all sources together, first work first', () => {
  it('an off day + two cool-downs + 30 easy minutes (2.9 raw) credit exactly 2.0; the last one is cut', () => {
    const ev = [off(T0 + 8 * H), cardio(T0 + 8 * H, 30), cool(T0 + 12 * H), cool(T0 + 18 * H)];
    const c = recoveryCredits(ev);
    expect(sum(c.map((x) => x.raw))).toBeCloseTo(2.9, 10);
    expect(sum(c.map((x) => x.credit))).toBeCloseTo(RECOVERY_DAILY_CAP, 10);
    expect(c.map((x) => x.event.source)).toEqual(['offDay', 'easyCardio', 'cooldown', 'cooldown']);
    expect(c[3].credit).toBe(0);
    const s = settleRecovery(50, T0, ev, T0 + 18 * H);
    expect(s.gained).toBe(2);
    expect(s.value).toBeCloseTo(52, 1);          // 52 less ten hours' fall on a margin of about 2 (≈ 0.03)
    expect(s.value).toBeLessThan(52);
  });
  it('the cap resets at 00:00 UTC', () => {
    const ev = [off(T0 + 20 * H), off(T0 + 21 * H), off(T0 + 22 * H), off(T0 + DAY + 1 * H)];
    expect(recoveryCredits(ev).map((x) => x.credit)).toEqual([1, 1, 0, 1]);
    expect(recoveryDayStart(T0 + 23 * H)).toBe(T0);
    expect(recoveryDayStart(T0 + DAY)).toBe(T0 + DAY);
  });
  it('work credited by an EARLIER settle that day still counts against the day\'s cap (and is not credited twice)', () => {
    // 08:00 off day + 09:00 cool-down, settled at 09:30 → +1.6; then 10:00 and 11:00 cool-downs, settled from 09:30
    const first = settleRecovery(50, T0, [off(T0 + 8 * H), cool(T0 + 9 * H)], T0 + 9.5 * H);
    expect(first.gained).toBe(1.6);
    expect(first.value).toBeCloseTo(51.6, 2);    // less 90 minutes' fall
    const all = [off(T0 + 8 * H), cool(T0 + 9 * H), cool(T0 + 10 * H), cool(T0 + 11 * H)];
    const second = settleRecovery(first.value, T0 + 9.5 * H, all, T0 + 11 * H);
    expect(second.credited.map((c) => c.credit)).toEqual([expect.closeTo(0.4, 10), 0]);
    expect(second.gained).toBe(0.4);
    expect(second.value).toBeCloseTo(52, 1);
  });
});

describe('ANCHOR and COMPOSITION', () => {
  it('events at or before the anchor are never credited again; events after now wait for a later settle', () => {
    expect(settleRecovery(50, T0, [cool(T0)], T0 + H)).toMatchObject({ value: 50, changed: false, credited: [] });
    const early = settleRecovery(50, T0, [cool(T0 + 2 * H)], T0 + H);
    expect(early).toMatchObject({ value: 50, changed: false });
    expect(settleRecovery(50, T0 + H, [cool(T0 + 2 * H)], T0 + 2 * H).value).toBe(50.6);
  });
  it('settling in two steps equals settling once (any split point), so how often a player is seen never matters', () => {
    const ev = [off(T0 + 3 * DAY), cardio(T0 + 3 * DAY, 12), cool(T0 + 5 * DAY + 2 * H), cool(T0 + 9 * DAY), cardio(T0 + 9 * DAY + H, 25)];
    for (const start of [80, 64.2, 50, 45]) {
      const once = settleRecovery(start, T0, ev, T0 + 20 * DAY).value;
      for (const split of [T0 + DAY, T0 + 3 * DAY, T0 + 5 * DAY + 3 * H, T0 + 9 * DAY + 30 * 60 * 1000, T0 + 15 * DAY]) {
        const a = settleRecovery(start, T0, ev, split);
        const b = settleRecovery(a.value, split, ev, T0 + 20 * DAY);
        expect(b.value, `start ${start} split ${new Date(split).toISOString()}`).toBeCloseTo(once, 3);
      }
    }
  });
  it('recoveryAnchor: the last write, but never before the rule\'s start; unusable times give null', () => {
    expect(recoveryAnchor(new Date('2026-06-01T00:00:00Z'))).toBe(RECOVERY_RULE_SINCE_MS);
    expect(recoveryAnchor(new Date('2026-10-02T08:00:00Z'))).toBe(Date.parse('2026-10-02T08:00:00Z'));
    expect(recoveryAnchor(T0)).toBe(T0);
    expect(recoveryAnchor(null)).toBeNull();
    expect(recoveryAnchor(undefined)).toBeNull();
    expect(recoveryAnchor(new Date('nope'))).toBeNull();
  });
  it('MIGRATION: a trivia-raised 78 last written in June is not charged for June–September; it falls from the rule\'s start', () => {
    const june = new Date('2026-06-15T00:00:00Z');
    const s = settleRecovery(78, recoveryAnchor(june)!, [], RECOVERY_RULE_SINCE_MS + 14 * DAY);
    expect(s.value).toBe(64);                 // 50 + 28 / 2 — one half-life, from 2026-09-30, not seven
  });
  it('bad input changes nothing', () => {
    expect(settleRecovery(Number.NaN, T0, [off(T0 + H)], T0 + DAY).changed).toBe(false);
    expect(settleRecovery(70, Number.NaN, [off(T0 + H)], T0 + DAY).changed).toBe(false);
    expect(settleRecovery(70, T0, [off(T0 + H)], T0).changed).toBe(false);
  });
});

describe('TRIVIA NO LONGER COUNTS (lib/prq.ts MODE_ATTRS)', () => {
  it('brainBrawl and whoSceneIt train mental only — mental stays, recovery is gone', () => {
    expect(MODE_ATTRS.brainBrawl).toEqual(['mental']);
    expect(MODE_ATTRS.whoSceneIt).toEqual(['mental']);
  });
  // MIRROR-COACH P9 fix (2026-09-30, code review). This test used to pin `training` (the Iron Paradise gym game) as the
  // one game row still raising recovery, "kept byte-identical by the brief". The review measured it as a farm: a won
  // 60-second round adds 0.6 recovery through POST /api/sessions with no daily cap, so four rounds out-earn a whole day
  // of real recovery work (RECOVERY_DAILY_CAP 2.0) and ten a day pin recovery at 100 against the 14-day half-life.
  // Owner decision #12 names the sources (cool-downs, off days, easy-cardio minutes), lib/coach/recoverySources.ts says
  // game minutes are NOT a source, and docs/LANES.md gives this lane the recovery lines — so the token went, and this
  // test now holds the opposite: no game row names recovery at all.
  it('no game row names recovery: not trivia, not the Iron Paradise gym game (`training` keeps strength and endurance)', () => {
    expect(Object.entries(MODE_ATTRS).filter(([, a]) => a.includes('recovery')).map(([m]) => m)).toEqual([]);
    expect(MODE_ATTRS.training).toEqual(['strength', 'endurance']);
  });
  it('a trivia session\'s PRQ delta is unchanged; it simply lands on mental alone (the route adds it per MODE_ATTRS row)', () => {
    const d = computePrqDelta({ mode: 'brainBrawl', score: 240, won: true, duration: 120 });
    expect(d).toBe(0.96);   // 10 × 0.1 × 0.8 × 1.2 — the same number as before this phase
    const profile = { recovery: 71.2, mental: 60 } as Record<string, number>;
    const after = { ...profile };
    for (const a of MODE_ATTRS.brainBrawl) after[a] = Math.min(100, Math.round((profile[a] + d) * 100) / 100);
    expect(after).toEqual({ recovery: 71.2, mental: 60.96 });
  });
  it('recovery is still one of the eight PRQ attributes (the number exists; only its sources changed)', () => {
    expect(PRQ_ATTRS).toContain('recovery');
  });
});

describe('SELF-REPORTS NEVER COUNT (owner decision #12): readiness, pain, intake and breath are not inputs', () => {
  const selfReports = {
    readiness: { sleep: 1, soreness: 5, energy: 1, mood: 1, level: 'low' },
    readinessCheckIn: { id: 'rc1', date: '2026-10-05', sleep: 1, soreness: 5, energy: 1, mood: 1 },
    pain: { rating: 7, area: 'knee', decision: 'stop' },
    painCheckIn: { id: 'pc1', rating: 7 },
    intake: { answers: { red_flag_chest: true }, birth_year: 1990 },
    healthIntake: { id: 'hi1' },
    breath: { kind: 'ramp', rounds: 5, seconds: null },
    breathLog: { id: 'bl1', kind: 'ramp', seconds: null },
  };
  const ev = [off(T0 + 8 * H), cardio(T0 + 8 * H, 12), cool(T0 + 30 * H)];

  it('control: a real event does change the answer (the harness is live)', () => {
    expect(settleRecovery(55, T0, ev, T0 + 3 * DAY).value).not.toBe(settleRecovery(55, T0, [], T0 + 3 * DAY).value);
  });
  it('the same events with every self-report stuffed onto them settle to exactly the same number', () => {
    const stuffed = ev.map((e) => ({ ...e, ...selfReports })) as RecoveryEvent[];
    expect(settleRecovery(55, T0, stuffed, T0 + 3 * DAY)).toEqual({ ...settleRecovery(55, T0, ev, T0 + 3 * DAY), credited: expect.any(Array) });
    expect(settleRecovery(55, T0, stuffed, T0 + 3 * DAY).value).toBe(settleRecovery(55, T0, ev, T0 + 3 * DAY).value);
    expect(recoveryCredits(stuffed).map((c) => c.credit)).toEqual(recoveryCredits(ev).map((c) => c.credit));
  });
  it('a self-report dressed up as an event is not one: it is dropped, whatever its "source"', () => {
    const fakes = ['readiness', 'pain', 'intake', 'breath', 'ramp', 'checkIn', 'sleep', undefined].map((source, i) => ({ source, at: T0 + (i + 1) * H, minutes: 60 }));
    for (const f of fakes) expect(isRecoveryEvent(f)).toBe(false);
    expect(recoveryCredits(fakes as unknown as RecoveryEvent[])).toEqual([]);
    expect(settleRecovery(55, T0, [...ev, ...fakes] as unknown as RecoveryEvent[], T0 + 3 * DAY).value).toBe(settleRecovery(55, T0, ev, T0 + 3 * DAY).value);
    expect(settleRecovery(50, T0, fakes as unknown as RecoveryEvent[], T0 + DAY)).toMatchObject({ value: 50, changed: false });
  });
  it('the PRQ, pay and streak functions the sessions route runs have no self-report parameter to pass (types only take the session)', () => {
    // computePrqDelta reads mode/score/won/duration/accuracy; a check-in in its options changes nothing
    const base = { mode: 'training', score: 300, won: true, duration: 90 };
    expect(computePrqDelta({ ...base, ...selfReports } as typeof base)).toBe(computePrqDelta(base));
  });
});
