// The form read's bound (movement play, phase 10): unread stays null, never 0; a height must agree with its flight;
// PRQ power moves only from a measured 'jump'. The fixtures' ground-truth jumps (lib/pose/__fixtures__/index.json,
// the owner's DeepMotion takes) are the realistic values every honest read must pass.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  boundFormSummary, bestMeasuredJump, powerFromJumpCm, planFormWrite, scanKindFor, formHasReads, jumpConsistent,
  heightCmForFlight, flightMsForHeight, KIND_READS, FORM_ATTEMPT_KINDS, MAX_FORM_ATTEMPTS, MAX_VERTICAL_CM,
  MAX_FLIGHT_MS, MIN_FLIGHT_MS, FLIGHT_SLACK_MS, DUNK_SCAN_KIND, FORM_SCAN_KINDS, MAX_LABEL_CHARS, FORM_SUMMARY_VERSION,
  POWER_SESSION_MODES, SHARED_CAMERA_MODES, familyOf, type FormSummary,
} from './formSummary';
import { axisValue, measurementFor } from '@/lib/profile/scanToSnapshot';
import { PRQ_CAMERA_SOURCE } from '@/lib/prq';

interface GtJump { flightMs: number; heightFlightM: number; hipRiseM: number; feet: number }
const FIXTURES = JSON.parse(readFileSync(join(__dirname, '../pose/__fixtures__/index.json'), 'utf8')) as { name: string; jumps: GtJump[] }[];
const GT_JUMPS = FIXTURES.flatMap((f) => f.jumps.map((j) => ({ name: f.name, ...j })));

/** An honest jump read, the way BodyReader's 'land' event makes it: the height from the flight. */
const jumpOf = (flightMs: number, extra: Record<string, unknown> = {}) => ({
  kind: 'jump', label: 'WINDMILL', made: true, takeoff: 'two',
  reads: { heightCm: heightCmForFlight(flightMs), flightMs, ...extra },
});

const bound = (form: unknown, mode = 'dunkContest') => boundFormSummary(form, { mode });

describe('the bound: what a body can produce', () => {
  it('there are ground-truth jumps to check against', () => {
    expect(GT_JUMPS.length).toBeGreaterThanOrEqual(8);
  });

  it('every ground-truth jump in the fixtures survives the bound, height and flight intact', () => {
    for (const j of GT_JUMPS) {
      const { form, issues } = bound({ attempts: [jumpOf(j.flightMs)] });
      expect(issues, j.name).toEqual([]);
      const a = form!.attempts[0];
      expect(a.kind).toBe('jump');
      if (a.kind !== 'jump') continue;
      expect(a.reads.flightMs, j.name).toBeCloseTo(j.flightMs, 1);
      expect(a.reads.heightCm! / 100, j.name).toBeCloseTo(j.heightFlightM, 2);
    }
  });

  it('g·t²/8: a 0.6 s flight is ~44 cm and the two helpers invert each other', () => {
    expect(heightCmForFlight(600)).toBeCloseTo(44.1, 1);        // map:irl-form §2's table
    expect(flightMsForHeight(heightCmForFlight(733))).toBeCloseTo(733, 6);
  });

  it('an unread read is null, never 0 — and a missing one is filled in as null', () => {
    const { form } = bound({ attempts: [{ kind: 'jump', reads: { heightCm: null } }] });
    const a = form!.attempts[0];
    for (const key of KIND_READS.jump) expect((a.reads as Record<string, unknown>)[key], key).toBeNull();
    expect(Object.keys(a.reads).sort()).toEqual([...KIND_READS.jump].sort());
    expect(a.label).toBeNull();
    expect(a.made).toBeNull();
    expect(a.takeoff).toBeNull();
  });

  it('a real 0 inside the range is kept as 0 (a landing with all the sway), not turned into unread', () => {
    const { form } = bound({ attempts: [{ kind: 'jump', reads: { landingStability: 0, armSwingMs: 0 } }] });
    const r = form!.attempts[0].reads as Record<string, number | null>;
    expect(r.landingStability).toBe(0);
    expect(r.armSwingMs).toBe(0);
  });

  it('a jump over 120 cm, a flight past the cap, NaN, Infinity and strings all become unread', () => {
    const tooHigh = heightCmForFlight(1000) + 5;                  // ~128 cm
    expect(tooHigh).toBeGreaterThan(MAX_VERTICAL_CM);
    const cases: [Record<string, unknown>, string][] = [
      [{ heightCm: tooHigh, flightMs: flightMsForHeight(tooHigh) }, 'heightCm'],
      [{ heightCm: 50, flightMs: MAX_FLIGHT_MS + 1 }, 'flightMs'],
      [{ heightCm: NaN, flightMs: 600 }, 'heightCm'],
      [{ heightCm: Infinity, flightMs: 600 }, 'heightCm'],
      [{ heightCm: '60', flightMs: 700 }, 'heightCm'],
      [{ heightCm: 2, flightMs: MIN_FLIGHT_MS - 20 }, 'heightCm'],
      [{ heightCm: 2, flightMs: MIN_FLIGHT_MS - 20 }, 'flightMs'],
      [{ landingStability: 1.4 }, 'landingStability'],
      [{ absorbCm: -3 }, 'absorbCm'],
    ];
    for (const [reads, key] of cases) {
      const { form, issues } = bound({ attempts: [{ kind: 'jump', reads }] });
      const r = form!.attempts[0].reads as Record<string, number | null>;
      expect(r[key], JSON.stringify(reads)).toBeNull();
      expect(issues.join(), JSON.stringify(reads)).toContain(key);
    }
  });

  it('a height that disagrees with its flight is not one jump: both go unread', () => {
    const flight = 600;
    const honest = heightCmForFlight(flight);
    expect(jumpConsistent(honest, flight)).toBe(true);
    // a doctored height (+50%) on the same flight
    const { form, issues } = bound({ attempts: [{ kind: 'jump', reads: { heightCm: honest * 1.5, flightMs: flight } }] });
    const r = form!.attempts[0].reads as Record<string, number | null>;
    expect(r.heightCm).toBeNull();
    expect(r.flightMs).toBeNull();
    expect(issues.join()).toMatch(/disagree/);
  });

  it('the slack is two frames at 24 Hz: a flight one frame off still agrees, three frames off does not', () => {
    expect(FLIGHT_SLACK_MS).toBeCloseTo(83.3, 1);
    const h = heightCmForFlight(600);
    expect(jumpConsistent(h, 600 + 1000 / 30)).toBe(true);
    expect(jumpConsistent(h, 600 + 3 * (1000 / 24))).toBe(false);
  });

  it('reads that do not belong to the kind are dropped, and the kind must be known', () => {
    const { form, issues } = bound({ attempts: [
      { kind: 'strike', reads: { heightCm: 50, handSpeedMps: 7.5 } },
      { kind: 'dance', reads: {} },
      'nope',
    ] });
    expect(form!.attempts).toHaveLength(1);
    const a = form!.attempts[0];
    expect('heightCm' in a.reads).toBe(false);
    expect((a.reads as Record<string, number | null>).handSpeedMps).toBe(7.5);
    expect(a.takeoff).toBeNull();                                // a strike does not leave the floor
    expect(issues.join()).toMatch(/not a strike read/);
    expect(issues.join()).toMatch(/unknown kind/);
  });

  it('attempts are capped, and the count still says how many there were', () => {
    const many = Array.from({ length: MAX_FORM_ATTEMPTS + 15 }, () => jumpOf(500));
    const { form, issues } = bound({ attempts: many, attemptCount: 3 });
    expect(form!.attempts).toHaveLength(MAX_FORM_ATTEMPTS);
    expect(form!.attemptCount).toBe(MAX_FORM_ATTEMPTS + 15);
    expect(issues.join()).toMatch(/capped/);
  });

  it('the mode is the session\'s, whatever the client wrote', () => {
    const { form } = bound({ mode: 'tennis', attempts: [jumpOf(500)] }, 'dunkContest');
    expect(form!.mode).toBe('dunkContest');
  });

  it('no form, junk, or no surviving attempt: null, and the session goes on', () => {
    expect(bound(undefined).form).toBeNull();
    expect(bound(null).form).toBeNull();
    expect(bound('x').form).toBeNull();
    expect(bound([]).form).toBeNull();
    expect(bound({ attempts: [{ kind: 'nope' }] }).form).toBeNull();
  });

  it('labels are a move\'s name or nothing', () => {
    const labels = ['HIDE & SEEK', '360', '<script>', 'x'.repeat(MAX_LABEL_CHARS + 1), 42];
    const { form, issues } = bound({ attempts: labels.map((label) => ({ kind: 'jump', label, reads: {} })) });
    expect(form!.attempts.map((a) => a.label)).toEqual(['HIDE & SEEK', '360', null, null, null]);
    expect(issues.filter((i) => i.endsWith('.label: not a move\'s name'))).toHaveLength(3);   // refused, and it says so
  });

  it('every kind has its reads, and every read is bounded', () => {
    for (const k of FORM_ATTEMPT_KINDS) expect(KIND_READS[k].length, k).toBeGreaterThan(0);
  });

  it('formHasReads: one read anywhere is play; an all-unread form is not', () => {
    expect(formHasReads(bound({ attempts: [{ kind: 'shot', reads: {} }] }).form)).toBe(false);
    expect(formHasReads(bound({ attempts: [{ kind: 'shot', reads: { followThroughMs: 400 } }] }).form)).toBe(true);
    expect(formHasReads(null)).toBe(false);
  });
});

describe('PRQ power: only from a measured jump, through the existing verticalJump mapping', () => {
  it('the mapping is scanToSnapshot\'s: 12 in → 0, 40 in → 100, clamped', () => {
    const m = measurementFor('verticalJump')!;
    expect(m.axis).toBe('power');
    expect(powerFromJumpCm(12 * 2.54)).toBe(0);
    expect(powerFromJumpCm(40 * 2.54)).toBe(100);
    expect(powerFromJumpCm(26 * 2.54)).toBe(50);
    expect(powerFromJumpCm(60)).toBe(axisValue(m, 60 / 2.54));
    expect(powerFromJumpCm(20)).toBe(0);                          // below the floor clamps, it does not go negative
    expect(powerFromJumpCm(MAX_VERTICAL_CM)).toBe(100);
  });

  it('the best measured jump of the session wins, and it is always a score 0..100', () => {
    const { form } = bound({ attempts: [jumpOf(500), jumpOf(733), jumpOf(620)] });
    const best = bestMeasuredJump(form)!;
    expect(best.attempt).toBe(2);
    expect(best.heightCm).toBeCloseTo(heightCmForFlight(733), 1);
    for (const j of GT_JUMPS) {
      const v = powerFromJumpCm(j.heightFlightM * 100)!;
      expect(v, j.name).toBeGreaterThanOrEqual(0);
      expect(v, j.name).toBeLessThanOrEqual(100);
    }
  });

  it('a jump shot, a board pop, a height with no flight, or an unread jump never moves power', () => {
    const { form } = bound({ attempts: [
      { kind: 'shot', reads: { heightCm: heightCmForFlight(700), flightMs: 700 } },
      { kind: 'board', reads: { heightCm: heightCmForFlight(700), flightMs: 700 } },
      { kind: 'jump', reads: { heightCm: 60 } },
      { kind: 'jump', reads: {} },
    ] });
    expect(bestMeasuredJump(form)).toBeNull();
    expect(planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: new Date() }).power).toBeNull();
  });

  it('the plan writes ONE power entry: unit score (never cm), source camera, tied to the session', () => {
    const { form } = bound({ attempts: [jumpOf(500), jumpOf(733)] });
    const at = new Date('2026-09-24T12:00:00Z');
    const plan = planFormWrite(form!, { userId: 'u1', sessionId: 's1', measuredAt: at });
    expect(plan.power).toEqual({
      userId: 'u1', attribute: 'power', value: powerFromJumpCm(heightCmForFlight(733)), unit: 'score',
      source: PRQ_CAMERA_SOURCE, measuredAt: at, sessionId: 's1',
    });
  });
});

describe('history rows', () => {
  const at = new Date('2026-09-24T12:00:00Z');

  it('one row per attempt; unread stays null in the stored numbers', () => {
    const { form } = bound({ attempts: [jumpOf(700, { kneeDriveCm: 22 }), { kind: 'jump', reads: {} }] });
    const plan = planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: at });
    expect(plan.scans).toHaveLength(2);
    const reads = plan.scans[0].metrics.reads as Record<string, number | null>;
    expect(reads.kneeDriveCm).toBe(22);
    expect(reads.penultimateDropCm).toBeNull();
    expect(plan.scans[0].metrics).toMatchObject({ source: 'camera', mode: 'dunkContest', sessionId: 's', attempt: 1, attemptCount: 2, kind: 'jump' });
  });

  it('a measured dunk joins the Mirror\'s dunk history under its names; an unread one does not (it would read as 0 cm)', () => {
    const { form } = bound({ attempts: [jumpOf(700), { kind: 'jump', label: 'TOMAHAWK', reads: {} }] });
    const plan = planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: at });
    expect(plan.scans.map((r) => r.kind)).toEqual([DUNK_SCAN_KIND, FORM_SCAN_KINDS.jump]);
    expect(plan.scans[0].metrics).toMatchObject({ verticalCm: expect.any(Number), flightTimeMs: 700, family: 'WINDMILL', made: true });
    expect(plan.scans[1].metrics).not.toHaveProperty('verticalCm');
  });

  it('outside the dunk contests a jump is a \'jump\' row, and the other kinds get their own', () => {
    const { form } = bound({ attempts: [
      jumpOf(600), { kind: 'shot', reads: {} }, { kind: 'strike', reads: {} }, { kind: 'board', reads: {} },
    ] }, 'irl');
    expect(form!.attempts.map((a) => scanKindFor(a, 'irl'))).toEqual(['jump', 'shot_form', 'strike_form', 'board_form']);
  });

  it('a dunk name the Mirror does not know is stored as ATTEMPT, as the Mirror route does', () => {
    const { form } = bound({ attempts: [{ ...jumpOf(650), label: 'SCORPION' }, { ...jumpOf(650), label: 'between the legs' }] });
    const plan = planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: at });
    expect(plan.scans.map((r) => r.metrics.family)).toEqual(['ATTEMPT', 'BETWEEN-THE-LEGS']);
    expect(plan.scans[0].metrics.label).toBe('SCORPION');
  });

  it('the stored rows are numbers only: JSON round-trips them exactly', () => {
    const { form } = bound({ attempts: [jumpOf(700), { kind: 'shot', reads: { releaseVsApexMs: -60, setPointCm: 12 } }] }, 'threePoint');
    const plan = planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: at });
    expect(JSON.parse(JSON.stringify(plan.scans))).toEqual(plan.scans);
  });
});

// Adversarial review (2026-09-24): each case below broke the first cut of the bound or the PRQ feed.
describe('review: what the first cut let through', () => {
  const at = new Date('2026-09-24T12:00:00Z');
  const plan = (form: FormSummary) => planFormWrite(form, { userId: 'u', sessionId: 's', measuredAt: at });

  it('every dunk name in the game survives the label bound (the longest named chain is 37 characters)', () => {
    // read the game's own names from DunkSystem.ts rather than importing Babylon into a node test
    const src = readFileSync(join(__dirname, '../babylon/core/DunkSystem.ts'), 'utf8');
    const names = [...new Set([...src.matchAll(/\b(?:label|name): '([^']+)'/g)].map((m) => m[1]))];
    expect(names).toContain('FAKE BEHIND THE BACK BETWEEN THE LEGS');
    for (let i = 0; i < names.length; i += MAX_FORM_ATTEMPTS) {
      const chunk = names.slice(i, i + MAX_FORM_ATTEMPTS);
      const { form, issues } = bound({ attempts: chunk.map((label) => ({ kind: 'jump', label, reads: {} })) });
      expect(issues).toEqual([]);
      expect(form!.attempts.map((a) => a.label)).toEqual(chunk);
    }
  });

  it('half of a broken pair goes unread with it: a height beside an impossible flight is not a lone height', () => {
    const cases: Record<string, unknown>[] = [
      { heightCm: 100, flightMs: 5000 },                       // the flight is refused, so the height it came with is too
      { heightCm: 'sixty', flightMs: 700 },                    // and the reverse
      { heightCm: 150, flightMs: flightMsForHeight(150) },     // an honest-looking pair past the cap
    ];
    for (const reads of cases) {
      const r = bound({ attempts: [{ kind: 'jump', reads }] }).form!.attempts[0].reads as Record<string, number | null>;
      expect(r.heightCm, JSON.stringify(reads)).toBeNull();
      expect(r.flightMs, JSON.stringify(reads)).toBeNull();
    }
    // a lone flight, or a lone height, with nothing refused beside it, is still kept for history
    const lone = bound({ attempts: [{ kind: 'jump', reads: { flightMs: 600 } }, { kind: 'jump', reads: { heightCm: 44 } }] }).form!;
    expect((lone.attempts[0].reads as Record<string, number | null>).flightMs).toBe(600);
    expect((lone.attempts[1].reads as Record<string, number | null>).heightCm).toBe(44);
  });

  it('PRQ is credited with the flight\'s height, not a height inflated inside the slack', () => {
    const flight = 500;
    const inflated = heightCmForFlight(flight + 0.9 * FLIGHT_SLACK_MS);   // +33 %, and still "agrees"
    expect(jumpConsistent(inflated, flight)).toBe(true);
    const { form } = bound({ attempts: [{ kind: 'jump', reads: { heightCm: inflated, flightMs: flight } }] });
    const best = bestMeasuredJump(form)!;
    expect(best.heightCm).toBeCloseTo(heightCmForFlight(flight), 2);
    expect(plan(form!).power!.value).toBe(powerFromJumpCm(heightCmForFlight(flight)));
    expect(plan(form!).power!.value).toBeLessThan(powerFromJumpCm(inflated)!);
    // a height LOWER than its flight's (a hip-rise height) is taken as sent: the lower of the two
    const low = bound({ attempts: [{ kind: 'jump', reads: { heightCm: 40, flightMs: 600 } }] }).form;
    expect(bestMeasuredJump(low)!.heightCm).toBe(40);
  });

  it('only a dunk session\'s jump moves PRQ: a drill\'s pogos, a hoops contest or a vert hop go to history only', () => {
    expect([...POWER_SESSION_MODES].sort()).toEqual(['dunkContest', 'dunkduel']);
    // a pogo set: ~0.3 s contacts, ~11 cm (lib/drills/drills.ts POGO_SEC); on the standing-vertical scale that is power 0
    const pogos = { attempts: Array.from({ length: 5 }, () => ({ kind: 'jump', label: 'POGO', reads: { heightCm: heightCmForFlight(300), flightMs: 300 } })) };
    expect(powerFromJumpCm(heightCmForFlight(300))).toBe(0);
    for (const mode of ['drills', 'hoops1v1', 'hoops3v3', 'threePoint', 'irl', 'karateVersus']) {
      const { form } = bound(pogos, mode);
      expect(bestMeasuredJump(form), mode).toBeNull();
      const p = plan(form!);
      expect(p.power, mode).toBeNull();
      expect(p.scans, mode).toHaveLength(5);                 // every read still saved to history
    }
    expect(plan(bound({ attempts: [jumpOf(700)] }, 'dunkContest').form!).power).not.toBeNull();
  });

  it('Dunk Duel shares one camera: only the signed-in player\'s (P1) jumps are kept, and P2\'s bigger jump is not their PRQ', () => {
    expect(SHARED_CAMERA_MODES).toEqual(['dunkduel']);
    const duel = { attemptCount: 4, attempts: [
      { ...jumpOf(600), player: 1 },
      { ...jumpOf(850), player: 2 },                          // somebody else's 88 cm
      { ...jumpOf(640), player: 1 },
      jumpOf(900),                                            // untagged: whose? not kept
    ] };
    const { form, issues } = bound(duel, 'dunkduel');
    expect(form!.attempts).toHaveLength(2);
    expect(form!.attempts.every((a) => a.player === 1)).toBe(true);
    expect(form!.attemptCount).toBe(2);
    expect(bestMeasuredJump(form)!.flightMs).toBe(640);
    const p = plan(form!);
    expect(p.scans).toHaveLength(2);
    expect(p.power!.value).toBe(powerFromJumpCm(heightCmForFlight(640)));
    expect(issues.join()).toMatch(/player 2 is not the signed-in player/);
    expect(issues.join()).toMatch(/no player on a shared camera/);
    // a duel with only P2's jumps stores nothing at all
    expect(bound({ attempts: [{ ...jumpOf(850), player: 2 }] }, 'dunkduel').form).toBeNull();
    // a one-body mode ignores the tag
    expect(bound({ attempts: [{ ...jumpOf(600), player: 2 }] }, 'dunkContest').form!.attempts[0].player).toBeNull();
  });

  it('a game-finished 360 joins the dunk history as an ATTEMPT: a real quarter-turn does not climb the 360 rung', () => {
    expect(familyOf('360')).toBe('ATTEMPT');
    expect(familyOf('WINDMILL')).toBe('WINDMILL');
    expect(familyOf('between the legs')).toBe('BETWEEN-THE-LEGS');
    const { form } = bound({ attempts: [{ ...jumpOf(700), label: '360' }] });
    const row = plan(form!).scans[0];
    expect(row.kind).toBe(DUNK_SCAN_KIND);
    expect(row.metrics).toMatchObject({ family: 'ATTEMPT', label: '360', verticalCm: expect.any(Number) });
  });

  it('the book\'s four reads fit a dunk AND a layup, with arm swing timing as its two reads (the map\'s derivation)', () => {
    const book = { penultimateDropCm: 24, penultimateContactMs: 210, armLowVsPenultMs: -20, armSwingMs: -35, kneeDriveCm: 18 };
    for (const kind of ['jump', 'shot'] as const) {
      const { form, issues } = bound({ attempts: [{ kind, label: kind === 'shot' ? 'LAYUP' : 'TOMAHAWK', reads: book }] }, 'hoops1v1');
      expect(issues, kind).toEqual([]);
      expect(form!.attempts[0].reads, kind).toMatchObject(book);
    }
    // a jumper leaves the approach unread, never 0
    const jumper = bound({ attempts: [{ kind: 'shot', reads: { releaseVsApexMs: -60 } }] }, 'threePoint').form!.attempts[0].reads as Record<string, number | null>;
    expect(jumper.penultimateDropCm).toBeNull();
    expect(jumper.armLowVsPenultMs).toBeNull();
  });

  it('another version of the form is refused, not read as this one (its units may differ)', () => {
    expect(FORM_SUMMARY_VERSION).toBe(1);
    const metres = { v: 2, attempts: [{ kind: 'jump', reads: { heightCm: 0.6, flightMs: 700 } }] };
    const { form, issues } = bound(metres);
    expect(form).toBeNull();
    expect(issues.join()).toMatch(/form\.v/);
    expect(bound({ v: 1, attempts: [jumpOf(600)] }).form).not.toBeNull();
    expect(bound({ attempts: [jumpOf(600)] }).form).not.toBeNull();     // an unversioned form is read as v1
  });
});

// a compile-time check that the exported type reads like the contract says
const _typed: FormSummary = { v: 1, mode: 'dunkContest', attemptCount: 1, attempts: [{
  kind: 'jump', label: null, player: null, made: null, takeoff: 'one',
  reads: { heightCm: null, flightMs: null, penultimateDropCm: null, penultimateContactMs: null, armLowVsPenultMs: null, armSwingMs: null, kneeDriveCm: null, landingStability: null, absorbCm: null },
}] };
void _typed;
