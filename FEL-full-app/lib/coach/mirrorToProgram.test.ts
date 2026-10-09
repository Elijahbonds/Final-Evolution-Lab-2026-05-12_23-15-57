// The coach's draft from a REAL screen (MIRROR-COACH P3, 2026-09-26): each flagged camera check maps to its FIX line,
// its corrective block and a catalogue exercise matched on the P2 TAGS; a check the camera could not read is a retest
// and never clear; a pass prescribes nothing; the coach reads camera / answers / hands-on checks in three groups; the
// draft goes into the Prep section through the builder's own add path; and the route's read falls back to the last
// GRADED screen. The stored rows are made the way the screen route makes them (lib/mirror/screenClaims.ts
// decideScreenPost → storedScreen), from summary numbers the real grader reads.
import { describe, expect, it } from 'vitest';
import {
  ANSWERS_NOTE, ANSWERS_WITHHELD, COACH_OWN_CHECK_LINE, MODIFIED_NO_COACH_CHECKS, REVIEW_GROUPS, SCREEN_NOTE_PREFIX, addBodyFor, becauseLine,
  blockAddBodies, coachDraft, coachNoteFor, matchExercise, prescribeFromOutcomes, prescribeFromScreen, reviewScreen, wantedFor,
  WRITTEN_CORRECTIVE_NOTE, type CatalogueExercise,
} from './mirrorToProgram';
import { validateExerciseSpec } from './loop';
import { doseLine } from './structure';
import { mentionsShoulder } from './coverage';
import { builderAction } from './builderServer';
import { builderMemoryDb, createProgram, newBuilderStore } from './builderMemoryDb';
import type { BuilderDb } from './builderServer';
import { CAMERA_NOT_DIAGNOSIS, outcomesFromGrades } from '@/lib/mirror/screenCorrectives';
import { fixLine, scoreScreen, type CheckResult, type ScreenId } from '@/lib/mirror/screen';
import { decideScreenPost } from '@/lib/mirror/screenClaims';
import { readStoredScreen, storedScreen } from '@/lib/mirror/screenStore';
import { regradeFromSummary } from '@/lib/mirror/stationGraders';
import { screenText } from '@/lib/share/screen';

// ── a coach's catalogue, tagged the way the P2 bridge tags the knowledge base (lib/coach/kbTags.ts) ─────────────────
const CAT: CatalogueExercise[] = [
  { id: 'hipthrust', name: 'Hip thrust', pattern: 'hinge', skillLayer: 'strength' },          // "hip" in the NAME only
  { id: 'ankle', name: 'Ankle Circles', pattern: 'mobility', skillLayer: 'joints', defaultTempo: '0-0-0-0' },
  { id: 'hip9090', name: 'Hip Circles (90/90)', pattern: 'mobility', skillLayer: 'joints', defaultTempo: '0-0-0-0' },
  { id: 'tripod', name: 'Tripod Foot', pattern: 'other', skillLayer: 'tripod', defaultTempo: '0-0-0-0' },
  { id: 'd360', name: '360 Diaphragm', pattern: 'breath', skillLayer: 'cylinder', defaultTempo: '0-0-0-0' },
  { id: 'split', name: 'Split squat', pattern: 'lunge', skillLayer: 'strength' },
  { id: 'goblet', name: 'Goblet squat', pattern: 'squat', skillLayer: 'strength' },
  { id: 'tspine', name: 'Thoracic extension on a roller', pattern: 'mobility', skillLayer: 'joints' },
  { id: 'clam', name: 'Banded clamshell', pattern: null, skillLayer: null },                   // never tagged
];

// ── screens, made the way the route makes them ──────────────────────────────────────────────────────────────────────
const PASS = {
  heelLine: { checkId: 'heelLine', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels' },
  kneeWindow: { checkId: 'kneeWindow', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack' },
  hipLevel: { checkId: 'hipLevel', value: 0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  shoulderLevel: { checkId: 'shoulderLevel', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  headFloat: { checkId: 'headFloat', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02, stationId: 'profile' },
  singleLegL: { checkId: 'singleLeg', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL' },
  singleLegR: { checkId: 'singleLeg', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right', stationId: 'wobbleR' },
} as const;
type Key = keyof typeof PASS;
const KEYS = Object.keys(PASS) as Key[];
const FLAG: Record<Key, Record<string, unknown>> = {
  heelLine: { value: 14, bySide: { left: 14, right: 2 } },
  kneeWindow: { value: 0.7, bySide: { left: 0.7, right: 0.05 } },
  hipLevel: { value: -0.12 },
  shoulderLevel: { value: 0.1 },
  headFloat: { value: 0.2 },
  singleLegL: { touchDowns: 2 },
  singleLegR: { value: 0.2 },
};
const UNREAD = { readableFrames: 3, value: null, uncertainty: null, spread: null, bySide: undefined };
/** A claim whose status is what the real grader says its numbers give (the route refuses anything else). */
const claim = (k: Key, over: Record<string, unknown> = {}) => {
  const body = { ...PASS[k], ...over };
  return { ...body, status: regradeFromSummary(body)!.status };
};
type Over = Partial<Record<Key, Record<string, unknown> | 'absent'>>;
/** The stored row the screen route would write for this screen (server-graded). */
function row(over: Over = {}, screen: ScreenId = 'modified', answers: unknown[] = []) {
  const checks = KEYS.filter((k) => over[k] !== 'absent').map((k) => claim(k, (over[k] as Record<string, unknown>) ?? {}));
  const d = decideScreenPost({ screenId: `s-${Math.random().toString(36).slice(2)}`, screen, checks, answers }, 'athlete-1');
  if (!d.ok) throw new Error(`the route refused the test's screen: ${JSON.stringify(d.body)}`);
  return JSON.parse(JSON.stringify(storedScreen(d.screenId, d.screen, d.outcome.results, d.summary, {
    camera: d.outcome.camera, provisional: d.outcome.provisional, selfReport: d.answers,
  })));
}
const drafted = (over: Over, catalogue = CAT) => coachDraft([{ metrics: row(over), createdAt: '2026-09-26T10:00:00Z' }], catalogue);

describe('each FLAGGED camera check maps to its FIX line, its block and a catalogue exercise — with what the camera read', () => {
  const expected: Record<Key, { exercise: string; block: string | null; value: RegExp }> = {
    heelLine: { exercise: 'tripod', block: null, value: /^heel lines L 14° · R 2° from vertical .* · estimated$/ },
    kneeWindow: { exercise: 'hip9090', block: 'Ask the hips to lead the hinge', value: /^knee against its hip–ankle line, in hip half-widths: L 0\.70 in · R 0\.05 in · estimated$/ },
    hipLevel: { exercise: 'split', block: 'Trunk and hip hold', value: /^0\.12 of a shoulder width, right higher · estimated$/ },
    shoulderLevel: { exercise: 'd360', block: 'Open the ribcage', value: /^0\.10 of a shoulder width, left higher · estimated$/ },
    headFloat: { exercise: 'tspine', block: 'Ask the mid-back to hold', value: /^ear 0\.20 torso lengths ahead of the shoulder · estimated$/ },
    singleLegL: { exercise: 'tripod', block: 'Trunk and hip hold', value: /^sway 0\.03 torso lengths a second, 2 touch-downs, 28 s on one leg · estimated$/ },
    singleLegR: { exercise: 'tripod', block: 'Trunk and hip hold', value: /^sway 0\.20 torso lengths a second, 0 touch-downs, 28 s on one leg · estimated$/ },
  };
  for (const k of KEYS) {
    it(k, () => {
      const d = drafted({ [k]: FLAG[k] });
      expect(d.prescriptions).toHaveLength(1);
      const p = d.prescriptions[0];
      expect(p.findingId).toBe(PASS[k].checkId);
      expect(p.fix?.startsWith(fixLine(PASS[k].checkId)!)).toBe(true);
      expect(p.block?.title ?? null).toBe(expected[k].block);
      expect(p.exercise?.id).toBe(expected[k].exercise);
      expect(p.matchedBy).toBe('tags');
      expect(p.value).toMatch(expected[k].value);
      expect(p.section).toBe('prep');
      expect(p.because.startsWith(SCREEN_NOTE_PREFIX)).toBe(true);
      expect(p.because).toMatch(/was flagged for a closer look \(.* · estimated\)\.$/);
      expect(d.reason).toBeUndefined();
      // the coach's camera group shows the same flag with the same value, FIX line and block
      const r = d.review!.camera.find((x) => x.checkId === p.findingId && x.status === 'flag')!;
      expect(r).toMatchObject({ statusLabel: 'Flagged for a closer look', value: p.value, fix: p.fix });
      expect(r.block?.title ?? null).toBe(expected[k].block);
    });
  }

  it('the example the brief gave, as the camera can honestly say it: hip level, right side, the value in shoulder widths', () => {
    const p = drafted({ hipLevel: FLAG.hipLevel }).prescriptions[0];
    // the brief's "2.1 cm-est" needs a body size the camera does not know (stationGraders.ts GradeUnit 'cm-est' is
    // reserved), so the value is the grader's own ratio, estimated
    expect(p.because).toBe('From the screen: Hip level, right hip higher was flagged for a closer look (0.12 of a shoulder width, right higher · estimated).');
    expect(p.fix).toMatch(/Here the low side is the left\.$/);
  });
});

describe('an unreadable check is RETEST, never clear; a pass prescribes nothing', () => {
  it('one check unreadable, the rest pass: nothing prescribed, the check says retest, and the screen is partial — not clear', () => {
    const d = drafted({ headFloat: UNREAD });
    expect(d.prescriptions).toEqual([]);
    expect(d.reason).toBe('partial_screen');
    expect(d.complete).toBe(false);
    expect(d.retests).toBe(1);
    const r = d.review!.camera.find((x) => x.checkId === 'headFloat')!;
    expect(r).toMatchObject({ status: 'retest', statusLabel: 'Retest', value: null, fix: null, block: null });
    expect(r.retest).toMatch(/^Not read: .*Hold still in the shot/);
  });

  it('a check with no reading at all is a retest too', () => {
    const d = drafted({ heelLine: 'absent' });
    expect(d.reason).toBe('partial_screen');
    expect(d.review!.camera.find((x) => x.checkId === 'heelLine')!.status).toBe('retest');
  });

  it('every check read and passing: nothing prescribed, and ONLY this is clear', () => {
    const d = drafted({});
    expect(d.prescriptions).toEqual([]);
    expect(d).toMatchObject({ reason: 'clear_screen', complete: true, retests: 0 });
    expect(d.review!.camera.every((r) => r.status === 'pass' && r.fix === null && r.block === null && !!r.value)).toBe(true);
  });

  it('a flag beside a retest drafts the flag and still is not clear', () => {
    const d = drafted({ hipLevel: FLAG.hipLevel, headFloat: UNREAD });
    expect(d.prescriptions.map((p) => p.findingId)).toEqual(['hipLevel']);
    expect(d.reason).toBeUndefined();
    expect(d.complete).toBe(false);
  });
});

describe('matched on the catalogue\'s TAGS, not its names', () => {
  it('"Hip thrust" (a hinge) is never the knee window\'s exercise because its name says hip', () => {
    expect(matchExercise('kneeWindow', CAT)?.exercise.id).toBe('hip9090');
    expect(matchExercise('kneeWindow', [CAT[0]])).toBeNull();
  });

  it('the joints layer spans ankle, hip and upper back, so a joints row must also name the joint', () => {
    const ankleOnly = CAT.filter((e) => e.id === 'ankle');
    expect(matchExercise('kneeWindow', ankleOnly)).toBeNull();            // ankle circles are not hip work
    expect(matchExercise('heelLine', ankleOnly)?.exercise.id).toBe('ankle');
    expect(matchExercise('headFloat', ankleOnly)).toBeNull();
  });

  it('falls to the next want in order: no joints row naming the hip → a strength squat', () => {
    expect(matchExercise('kneeWindow', CAT.filter((e) => e.id !== 'hip9090'))?.exercise.id).toBe('goblet');
  });

  it('an UNTAGGED row is read by its name, and the draft says so', () => {
    const m = matchExercise('kneeWindow', [CAT[0], CAT[8]]);
    expect(m).toEqual({ exercise: CAT[8], by: 'name' });
    const d = drafted({ kneeWindow: FLAG.kneeWindow }, [CAT[0], CAT[8]]);
    expect(d.prescriptions[0]).toMatchObject({ matchedBy: 'name', exercise: { id: 'clam' } });
  });

  it('nothing that fits: no exercise, never an invented one — and what to look for, as tags', () => {
    const d = drafted({ heelLine: FLAG.heelLine }, [CAT[0], CAT[5]]);
    expect(d.prescriptions[0].exercise).toBeNull();
    expect(d.prescriptions[0].wanted).toEqual(['Tripod layer', 'Joints layer, naming the ankle']);
    expect(wantedFor('kneeWindow')).toEqual(['Joints layer, naming the hip', 'Strength layer, squat pattern']);
    expect(wantedFor('ribAngle')).toEqual([]);
  });

  it('never the same catalogue row twice in one draft (the single-leg stance on both legs wants the same thing)', () => {
    const d = drafted({ singleLegL: FLAG.singleLegL, singleLegR: FLAG.singleLegR });
    const ids = d.prescriptions.map((p) => p.exercise?.id).filter(Boolean);
    expect(ids).toEqual(['tripod', 'split']);
  });
});

describe('ranking and bounds', () => {
  it('one-sided flags first, then protocol order; at most three', () => {
    const d = drafted({ headFloat: FLAG.headFloat, hipLevel: FLAG.hipLevel, heelLine: FLAG.heelLine, shoulderLevel: FLAG.shoulderLevel });
    expect(d.prescriptions.map((p) => p.findingId)).toEqual(['heelLine', 'hipLevel', 'shoulderLevel']);
    // …and the camera group still shows every flag, with its FIX line, beyond the three
    expect(d.review!.camera.filter((r) => r.status === 'flag').map((r) => r.checkId)).toEqual(['heelLine', 'hipLevel', 'shoulderLevel', 'headFloat']);
    expect(prescribeFromOutcomes(outcomesFromGrades('modified', readStoredScreen(row({ headFloat: FLAG.headFloat, hipLevel: FLAG.hipLevel, heelLine: FLAG.heelLine, shoulderLevel: FLAG.shoulderLevel }))!.camera!), CAT, 5)).toHaveLength(4);
  });

  it('the pre-P3 entry point still drafts from bare findings, borderlines after fails, non-camera ids ignored', () => {
    const out = prescribeFromScreen({ meaning: [], suggestions: [], findings: [
      { checkId: 'ribAngle', grade: 'fail' },
      { checkId: 'heelLine', grade: 'borderline' },
      { checkId: 'hipLevel', grade: 'fail' },
      { checkId: 'kneeWindow', grade: 'fail', side: 'left' },
    ] }, CAT);
    expect(out.map((p) => p.findingId)).toEqual(['kneeWindow', 'hipLevel', 'heelLine']);
    expect(out[2].because).toBe('From the screen: Heel line came back borderline.');
    expect(prescribeFromScreen({ meaning: [], suggestions: [], findings: [{ checkId: 'hipLevel', grade: 'stable' }] }, CAT)).toEqual([]);
  });
});

describe('the coach reads THREE groups: camera, their answers, the hands-on checks', () => {
  it('answers are the client\'s own words — never a grade — and an unanswered question says so', () => {
    const stored = readStoredScreen(row({}, 'modified', [{ questionId: 'lowerRibsWiden', answer: 'notSure' }]))!;
    // shown once the client consents to share them (phase 5 passes answersShared)
    const r = reviewScreen(stored, undefined, { answersShared: true });
    expect(r.answersWithheld).toBe(false);
    expect(r.answers.map((a) => a.said)).toEqual(['They said: "Not sure".', 'Not answered.']);
    expect(r.answers[0].question).toMatch(/lower ribs move out to the sides\?$/);
    for (const a of r.answers) expect(a.said).not.toMatch(/pass|flag|fail|stable|score|clear/i);
    expect(ANSWERS_NOTE).toMatch(/never graded/);
  });

  // MIRROR-COACH P3 review (2026-09-26), owner decision #4: "coach sees it only with client consent" — until the consent
  // step (phase 5) exists, the coach sees the questions, never the answers; withheld is the DEFAULT, so a caller that
  // forgets the option cannot leak them
  it('the answers are withheld from the coach by default — no answer, no "They said"', () => {
    const stored = readStoredScreen(row({}, 'modified', [{ questionId: 'lowerRibsWiden', answer: 'yes' }, { questionId: 'neckShouldersLift', answer: 'no' }]))!;
    for (const r of [reviewScreen(stored), coachDraft([{ metrics: row({}, 'modified', [{ questionId: 'lowerRibsWiden', answer: 'yes' }]), createdAt: 'x' }], CAT).review!]) {
      expect(r.answersWithheld).toBe(true);
      expect(r.answers.map((a) => a.answer)).toEqual([null, null]);
      expect(r.answers.map((a) => a.said)).toEqual([ANSWERS_WITHHELD, ANSWERS_WITHHELD]);
      expect(r.answers.map((a) => a.question)).toHaveLength(2);        // the questions are still named
    }
    expect(screenText(ANSWERS_WITHHELD)).toEqual([]);
  });

  it('the answers never change the camera group or the draft', () => {
    const a = coachDraft([{ metrics: row({ hipLevel: FLAG.hipLevel }, 'modified', [{ questionId: 'neckShouldersLift', answer: 'yes' }]), createdAt: 'x' }], CAT);
    const b = coachDraft([{ metrics: row({ hipLevel: FLAG.hipLevel }), createdAt: 'x' }], CAT);
    expect(a.review!.camera).toEqual(b.review!.camera);
    expect(a.prescriptions).toEqual(b.prescriptions);
    expect(a.headline).toBe(b.headline);
  });

  it('the full screen lists its two hands-on checks as the coach\'s; the modified screen says it has none', () => {
    const full = reviewScreen(readStoredScreen(row({}, 'full'))!);
    expect(full.coachChecks.map((c) => c.checkId)).toEqual(['pelvicTilt', 'thoracicRotation']);
    expect(full.coachChecks.every((c) => c.line === COACH_OWN_CHECK_LINE)).toBe(true);
    expect(full.coachChecksNote).toBeNull();
    const mod = reviewScreen(readStoredScreen(row({}, 'modified'))!);
    expect(mod.coachChecks).toEqual([]);
    expect(mod.coachChecksNote).toBe(MODIFIED_NO_COACH_CHECKS);
  });

  it('the camera group holds camera checks only — never the breath or the coach\'s checks — and carries the not-a-diagnosis line', () => {
    const r = reviewScreen(readStoredScreen(row({}, 'full'))!);
    expect(r.camera.map((c) => c.checkId)).toEqual(['heelLine', 'kneeWindow', 'hipLevel', 'shoulderLevel', 'headFloat', 'singleLeg', 'singleLeg']);
    expect(r.note).toBe(CAMERA_NOT_DIAGNOSIS);
    expect(Object.values(REVIEW_GROUPS)).toHaveLength(3);
  });
});

describe('the route\'s read: the LAST GRADED screen', () => {
  const at = (h: number) => `2026-09-26T${String(h).padStart(2, '0')}:00:00.000Z`;
  const allUnread = (): Over => Object.fromEntries(KEYS.map((k) => [k, UNREAD]));

  it('a newer run the camera read nothing of does not hide the graded screen before it — and is named', () => {
    const newer = row(allUnread());
    expect(readStoredScreen(newer)).toBeNull();                       // stored, but graded nothing
    const d = coachDraft([{ metrics: newer, createdAt: at(12) }, { metrics: row({ hipLevel: FLAG.hipLevel }), createdAt: at(9) }], CAT);
    expect(d.prescriptions.map((p) => p.findingId)).toEqual(['hipLevel']);
    expect(d.screenAt).toBe(at(9));
    expect(d.newerRunAt).toBe(at(12));
  });

  it('only ungraded runs: "ungraded_screen"; a row nothing can read: "unreadable_screen"; none: "no_screen"', () => {
    // P3 review (2026-09-26): a run the camera TRIED says why ('unread_screen'); a row with no grades is 'ungraded_screen'
    expect(coachDraft([{ metrics: row(allUnread()), createdAt: at(1) }], CAT)).toMatchObject({ prescriptions: [], reason: 'unread_screen', unread: { why: expect.any(String), hint: expect.any(String) } });
    expect(coachDraft([{ metrics: storedScreen('empty', 'modified', [], scoreScreen('modified', [])), createdAt: at(1) }], CAT)).toMatchObject({ prescriptions: [], reason: 'ungraded_screen' });
    expect(coachDraft([{ metrics: { junk: true }, createdAt: at(1) }], CAT)).toMatchObject({ prescriptions: [], reason: 'unreadable_screen' });
    expect(coachDraft([], CAT)).toEqual({ screenAt: null, prescriptions: [], reason: 'no_screen' });
  });

  // MIRROR-COACH P3 follow-up review (2026-09-28): End posts what was read so far, so a run quit after one station is
  // stored (provisional, unpaid) — and, as the newest readable row, it REPLACED yesterday's full screen here: "Score 100 ·
  // from 1 of 6 checks read", the knee flag gone from the draft. Fails on the follow-up's diff.
  it('a newer run that read too little to be a screen (End after one station) does not replace the last screen — and is named', () => {
    const onlyHeels: Over = { kneeWindow: 'absent', hipLevel: 'absent', shoulderLevel: 'absent', headFloat: 'absent', singleLegL: 'absent', singleLegR: 'absent' };
    const quit = row(onlyHeels);
    expect(readStoredScreen(quit)).not.toBeNull();                   // it is a readable row…
    expect(quit.provisional).toBe(true);                               // …that is not a screen
    const full = row({ kneeWindow: FLAG.kneeWindow });
    const d = coachDraft([{ metrics: quit, createdAt: at(12) }, { metrics: full, createdAt: at(9) }], CAT);
    expect(d.screenAt).toBe(at(9));                                    // on the follow-up: at(12), "Score 100 · from 1 of 6"
    expect(d.prescriptions.map((p) => p.findingId)).toEqual(['kneeWindow']);
    expect(d).toMatchObject({ provisional: false, readCount: 6, totalCount: 6, newerPartial: { at: at(12), readCount: 1, totalCount: 6 } });
    expect(d.newerRunAt).toBeUndefined();                              // it was graded: not "not graded"
  });

  it('only runs that are not screens: the newest one is drafted from, provisional, as before — nothing newer to name', () => {
    const onlyHeels: Over = { kneeWindow: 'absent', hipLevel: 'absent', shoulderLevel: 'absent', headFloat: 'absent', singleLegL: 'absent', singleLegR: 'absent' };
    const older = row({ ...onlyHeels, heelLine: FLAG.heelLine });
    const d = coachDraft([{ metrics: row(onlyHeels), createdAt: at(12) }, { metrics: older, createdAt: at(9) }], CAT);
    expect(d).toMatchObject({ screenAt: at(12), provisional: true });
    expect(d.newerPartial).toBeUndefined();
  });

  it('a newer ungraded run AND a newer run too thin to be a screen are both named above the screen drafted from', () => {
    const onlyHeels: Over = { kneeWindow: 'absent', hipLevel: 'absent', shoulderLevel: 'absent', headFloat: 'absent', singleLegL: 'absent', singleLegR: 'absent' };
    const d = coachDraft([
      { metrics: row(allUnread()), createdAt: at(13) }, { metrics: row(onlyHeels), createdAt: at(12) }, { metrics: row({ hipLevel: FLAG.hipLevel }), createdAt: at(9) },
    ], CAT);
    expect(d).toMatchObject({ screenAt: at(9), newerRunAt: at(13), newerPartial: { at: at(12), readCount: 1 } });
  });

  it('says whether the grades were the server\'s, and whether the screen was provisional', () => {
    const graded = coachDraft([{ metrics: row({ hipLevel: FLAG.hipLevel }), createdAt: at(1) }], CAT);
    expect(graded).toMatchObject({ serverGraded: true, provisional: false });
    const thin = coachDraft([{ metrics: row({ hipLevel: FLAG.hipLevel, heelLine: 'absent', kneeWindow: 'absent', shoulderLevel: 'absent', headFloat: 'absent', singleLegL: 'absent', singleLegR: 'absent' }), createdAt: at(1) }], CAT);
    expect(thin).toMatchObject({ provisional: true, retests: 6 });
    const results: CheckResult[] = [{ checkId: 'kneeWindow', grade: 'fail', side: 'left', source: 'camera' }];
    const legacy = coachDraft([{ metrics: storedScreen('old', 'modified', results, scoreScreen('modified', results)), createdAt: at(1) }], CAT);
    expect(legacy).toMatchObject({ serverGraded: false });
    expect(legacy.prescriptions[0].findingId).toBe('kneeWindow');
  });
});

describe('ONE TAP: the draft into the program\'s Prep section, through the builder\'s own add path', () => {
  function program() {
    const s = newBuilderStore();
    s.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }];
    s.pe = CAT.map((e) => ({ ...e, coachId: 'coach-1', category: 'general' }));
    const p = createProgram(s, { coachId: 'coach-1', clientId: 'client-1', name: 'Base', blocks: { create: [{ order: 1, label: 'Week 1', sessions: { create: [{ order: 1, label: 'Day 1', exercises: { create: [{ exerciseId: 'goblet', order: 1, section: 'key', isKeySet: true }] } }] } }] } });
    return { s, db: builderMemoryDb(s) as unknown as BuilderDb, programId: p.id, sessionId: s.session[0].id };
  }

  it('every matched corrective lands in Prep, tagged-matched, no load, its own tempo, the finding as the note', async () => {
    const { db, programId, sessionId } = program();
    const d = drafted({ hipLevel: FLAG.hipLevel, singleLegL: FLAG.singleLegL, shoulderLevel: FLAG.shoulderLevel });
    const bodies = blockAddBodies(d.prescriptions, sessionId);
    expect(bodies).toHaveLength(3);
    let tree;
    for (const b of bodies) {
      const r = await builderAction(db, 'coach-1', programId, b);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (r.ok) tree = r.tree;
    }
    const ex = tree!.blocks[0].sessions[0].exercises;
    const prep = ex.filter((e) => e.section === 'prep');
    expect(prep.map((e) => e.exerciseId)).toEqual(d.prescriptions.map((p) => p.exercise!.id));
    expect(ex.map((e) => e.section)).toEqual(['prep', 'prep', 'prep', 'key']);            // running order: prep first
    for (const e of prep) {
      expect(e.load).toBe('');
      expect(e.restSeconds).toBe(30);
      expect(e.coachNote?.startsWith(SCREEN_NOTE_PREFIX)).toBe(true);
      expect(e.isKeySet).toBe(false);
    }
    const leg = prep.find((e) => e.exerciseId === d.prescriptions.find((p) => p.findingId === 'singleLeg')!.exercise!.id)!;
    expect(leg).toMatchObject({ reps: '30 s each side', workSeconds: 30, tempo: '0-0-0-0' });
    // the note it carries is a screen finding, not a note about a shoulder (lib/coach/coverage.ts pull:push)
    expect(mentionsShoulder(prep.map((e) => e.coachNote))).toBe(false);
  });

  it('a prescription with no catalogue match adds nothing (never an invented exercise)', () => {
    const d = drafted({ heelLine: FLAG.heelLine }, [CAT[0]]);
    expect(addBodyFor(d.prescriptions[0], 's1')).toBeNull();
    expect(blockAddBodies(d.prescriptions, 's1')).toEqual([]);
  });

  it('another coach\'s program refuses the add (the builder\'s own check)', async () => {
    const { db, programId, sessionId } = program();
    const [b] = blockAddBodies(drafted({ hipLevel: FLAG.hipLevel }).prescriptions, sessionId);
    expect(await builderAction(db, 'coach-2', programId, b)).toMatchObject({ ok: false, status: 403 });
  });
});

// MIRROR-COACH P2 review (2026-09-26): the single-leg prescription, saved the way the coach accepts it and read the way
// Today and /training read it. The dose line dropped "each side" ("3 × 30 s") — half the prescribed work per set.
describe('the single-leg prescription reaches Today with its "each side"', () => {
  it('prescribe → the builder\'s validator → the dose line', () => {
    const [p] = drafted({ singleLegL: FLAG.singleLegL }).prescriptions;
    const body = addBodyFor(p, 's1')!;
    const v = validateExerciseSpec(body);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.spec).toMatchObject({ reps: '30 s each side', workSeconds: 30, load: '', section: 'prep' });
    expect(doseLine(v.spec)).toBe('3 × 30 s each side');
    const v40 = validateExerciseSpec({ ...v.spec, workSeconds: 40 });
    expect(v40.ok && doseLine(v40.spec)).toBe('3 × 40 s each side');
  });
});

describe('what the coach reads is what the camera saw — never health', () => {
  it('no draft line, camera row, answer or group line names a condition, a treatment or a verdict', () => {
    const lines: string[] = [];
    for (const k of KEYS) {
      for (const over of [FLAG[k], UNREAD]) {
        const d = drafted({ [k]: over });
        for (const p of d.prescriptions) lines.push(p.because, p.title, p.value ?? '', p.fix ?? '', ...p.wanted, becauseLine({ ...p, checkId: p.findingId as 'hipLevel', label: p.title }));
        for (const r of d.review!.camera) lines.push(r.title, r.statusLabel, r.value ?? '', r.fix ?? '', r.retest ?? '');
      }
    }
    const full = reviewScreen(readStoredScreen(row({}, 'full', [{ questionId: 'lowerRibsWiden', answer: 'yes' }]))!);
    lines.push(...full.answers.map((a) => a.said), ...full.coachChecks.map((c) => c.line), ...Object.values(REVIEW_GROUPS), ANSWERS_NOTE, MODIFIED_NO_COACH_CHECKS);
    for (const l of lines.filter(Boolean)) {
      expect(screenText(l), l).toEqual([]);
      expect(l, l).not.toMatch(/\bfail|dysfunction|injur|\brisk|prevent|diagnos/i);
    }
  });
});

// MIRROR-COACH P3 review (2026-09-26): owner decision #6 (no pin-and-stretch under 18) and PLAN item 9 (the written
// correctives off for minors) — the Mirror's own mapping holds no pin, but the coach's catalogue match could bring one
// back: a "Calf pin and stretch" tagged 'joints' matched a heel-line flag and went into a youth client's Prep in one tap.
describe('youth rules in the coach\'s draft', () => {
  const PIN_CAT: CatalogueExercise[] = [
    { id: 'pin', name: 'Calf pin and stretch', skillLayer: 'joints' },
    { id: 'raise', name: 'Slow calf raise', skillLayer: 'joints' },
    { id: 'pinned', name: 'Pinned foot release', pattern: null, skillLayer: null },
    { id: 'split', name: 'Split squat', pattern: 'lunge', skillLayer: 'strength' },
  ];
  const heelFlag = () => [{ metrics: row({ heelLine: { value: 14, bySide: { left: 14, right: 2 } } }), createdAt: 'x' }];

  it('an adult: the catalogue as it is (the pin row can match), and the written block where one maps', () => {
    const d = coachDraft(heelFlag(), PIN_CAT, { youth: null });
    expect(d.prescriptions.find((p) => p.findingId === 'heelLine')!.exercise!.id).toBe('pin');
    expect(d.youth).toBeUndefined();
    const hip = coachDraft([{ metrics: row({ hipLevel: FLAG.hipLevel }), createdAt: 'x' }], PIN_CAT, { youth: null });
    expect(hip.prescriptions[0].block).not.toBeNull();
  });

  for (const youth of ['minor', 'unknownAge'] as const) {
    it(`${youth}: no pin row is offered, no written block is shown, and the draft says why`, () => {
      const d = coachDraft(heelFlag(), PIN_CAT, { youth });
      const heel = d.prescriptions.find((p) => p.findingId === 'heelLine')!;
      expect(heel.exercise!.id).toBe('raise');
      expect(d.pinRowsSkipped).toBe(2);
      expect(d.youthNote).toBeTruthy();
      expect(screenText(d.youthNote!)).toEqual([]);
      const hip = coachDraft([{ metrics: row({ hipLevel: FLAG.hipLevel }), createdAt: 'x' }], PIN_CAT, { youth });
      expect(hip.prescriptions.every((p) => p.block === null)).toBe(true);
      expect(hip.review!.camera.every((r) => r.block === null)).toBe(true);
      // what "add the block" would send holds no pin row
      expect(blockAddBodies(d.prescriptions, 's1').map((b) => b.exerciseId)).not.toContain('pin');
    });
  }
});

// MIRROR-COACH P9 (2026-09-30), PLAN item 9 rule (e): "a flagged check can prescribe the matching corrective" — the
// Mirror's written band drill and release (lib/mirror/correctives.ts SCREEN_CORRECTIVE), for an adult client only.
describe('P9: a flagged check carries its matching written corrective', () => {
  const draftFor = (k: Key, youth: 'minor' | 'unknownAge' | null) =>
    coachDraft([{ metrics: row({ [k]: FLAG[k] }), createdAt: '2026-09-30T10:00:00Z' }], CAT, { youth });

  it('an adult client: the hip checks → the side-pull drill; the shoulder → the band-up hold and its release; the knee → the back-of-the-hip release', () => {
    expect(draftFor('hipLevel', null).prescriptions[0].corrective!.drill!.signal).toBe('trunkShift');
    expect(draftFor('singleLegL', null).prescriptions[0].corrective!.drill!.signal).toBe('trunkShift');
    const sh = draftFor('shoulderLevel', null).prescriptions[0].corrective!;
    expect(sh.drill!.signal).toBe('shoulderRise');
    expect(sh.release!.zone).toBe('upper_traps');
    const knee = draftFor('kneeWindow', null).prescriptions[0].corrective!;
    expect(knee.drill).toBeNull();
    expect(knee.release!.zone).toBe('posterior_chain');
  });

  it('no written corrective for a check none fits (the head float, the heel line)', () => {
    expect(draftFor('headFloat', null).prescriptions[0].corrective).toBeNull();
    expect(draftFor('heelLine', null).prescriptions[0].corrective).toBeNull();
  });

  for (const youth of ['minor', 'unknownAge'] as const) {
    it(`${youth}: no written corrective on any prescription, and the draft says the drills and releases are off with the blocks`, () => {
      for (const k of KEYS) expect(draftFor(k, youth).prescriptions.every((p) => p.corrective === null), k).toBe(true);
      expect(draftFor('shoulderLevel', youth).youthNote).toMatch(/the band drills and releases with them/);
    });
  }

  it('a caller that does not say whose draft it is gets none (youth rules, the conservative side)', () => {
    const outcomes = outcomesFromGrades('modified', [regradeFromSummary({ ...PASS.shoulderLevel, ...FLAG.shoulderLevel })!]);
    expect(prescribeFromOutcomes(outcomes, CAT)[0].corrective).toBeNull();
    expect(prescribeFromOutcomes(outcomes, CAT, 3, { youth: null })[0].corrective).not.toBeNull();
  });

  // MIRROR-COACH P9 fix (2026-09-30, code review): this test said the written corrective is text for the COACH only —
  // and that was the defect: rule (e) wants it reachable from the prescription, and nothing the athlete received pointed
  // at it. "Add" still sends only the catalogue row (the drill is never an exercise); the row's coach note — what Today
  // shows the athlete — now ends with the corrective's page anchor, which Today renders as a link (coach-note.tsx).
  it('"add" still sends only the catalogue row — and its coach note now points the athlete at the written corrective', () => {
    const p = draftFor('shoulderLevel', null).prescriptions[0];
    expect(p.corrective).not.toBeNull();
    const body = addBodyFor(p, 's1')!;
    expect(body).toMatchObject({ exerciseId: p.exercise!.id });
    expect(JSON.stringify(body)).not.toMatch(/Band-up|neck meets the shoulder/);   // the drill's words are not a row or a note
    expect(body.coachNote).toBe(`${p.because} ${WRITTEN_CORRECTIVE_NOTE} /play/mirror/correctives#band-drills`);
    expect(String(body.coachNote).startsWith(SCREEN_NOTE_PREFIX)).toBe(true);
    // the knee has a release only: its anchor is the release section
    expect(coachNoteFor(draftFor('kneeWindow', null).prescriptions[0])).toMatch(/Written corrective: \/play\/mirror\/correctives#release$/);
  });

  it('youth rules, or a check with none: the note is the finding alone', () => {
    for (const youth of ['minor', 'unknownAge'] as const) {
      const p = draftFor('shoulderLevel', youth).prescriptions[0];
      expect(coachNoteFor(p)).toBe(p.because);
    }
    const head = draftFor('headFloat', null).prescriptions[0];
    expect(coachNoteFor(head)).toBe(head.because);
  });

  it('the note never passes the 300-character coach note (the finding is trimmed, the link kept whole)', () => {
    const p = { ...draftFor('shoulderLevel', null).prescriptions[0] };
    p.because = `${SCREEN_NOTE_PREFIX} ${'x'.repeat(400)}`;
    const note = coachNoteFor(p);
    expect(note.length).toBeLessThanOrEqual(300);
    expect(note.endsWith(`${WRITTEN_CORRECTIVE_NOTE} /play/mirror/correctives#band-drills`)).toBe(true);
    const v = validateExerciseSpec({ exerciseId: 'e', coachNote: note } as never);
    expect(v.ok && v.spec.coachNote).toBe(note);                    // the builder keeps it whole (its cap is 300)
  });

  it('coachDraft with no age said gives no written corrective (fails closed, like prescribeFromOutcomes) — blocks unchanged', () => {
    const unstated = coachDraft([{ metrics: row({ shoulderLevel: FLAG.shoulderLevel }), createdAt: 'x' }], CAT);
    expect(unstated.prescriptions.every((p) => p.corrective === null)).toBe(true);
    expect(unstated.prescriptions.every((p) => coachNoteFor(p) === p.because)).toBe(true);
    // P3's adult default for the blocks is not changed by this (their youth reading is a separate, owner-set rule)
    const adult = coachDraft([{ metrics: row({ shoulderLevel: FLAG.shoulderLevel }), createdAt: 'x' }], CAT, { youth: null });
    expect(unstated.prescriptions.map((p) => p.block)).toEqual(adult.prescriptions.map((p) => p.block));
    expect(adult.prescriptions[0].corrective).not.toBeNull();
  });
});
