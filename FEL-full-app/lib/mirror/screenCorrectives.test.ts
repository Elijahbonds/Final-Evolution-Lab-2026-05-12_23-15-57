// The Movement Screen's one mapping from a camera check to what to do about it (MIRROR-COACH P3, 2026-09-26): a flag →
// its FIX line + a corrective block; a check the camera could not read → retest, never a pass; a pass → nothing. The
// grades here are the REAL grader's (stationGraders.regradeFromSummary over summary numbers), so a change to the
// grader's decision shows up here too.
import { describe, expect, it } from 'vitest';
import {
  CAMERA_NOT_DIAGNOSIS, CORRECTIVE_BLOCK, NOT_MEASURED_NOTE, SHORT_LABEL, YOUTH_BLOCKS_OFF, athletePlan, correctiveBlockFor, outcomeTitle,
  outcomesFromGrades, outcomesFromResults, youthGateFor, type CheckOutcome,
} from './screenCorrectives';
import { youthRules } from '@/lib/coach/taxonomy';
import { fixLine, type CheckResult } from './screen';
import { playbookBlock } from './program';
import { GRADER_IDS, RETEST_HINT, regradeFromSummary, type StationGrade } from './stationGraders';
import { screenText } from '@/lib/share/screen';

/** Summary numbers per camera slot that the real grader reads as a pass. */
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
/** …and the numbers that flag each one. */
const FLAG: Record<Key, Record<string, unknown>> = {
  heelLine: { value: 14, bySide: { left: 14, right: 2 } },
  kneeWindow: { value: 0.7, bySide: { left: 0.7, right: 0.05 } },
  hipLevel: { value: -0.12 },
  shoulderLevel: { value: 0.1 },
  headFloat: { value: 0.2 },
  singleLegL: { touchDowns: 2 },
  singleLegR: { value: 0.2 },
};
const grade = (k: Key, over: Record<string, unknown> = {}): StationGrade => {
  const g = regradeFromSummary({ ...PASS[k], ...over });
  if (!g) throw new Error(`the test's summary for ${k} is not a grade`);
  return g;
};
const all = (over: Partial<Record<Key, StationGrade>> = {}): StationGrade[] => (Object.keys(PASS) as Key[]).map((k) => over[k] ?? grade(k));
const unreadable = (k: Key) => grade(k, { readableFrames: 3, value: null, uncertainty: null, spread: null, bySide: undefined });

describe('the test\'s grades are the grader\'s', () => {
  it('PASS reads pass and FLAG reads flag, per slot', () => {
    for (const k of Object.keys(PASS) as Key[]) {
      expect(grade(k).status, k).toBe('pass');
      expect(grade(k, FLAG[k]).status, k).toBe('flag');
    }
    expect(unreadable('hipLevel').status).toBe('unreadable');
  });
});

describe('a FLAG maps to its FIX line and its corrective block, with the value the camera read', () => {
  for (const k of Object.keys(PASS) as Key[]) {
    it(`${k}`, () => {
      const out = outcomesFromGrades('modified', all({ [k]: grade(k, FLAG[k]) }));
      const flagged = out.filter((o) => o.status === 'flag');
      expect(flagged).toHaveLength(1);
      const o = flagged[0];
      expect(o.fix?.startsWith(fixLine(o.checkId)!)).toBe(true);
      const spec = CORRECTIVE_BLOCK[o.checkId];
      expect(o.block).toEqual(spec ? { ...playbookBlock(spec.zone, spec.kind), ...(spec.title ? { title: spec.title } : {}) } : null);
      expect(o.value).toMatch(/estimated$/);
      expect(o.note).toBeNull();
    });
  }

  it('the side: a one-sided flag carries the side the grader named; the single-leg stance always carries its leg', () => {
    const hip = outcomesFromGrades('modified', all({ hipLevel: grade('hipLevel', FLAG.hipLevel) })).find((o) => o.checkId === 'hipLevel')!;
    expect(hip.side).toBe('right');                      // value −0.12 = the RIGHT hip higher
    expect(hip.value).toBe('0.12 of a shoulder width, right higher · estimated');
    expect(outcomeTitle(hip)).toBe('Hip level, right hip higher');
    // the hip FIX works "the low side": the flag's side is the HIGHER hip, so the line says which side is low
    expect(hip.fix).toBe(`${fixLine('hipLevel')} Here the low side is the left.`);
    const legs = outcomesFromGrades('modified', all({ singleLegL: grade('singleLegL', FLAG.singleLegL) })).filter((o) => o.checkId === 'singleLeg');
    expect(legs.map((o) => [o.side, o.status])).toEqual([['left', 'flag'], ['right', 'pass']]);
    expect(outcomeTitle(legs[0])).toBe('Single-leg stance, left leg');
  });

  it('every camera check has a FIX line, and every mapped block is one the playbook has', () => {
    for (const id of GRADER_IDS) {
      expect(fixLine(id), id).toBeTruthy();
      const spec = CORRECTIVE_BLOCK[id];
      expect(correctiveBlockFor(id)?.title ?? null, id).toBe(spec ? spec.title ?? playbookBlock(spec.zone, spec.kind).title : null);
      if (spec) expect(correctiveBlockFor(id)!.movements, id).toEqual(playbookBlock(spec.zone, spec.kind).movements);
    }
    expect(correctiveBlockFor('ribAngle')).toBeNull();   // not a camera check
    expect(correctiveBlockFor('heelLine')).toBeNull();   // no block works the foot (header)
  });

  it('no mapped block holds a pin (owner decision #6: no pin-and-stretch under 18)', () => {
    for (const id of GRADER_IDS) {
      for (const m of correctiveBlockFor(id)?.movements ?? []) expect(m, `${id}: ${m}`).not.toMatch(/\bpin\b/i);
    }
  });

  // MIRROR-COACH P3 review (2026-09-26): the single-leg flag's block was titled "Ask the pelvis to stay level", right after
  // P3 took "the pelvis dropping" out of that flag as something the camera cannot measure
  it('no block the screen maps is titled with a pelvis or a hip-point claim', () => {
    for (const id of GRADER_IDS) expect(correctiveBlockFor(id)?.title ?? '', id).not.toMatch(/pelvi|hip point/i);
  });
});

describe('a check the camera could not read is RETEST — never a pass, never clear', () => {
  it('an unreadable grade: retest, with the grader\'s own reason and the one thing to do', () => {
    const o = outcomesFromGrades('modified', all({ hipLevel: unreadable('hipLevel') })).find((x) => x.checkId === 'hipLevel')!;
    expect(o).toMatchObject({ status: 'retest', value: null, fix: null, block: null });
    expect(o.note).toMatch(/^Not read: too few clear frames/);
    expect(o.hint).toBe(RETEST_HINT.tooFewFrames);
  });

  it('a slot with no grade at all is a retest too (the screen ended before it)', () => {
    const out = outcomesFromGrades('modified', [grade('hipLevel')]);
    expect(out).toHaveLength(7);
    expect(out.filter((o) => o.status === 'retest')).toHaveLength(6);
    expect(out.find((o) => o.checkId === 'heelLine')!.note).toBe(NOT_MEASURED_NOTE);
  });

  it('a "pass" with no number is not a pass (a stored row is JSON)', () => {
    const out = outcomesFromGrades('modified', [{ checkId: 'hipLevel', status: 'pass', value: null }]);
    expect(out.find((o) => o.checkId === 'hipLevel')!.status).toBe('retest');
  });
});

describe('a PASS prescribes nothing', () => {
  it('shows what was read, with no FIX line and no block', () => {
    for (const o of outcomesFromGrades('modified', all())) {
      expect(o).toMatchObject({ status: 'pass', fix: null, block: null, note: null });
      expect(o.value).toMatch(/estimated$/);
    }
  });
});

describe('rows stored before P3 (results only)', () => {
  it('fail → flag, borderline → flag marked borderline, stable → pass, nothing → retest', () => {
    const results: CheckResult[] = [
      { checkId: 'kneeWindow', grade: 'fail', side: 'left', source: 'camera' },
      { checkId: 'heelLine', grade: 'borderline', source: 'camera' },
      { checkId: 'hipLevel', grade: 'stable', source: 'camera' },
    ];
    const out = outcomesFromResults('modified', results);
    const by = (id: string) => out.find((o) => o.checkId === id)!;
    expect(by('kneeWindow')).toMatchObject({ status: 'flag', side: 'left', fix: fixLine('kneeWindow') });
    expect(by('heelLine')).toMatchObject({ status: 'flag', borderline: true });
    expect(by('hipLevel')).toMatchObject({ status: 'pass' });
    expect(by('headFloat')).toMatchObject({ status: 'retest' });
  });

  it('an old single-leg result that names no leg fills one slot, with no leg claimed', () => {
    const out = outcomesFromResults('modified', [{ checkId: 'singleLeg', grade: 'fail', source: 'camera' }]).filter((o) => o.checkId === 'singleLeg');
    expect(out.map((o) => o.status)).toEqual(['flag', 'retest']);
    expect(out[0].side).toBeUndefined();
  });
});

describe('the athlete\'s plan, in plain words', () => {
  const plan = (grades: StationGrade[]) => athletePlan(outcomesFromGrades('modified', grades));

  it('a flag: the title, what the camera saw, what to do, and the block; a shared block is shown once', () => {
    const p = plan(all({ hipLevel: grade('hipLevel', FLAG.hipLevel), singleLegR: grade('singleLegR', FLAG.singleLegR) }));
    expect(p.headline).toBe('2 things to work on, from what the camera saw.');
    expect(p.work.map((w) => w.title)).toEqual(['Hip level, right hip higher', 'Single-leg stance, right leg']);
    expect(p.work[0].saw).toBe('The camera saw 0.12 of a shoulder width, right higher · estimated.');
    expect(p.work[0].todo).toBe(`${fixLine('hipLevel')} Here the low side is the left.`);
    expect(p.work[0].block?.title).toBe('Trunk and hip hold');
    expect([p.work[0].blockShownAbove, p.work[1].blockShownAbove]).toEqual([false, true]);
    // the left leg passed beside a flagged right leg: named with its leg, not as if the whole check were fine
    expect(p.nothing).toEqual(['Heel line', 'Knee window', 'Shoulder height', 'Head float', 'Single-leg stance, left leg']);
    expect(p.note).toBe(CAMERA_NOT_DIAGNOSIS);
  });

  // MIRROR-COACH P3 review (2026-09-26): PLAN item 9 — the written correctives are "off for minors"; blank birth year =
  // youth rules until answered (decision #20)
  it('under youth rules the written blocks are off, and the plan says why; the FIX line stays', () => {
    const grades = all({ hipLevel: grade('hipLevel', FLAG.hipLevel), singleLegR: grade('singleLegR', FLAG.singleLegR) });
    for (const youth of ['minor', 'unknownAge'] as const) {
      const p = athletePlan(outcomesFromGrades('modified', grades), { youth });
      expect(p.work.every((w) => w.block === null && !w.blockShownAbove), youth).toBe(true);
      expect(p.work[0].todo).toBe(`${fixLine('hipLevel')} Here the low side is the left.`);
      expect(p.blocksNote).toBe(YOUTH_BLOCKS_OFF[youth]);
      expect(screenText(p.blocksNote!)).toEqual([]);
    }
    const adult = athletePlan(outcomesFromGrades('modified', grades), { youth: null });
    expect(adult.work[0].block).not.toBeNull();
    expect(adult.blocksNote).toBeUndefined();
    // a heel-line flag has no block to hide: nothing to say
    expect(athletePlan(outcomesFromGrades('modified', all({ heelLine: grade('heelLine', FLAG.heelLine) })), { youth: 'minor' }).blocksNote).toBeUndefined();
  });

  it('youthGateFor is the coach\'s youthRules, told apart by whether a birth year is on file', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    for (const y of [null, undefined, 0, 1850, 1990, 2007, 2008, 2010, 2020]) {
      expect(youthGateFor(y as number | null, now) !== null, String(y)).toBe(youthRules(y as number | null, now));
    }
    expect(youthGateFor(null, now)).toBe('unknownAge');
    expect(youthGateFor(2012, now)).toBe('minor');
    expect(youthGateFor(1990, now)).toBeNull();
  });

  it('nothing flagged but something not read: says to run those again — never "clear"', () => {
    const p = plan(all({ headFloat: unreadable('headFloat') }));
    expect(p.work).toEqual([]);
    expect(p.retest).toEqual([{ title: 'Head float', why: expect.stringMatching(/^Not read: .* Hold still in the shot for the whole count\.$/) }]);
    expect(p.headline).toMatch(/run those again/);
    expect(p.headline).not.toMatch(/clear/i);
  });

  it('nothing read at all: run it again', () => {
    const p = plan((Object.keys(PASS) as Key[]).map(unreadable));
    expect(p.headline).toBe('The camera could not read enough of this screen to say what to work on. Run it again.');
    expect(p.nothing).toEqual([]);
  });

  it('everything read, nothing flagged', () => {
    expect(plan(all()).headline).toBe('Nothing flagged in any check the camera read.');
  });
});

describe('what it says is what the camera saw — never health', () => {
  // every line any reader of this mapping shows, for every flag, retest and pass
  const lines = (): string[] => {
    const outs: CheckOutcome[] = [];
    for (const k of Object.keys(PASS) as Key[]) {
      outs.push(...outcomesFromGrades('modified', all({ [k]: grade(k, FLAG[k]) })));
      outs.push(...outcomesFromGrades('modified', all({ [k]: unreadable(k) })));
    }
    const plans = [athletePlan(outs)];
    return [
      ...outs.flatMap((o) => [o.label, outcomeTitle(o), o.value, o.note, o.hint, o.fix, o.block?.title, ...(o.block?.movements ?? [])]),
      ...plans.flatMap((p) => [p.headline, ...p.work.flatMap((w) => [w.saw, w.todo]), ...p.retest.map((r) => r.why)]),
      ...Object.values(SHORT_LABEL), NOT_MEASURED_NOTE,
    ].filter((x): x is string => typeof x === 'string');
  };

  it('no line names a condition, a treatment or a guarantee (lib/share/screen.ts)', () => {
    for (const l of lines()) expect(screenText(l), l).toEqual([]);
  });

  it('no verdict words: a flag is "flagged for a closer look", never a failure, a dysfunction, an injury or a risk', () => {
    for (const l of lines()) expect(l, l).not.toMatch(/\bfail|dysfunction|injur|\brisk|prevent|diagnos/i);
  });

  it('the one line that names diagnosis says the camera does not make one', () => {
    expect(CAMERA_NOT_DIAGNOSIS).toBe('This is what the camera saw, not a diagnosis.');
  });
});
