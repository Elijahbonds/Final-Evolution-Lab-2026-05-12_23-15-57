// The breath presets (MIRROR-COACH P7, 2026-09-29): between sets and after the session, in FEL's words and timings.
// What this holds: both run the one pacer and are led by the breath out; the post-session preset IS the cool-down's
// breath (one post-session breath in the app); the settle fits inside a rest and never runs into the next set; and
// every line either preset — or the pacer's captions, or the Settle chip — can show is lint-clean: no HRV, heart rate,
// nervous system, stress chemistry, injury, pain, condition or treatment words, no book, and "helps you settle" is the
// strongest thing any line says.
import { describe, expect, it } from 'vitest';
import { screenText } from '@/lib/share/screen';
import { PACER_AFTER_WORD, PACER_BEFORE_WORD, PACER_WORDS, isRunnablePacer, pacerEndSec, pacerLengthSec } from './pacer';
import {
  BETWEEN_SET_SETTLE, BREATH_PRESETS, POST_SESSION_BREATH, SETTLE_MIN_ROUNDS, SETTLE_SETUP_SEC, SETTLE_WHY_LINE, presetById,
  presetLines, restHoldsSettle, settleChip, settleChipLabel, settleFor, workBreathFor,
} from './presets';
import { RECOVERY_BREATH, RECOVERY_BREATH_STEP, breathTotalSec, generateCooldown } from '@/lib/coach/cooldown';
import { OFF_DAY_ITEMS } from '@/lib/coach/offDay';
import { todayExercise } from '@/lib/coach/today';

describe('the presets', () => {
  it('both run the one pacer, start at 0 on their host clock, have no hold, and breathe out longer than in', () => {
    for (const p of BREATH_PRESETS) {
      expect(isRunnablePacer(p.spec), p.id).toBe(true);
      expect(p.spec.from).toBe(0);
      expect(p.spec.holdSec).toBe(0);
      expect(p.spec.outSec).toBeGreaterThan(p.spec.inSec);
      expect(p.youthSafe).toBe(true);
      expect(presetById(p.id)).toBe(p);
    }
    expect(BREATH_PRESETS.map((p) => p.id)).toEqual(['between-set', 'post-session']);
  });

  it("between sets: FEL's short settle — in 3, out 6, a 1 s pause, four breaths, 40 s", () => {
    expect(BETWEEN_SET_SETTLE.spec).toEqual({ from: 0, inSec: 3, holdSec: 0, outSec: 6, restSec: 1, rounds: 4 });
    expect(pacerLengthSec(BETWEEN_SET_SETTLE.spec)).toBe(40);
    expect(BETWEEN_SET_SETTLE.source).toBe('fel');
  });

  it("after the session: the owner's 4-6 recovery breath, the same breath the cool-down runs (one, not two), and longer", () => {
    expect(POST_SESSION_BREATH.spec).toEqual({ from: 0, ...RECOVERY_BREATH });
    expect(pacerLengthSec(POST_SESSION_BREATH.spec)).toBe(breathTotalSec(RECOVERY_BREATH));
    expect(pacerLengthSec(POST_SESSION_BREATH.spec)).toBe(120);
    expect(pacerLengthSec(POST_SESSION_BREATH.spec)).toBeGreaterThan(pacerLengthSec(BETWEEN_SET_SETTLE.spec));
    expect(RECOVERY_BREATH_STEP.name).toBe(POST_SESSION_BREATH.name);
    expect(POST_SESSION_BREATH.source).toBe('playbook ch9');
    // the cool-down's breath step is this preset, 120 s, first
    const plan = generateCooldown([{ order: 1, section: 'key', isKeySet: true, coaching: { pattern: { id: 'squat' } } }]);
    expect(plan.steps[0]).toMatchObject({ kind: 'breath', name: POST_SESSION_BREATH.name, seconds: 120, breath: RECOVERY_BREATH });
  });
});

describe('the settle fits inside a rest, and never runs into the next set', () => {
  it('a 60 s rest holds the whole settle (40 s) with 20 s to set up; shorter rests give up whole breaths; under 35 s, none', () => {
    expect(settleFor(60)).toEqual(BETWEEN_SET_SETTLE.spec);
    expect(settleFor(180)!.rounds).toBe(4);
    expect(settleFor(45)!.rounds).toBe(3);
    expect(settleFor(35)!.rounds).toBe(2);
    expect(settleFor(34)).toBeNull();
    expect(settleFor(0)).toBeNull();
    expect(restHoldsSettle(35)).toBe(true);
    expect(restHoldsSettle(30)).toBe(false);
  });

  it('started partway through a rest it starts where the rest is and keeps only the breaths that still fit', () => {
    expect(settleFor(90, 40)).toEqual({ ...BETWEEN_SET_SETTLE.spec, from: 40, rounds: 3 });
    expect(settleFor(60, 30)).toBeNull();          // 30 s left: 15 of them to set up, one breath — not a settle
    expect(settleFor(60, -1)).toBeNull();
    expect(settleFor(Number.NaN)).toBeNull();
  });

  it('every rest from 0 to 10 min, started at any whole second: the settle ends at least 15 s before the rest does', () => {
    for (let rest = 0; rest <= 600; rest += 5) {
      for (let start = 0; start <= rest; start += 5) {
        const s = settleFor(rest, start);
        if (!s) continue;
        expect(s.from).toBe(start);
        expect(s.rounds).toBeGreaterThanOrEqual(SETTLE_MIN_ROUNDS);
        expect(s.rounds).toBeLessThanOrEqual(BETWEEN_SET_SETTLE.spec.rounds);
        expect(pacerEndSec(s), `rest ${rest} from ${start}`).toBeLessThanOrEqual(rest - SETTLE_SETUP_SEC);
      }
    }
  });

  it('the chip: hidden without a rest long enough; with one, the settle a tap starts now, or disabled when too little is left', () => {
    expect(settleChip(null, null)).toMatchObject({ show: false, spec: null });
    expect(settleChip(0, null).show).toBe(false);
    expect(settleChip(30, null).show).toBe(false);
    expect(settleChip(90, null)).toEqual({ show: true, spec: BETWEEN_SET_SETTLE.spec, label: 'Settle · 40 s', why: null });
    expect(settleChip(45, null).label).toBe('Settle · 30 s');
    expect(settleChip(90, 40)).toEqual({ show: true, spec: { ...BETWEEN_SET_SETTLE.spec, from: 40, rounds: 3 }, label: 'Settle · 30 s', why: null });
    expect(settleChip(60, 30)).toEqual({ show: true, spec: null, label: 'Settle', why: 'rest-too-short' });
    expect(settleChipLabel(BETWEEN_SET_SETTLE.spec)).toBe('Settle · 40 s');
  });

  // MIRROR-COACH P7 review (2026-09-29): a tap while a SET's timer ran used to start the rest, which replaced the set's
  // timer — the settle cut into the set and the set's worked seconds were never logged.
  it('NEVER DURING A SET: while a work or hold timer runs the chip stays in place, disabled, and says why', () => {
    expect(settleChip(90, null, true)).toEqual({ show: true, spec: null, label: 'Settle · 40 s', why: 'set-running' });
    expect(settleChip(45, null, true)).toMatchObject({ spec: null, label: 'Settle · 30 s', why: 'set-running' });
    expect(settleChip(30, null, true).show).toBe(false);        // no rest to settle in: no chip at all, set or no set
    expect(settleChip(90, null, false).spec).toEqual(BETWEEN_SET_SETTLE.spec);   // the set is done / stopped: live again
    // a live rest is not a set (setLive is only ever true with no rest running; a rest wins if both were passed)
    expect(settleChip(90, 10, true)).toMatchObject({ spec: { ...BETWEEN_SET_SETTLE.spec, from: 10 }, why: null });
    expect(Object.keys(SETTLE_WHY_LINE).sort()).toEqual(['other-breath', 'rest-too-short', 'set-running']);
  });

  // MIRROR-COACH P7 FIX (2026-09-29, review): the settle and the Dial-Up could run side by side on the key set's card
  it('ONE BREATH AT A TIME: while the Dial-Up Breath runs on the card, the chip stays in place, disabled, and says why', () => {
    expect(settleChip(90, null, false, true)).toEqual({ show: true, spec: null, label: 'Settle · 40 s', why: 'other-breath' });
    expect(SETTLE_WHY_LINE['other-breath']).toMatch(/Dial-Up Breath first/);
    expect(settleChip(30, null, false, true).show).toBe(false);          // no rest to settle in: no chip at all
    expect(settleChip(90, null, true, true).why).toBe('set-running');    // a set's timer is the stronger reason
    expect(settleChip(90, null, false, false).spec).toEqual(BETWEEN_SET_SETTLE.spec);
  });
});

// MIRROR-COACH P7 FIX (2026-09-29, review): the off day's recovery breath was a bare "Work 3:00" countdown
describe('a timed item that IS the post-session breath gets the one pacer on its Work clock (workBreathFor)', () => {
  const breathRow = { pattern: 'breath', category: 'breath' };
  it("the off day's 4-6 Recovery Breath: 180 s is 15 of its 12-second breaths, and the ring ends with the clock", () => {
    const item = OFF_DAY_ITEMS.find((i) => i.catalogue.name === POST_SESSION_BREATH.name)!;
    expect(item.prescription.workSeconds).toBe(180);
    const spec = workBreathFor({ name: item.catalogue.name, workSeconds: item.prescription.workSeconds }, item.catalogue)!;
    expect(spec).toEqual({ ...POST_SESSION_BREATH.spec, from: 0, rounds: 15 });
    expect(pacerLengthSec(spec)).toBe(item.prescription.workSeconds);
    expect(pacerEndSec(spec)).toBe(180);
  });
  it('only for the named preset, filed as a breath, and a whole number of breaths — anything else keeps the plain clock', () => {
    expect(workBreathFor({ name: POST_SESSION_BREATH.name, workSeconds: 120 }, breathRow)!.rounds).toBe(10);
    expect(workBreathFor({ name: POST_SESSION_BREATH.name, workSeconds: 100 }, breathRow)).toBeNull();   // 100 / 12 is not whole
    expect(workBreathFor({ name: 'Box Jump', workSeconds: 120 }, breathRow)).toBeNull();
    expect(workBreathFor({ name: POST_SESSION_BREATH.name, workSeconds: 120 }, { pattern: 'squat', category: 'strength' })).toBeNull();
    expect(workBreathFor({ name: POST_SESSION_BREATH.name, workSeconds: null }, breathRow)).toBeNull();
    expect(workBreathFor({ name: POST_SESSION_BREATH.name, workSeconds: 0 }, breathRow)).toBeNull();
    expect(workBreathFor({ name: POST_SESSION_BREATH.name, workSeconds: 120 }, null)).toBeNull();
  });
  it("Today's card for the off day's breath carries the spec (lib/coach/today.ts todayExercise); a squat's does not", () => {
    const item = OFF_DAY_ITEMS.find((i) => i.catalogue.name === POST_SESSION_BREATH.name)!;
    const tree = { id: 'se-b', order: 5, exerciseId: 'pe-b', name: item.catalogue.name, coachNote: null, ...item.prescription } as unknown as Parameters<typeof todayExercise>[0];
    expect(todayExercise(tree, item.catalogue, new Map()).breath).toEqual({ ...POST_SESSION_BREATH.spec, from: 0, rounds: 15 });
    const squat = { ...tree, name: 'Goblet Squat', workSeconds: null } as typeof tree;
    expect('breath' in todayExercise(squat, { pattern: 'squat', category: 'strength' }, new Map())).toBe(false);
  });
});

// ── the copy lint ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The book and its methods (never named; it appears only in Education's further reading), and named breath methods.
 *  MIRROR-COACH P7 FIX (2026-09-29, review): with the book's own breath names — huff, double breath, crocodile, square
 *  breath, 90/90, rhythmic breathing — the same additions as ramp-copy.test.ts. */
const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|tactical|box breath|physiological sigh|Wim Hof|buteyko|4-7-8|pillar|linchpin|6x6|downshift|biphasic|\bhuff\w*|double[- ]?breath|crocodile|square[- ]?breath|90 ?\/ ?90|rhythmic[- ]?breath/i;
/** Body-state claims a breath line must never make (owner decision #11: no HRV or injury claims). */
const CLAIMS = /\b(hrv|heart[- ]?rate|variability|nervous|sympathetic|parasympathetic|vagus|vagal|cortisol|stress|anxiety|panic|fight[- ]or[- ]flight|oxygen|co2|carbon dioxide|blood pressure|injur\w*|prevent\w*|risks?|reduc\w*|protect\w*|heal\w*|cure\w*|treat\w*|therap\w*|rehab\w*|recover faster|guarantee\w*|safer|pain)\b/i;

describe("every line is FEL's words: no body-state claim, no book, and 'helps you settle' at most", () => {
  const lines = [
    ...BREATH_PRESETS.flatMap(presetLines),
    ...Object.values(PACER_WORDS), PACER_BEFORE_WORD, PACER_AFTER_WORD,
    settleChipLabel(BETWEEN_SET_SETTLE.spec), 'Settle', 'Stop settle', ...Object.values(SETTLE_WHY_LINE),
  ];
  it.each(lines.map((l) => [l]))('%s', (text) => {
    expect(text).not.toMatch(BOOK);
    expect(text).not.toMatch(CLAIMS);
    expect(screenText(text), text).toEqual([]);
    // the one benefit a line may name is settling, said exactly so
    for (const m of text.matchAll(/\bhelps?\b[^.]*/gi)) expect(m[0]).toMatch(/^helps you settle\b/i);
  });

  it('the lint bites: it flags a line that makes the claims it forbids', () => {
    for (const bad of [
      'Raises your HRV.', 'Calms your nervous system.', 'Lowers your heart rate.', 'Helps prevent injury.',
      'Tactical breathing for athletes.', 'A parasympathetic downshift.', 'Reduces stress.',
      'Huff breath before the set', 'Double breath, then go', 'Crocodile breathing on the floor', 'Square breathing', 'Rhythmic breathing on the run',
    ]) expect(BOOK.test(bad) || CLAIMS.test(bad), bad).toBe(true);
    expect(/^helps you settle\b/i.test('helps you recover')).toBe(false);
  });
});
