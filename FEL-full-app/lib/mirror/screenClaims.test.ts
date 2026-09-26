// The server's half of the graders (MIRROR-COACH P3, 2026-09-25): what it keeps from a posted screen and what it
// refuses. The route runs this module for real in lib/mirror/screen-route.test.ts; these hold its rules one by one,
// and sweep every camera check's value range to show the server's status is the grader's own, value for value.
import { describe, expect, it } from 'vitest';
import {
  GAVE_UP_NOTE, MAX_CLAIMS, MIN_READABLE_CAMERA_CHECKS, MIN_READABLE_CAMERA_STATIONS, claimFromGrade, decideScreenPost,
  isScreenNotStation, regradeClaims, screenCoverage, screenReadLine, type CameraCheckClaim,
} from './screenClaims';
import { screenText } from '@/lib/share/screen';
import { MIN_CHECKS_FOR_REWARD } from './screenReward';
import { STATION_THRESHOLDS, minReadableFrames, regradeFromSummary, type StationGrade } from './stationGraders';

const base: Record<string, CameraCheckClaim> = {
  hipLevel: { checkId: 'hipLevel', status: 'pass', value: 0, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  shoulderLevel: { checkId: 'shoulderLevel', status: 'pass', value: 0, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  headFloat: { checkId: 'headFloat', status: 'pass', value: 0, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02, stationId: 'profile', view: 'side' },
  kneeWindow: { checkId: 'kneeWindow', status: 'pass', value: 0, bySide: { left: 0, right: 0 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack', view: 'front' },
  heelLine: { checkId: 'heelLine', status: 'pass', value: 0, bySide: { left: 0, right: 0 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels', view: 'back' },
  singleLeg: { checkId: 'singleLeg', status: 'pass', value: 0, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL', view: 'front' },
};
/** A claim for `checkId` at `value` (both sides at `value` for the two-sided reads), with the status the grader gives it. */
function honest(checkId: string, value: number, over: Partial<CameraCheckClaim> = {}): CameraCheckClaim {
  const c: CameraCheckClaim = { ...base[checkId], value, ...over };
  if (c.bySide && !over.bySide) c.bySide = { left: value, right: checkId === 'heelLine' ? 0 : value };
  c.status = regradeFromSummary(c)!.status;
  return c;
}

describe('the server\'s status is the grader\'s, value for value', () => {
  const sweeps: Record<string, number[]> = {
    hipLevel: [-0.3, -0.12, -0.08, -0.079, 0, 0.05, 0.079, 0.08, 0.2],
    shoulderLevel: [-0.2, -0.08, 0, 0.0799, 0.08, 0.5],
    headFloat: [-0.1, 0, 0.119, 0.12, 0.4],
    kneeWindow: [-0.3, 0, 0.49, 0.5, 1.2],
    heelLine: [0, 9.9, 10, 25],
    singleLeg: [0, 0.05, 0.119, 0.12, 0.5],
  };
  for (const [checkId, values] of Object.entries(sweeps)) {
    it(`${checkId}: the honest status is kept; every other readable status is refused (422)`, () => {
      let flags = 0, passes = 0;
      for (const v of values) {
        const c = honest(checkId, v);
        const kept = regradeClaims('modified', [c]);
        expect(kept.refused, `${checkId} ${v}`).toEqual([]);
        expect(kept.camera[0].status, `${checkId} ${v}`).toBe(c.status);
        if (c.status === 'flag') flags++; else if (c.status === 'pass') passes++;
        for (const lie of (['pass', 'flag'] as const).filter((s) => s !== c.status)) {
          const out = regradeClaims('modified', [{ ...c, status: lie }]);
          expect(out.refused, `${checkId} ${v} posted ${lie}`).toHaveLength(1);
          expect(out.results).toEqual([]);
        }
      }
      // the sweep crosses the line both ways (each check's flagAt lives in STATION_THRESHOLDS, not here)
      expect(flags).toBeGreaterThan(0);
      expect(passes).toBeGreaterThan(0);
    });
  }

  it('the single-leg stance: a touch-down is a flag whatever the sway (the table\'s touchDownsFlagAt)', () => {
    const c = honest('singleLeg', 0.01, { touchDowns: STATION_THRESHOLDS.singleLeg.touchDownsFlagAt });
    expect(c.status).toBe('flag');
    expect(regradeClaims('modified', [{ ...c, status: 'pass' }]).refused).toHaveLength(1);
  });
});

describe('the readable-frame minimum', () => {
  it('a pass under minReadableFrames is refused as too_few_frames_for_pass; the same numbers posted unreadable are kept', () => {
    const need = minReadableFrames(420);
    expect(need).toBe(Math.max(STATION_THRESHOLDS.common.minReadableFrames, Math.ceil(STATION_THRESHOLDS.common.minReadableShare * 420)));
    const thin = { ...base.hipLevel, readableFrames: need - 1 };
    expect(regradeClaims('modified', [thin]).refused).toEqual([{ checkId: 'hipLevel', claimed: 'pass', expected: 'unreadable', reason: 'too_few_frames_for_pass' }]);
    expect(regradeClaims('modified', [{ ...thin, status: 'flag', value: 0.2 }]).refused[0].reason).toBe('status_does_not_follow');
    const ok = regradeClaims('modified', [{ ...base.hipLevel, readableFrames: need }]);
    expect(ok.refused).toEqual([]);
    expect(ok.camera[0].status).toBe('pass');
    const gaveUp = regradeClaims('modified', [{ ...thin, status: 'unreadable' }]);
    expect(gaveUp.refused).toEqual([]);
    expect(gaveUp.results).toEqual([]);
  });
});

describe('what is kept', () => {
  it('a check the phone gave up on is unreadable even when its numbers read, and says so in FEL\'s words', () => {
    const out = regradeClaims('modified', [{ ...base.hipLevel, status: 'unreadable' }]);
    expect(out.camera[0]).toMatchObject({ status: 'unreadable', claimed: 'unreadable', value: null, note: GAVE_UP_NOTE });
    expect(out.results).toEqual([]);
    expect(out.readableChecks).toBe(0);
  });

  it('a claim with no view takes its station\'s; a station that does not ask the check is malformed', () => {
    const { view: _v, ...noView } = base.headFloat;
    void _v;
    expect(regradeClaims('modified', [noView]).camera[0]).toMatchObject({ view: 'side', status: 'pass' });
    expect(regradeClaims('modified', [{ ...noView, stationId: 'frontStack' }]).dropped).toEqual([{ checkId: 'headFloat', reason: 'malformed' }]);
    // no view and no station: nothing says where it was read from
    const { stationId: _s, ...bare } = noView;
    void _s;
    expect(regradeClaims('modified', [bare]).dropped).toEqual([{ checkId: 'headFloat', reason: 'malformed' }]);
  });

  it('the single-leg stance needs its leg — from the claim or its station — and one per leg', () => {
    const { side: _side, ...noSide } = base.singleLeg;
    void _side;
    expect(regradeClaims('modified', [noSide]).camera[0]).toMatchObject({ side: 'left' });           // from wobbleL
    const { stationId: _st, ...neither } = noSide;
    void _st;
    expect(regradeClaims('modified', [neither]).dropped[0]).toEqual({ checkId: 'singleLeg', reason: 'malformed' });
    const right = { ...base.singleLeg, side: 'right' as const, stationId: 'wobbleR' };
    const both = regradeClaims('modified', [right, base.singleLeg, base.singleLeg]);
    expect(both.camera.map((c) => c.side)).toEqual(['left', 'right']);
    expect(both.dropped).toEqual([{ checkId: 'singleLeg', reason: 'duplicate' }]);
    expect(both.readableChecks).toBe(1);
    expect(both.results.map((r) => r.side)).toEqual(['left', 'right']);
  });

  it('a flag\'s side is the server\'s (from the value\'s sign), never the posted one', () => {
    const out = regradeClaims('modified', [{ ...base.shoulderLevel, status: 'flag', value: -0.1, side: 'left' }]);
    expect(out.results).toEqual([expect.objectContaining({ checkId: 'shoulderLevel', grade: 'fail', side: 'right' })]);
  });

  it('comes back in protocol order', () => {
    const out = regradeClaims('modified', [base.singleLeg, base.headFloat, base.hipLevel, base.heelLine]);
    expect(out.camera.map((c) => c.checkId)).toEqual(['heelLine', 'hipLevel', 'headFloat', 'singleLeg']);
  });

  it('reads at most MAX_CLAIMS claims; the rest are dropped', () => {
    const many = Array.from({ length: MAX_CLAIMS + 5 }, () => base.hipLevel);
    const out = regradeClaims('modified', many);
    expect(out.camera).toHaveLength(1);
    expect(out.dropped).toHaveLength(MAX_CLAIMS + 4);
  });
});

describe('the pipeline', () => {
  it('provisional is the reward\'s own minimum (three different camera checks)', () => {
    expect(MIN_READABLE_CAMERA_CHECKS).toBe(MIN_CHECKS_FOR_REWARD);
    expect(MIN_READABLE_CAMERA_CHECKS).toBe(3);
  });

  it('claimFromGrade carries the numbers and the view, never the note', () => {
    const g: StationGrade = { ...(base.hipLevel as StationGrade), note: 'Hips read level.' };
    const c = claimFromGrade(g, 'front');
    expect(c).not.toHaveProperty('note');
    expect(c).toMatchObject({ checkId: 'hipLevel', view: 'front', value: 0, readableFrames: 420 });
  });

  it('reads `checks`, then the runner\'s `grades`, and the client\'s own `results` only when neither is there', () => {
    const bare = [{ checkId: 'hipLevel', grade: 'fail', source: 'camera' }];
    const a = decideScreenPost({ screenId: 's', grades: [base.hipLevel], results: bare }, 'a');
    expect(a.ok && a.outcome.results).toEqual([expect.objectContaining({ checkId: 'hipLevel', grade: 'stable' })]);
    const b = decideScreenPost({ screenId: 's', results: bare }, 'a');
    expect(b.ok && b.outcome.dropped).toEqual([{ checkId: 'hipLevel', reason: 'unverifiable' }]);
    const c = decideScreenPost({ screenId: 's', checks: [], grades: [base.hipLevel] }, 'a');
    expect(c.ok && c.outcome.camera).toEqual([]);
  });

  it('400 without a screen id; 422 with the refusals listed', () => {
    expect(decideScreenPost({ checks: [] }, 'a')).toMatchObject({ ok: false, status: 400 });
    expect(decideScreenPost(null, 'a')).toMatchObject({ ok: false, status: 400 });
    const r = decideScreenPost({ screenId: 's', checks: [{ ...base.hipLevel, value: 0.3 }] }, 'a');
    expect(r).toMatchObject({ ok: false, status: 422, body: { error: 'status_does_not_follow' } });
  });

  it('answers ride through, validated, and change nothing scored or paid', () => {
    const three = [base.hipLevel, base.shoulderLevel, base.headFloat];
    const a = decideScreenPost({ screenId: 's', checks: three }, 'a');
    const b = decideScreenPost({ screenId: 's', checks: three, answers: [{ questionId: 'lowerRibsWiden', answer: 'no' }, { questionId: 'x', answer: 'yes' }] }, 'a');
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(b.summary).toEqual(a.summary);
    expect(b.reward).toEqual(a.reward);
    expect(b.answers).toEqual([{ questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'no' }]);
  });
});

// MIRROR-COACH P3 review (2026-09-26)
describe('the review\'s cases', () => {
  it('one station is not a screen: the front stack alone (three checks) is provisional, unpaid', () => {
    const out = regradeClaims('modified', [base.kneeWindow, base.hipLevel, base.shoulderLevel]);
    expect(out).toMatchObject({ readableChecks: 3, readableStations: 1, provisional: true });
    const d = decideScreenPost({ screenId: 's', checks: [base.kneeWindow, base.hipLevel, base.shoulderLevel] }, 'a');
    if (!d.ok) throw new Error('expected ok');
    expect(d.reward.pay).toBe(false);
    expect(d.reward.message).toMatch(/^The camera read 3 checks \(Knee window, Hip level, Shoulder height\), all at one station — not enough to count as a screen/);
    // two stations, three checks: a screen
    expect(regradeClaims('modified', [base.hipLevel, base.shoulderLevel, base.headFloat])).toMatchObject({ readableStations: 2, provisional: false });
    expect(MIN_READABLE_CAMERA_STATIONS).toBe(2);
    expect(isScreenNotStation(screenCoverage('modified', [
      { checkId: 'singleLeg', grade: 'stable', side: 'left', source: 'camera' }, { checkId: 'singleLeg', grade: 'stable', side: 'right', source: 'camera' },
      { checkId: 'hipLevel', grade: 'stable', source: 'camera' },
    ]))).toBe(false);                                                         // two stations, but two checks
  });

  it('a check posted twice keeps the WORSE read: [pass, flag] stores the flag; [flag, pass] too', () => {
    const flag = honest('shoulderLevel', 0.2);
    expect(flag.status).toBe('flag');
    for (const order of [[base.shoulderLevel, flag], [flag, base.shoulderLevel]]) {
      const out = regradeClaims('modified', [...order, base.hipLevel, base.kneeWindow]);
      expect(out.camera.find((c) => c.checkId === 'shoulderLevel')!.status).toBe('flag');
      expect(out.results).toContainEqual(expect.objectContaining({ checkId: 'shoulderLevel', grade: 'fail' }));
      expect(out.dropped).toEqual([{ checkId: 'shoulderLevel', reason: 'duplicate' }]);
    }
    // a readable read over one that gave up, whichever came first
    const gaveUp = { ...base.hipLevel, status: 'unreadable' as const };
    expect(regradeClaims('modified', [gaveUp, base.hipLevel]).camera[0].status).toBe('pass');
  });

  it('counts no hold of the station could make are dropped as malformed, not stored or printed', () => {
    const tooFew = { ...base.singleLeg, frames: 30, readableFrames: 30, stanceSec: 20 };
    const forever = { ...base.singleLeg, stanceSec: 1e6 };
    const tooMany = { ...base.hipLevel, frames: 14 * 121, readableFrames: 14 * 121 };
    for (const c of [tooFew, forever, tooMany]) {
      const out = regradeClaims('modified', [c]);
      expect(out.camera, JSON.stringify(c).slice(0, 60)).toEqual([]);
      expect(out.dropped).toEqual([{ checkId: c.checkId, reason: 'malformed' }]);
    }
    // the honest runner's counts pass (30 s hold, 30 fps)
    expect(regradeClaims('modified', [base.singleLeg]).camera).toHaveLength(1);
  });

  it('the read line: what was read, and the commonest reason with its one fix — never "step back and run it again"', () => {
    const tooSmall = (c: CameraCheckClaim) => ({ ...c, status: 'unreadable' as const, value: null, readableFrames: 3, uncertainty: null, spread: null, reason: 'tooSmall' as const, bySide: undefined });
    const out = regradeClaims('modified', [base.hipLevel, base.shoulderLevel, tooSmall(base.headFloat), tooSmall(base.heelLine), tooSmall(base.kneeWindow)]);
    const line = screenReadLine(out)!;
    expect(line).toBe('The camera read 2 checks (Hip level, Shoulder height), all at one station — not enough to count as a screen, so it pays nothing this time. Most of the rest: you were too small in the shot to read this. Come a little closer to the phone.');
    expect(line).not.toMatch(/step back|run it again/i);
    expect(screenText(line)).toEqual([]);
    // nothing read at all
    const none = regradeClaims('modified', [tooSmall(base.hipLevel), tooSmall(base.headFloat)]);
    expect(screenReadLine(none)).toMatch(/^The camera could not read any of this screen's checks, so it does not count and pays nothing\. Most of the rest: you were too small/);
    // a screen that counts, or one with no camera claims, has no read line
    expect(screenReadLine(regradeClaims('modified', [base.hipLevel, base.shoulderLevel, base.headFloat]))).toBeNull();
    expect(screenReadLine(regradeClaims('modified', []))).toBeNull();
  });

  it('a wrong-leg single-leg read names the leg in its fix', () => {
    const wrong = { ...base.singleLeg, status: 'unreadable' as const, value: null, readableFrames: 900, uncertainty: null, reason: 'wrongLeg' as const };
    const line = screenReadLine(regradeClaims('modified', [base.hipLevel, wrong]))!;
    expect(line).toMatch(/Stand on your LEFT leg\.$/);
  });
});
