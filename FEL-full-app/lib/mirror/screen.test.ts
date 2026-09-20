import { describe, expect, it } from 'vitest';
import {
  FULL_SCREEN, MODIFIED_SCREEN, SCREEN_DISCLAIMER, TURN_CUE, scoreScreen, screenFor, triageFor,
  type CheckResult,
} from './screen';

const res = (checkId: string, grade: CheckResult['grade'], side?: 'left' | 'right'): CheckResult =>
  ({ checkId, grade, side, source: 'camera' });

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

  it('a clean screen says so and clears the athlete to train', () => {
    const r = scoreScreen('modified', [res('heelLine', 'stable'), res('kneeWindow', 'stable'), res('hipLevel', 'stable')]);
    expect(r.redFlags).toBe(0);
    expect(r.triage).toBe('proceed');
    expect(r.score).toBe(100);
    expect(r.programming.join(' ')).toMatch(/train normally/i);
    expect(r.programming.join(' ')).toMatch(/monthly|growth spurt/i);
  });

  it('weights a ONE-SIDED failure above a bilateral one — asymmetry beats severity', () => {
    const oneSided = scoreScreen('modified', [res('singleLeg', 'fail', 'left')]);
    const bilateral = scoreScreen('modified', [res('ribAngle', 'fail')]);
    expect(oneSided.asymmetries).toBe(1);
    expect(oneSided.score).toBeLessThan(bilateral.score);
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
    expect(r.notMeasured.join(' ')).toMatch(/rib angle|pelvic tilt|rotation/i);
    expect(r.ranAll).toBe(false);
  });

  it('the disclaimer refuses to be clearance, and says what belongs with a physician', () => {
    expect(SCREEN_DISCLAIMER).toMatch(/not medical clearance/i);
    expect(SCREEN_DISCLAIMER).toMatch(/physician/i);
  });
});
