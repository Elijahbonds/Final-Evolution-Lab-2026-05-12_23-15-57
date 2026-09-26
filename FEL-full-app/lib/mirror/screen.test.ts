import { describe, expect, it } from 'vitest';
import {
  FULL_SCREEN, MODIFIED_SCREEN, NOT_GRADED_LINE, NOT_READ_LINE, SCREEN_DISCLAIMER, TURN_CUE, checkSlots, distinctChecks, isCompleteScreen,
  movementFlagsOf, resultsForScreen, scoreScreen, screenFor, screenVariantFor, triageFor, type CheckResult, type ScreenId,
} from './screen';
import { decideScreenReward, MIN_CHECKS_FOR_REWARD } from './screenReward';
import { screenText } from '@/lib/share/screen';

const res = (checkId: string, grade: CheckResult['grade'], side?: 'left' | 'right'): CheckResult =>
  side ? { checkId, grade, side, source: 'camera' } : { checkId, grade, source: 'camera' };

/** Every slot of a screen answered 'stable', then `over` replacing the matching check (the single-leg test takes two). */
function complete(screen: ScreenId, over: CheckResult[] = []): CheckResult[] {
  const out: CheckResult[] = [];
  for (const [id, n] of checkSlots(screen)) {
    const mine = over.filter((r) => r.checkId === id);
    if (n === 2) out.push(...[mine[0] ?? res(id, 'stable', 'left'), mine[1] ?? res(id, 'stable', 'right')]);
    else out.push(mine[0] ?? res(id, 'stable'));
  }
  return out;
}

describe('the screen protocol', () => {
  it('walks the athlete round: behind, front, side — and cues the turn every time the view changes', () => {
    const views = MODIFIED_SCREEN.map((s) => s.view);
    expect(views[0]).toBe('back');           // the Playbook starts behind the athlete, at the heels
    expect(views).toContain('front');
    expect(views).toContain('side');
    for (const v of ['front', 'side', 'back'] as const) expect(TURN_CUE[v].length).toBeGreaterThan(8);
  });

  it('NEVER cues posture — the book grades a default, not a performance', () => {
    const banned = /stand up straight|shoulders back|chin up|chest out|tuck your/i;
    for (const s of [...MODIFIED_SCREEN, ...FULL_SCREEN]) expect(s.cue).not.toMatch(banned);
    // and it says so where it can: the front station tells them not to fix anything
    expect(MODIFIED_SCREEN.find((s) => s.id === 'frontStack')!.cue).toMatch(/do not fix/i);
  });

  it('the full screen is the modified one plus the hands-on stations, not a different protocol', () => {
    expect(screenFor('modified')).toBe(MODIFIED_SCREEN);
    expect(FULL_SCREEN.length).toBeGreaterThan(MODIFIED_SCREEN.length);
    for (const s of MODIFIED_SCREEN) expect(FULL_SCREEN.map((f) => f.id)).toContain(s.id);
    // the single-leg test stays last in both — it is the dynamic check the static ones lead to
    expect(FULL_SCREEN[FULL_SCREEN.length - 1].id).toBe('wobbleR');
  });

  it('holds the books triage exactly: none, one or two, three and up', () => {
    expect(triageFor(0)).toBe('proceed');
    expect(triageFor(1)).toBe('addressFirst');
    expect(triageFor(2)).toBe('addressFirst');
    expect(triageFor(3)).toBe('seeSpecialist');
  });

  it('a clean screen — every check back, none flagged — says so and clears the athlete to train', () => {
    const r = scoreScreen('modified', complete('modified'));
    expect(r.ranAll).toBe(true);
    expect(r.notMeasured).toEqual([]);
    expect(r.graded).toBe(true);
    expect(r.movementFlags).toBe(0);
    expect(r.redFlags).toBe(0);
    expect(r.triage).toBe('proceed');
    expect(r.score).toBe(100);
    expect(r.programming.join(' ')).toMatch(/train normally/i);
    expect(r.programming.join(' ')).toMatch(/monthly|growth spurt/i);
    expect(r.headline).toBe('Nothing flagged. That is a platform you can load.');
  });

  it('weights a ONE-SIDED failure above a bilateral one — asymmetry beats severity', () => {
    const oneSided = scoreScreen('modified', complete('modified', [res('singleLeg', 'fail', 'left')]));
    // a camera check without a side (MIRROR-COACH P3: the breath station, the old example here, is never scored)
    const bilateral = scoreScreen('modified', complete('modified', [res('headFloat', 'fail')]));
    expect(oneSided.asymmetries).toBe(1);
    expect(oneSided.score).toBeLessThan(bilateral.score!);
    expect(oneSided.headline).toMatch(/left/);
    expect(oneSided.headline).toMatch(/one side off and one side fine/i);
  });

  it('three red flags sends them to a person, and says what they can still do', () => {
    const r = scoreScreen('modified', [res('heelLine', 'fail', 'right'), res('kneeWindow', 'fail'), res('singleLeg', 'fail', 'right')]);
    expect(r.triage).toBe('seeSpecialist');
    expect(r.programming.join(' ')).toMatch(/controlled intensity/i);
    expect(r.programming.join(' ')).toMatch(/not medical clearance/i);
    expect(r.suggestions.length).toBeGreaterThan(0);     // it still tells them what to work on
  });

  it('explains what each finding MEANS and what to do about it, in movement language', () => {
    const r = scoreScreen('modified', [res('hipLevel', 'fail', 'left'), res('headFloat', 'borderline')]);
    expect(r.meaning.length).toBe(2);                    // both the fail and the borderline are explained
    expect(r.suggestions.length).toBe(1);                // only the fail gets prescribed work
    expect(r.meaning.join(' ')).toMatch(/pelvis|tilt/i);
    expect(r.suggestions.join(' ')).toMatch(/single-leg|hip/i);
  });

  it('names the checks a camera could not take instead of quietly dropping them', () => {
    const r = scoreScreen('full', [res('heelLine', 'stable')]);
    // MIRROR-COACH P3 (2026-09-25): named as NOT SCORED (the athlete's answers and the coach's checks), not as "not
    // measured" camera checks — they were listed as missing on every screen, so no screen could ever be complete
    expect(r.notScored).toEqual(['Rib angle and breath', 'Pelvic tilt (hands on the hip points)', 'Seated rotation, each side']);
    expect(r.notMeasured.join(' ')).not.toMatch(/rib angle|pelvic tilt|rotation/i);
    expect(r.ranAll).toBe(false);
  });

  it('the disclaimer refuses to be clearance, and says what belongs with a physician', () => {
    expect(SCREEN_DISCLAIMER).toMatch(/not medical clearance/i);
    expect(SCREEN_DISCLAIMER).toMatch(/physician/i);
  });
});

// MIRROR-COACH P1 (2026-09-25): no station has a grader yet, so every screen arrived with zero results — and scored 100
// with "Nothing flagged. That is a platform you can load." and "Train normally". These would have caught it.
describe('a screen nothing graded is not a clean screen', () => {
  const empty = scoreScreen('modified', []);

  it('has no score, no triage and no clean-bill headline', () => {
    expect(empty.graded).toBe(false);
    expect(empty.score).toBeNull();
    expect(empty.triage).toBe('notGraded');
    expect(empty.headline).toBe(NOT_GRADED_LINE);
    expect(empty.headline).not.toMatch(/nothing flagged|platform you can load/i);
    expect(empty.programming.join(' ')).not.toMatch(/train normally/i);
  });

  it('says it was not graded, without telling the athlete to step back and retry', () => {
    expect(NOT_GRADED_LINE).toMatch(/^Not graded yet/);
    expect(NOT_GRADED_LINE).not.toMatch(/step back|run it again|in frame/i);
  });

  it('names every CAMERA check as not measured, and the breath station as not scored (MIRROR-COACH P3)', () => {
    expect(empty.notMeasured.length).toBe(new Set(MODIFIED_SCREEN.flatMap((s) => s.checks.filter((c) => c.source === 'camera').map((c) => c.id))).size);
    expect(empty.notMeasured).toHaveLength(6);
    expect(empty.notScored).toEqual(['Rib angle and breath']);
    expect(empty.ranAll).toBe(false);
  });

  it('one graded station is graded — and is NOT scored, and is not clear (MIRROR-COACH P1 review)', () => {
    const one = scoreScreen('modified', [res('hipLevel', 'stable')]);
    expect(one.graded).toBe(true);
    expect(one.score).toBeNull();
  });
});

// MIRROR-COACH P1 review (2026-09-25): "at least one result" made a screen graded AND clear. scoreScreen('modified',
// [{heelLine, stable}]) returned score 100, "Nothing flagged. That is a platform you can load.", "Train normally.", and
// notMeasured ['Rib angle and breath'] — the five unmeasured camera checks silently dropped — and the coach read it as
// "Their last screen came back clear."
describe('a partly graded screen is not a clear screen', () => {
  const one = scoreScreen('modified', [res('heelLine', 'stable')]);

  it('one passing check out of seven camera slots: no score, triage partial, no clean-bill headline, no "Train normally"', () => {
    expect(one.graded).toBe(true);
    expect(one.ranAll).toBe(false);
    expect(one.score).toBeNull();
    expect(one.triage).toBe('partial');
    // MIRROR-COACH P3: out of the 7 CAMERA slots (P1 counted 8 with the breath slot, which no screen can fill)
    expect(one.headline).toMatch(/^Partly graded: 1 of 7 camera checks/);
    expect(one.headline).not.toMatch(/nothing flagged|platform you can load/i);
    expect(one.programming).toEqual([]);
  });

  it('names EVERY camera check that did not come back', () => {
    expect(one.notMeasured).toEqual([
      'Knee window', 'Hip level', 'Shoulder height', 'Head float', 'Single-leg stance, 30 seconds a side',
    ]);
    // the same list on an ungraded screen: every camera check (MIRROR-COACH P3: the breath station is in notScored)
    expect(scoreScreen('modified', []).notMeasured).toHaveLength(6);
  });

  it('a two-sided check needs both sides: seven checks with one leg missing is still partial', () => {
    const noRightLeg = complete('modified').filter((r) => !(r.checkId === 'singleLeg' && r.side === 'right'));
    expect(isCompleteScreen('modified', noRightLeg)).toBe(false);
    expect(scoreScreen('modified', noRightLeg).triage).toBe('partial');
    expect(scoreScreen('modified', noRightLeg).notMeasured).toEqual(['Single-leg stance, 30 seconds a side']);
    expect(isCompleteScreen('modified', complete('modified'))).toBe(true);
    // MIRROR-COACH P3: the full screen's extra stations are coach checks, never scored, so its camera slots are the
    // modified screen's (P1: false, when the coach and breath slots counted and no screen could ever fill them)
    expect(isCompleteScreen('full', complete('modified'))).toBe(true);
  });

  it('a partial screen that DID flag something is triaged by its flags (a measured fail is real), still without a score', () => {
    const r = scoreScreen('modified', [res('hipLevel', 'fail', 'left'), res('headFloat', 'stable')]);
    expect(r.triage).toBe('addressFirst');
    expect(r.score).toBeNull();
    // P3 review (2026-09-26): a level flag's side is the HIGHER hip, and the headline says so
    expect(r.headline).toBe('Hip level was flagged for a closer look: the left hip read higher.');
    const three = scoreScreen('modified', [res('heelLine', 'fail', 'right'), res('kneeWindow', 'fail'), res('singleLeg', 'fail', 'right')]);
    expect(three.triage).toBe('seeSpecialist');
    expect(three.score).toBeNull();
  });
});

// The same review: resultsForScreen checked only the checkId, and the route counted the raw array. Posting three copies
// of {hipLevel, grade: 'x'} was graded, 100, "Nothing flagged", and PAID (MIN_CHECKS_FOR_REWARD 3).
describe('what the server keeps from a posted screen', () => {
  it('drops a grade that is not a grade, a source that is not a source, and a side that is not a side', () => {
    const junk = [
      { checkId: 'hipLevel', grade: 'x', source: 'camera' }, { checkId: 'heelLine', grade: 'pass', source: 'camera' },
      { checkId: 'kneeWindow', grade: 'fail', source: 'vibes' }, { checkId: 'headFloat', grade: 'fail', source: 'camera', side: 'up' },
    ];
    expect(resultsForScreen('modified', junk)).toEqual([]);
    const s = scoreScreen('modified', junk as CheckResult[]);
    expect(s.graded).toBe(false);
    expect(s.score).toBeNull();
  });

  it('keeps one result per check per side — the WORST grade, so a later "stable" cannot launder a "fail"', () => {
    const kept = resultsForScreen('modified', [res('hipLevel', 'fail'), res('hipLevel', 'stable'), res('hipLevel', 'stable')]);
    expect(kept).toEqual([res('hipLevel', 'fail')]);
  });

  it('three copies of one check are one check: not graded as three, and not paid', () => {
    const three = [res('hipLevel', 'stable'), res('hipLevel', 'stable'), res('hipLevel', 'stable')];
    const kept = resultsForScreen('modified', three);
    expect(kept).toHaveLength(1);
    expect(distinctChecks(kept)).toBe(1);
    expect(distinctChecks(kept)).toBeLessThan(MIN_CHECKS_FOR_REWARD);
    expect(decideScreenReward({ screenId: 's', athleteId: 'a', provisional: false, checksTaken: distinctChecks(kept) }).pay).toBe(false);
    // and one check per side is still one check to the reward
    expect(distinctChecks([res('singleLeg', 'stable', 'left'), res('singleLeg', 'stable', 'right')])).toBe(1);
  });

  it('never more results for a check than the screen has stations asking it', () => {
    const kept = resultsForScreen('modified', [res('hipLevel', 'stable', 'left'), res('hipLevel', 'fail', 'right'), res('singleLeg', 'stable', 'left'), res('singleLeg', 'stable', 'right')]);
    expect(kept.filter((r) => r.checkId === 'hipLevel')).toEqual([res('hipLevel', 'fail', 'right')]);
    expect(kept.filter((r) => r.checkId === 'singleLeg')).toHaveLength(2);
  });

  it('comes back in protocol order, with only the fields a result has', () => {
    const kept = resultsForScreen('modified', [{ ...res('headFloat', 'stable'), extra: 'x', detail: 'd'.repeat(500) }, res('heelLine', 'stable')]);
    expect(kept.map((r) => r.checkId)).toEqual(['heelLine', 'headFloat']);
    expect(kept[1]).toEqual({ checkId: 'headFloat', grade: 'stable', source: 'camera', detail: 'd'.repeat(200) });
  });
});

describe('the variant a screen is stored as', () => {
  // MIRROR-COACH P3 (2026-09-25): the claim stands. P1 stored a 'full' claim with none of the full screen's own results
  // as 'modified' because the label changed the score; only camera checks score now and both variants have the same
  // ones, so the label cannot buy anything — and no result can carry a coach check, so P1's rule would have stored
  // every real full screen as 'modified'.
  it('a "full" claim is stored as full, a "modified" one as modified, whatever results came back', () => {
    expect(screenVariantFor('full', [res('hipLevel', 'stable')])).toBe('full');
    expect(screenVariantFor('modified', [res('hipLevel', 'stable')])).toBe('modified');
    expect(screenVariantFor('full', [])).toBe('full');
  });

  it('both variants score the same camera results identically — the label decides only which coach checks are named', () => {
    const all = complete('modified');
    const full = scoreScreen('full', all), mod = scoreScreen('modified', all);
    expect({ ...full, screen: 'x', notScored: [] }).toEqual({ ...mod, screen: 'x', notScored: [] });
    expect(full.triage).toBe('proceed');
    expect(full.notScored).toEqual(['Rib angle and breath', 'Pelvic tilt (hands on the hip points)', 'Seated rotation, each side']);
    expect(mod.notScored).toEqual(['Rib angle and breath']);
  });
});

// MIRROR-COACH P3 (2026-09-25): a self-report answer or a coach check is never a result — whatever source the client
// claims for it — so it never reaches the score, the flag count, the triage or the reward.
describe('only camera checks are scored', () => {
  it('drops a breath or coach "result" in any source, and keeps the camera ones', () => {
    const posted = [
      res('ribAngle', 'fail'), { checkId: 'ribAngle', grade: 'fail', source: 'selfReport' },
      { checkId: 'pelvicTilt', grade: 'fail', source: 'coach' }, res('thoracicRotation', 'fail', 'left'),
      res('hipLevel', 'stable'), { checkId: 'headFloat', grade: 'fail', source: 'coach' },
    ];
    expect(resultsForScreen('full', posted)).toEqual([res('hipLevel', 'stable')]);
  });

  it('the same camera results give the same summary with or without a breath/coach result beside them', () => {
    const cam = complete('modified');
    const withAnswers = [...cam, res('ribAngle', 'fail'), { checkId: 'pelvicTilt', grade: 'fail', source: 'coach' } as CheckResult];
    expect(scoreScreen('full', withAnswers)).toEqual(scoreScreen('full', cam));
    expect(scoreScreen('full', withAnswers)).toMatchObject({ movementFlags: 0, score: 100, triage: 'proceed' });
    // a screen whose only "results" were answers is not graded
    expect(scoreScreen('modified', [res('ribAngle', 'stable')]).graded).toBe(false);
  });

  it('a sided flag is worded as a closer look, never "failed"', () => {
    const r = scoreScreen('modified', complete('modified', [res('kneeWindow', 'fail', 'left')]));
    expect(r.headline).toMatch(/^Knee window was flagged for a closer look on the left knee\. One side off and one side fine/);
    expect(r.headline).not.toMatch(/failed/i);
  });
});

// MIRROR-COACH P3 review (2026-09-26): both single-leg legs flagged read as two one-sided findings, and the headline said
// "…on the left side. One side off and one side fine matters more…" when neither side was fine
describe('a check flagged on every slot is ONE bilateral finding; the side a headline names says what it means', () => {
  it('both legs flagged: one movement flag, not one-sided, no side in the headline, 15 points', () => {
    const r = scoreScreen('modified', complete('modified', [res('singleLeg', 'fail', 'left'), res('singleLeg', 'fail', 'right')]));
    expect(r.movementFlags).toBe(1);
    expect(r.asymmetries).toBe(0);
    expect(r.score).toBe(85);
    expect(r.triage).toBe('addressFirst');
    expect(r.headline).toBe('1 flag worth clearing before you add intensity.');
    expect(r.headline).not.toMatch(/one side fine|left|right/i);
    expect(r.meaning).toHaveLength(1);                   // one explanation for one finding
    // one leg only: one ONE-SIDED finding, named by its leg
    const one = scoreScreen('modified', complete('modified', [res('singleLeg', 'stable', 'left'), res('singleLeg', 'fail', 'right')]));
    expect(one).toMatchObject({ movementFlags: 1, asymmetries: 1, score: 78 });
    expect(one.headline).toMatch(/^Single-leg stance, 30 seconds a side was flagged for a closer look on the right leg\. One side off and one side fine/);
  });

  it('both legs plus one more flag is two findings, not three — addressFirst, not seeSpecialist', () => {
    const r = scoreScreen('modified', complete('modified', [res('singleLeg', 'fail', 'left'), res('singleLeg', 'fail', 'right'), res('hipLevel', 'fail', 'right')]));
    expect(r.movementFlags).toBe(2);
    expect(r.triage).toBe('addressFirst');
    // the one-sided finding leads the headline, worded as what the side means
    expect(r.headline).toBe('Hip level was flagged for a closer look: the right hip read higher.');
  });

  it('a shoulder-level flag names the higher shoulder, without the one-side-off line', () => {
    const r = scoreScreen('modified', complete('modified', [res('shoulderLevel', 'fail', 'left')]));
    expect(r.headline).toBe('Shoulder height was flagged for a closer look: the left shoulder read higher.');
    expect(r.asymmetries).toBe(1);
  });

  it('three separate findings still reach seeSpecialist, and its lines say what to build, not what to stop', () => {
    const r = scoreScreen('modified', complete('modified', [res('heelLine', 'fail', 'right'), res('kneeWindow', 'fail', 'left'), res('headFloat', 'fail')]));
    expect(r.triage).toBe('seeSpecialist');
    expect(r.programming.join(' ')).not.toMatch(/hold off|until this is looked at|stop loading/i);
    expect(scoreScreen('modified', complete('modified', [res('hipLevel', 'fail', 'left')])).suggestions.join(' ')).not.toMatch(/stop loading/i);
  });

  it('a screen the camera tried and read nothing of says so — "not graded yet" is for a screen with no grades at all', () => {
    expect(scoreScreen('modified', [], { attempted: true }).headline).toBe(NOT_READ_LINE);
    expect(scoreScreen('modified', []).headline).toBe(NOT_GRADED_LINE);
    expect(screenText(NOT_READ_LINE)).toEqual([]);
  });
});

describe('the words the screen says', () => {
  it('no line names a condition, a treatment or a guarantee (lib/share/screen.ts) — "an ankle injury", not "an ankle sprain"', () => {
    const lines = new Set<string>([NOT_GRADED_LINE, SCREEN_DISCLAIMER]);
    for (const screen of ['modified', 'full'] as const) {
      for (const c of [...checkSlots(screen).keys()]) {
        for (const g of ['fail', 'borderline'] as const) {
          const s = scoreScreen(screen, complete(screen, [res(c, g)]));
          for (const l of [s.headline, ...s.meaning, ...s.suggestions, ...s.programming]) lines.add(l);
        }
      }
      const clean = scoreScreen(screen, complete(screen));
      for (const l of [clean.headline, ...clean.programming]) lines.add(l);
      const part = scoreScreen(screen, [res('heelLine', 'stable')]);
      lines.add(part.headline);
    }
    for (const l of lines) expect(screenText(l), l).toEqual([]);
  });
});

describe('movement flags, not red flags', () => {
  it('the count is movementFlags, with the old key kept beside it', () => {
    const r = scoreScreen('modified', [res('heelLine', 'fail', 'left'), res('hipLevel', 'fail')]);
    expect(r.movementFlags).toBe(2);
    expect(r.redFlags).toBe(r.movementFlags);
  });

  it('reads a row stored before the rename (redFlags only), and junk as 0', () => {
    expect(movementFlagsOf({ redFlags: 3 })).toBe(3);
    expect(movementFlagsOf({ movementFlags: 1, redFlags: 3 })).toBe(1);
    for (const junk of [null, undefined, 'x', {}, { redFlags: 'many' }, { movementFlags: -2 }]) expect(movementFlagsOf(junk)).toBe(0);
  });

  it('no station copy calls a movement finding a red flag', () => {
    for (const st of FULL_SCREEN) for (const c of st.checks) expect(c).not.toHaveProperty('redFlag');
  });
});

describe('the stored variant is the one that ran', () => {
  it('drops results for checks the claimed screen does not have', () => {
    const fullOnly = res('pelvicTilt', 'fail');
    expect(resultsForScreen('modified', [res('hipLevel', 'stable'), fullOnly]).map((r) => r.checkId)).toEqual(['hipLevel']);
    // MIRROR-COACH P3: and on the full screen too — pelvicTilt is a coach check, never a result (P1 kept it here)
    expect(resultsForScreen('full', [res('hipLevel', 'stable'), fullOnly]).map((r) => r.checkId)).toEqual(['hipLevel']);
  });

  it('drops junk rather than throwing on it', () => {
    expect(resultsForScreen('modified', [null as unknown as CheckResult, { grade: 'fail' } as unknown as CheckResult])).toEqual([]);
  });
});
