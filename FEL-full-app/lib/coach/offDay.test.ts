// The off day (MIRROR-COACH P6, 2026-09-29): FEL's 15–20 minute template is valid under every one of P2's own
// validators (the catalogue row, the prescription, the session's shape), it is youth-safe, it logs walk minutes the way
// P9 will read them, and a plan's week shows its off days as days rather than blanks.
import { describe, expect, it } from 'vitest';
import { LOGGED_WORK_WHERE } from './setLog';
import { screenText } from '@/lib/share/screen';
import { validateCatalogueCreate } from './catalogue';
import { COVERAGE_PATTERNS, isWorking } from './coverage';
import { validateExerciseSpec } from './loop';
import { doseLine, sessionOrder, sessionWarnings, validateStructure } from './structure';
import { MAX_EFFORT_CUE, PIN_EXERCISE, bandAllowed, youthSafeCues } from './taxonomy';
import { timersFor } from './setTimer';
import { todayLayout } from './today';
import { ROCK_HOLDS } from './warmupContent';
import { RECOVERY_BREATH_STEP, breathCycleSec, RECOVERY_BREATH } from './cooldown';
import {
  COMPLETED_OFF_DAY_WHERE, COOLDOWN_DONE_WHERE, rockHoldCues, OFF_DAY_ADD_LINE, OFF_DAY_BREATH_ROUNDS, OFF_DAY_ITEMS, OFF_DAY_KIND, OFF_DAY_LABEL, OFF_DAY_LINE,
  OFF_DAY_MINUTES, OFF_DAY_RANGE_MIN, OFF_DAY_SEC, OFF_DAY_STRETCH_IDS, OFF_DAY_WALK_MIN, OFF_DAY_WEEK_LINE, WEEK_DAYS, dayIndex, fullWeek, weekView,
} from './offDay';

describe('the template is valid under P2\'s validators', () => {
  it('every catalogue row passes the catalogue\'s own create validator unchanged, with no claims-screen warning', () => {
    for (const i of OFF_DAY_ITEMS) {
      const v = validateCatalogueCreate({ ...i.catalogue });
      expect(v.ok, i.key).toBe(true);
      if (!v.ok) continue;
      expect(v.warnings, i.key).toEqual([]);
      const { name, category, primaryCues, pattern, braceMode, skillLayer, defaultTempo, equipment } = v.item;
      expect({ name, category, primaryCues, pattern, braceMode, skillLayer, defaultTempo, equipment }, i.key).toEqual(i.catalogue);
    }
  });

  it('every prescription passes the builder\'s validator (validateExerciseSpec) and the structure validator, and comes back as written', () => {
    for (const i of OFF_DAY_ITEMS) {
      const st = validateStructure(i.prescription);
      expect(st.ok, i.key).toBe(true);
      const v = validateExerciseSpec({ exerciseId: 'pe-x', ...i.prescription });
      expect(v.ok, i.key).toBe(true);
      if (!v.ok) continue;
      // nothing clamped, nothing re-derived: the saved prescription IS the template's
      const { exerciseId: _e, ...spec } = v.spec;
      expect(spec, i.key).toEqual(i.prescription);
    }
  });

  it('the session has P2\'s shape with no builder warning: a Key walk, then the Cool-down, no key set, no superset', () => {
    const items = OFF_DAY_ITEMS.map((i, k) => ({ id: i.key, order: k + 1, ...i.prescription }));
    expect(sessionWarnings(items)).toEqual([]);
    expect(sessionOrder(items).map((x) => x.id)).toEqual(OFF_DAY_ITEMS.map((i) => i.key));   // stored order = running order
    expect(todayLayout(items).map((s) => s.section)).toEqual(['key', 'cooldown']);
    expect(items.filter((x) => x.isKeySet)).toEqual([]);
    expect(OFF_DAY_ITEMS.map((i) => i.key)).toEqual(['easy-walk', ...OFF_DAY_STRETCH_IDS, RECOVERY_BREATH_STEP.id]);
  });

  it('is 15–20 minutes: a 12-minute walk, three 1-minute rock-and-holds, 15 recovery breaths (3 minutes)', () => {
    expect(OFF_DAY_SEC).toBe(OFF_DAY_ITEMS.reduce((s, i) => s + i.seconds, 0));
    expect(OFF_DAY_MINUTES).toBeGreaterThanOrEqual(OFF_DAY_RANGE_MIN.min);
    expect(OFF_DAY_MINUTES).toBeLessThanOrEqual(OFF_DAY_RANGE_MIN.max);
    expect(OFF_DAY_MINUTES).toBe(18);
    // each item's seconds is what its prescription runs: sets × (work + hold)
    for (const i of OFF_DAY_ITEMS) expect(i.seconds, i.key).toBe(i.prescription.sets * (i.prescription.workSeconds + (i.prescription.holdSeconds ?? 0)));
    expect(OFF_DAY_ITEMS[0].seconds).toBe(OFF_DAY_WALK_MIN * 60);
    expect(OFF_DAY_ITEMS.at(-1)!.seconds).toBe(breathCycleSec(RECOVERY_BREATH) * OFF_DAY_BREATH_ROUNDS);
    // the stretches are warmupContent's own rows, by name and cue
    for (const id of OFF_DAY_STRETCH_IDS) {
      const r = ROCK_HOLDS.find((x) => x.id === id)!;
      const i = OFF_DAY_ITEMS.find((x) => x.key === id)!;
      expect(i.catalogue.name).toBe(r.name);
      // the position, the rocks, the hold: warmupContent's words split at "Then hold", nothing added or lost
      expect(i.catalogue.primaryCues).toHaveLength(3);
      expect(i.catalogue.primaryCues[0]).toBe(r.setup);
      expect(i.catalogue.primaryCues.slice(1).join(' ')).toBe(r.cue);
    }
  });

  it('reads on Today as it runs: the walk is "1 × 12 min" with a 12:00 work timer that logs into the set; no rest timers', () => {
    const walk = OFF_DAY_ITEMS[0].prescription;
    expect(doseLine(walk)).toBe('1 × 12 min · Idle');
    expect(timersFor(walk)).toEqual([{ kind: 'work', seconds: 720, label: 'Work 12:00' }]);
    const calf = OFF_DAY_ITEMS.find((i) => i.key === 'wall-calf-rock')!.prescription;
    expect(doseLine(calf)).toBe('2 × 20 s left, then right · hold 10 s · Idle');
    expect(timersFor(calf).map((t) => t.kind)).toEqual(['work', 'hold']);
    expect(doseLine(OFF_DAY_ITEMS.at(-1)!.prescription)).toBe('1 × 180 s · Idle');
    for (const i of OFF_DAY_ITEMS) expect(i.prescription.restSeconds).toBe(0);
  });

  it('does not count toward the six-pattern coverage strip: an easy day is not a squat, a pull or a carry', () => {
    for (const i of OFF_DAY_ITEMS) {
      if (isWorking({ section: i.prescription.section })) expect(COVERAGE_PATTERNS as readonly string[]).not.toContain(i.catalogue.pattern);
    }
  });
});

describe('every rock-and-hold fits the catalogue as cues', () => {
  it('all nine split into cues inside the 140-character cap (the off day uses three; a coach may add any)', () => {
    for (const r of ROCK_HOLDS) {
      const v = validateCatalogueCreate({ name: r.name, primaryCues: rockHoldCues(r) });
      expect(v.ok, r.id).toBe(true);
    }
  });
});

describe('youth-safe (owner decision #6)', () => {
  it('no impact, Idle for every item (a band youth rules allow), no pin, no max-effort cue, braced "none"', () => {
    for (const i of OFF_DAY_ITEMS) {
      expect(i.youthSafe).toBe(true);
      expect(i.impact).toBe(false);
      expect(i.prescription.effortBand).toBe('idle');
      expect(bandAllowed(i.prescription.effortBand, true)).toBe(true);
      expect(i.catalogue.name).not.toMatch(PIN_EXERCISE);
      expect(youthSafeCues(i.catalogue.primaryCues)).toEqual(i.catalogue.primaryCues);
      for (const c of i.catalogue.primaryCues) expect(c).not.toMatch(MAX_EFFORT_CUE);
      expect(i.catalogue.braceMode).toBe('none');
      expect(i.prescription.load).toBe('');
    }
  });
});

describe('what P9 reads', () => {
  // MIRROR-COACH P6 FIX (2026-09-29, code review): both predicates were looser — an off day marked Done with nothing
  // logged counted (Done is how a client who rested moves on to the next day), and a cool-down stamp counted on a row
  // that was never completed (a tap on the card of a session nobody trained). P9 reads these as PRQ recovery.
  it('a completed off day is a completed recovery session WITH WORK LOGGED; a done cool-down is a stamp on a COMPLETED session', () => {
    expect(OFF_DAY_KIND).toBe('recovery');
    expect(COMPLETED_OFF_DAY_WHERE).toEqual({ completedAt: { not: null }, session: { kind: 'recovery' }, exerciseLogs: { some: LOGGED_WORK_WHERE } });
    expect(COOLDOWN_DONE_WHERE).toEqual({ cooldownDoneAt: { not: null }, completedAt: { not: null } });
  });
});

describe('the week: off days are days, not blanks', () => {
  it('a Mon/Wed/Fri plan week becomes Mon → Sun, the four days it does not name are off days', () => {
    const days = [{ day: 'Mon', block: 'A' }, { day: 'Wed', block: 'B' }, { day: 'Fri', block: 'C' }];
    const w = fullWeek(days)!;
    expect(w.map((s) => s.day)).toEqual([...WEEK_DAYS]);
    expect(w.map((s) => s.kind)).toEqual(['training', 'off', 'training', 'off', 'training', 'off', 'off']);
    expect(w[0]).toEqual({ day: 'Mon', kind: 'training', entries: [days[0]] });
  });
  it('full day names, any case, and two entries on one day (kept together, in the plan\'s order)', () => {
    const days = [{ day: 'tuesday', n: 1 }, { day: 'Tue', n: 2 }, { day: 'SUNDAY', n: 3 }];
    const w = fullWeek(days)!;
    expect(w[1]).toEqual({ day: 'Tue', kind: 'training', entries: [days[0], days[1]] });
    expect(w[6].kind).toBe('training');
    expect(w.filter((s) => s.kind === 'off')).toHaveLength(5);
    expect(dayIndex(' Wed ')).toBe(2);
  });
  it('a plan whose days are not days of the week cannot be placed honestly: null, and the viewer shows it as it was', () => {
    expect(fullWeek([{ day: 'Mon' }, { day: 'Day 2' }])).toBeNull();
    expect(fullWeek([{ day: 3 }])).toBeNull();
    expect(fullWeek([null as unknown as { day: string }])).toBeNull();   // a stored plan of a shape nobody expected
    expect(fullWeek([])).toBeNull();
  });
  it("a coached week names its off day as an off day, with each session's state", () => {
    const sessions = [
      { id: 's3', order: 4, label: 'Session 3', kind: 'training' },
      { id: 's1', order: 1, label: 'Session 1', kind: 'training' },
      { id: 'off', order: 2, label: OFF_DAY_LABEL, kind: 'recovery' },
      { id: 's2', order: 3, label: 'Session 2' },   // a row from before the column: training
    ];
    expect(weekView(sessions, ['s1', 'off'], 's2')).toEqual([
      { id: 's1', label: 'Session 1', kind: 'training', state: 'done' },
      { id: 'off', label: 'Off day', kind: 'recovery', state: 'done' },
      { id: 's2', label: 'Session 2', kind: 'training', state: 'today' },
      { id: 's3', label: 'Session 3', kind: 'training', state: 'upcoming' },
    ]);
  });
});

describe("the copy is FEL's own words", () => {
  const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|biphasic|pin[- ]and[- ]stretch|soft[- ]tissue|nervous[- ]system|zone ?2|regeneration|parasympathetic|downshift/i;
  const CLAIMS = /\b(injur\w*|prevent\w*|risks?|reduc\w*|protect\w*|heal\w*|cure\w*|treat\w*|rehab\w*|guarantee\w*|safer|heart rate)\b/i;
  it('every name, cue and line passes the lint and the claims screen, and says "builds capacity"', () => {
    const all = [OFF_DAY_LABEL, OFF_DAY_LINE, OFF_DAY_ADD_LINE, OFF_DAY_WEEK_LINE, ...OFF_DAY_ITEMS.flatMap((i) => [i.catalogue.name, ...i.catalogue.primaryCues, i.prescription.reps])];
    for (const t of all) {
      expect(t, t).not.toMatch(BOOK);
      expect(t, t).not.toMatch(CLAIMS);
      expect(t, t).not.toMatch(/diagnos/i);
      expect(screenText(t), t).toEqual([]);
    }
    expect(OFF_DAY_LINE).toMatch(/builds capacity/);
    expect(OFF_DAY_WEEK_LINE).toMatch(/builds capacity/);
    // no "not scored": P9 will count completed off days toward PRQ recovery (owner decision #12)
    for (const t of all) expect(t).not.toMatch(/scored/i);
  });
});
