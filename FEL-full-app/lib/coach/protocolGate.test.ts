// MIRROR-COACH P8 (2026-09-29): the protocol gate, exhaustively (lib/coach/protocolGate.ts). The route-level proofs —
// Today served through the gate, the coach's view — are protocolGate-today-route.test.ts and
// protocolGate-coach-route.test.ts.
//
// Held here, each check ALONE and then every combination: age known / minor / blank (and a coach's assignment lifting
// ONLY the youth rule), intake missing / stale / red flag / unanswered / held answer / earlier flag, today's pain decision
// none / continue / modify / step-down / stop (both stops), the landing check passed recently / old / never / unreadable
// / fault — regraded from the stored numbers, never the device's own verdict — the ladder walk, and every word.
import { describe, expect, it } from 'vitest';
import { INTAKE_IDS, INTAKE_VERSION, RED_FLAG_QUESTION_IDS } from '../health/intake';
import type { PainDecision } from '../health/painRule';
import { bandOf, th } from '../assess/thresholds';
import type { Band } from '../assess/thresholds';
import {
  COACH_OPEN_LINE, COACH_OPEN_YOUTH_LINE, COACH_WHY, COACH_WHY_PRIVATE, LADDER_MAX_STEPS, LANDING_CHECK_DAYS, LANDING_CHECK_HREF, LANDING_CHECK_WEEKS,
  LANDING_METRICS, PRIVATE_REASONS, PROTOCOL_HREF, PROTOCOL_WHY, PROTOCOL_YES_HOLDS, WHY_PRIORITY, YOUTH_REASONS,
  athleteWhy, coachGateView, coachWhy, easierUngatedStep, gateAction, gatedKind, heldLine, isProtocolGated, itemReasons, landingCheck, landingReadOf,
  leadReason, painAllowsProtocol, protocolGate, protocolIntakeReasons, protocolReasons, swappedLine,
  GATE_UNREAD_LINE, GATE_UNREAD_REASON, easierReps, jumpNoteOnStep, swapPrescription, unreadGateAction,
  type GateRow, type LandingCheck, type ProtocolFacts, type ProtocolIntake, type ProtocolReason,
} from './protocolGate';

const NOW = new Date('2026-09-29T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

// ── builders ──

const cleanAnswers = (): Record<string, boolean | number> => ({
  [INTAKE_IDS.currentPain]: false, [INTAKE_IDS.recentInjuryOrSurgery]: false, [INTAKE_IDS.dizzinessFaintingChestPain]: false,
  [INTAKE_IDS.heartOrBpCondition]: false, [INTAKE_IDS.pregnancyOrPostpartum]: false, [INTAKE_IDS.heartRateOrBalanceMedicine]: false,
  [INTAKE_IDS.clinicianToldToAvoid]: false, [INTAKE_IDS.birthYear]: 1990,
});
const intake = (over: Partial<ProtocolIntake> = {}): ProtocolIntake => ({ version: INTAKE_VERSION, createdAt: ago(10), answers: cleanAnswers(), redFlags: [], clearedAt: null, ...over });
const PASSED: LandingCheck = { status: 'passed', at: ago(3).toISOString(), faults: [] };
const facts = (over: Partial<ProtocolFacts> = {}): ProtocolFacts => ({
  dobYear: 1990, healthDataConsent: true, intake: intake(), intakeHistory: [], painDecision: null, landing: PASSED, ...over,
});
const FEL = { coachAssigned: false };
const COACH = { coachAssigned: true };

/** A value the band calls clean, and one it calls a fault. */
const good = (b: Band) => b.good;
const faulty = (b: Band) => {
  switch (b.faultOp) {
    case '<': case '<=': return (b.fault as number) - 0.05;
    case '>': case '>=': return (b.fault as number) + 1;
    default: throw new Error('band with no fault line');
  }
};
const FLEX = bandOf('t5.landingFlex'), VALGUS = bandOf('t5.landingValgus');
const cleanMetrics = () => ({ landingFlex: good(FLEX), landingValgusLeft: good(VALGUS), landingValgusRight: good(VALGUS), landingSym: 10 });

/** A stored Quick Screen record (lib/assess/prqWrite.ts AssessmentRecord, the fields the landing read looks at). */
function quickScreen(t5: Partial<{ status: string; confidence: number; repsValid: number; metrics: Record<string, unknown>; faults: unknown }> | null = {}, extra: object[] = []) {
  const tests: object[] = [{ id: 'T1', status: 'scored', confidence: 0.9, sides: { both: { metrics: { valgusLeft: 0.1 }, faults: [], repsValid: 3 } } }, ...extra];
  if (t5 !== null) {
    const { status = 'scored', confidence = 0.9, repsValid = 3, metrics = cleanMetrics(), faults = [] } = t5;
    tests.push({ id: 'T5', status, confidence, score100: 90, score03: 3, sides: status === 'scored' ? { both: { score100: 90, score03: 3, repsValid, repsTotal: 3, complete: true, metrics, faults } } : {} });
  }
  return { assessmentId: 'a1', version: 1, mode: 'quick', tests };
}
const scan = (daysAgo: number, metrics: unknown) => ({ createdAt: ago(daysAgo), metrics });

// ── what the gate holds ──

describe('gatedKind: what the gate holds', () => {
  it('a depth drop by its name, whatever it is tagged', () => {
    expect(gatedKind({ name: 'Depth Drop to Vertical', category: 'lower-body' })).toBe('depth_drop');
    expect(gatedKind({ name: 'depth-drop jump' })).toBe('depth_drop');
  });
  it("a plyometric by P6's one jump signal: category 'plyometric' or skill layer 'jump-land'", () => {
    expect(gatedKind({ name: 'Pogo hops', category: 'plyometric' })).toBe('plyometric');
    expect(gatedKind({ name: 'Snap-down to stick', category: 'lower-body', skillLayer: 'jump-land' })).toBe('plyometric');
  });
  it('everything else is not gated', () => {
    expect(gatedKind({ name: 'Goblet Squat', category: 'lower-body', skillLayer: 'strength' })).toBeNull();
    expect(gatedKind({ name: 'Drop set curls', category: 'upper-pull' })).toBeNull();
    expect(gatedKind(null)).toBeNull();
    expect(isProtocolGated(undefined)).toBe(false);
  });
});

// ── each check alone ──

describe('the age check (lib/mirror/youth.ts isMinorForMirror, the one age truth)', () => {
  const y = NOW.getFullYear();
  it('an adult by birth year passes it', () => expect(protocolGate(facts({ dobYear: 1990 }), NOW, FEL)).toEqual({ open: true, reasons: [], youthOverride: false }));
  it("a minor is 'minor'", () => expect(protocolGate(facts({ dobYear: y - 15 }), NOW, FEL).reasons).toEqual(['minor']));
  it("a year-only birth date 18 years back is still a minor (the birthday may be ahead); 19 back is an adult", () => {
    expect(protocolReasons(facts({ dobYear: y - 18 }), NOW)).toEqual(['minor']);
    expect(protocolReasons(facts({ dobYear: y - 19 }), NOW)).toEqual([]);
  });
  it.each([null, undefined, Number.NaN, 1800])("a blank or implausible birth year (%s) is 'age_unknown': youth rules (decision #20)", (dob) => {
    expect(protocolGate(facts({ dobYear: dob as number | null }), NOW, FEL).reasons).toEqual(['age_unknown']);
  });
  it("a coach's assignment lifts the youth rule for that item, and says it did", () => {
    expect(protocolGate(facts({ dobYear: y - 14 }), NOW, COACH)).toEqual({ open: true, reasons: [], youthOverride: true });
    expect(protocolGate(facts({ dobYear: null }), NOW, COACH)).toEqual({ open: true, reasons: [], youthOverride: true });
    expect(protocolGate(facts(), NOW, COACH).youthOverride).toBe(false); // an adult needed no override
  });
  it('…and ONLY the youth rule: every other check still holds a coach-assigned item', () => {
    const f = facts({ dobYear: y - 14, intake: intake({ redFlags: [INTAKE_IDS.clinicianToldToAvoid], clearedAt: ago(1) }), painDecision: 'step_down_flag_coach', landing: { status: 'never', at: null, faults: [] } });
    expect(protocolGate(f, NOW, COACH)).toEqual({ open: false, reasons: ['red_flag', 'pain_today', 'landing_never'], youthOverride: true });
    expect(itemReasons(protocolReasons(f, NOW), COACH).some((r) => YOUTH_REASONS.includes(r))).toBe(false);
  });
});

describe('the intake: "a completed intake (no red flag)"', () => {
  it('no live health-data consent: closed, and nothing health is judged (not even a red flag in the facts)', () => {
    const f = facts({ healthDataConsent: false, intake: intake({ redFlags: [INTAKE_IDS.heartOrBpCondition] }), painDecision: 'stop_see_clinician' });
    expect(protocolReasons(f, NOW)).toEqual(['no_health_consent']);
  });
  it('missing', () => expect(protocolReasons(facts({ intake: null }), NOW)).toEqual(['intake_missing']));
  it('stale: over a year old, or another question set', () => {
    expect(protocolReasons(facts({ intake: intake({ createdAt: ago(366) }) }), NOW)).toEqual(['intake_stale']);
    expect(protocolReasons(facts({ intake: intake({ version: '2025-01-01' }) }), NOW)).toEqual(['intake_stale']);
    expect(protocolReasons(facts({ intake: intake({ createdAt: ago(364) }) }), NOW)).toEqual([]);
  });
  it('a red flag closes it — cleared or not (a clearance was never a yes to landing from a box)', () => {
    expect(protocolReasons(facts({ intake: intake({ redFlags: [INTAKE_IDS.dizzinessFaintingChestPain] }) }), NOW)).toEqual(['red_flag']);
    expect(protocolReasons(facts({ intake: intake({ redFlags: [INTAKE_IDS.dizzinessFaintingChestPain], clearedAt: ago(2) }) }), NOW)).toEqual(['red_flag']);
  });
  it.each(RED_FLAG_QUESTION_IDS)('a skipped red-flag question (%s) is not a completed intake', (id) => {
    const answers = cleanAnswers(); delete answers[id];
    expect(protocolReasons(facts({ intake: intake({ answers }) }), NOW)).toEqual(['intake_unanswered']);
  });
  it.each(PROTOCOL_YES_HOLDS)('a "yes" on %s holds jumps and drops; a skip of it does not', (id) => {
    expect(protocolReasons(facts({ intake: intake({ answers: { ...cleanAnswers(), [id]: true } }) }), NOW)).toEqual(['intake_answer']);
    const skipped = cleanAnswers(); delete skipped[id];
    expect(protocolReasons(facts({ intake: intake({ answers: skipped }) }), NOW)).toEqual([]);
  });
  it("a yes to current pain is left to the per-exercise pain loop (the intake's own design)", () => {
    expect(protocolReasons(facts({ intake: intake({ answers: { ...cleanAnswers(), [INTAKE_IDS.currentPain]: true } }) }), NOW)).toEqual([]);
  });
  it('answers that are not an object read as all skipped', () => {
    expect(protocolIntakeReasons(intake({ answers: 'garbage' }), [], NOW)).toEqual(['intake_unanswered']);
  });
  it('a re-take does not erase an earlier red flag inside the year; one over a year old has rolled off', () => {
    const newest = intake({ createdAt: ago(5) });
    expect(protocolIntakeReasons(newest, [{ createdAt: ago(5), redFlags: [] }, { createdAt: ago(40), redFlags: [INTAKE_IDS.heartOrBpCondition] }], NOW)).toEqual(['intake_history']);
    expect(protocolIntakeReasons(newest, [{ createdAt: ago(400).toISOString(), redFlags: [INTAKE_IDS.heartOrBpCondition] }], NOW)).toEqual([]);
    // the newest intake is judged as the newest, never as its own history
    expect(protocolIntakeReasons(intake({ createdAt: ago(5), redFlags: ['x'] }), [{ createdAt: ago(5), redFlags: ['x'] }], NOW)).toEqual(['red_flag']);
  });
});

describe("today's pain decision (stored, never re-decided)", () => {
  it.each<[PainDecision | null, boolean]>([
    [null, true], ['continue', true], ['easier_variation', false], ['step_down_flag_coach', false], ['stop_see_clinician', false], ['stop_tell_adult', false],
  ])('%s → allowed: %s', (d, ok) => {
    expect(painAllowsProtocol(d)).toBe(ok);
    expect(protocolGate(facts({ painDecision: d }), NOW, COACH)).toEqual({ open: ok, reasons: ok ? [] : ['pain_today'], youthOverride: false });
  });
});

// ── the landing check ──

describe('the landing check: read off the one threshold sheet', () => {
  it("reads T5's GRADED landing rows (knees on landing, stiff landing) and nothing hidden", () => {
    expect(LANDING_METRICS.map((m) => m.metric).sort()).toEqual(['landingFlex', 'landingValgusLeft', 'landingValgusRight']);
    expect(new Set(LANDING_METRICS.map((m) => m.thresholdId))).toEqual(new Set(['t5.landingFlex', 't5.landingValgus']));
  });
  it('names N: 4 weeks', () => { expect(LANDING_CHECK_WEEKS).toBe(4); expect(LANDING_CHECK_DAYS).toBe(28); });
});

describe('landingReadOf: one stored Quick Screen, regraded server-side', () => {
  it('clean numbers pass', () => expect(landingReadOf(quickScreen())).toEqual({ status: 'passed', faults: [] }));
  it('a stiff landing is a fault', () => expect(landingReadOf(quickScreen({ metrics: { ...cleanMetrics(), landingFlex: faulty(FLEX) } }))).toEqual({ status: 'fault', faults: ['landingFlex'] }));
  it('a knee caving in on landing is a fault, each side', () => {
    expect(landingReadOf(quickScreen({ metrics: { ...cleanMetrics(), landingValgusLeft: faulty(VALGUS) } }))).toEqual({ status: 'fault', faults: ['landingValgusLeft'] });
    expect(landingReadOf(quickScreen({ metrics: { ...cleanMetrics(), landingValgusRight: faulty(VALGUS) } }))?.faults).toEqual(['landingValgusRight']);
  });
  it("THE DEVICE'S VERDICT IS NOT TRUSTED: a record that lists no fault, with a number in fault, is a fault", () => {
    expect(landingReadOf(quickScreen({ metrics: { ...cleanMetrics(), landingValgusLeft: faulty(VALGUS) }, faults: [] }))?.status).toBe('fault');
  });
  it('…and a fault the device declared stays a fault (careful both ways)', () => {
    expect(landingReadOf(quickScreen({ faults: ['landingFlex'] }))).toEqual({ status: 'fault', faults: ['landingFlex'] });
  });
  it("a hidden row's fault (touchdown timing) does not decide it", () => {
    expect(landingReadOf(quickScreen({ metrics: { ...cleanMetrics(), landingSym: 999 }, faults: ['landingSym'] }))?.status).toBe('passed');
  });
  it.each([
    ['not scored', { status: 'notScored' }],
    ['a pain stop (never stored, but it would read as no landing read)', { status: 'painStop' }],
    ['scored under the confidence line', { confidence: th('gate.minConfidence') - 0.01 }],
    ['fewer valid jumps than the minimum', { repsValid: th('gate.minValidReps') - 1 }],
    ['a landing metric not read', { metrics: { landingFlex: good(FLEX), landingValgusLeft: good(VALGUS), landingValgusRight: null } }],
    ['a landing metric not a number', { metrics: { ...cleanMetrics(), landingFlex: 'soft' } }],
    ['a landing metric not finite', { metrics: { ...cleanMetrics(), landingFlex: Number.POSITIVE_INFINITY } }],
  ])('%s: unreadable, never a pass', (_w, t5) => expect(landingReadOf(quickScreen(t5 as never))).toEqual({ status: 'unreadable', faults: [] }));
  it('a scored T5 with no sides is unreadable', () => {
    expect(landingReadOf({ tests: [{ id: 'T5', status: 'scored', confidence: 0.9, sides: {} }] })?.status).toBe('unreadable');
  });
  it('no landing read in the record at all: null (no T5, skipped, not built, not a record)', () => {
    expect(landingReadOf(quickScreen(null))).toBeNull();
    expect(landingReadOf(quickScreen({ status: 'skipped' }))).toBeNull();
    expect(landingReadOf(quickScreen({ status: 'notBuilt' }))).toBeNull();
    for (const junk of [null, undefined, 'x', 42, [], {}, { tests: 'no' }]) expect(landingReadOf(junk)).toBeNull();
  });
});

describe('landingCheck: passed recently / old / never / unreadable / fault', () => {
  it('passed recently', () => expect(landingCheck([scan(3, quickScreen())], NOW)).toEqual({ status: 'passed', at: ago(3).toISOString(), faults: [] }));
  it(`on the ${LANDING_CHECK_DAYS}-day line it still counts; a millisecond past it is old`, () => {
    expect(landingCheck([scan(LANDING_CHECK_DAYS, quickScreen())], NOW).status).toBe('passed');
    expect(landingCheck([{ createdAt: new Date(ago(LANDING_CHECK_DAYS).getTime() - 1), metrics: quickScreen() }], NOW).status).toBe('old');
  });
  it('old: only reads older than N weeks (whatever they said)', () => {
    expect(landingCheck([scan(40, quickScreen()), scan(60, quickScreen({ status: 'notScored' }))], NOW)).toEqual({ status: 'old', at: ago(40).toISOString(), faults: [] });
  });
  it('never: nothing on file, or records with no landing read', () => {
    expect(landingCheck([], NOW)).toEqual({ status: 'never', at: null, faults: [] });
    expect(landingCheck(null, NOW).status).toBe('never');
    expect(landingCheck([scan(2, quickScreen(null)), scan(3, { junk: true })], NOW).status).toBe('never');
  });
  it('unreadable: only unreadable takes inside the window', () => {
    expect(landingCheck([scan(2, quickScreen({ status: 'notScored' })), scan(50, quickScreen())], NOW)).toEqual({ status: 'unreadable', at: ago(2).toISOString(), faults: [] });
  });
  it('the newest readable take decides: a newer fault outranks an older pass', () => {
    const c = landingCheck([scan(10, quickScreen()), scan(2, quickScreen({ metrics: { ...cleanMetrics(), landingFlex: faulty(FLEX) } }))], NOW);
    expect(c).toEqual({ status: 'fault', at: ago(2).toISOString(), faults: ['landingFlex'] });
  });
  it('…a newer pass outranks an older fault', () => {
    expect(landingCheck([scan(2, quickScreen()), scan(10, quickScreen({ faults: ['landingFlex'] }))], NOW).status).toBe('passed');
  });
  it('…and a newer UNREADABLE take measured nothing: it does not erase a readable one', () => {
    expect(landingCheck([scan(1, quickScreen({ status: 'notScored' })), scan(9, quickScreen())], NOW)).toEqual({ status: 'passed', at: ago(9).toISOString(), faults: [] });
  });
  it('a record stamped in the future (a skewed clock) does not count; a string date reads', () => {
    expect(landingCheck([{ createdAt: new Date(NOW.getTime() + 3_600_000), metrics: quickScreen() }], NOW).status).toBe('never');
    expect(landingCheck([{ createdAt: ago(1).toISOString(), metrics: quickScreen() }], NOW).status).toBe('passed');
    expect(landingCheck([{ createdAt: 'not a date', metrics: quickScreen() }], NOW).status).toBe('never');
  });
  it.each<[LandingCheck['status'], ProtocolReason | null]>([
    ['passed', null], ['old', 'landing_old'], ['never', 'landing_never'], ['unreadable', 'landing_unreadable'], ['fault', 'landing_fault'],
  ])('%s → %s, and a coach assignment never lifts it', (status, reason) => {
    const v = protocolGate(facts({ dobYear: 2014, landing: { status, at: null, faults: [] } }), NOW, COACH);
    expect(v.reasons).toEqual(reason ? [reason] : []);
  });
});

// ── every combination ──

describe('the whole gate, every combination (age × who assigned × intake × pain × landing: 540)', () => {
  const y = NOW.getFullYear();
  const AGES = { adult: 1990, minor: y - 15, blank: null } as const;
  const INTAKES = { ok: intake(), missing: null, red_flag: intake({ redFlags: [INTAKE_IDS.clinicianToldToAvoid] }) } as const;
  const PAINS: (PainDecision | null)[] = [null, 'continue', 'easier_variation', 'step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'];
  const LANDINGS: LandingCheck['status'][] = ['passed', 'old', 'never', 'unreadable', 'fault'];
  let n = 0;
  for (const [age, dob] of Object.entries(AGES)) for (const coachAssigned of [false, true]) for (const [ik, inTake] of Object.entries(INTAKES)) for (const pain of PAINS) for (const landing of LANDINGS) {
    n++;
    it(`${age} · ${coachAssigned ? 'coach' : 'FEL'} · intake ${ik} · pain ${pain ?? 'none'} · landing ${landing}`, () => {
      const v = protocolGate(facts({ dobYear: dob, intake: inTake, painDecision: pain, landing: { status: landing, at: null, faults: [] } }), NOW, { coachAssigned });
      const expected: ProtocolReason[] = [];
      if (age !== 'adult' && !coachAssigned) expected.push(age === 'minor' ? 'minor' : 'age_unknown');
      if (ik === 'missing') expected.push('intake_missing');
      if (ik === 'red_flag') expected.push('red_flag');
      if (pain !== null && pain !== 'continue') expected.push('pain_today');
      if (landing !== 'passed') expected.push(({ old: 'landing_old', never: 'landing_never', unreadable: 'landing_unreadable', fault: 'landing_fault' } as const)[landing]);
      expect(v.reasons).toEqual(expected);
      // open exactly for (an adult, or a coach's assignment) with a clean intake, a continue-or-no pain decision and a passed landing check
      expect(v.open).toBe((age === 'adult' || coachAssigned) && ik === 'ok' && (pain === null || pain === 'continue') && landing === 'passed');
      expect(v.youthOverride).toBe(coachAssigned && age !== 'adult');
    });
  }
  it('ran every combination', () => expect(n).toBe(3 * 2 * 3 * 6 * 5));
});

// ── the ladder ──

describe('the ladder: the first ungated step down, same coach, no loops', () => {
  const R = (id: string, o: Partial<GateRow> = {}): GateRow => ({ id, name: id, coachId: 'c1', category: 'lower-body', ...o });
  const map = (...rows: GateRow[]) => new Map(rows.map((r) => [r.id, r]));
  const drop = R('drop', { name: 'Depth Drop to Vertical', regressionOfId: 'boxjump' });
  it('walks past gated rungs to the first ungated one', () => {
    const byId = map(drop, R('boxjump', { category: 'plyometric', regressionOfId: 'snap' }), R('snap', { skillLayer: 'jump-land', regressionOfId: 'boxsquat' }), R('boxsquat'));
    expect(easierUngatedStep(drop, byId)?.id).toBe('boxsquat');
  });
  it('no easier link, or a link to a row not loaded (another coach, deleted): none', () => {
    expect(easierUngatedStep(R('x', { category: 'plyometric' }), map())).toBeNull();
    expect(easierUngatedStep(drop, map(drop))).toBeNull();
  });
  it("a rung owned by another coach ends the ladder (the same coach/template scope)", () => {
    expect(easierUngatedStep(drop, map(drop, R('boxjump', { coachId: 'c2' })))).toBeNull();
  });
  it('a loop ends it', () => {
    const a = R('a', { category: 'plyometric', regressionOfId: 'b' }), b = R('b', { category: 'plyometric', regressionOfId: 'a' });
    expect(easierUngatedStep(a, map(a, b))).toBeNull();
  });
  it(`more than ${LADDER_MAX_STEPS} gated rungs: none`, () => {
    const rows = Array.from({ length: LADDER_MAX_STEPS + 2 }, (_, i) => R(`r${i}`, { category: i <= LADDER_MAX_STEPS ? 'plyometric' : 'lower-body', regressionOfId: `r${i + 1}` }));
    expect(easierUngatedStep(rows[0], map(...rows))).toBeNull();
    expect(easierUngatedStep(rows[1], map(...rows))?.id).toBe(`r${LADDER_MAX_STEPS + 1}`);
  });
});

describe('gateAction: keep, swap or hold', () => {
  const plyo: GateRow = { id: 'pogo', name: 'Pogo hops', category: 'plyometric', regressionOfId: 'calf' };
  const calf: GateRow = { id: 'calf', name: 'Calf raise', category: 'lower-body' };
  const byId = new Map([[plyo.id, plyo], [calf.id, calf]]);
  it('an item that is not gated is kept whatever the reasons', () => {
    expect(gateAction(calf, ['minor', 'landing_never'], byId, FEL)).toEqual({ kind: 'keep', youthOverride: false });
  });
  it('an open gate keeps a gated item; a youth item a coach assigned says so', () => {
    expect(gateAction(plyo, [], byId, FEL)).toEqual({ kind: 'keep', youthOverride: false });
    expect(gateAction(plyo, ['minor'], byId, COACH)).toEqual({ kind: 'keep', youthOverride: true });
  });
  it("a closed gate swaps it for the ladder's easier step, or holds it back with none", () => {
    expect(gateAction(plyo, ['landing_never'], byId, FEL)).toEqual({ kind: 'swap', to: calf, reasons: ['landing_never'] });
    expect(gateAction({ ...plyo, regressionOfId: null }, ['minor'], byId, FEL)).toEqual({ kind: 'hold', reasons: ['minor'] });
  });
});

// ── the words ──

const BANNED = /\bclear(ed|s)?\b|\bsafe(ty|ly)?\b|prevent|injur|\brisk|diagnos|treat|condition|pregnan|heart|surgery|periodi[sz]|score/i;

describe('the words (FEL\'s own; the honesty rule)', () => {
  const REASONS = Object.keys(PROTOCOL_WHY) as ProtocolReason[];
  it('every reason has an athlete line, a place to point (or none) and a coach line, and a priority', () => {
    for (const r of REASONS) {
      expect(PROTOCOL_WHY[r].length).toBeGreaterThan(10);
      expect(r in PROTOCOL_HREF).toBe(true);
      expect(COACH_WHY[r].length).toBeGreaterThan(5);
      expect(WHY_PRIORITY).toContain(r);
    }
    expect(new Set(WHY_PRIORITY).size).toBe(REASONS.length);
  });
  it('no line claims a clearance, safety, prevention, a condition or a diagnosis, and none breaks a line', () => {
    const lines = [...Object.values(PROTOCOL_WHY), ...Object.values(COACH_WHY), COACH_WHY_PRIVATE, COACH_OPEN_LINE, COACH_OPEN_YOUTH_LINE,
      // MIRROR-COACH P8 FIX: the unread line and the coach's note said as the jump's
      GATE_UNREAD_LINE, jumpNoteOnStep('Box Jump and Stick', 'Stick every landing.')];
    for (const l of lines) { expect(l).not.toMatch(BANNED); expect(l).not.toMatch(/\n/); }
  });
  it('the camera read is called an estimate where its result is shown', () => {
    expect(PROTOCOL_WHY.landing_fault).toMatch(/camera estimate/);
    expect(COACH_WHY.landing_fault).toMatch(/camera estimate/);
  });
  it('the landing reasons point at the Quick Screen; the health-answer ones at the Mirror; health flags, pain and youth nowhere', () => {
    for (const r of ['landing_never', 'landing_old', 'landing_unreadable', 'landing_fault'] as const) expect(PROTOCOL_HREF[r]).toBe(LANDING_CHECK_HREF);
    for (const r of ['no_health_consent', 'intake_missing', 'intake_stale', 'intake_unanswered', 'age_unknown'] as const) expect(PROTOCOL_HREF[r]).toBe('/play/mirror');
    for (const r of ['red_flag', 'intake_history', 'intake_answer', 'pain_today', 'minor'] as const) expect(PROTOCOL_HREF[r]).toBeNull();
  });
  it('ONE line: the lead reason by priority, whatever else holds', () => {
    expect(leadReason(['landing_never', 'minor'])).toBe('minor');
    expect(leadReason(['pain_today', 'red_flag'])).toBe('red_flag');
    expect(leadReason([])).toBeNull();
    expect(athleteWhy(['landing_old', 'intake_missing'])).toEqual({ why: PROTOCOL_WHY.intake_missing, href: '/play/mirror' });
    expect(athleteWhy([])).toEqual({ why: '', href: null });
    expect(swappedLine('Depth Drop to Vertical', PROTOCOL_WHY.landing_never)).toBe(`Easier step in place of Depth Drop to Vertical. ${PROTOCOL_WHY.landing_never}`);
    expect(heldLine('Pogo hops', PROTOCOL_WHY.minor)).toBe(`Held back today: Pogo hops. ${PROTOCOL_WHY.minor}`);
  });
  it("the coach's words: every reason, most important first, each said once", () => {
    expect(coachWhy(['landing_never', 'intake_missing', 'no_health_consent'], { detailed: true })).toBe(`${COACH_WHY.intake_missing}; ${COACH_WHY.landing_never}`);
  });
  it("without the client's coach_view grant, a health reason is one generic line — never which answer or check-in", () => {
    for (const r of PRIVATE_REASONS) {
      expect(coachWhy([r], { detailed: false })).toBe(COACH_WHY_PRIVATE);
      expect(coachWhy([r], { detailed: true })).toBe(COACH_WHY[r]);
    }
    expect(coachWhy(['red_flag', 'pain_today', 'landing_old'], { detailed: false })).toBe(`${COACH_WHY_PRIVATE}; ${COACH_WHY.landing_old}`);
    // not a health reason: named either way
    expect(coachWhy(['minor', 'landing_fault'], { detailed: false })).toBe(`${COACH_WHY.minor}; ${COACH_WHY.landing_fault}`);
  });
  it("the coach's line for each action", () => {
    const to: GateRow = { id: 'calf', name: 'Calf raise' };
    expect(coachGateView({ kind: 'keep', youthOverride: false }, { detailed: false })).toEqual({ state: 'open', line: COACH_OPEN_LINE, to: null });
    expect(coachGateView({ kind: 'keep', youthOverride: true }, { detailed: false })).toEqual({ state: 'open_youth', line: COACH_OPEN_YOUTH_LINE, to: null });
    expect(coachGateView({ kind: 'swap', to, reasons: ['landing_never'] }, { detailed: false })).toEqual({
      state: 'swap', line: `For this client today, Today shows Calf raise instead: ${COACH_WHY.landing_never}.`, to: { id: 'calf', name: 'Calf raise' },
    });
    expect(coachGateView({ kind: 'hold', reasons: ['pain_today'] }, { detailed: false }).line).toContain(COACH_WHY_PRIVATE);
    expect(coachGateView({ kind: 'hold', reasons: ['pain_today'] }, { detailed: true }).line).toContain(COACH_WHY.pain_today);
  });
});


// ── MIRROR-COACH P8 FIX (2026-09-30, code review) ────────────────────────────────────────────────────────────────────

describe('the easier step is served with its own prescription (swapPrescription)', () => {
  const jump = { reps: '3 jumps', tempo: '0-0-0-0', coachNote: 'Stick every landing.', setupCues: ['quiet-landing', 'stick-two', 'tripod-down'], sets: 3, restSeconds: 60 };
  it('the jump noun leaves the reps, the landing cue leaves the set-up, the step keeps its own tempo, the note is said as the jump\'s', () => {
    expect(swapPrescription(jump, { defaultTempo: '2-0-0-0' }, 'Countermovement Jump and Stick')).toEqual({
      reps: '3', tempo: '2-0-0-0', coachNote: "Your coach's note for Countermovement Jump and Stick: Stick every landing.",
      setupCues: ['stick-two', 'tripod-down'], sets: 3, restSeconds: 60,
    });
  });
  it('no note stays no note; a row with no tempo keeps the prescribed one', () => {
    const r = swapPrescription({ ...jump, coachNote: null }, {}, 'x');
    expect(r.coachNote).toBeNull();
    expect(r.tempo).toBe('0-0-0-0');
    expect(swapPrescription(jump, { defaultTempo: '  ' }, 'x').tempo).toBe('0-0-0-0');
  });
  it('easierReps: the count stays, the jump noun goes; a per-side dose and a plain count are left as they are', () => {
    expect(['3 jumps', '20 contacts', '2 Jumps', '4 landings', '10 hops', '6 bounds', '3 each side', '8', '1 jump'].map(easierReps))
      .toEqual(['3', '20', '2', '4', '10', '6', '3 each side', '8', '1']);
    expect(easierReps('jumps')).toBe('jumps'); // nothing would be left: the text stays
  });
});

describe('a failed read closes the gate (unreadGateAction)', () => {
  const byId = new Map<string, GateRow>([
    ['drop', { id: 'drop', name: 'Depth Drop to Vertical', category: 'lower-body', regressionOfId: 'box' }],
    ['box', { id: 'box', name: 'Box Jump', category: 'plyometric', regressionOfId: 'squat' }],
    ['squat', { id: 'squat', name: 'Box Squat', category: 'lower-body' }],
    ['pogo', { id: 'pogo', name: 'Pogo', category: 'plyometric' }],
  ]);
  it('a gated item with a step down its ladder: swapped, marked unread; with none: held, marked unread', () => {
    expect(unreadGateAction(byId.get('drop')!, byId)).toEqual({ kind: 'swap', to: byId.get('squat'), reasons: [], unread: true });
    expect(unreadGateAction(byId.get('pogo')!, byId)).toEqual({ kind: 'hold', reasons: [], unread: true });
  });
  it('an item the gate never decides is kept', () => {
    expect(unreadGateAction(byId.get('squat')!, byId)).toEqual({ kind: 'keep', youthOverride: false });
  });
  it('the unread line is the one /workout shows too', () => {
    expect(GATE_UNREAD_REASON).toBe('unread');
    expect(GATE_UNREAD_LINE).toMatch(/couldn't read your jump checks/);
  });
});
