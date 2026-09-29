// The Movement Screen's station graders (MIRROR-COACH P3, 2026-09-26) on P1's landmark-fixture harness: bodies built in
// 3-D and filmed through the app's own virtual webcam (lib/mirror/fixtures), clean and under the synth's jitter.
//
// For every check: a clean body passes, a clear fault flags (on the right side), the wrong view / a dim shot / a body
// half out of the shot is UNREADABLE, and a mirrored (selfie) stream grades the same as the unmirrored one. Then: the
// threshold table is the only place a number lives, unreadable never becomes a pass anywhere downstream, the server's
// regrade agrees with the client and cannot be talked into a pass, and no line the graders say breaks the copy rules.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screenText } from '@/lib/share/screen';
import { LEFT_FOOT_INDEX, LEFT_HEEL, NOSE, RIGHT_ANKLE, RIGHT_FOOT_INDEX, RIGHT_HEEL } from '@/lib/pose/landmarks';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { toAdapterFrames } from './fixtures/index';
import { readFixture } from './fixtures/load';
import {
  JITTER, STATION_ASPECT, dimmed, film, mirrored, rolled, shifted, singleLegClip, standClip, standPose, tiltHeel, toBack,
  toOtherSide, toSide, turnFoot, withStepOff, type StandShape,
} from './fixtures/stations';
import {
  GRADER_IDS, GRADER_VIEW, HEAD_TURNED_HINT, RETEST_HINT, STATION_THRESHOLDS, decideGrade, formatGradeValue, gradeScreenStation, gradeStation,
  measureStation, minReadableFrames, notReadStation, regradeFromSummary, resultsFromGrades, retestHintFor, toCheckResult, unreadableLine,
  type GraderId, type StationGrade, type UnreadableReason,
} from './stationGraders';
import { FULL_SCREEN, MODIFIED_SCREEN, scoreScreen, type StationView } from './screen';

const OPT = { aspect: STATION_ASPECT };
type Joints = ReturnType<typeof standPose>;
const front = (o: StandShape = {}, sec = 14, seed?: number) => film(standClip(standPose(o), sec), seed ? JITTER(seed) : undefined);
const turned = (turn: (j: Joints) => Joints, o: StandShape = {}, sec = 10, seed?: number) =>
  film(standClip(turn(standPose(o)), sec), seed ? JITTER(seed) : undefined);
const oneLeg = (o: Parameters<typeof singleLegClip>[0], seed?: number) => film(singleLegClip(o), seed ? JITTER(seed) : undefined);

/** Every check, its view, a clean body, a clear fault (+ the side it should name), and a body facing the wrong way. */
interface Case { check: GraderId; view: StationView; stance?: 'left' | 'right'; clean: (seed?: number) => PoseFrame[]; fault: (seed?: number) => PoseFrame[]; faultSide?: 'left' | 'right'; wrongWay: () => PoseFrame[] }
const CASES: Case[] = [
  { check: 'shoulderLevel', view: 'front', clean: (s) => front({}, 14, s), fault: (s) => front({ shoulderUp: { side: 'left', cm: 5 } }, 14, s), faultSide: 'left', wrongWay: () => turned(toSide, {}, 14) },
  { check: 'hipLevel', view: 'front', clean: (s) => front({}, 14, s), fault: (s) => front({ hipDrop: { side: 'right', cm: 5 } }, 14, s), faultSide: 'left', wrongWay: () => turned(toBack, {}, 14) },
  { check: 'kneeWindow', view: 'front', clean: (s) => front({ kneeIn: {} }, 14, s), fault: (s) => front({ kneeIn: { right: 6 } }, 14, s), faultSide: 'right', wrongWay: () => turned(toSide, {}, 14) },
  { check: 'headFloat', view: 'side', clean: (s) => turned(toSide, {}, 10, s), fault: (s) => turned(toSide, { headForwardCm: 9 }, 10, s), wrongWay: () => front({}, 10) },
  { check: 'heelLine', view: 'back', clean: (s) => turned(toBack, {}, 12, s), fault: (s) => tiltHeel(turned(toBack, {}, 12, s), 'right', 18), faultSide: 'right', wrongWay: () => front({}, 12) },
  { check: 'singleLeg', view: 'front', stance: 'left', clean: (s) => oneLeg({ stance: 'left', swayCm: 0.3, swayHz: 0.5 }, s), fault: (s) => oneLeg({ stance: 'left', swayCm: 3, swayHz: 1 }, s), faultSide: 'left', wrongWay: () => film(singleLegClip({ stance: 'left' }).frames.length ? { fps: 30, frames: singleLegClip({ stance: 'left' }).frames.map(toSide) } : singleLegClip({ stance: 'left' })) },
];
const grade = (c: Case, frames: readonly PoseFrame[], view: StationView = c.view) => gradeStation(c.check, frames, view, { ...OPT, stance: c.stance });

describe('every camera check: pass, flag, unreadable, mirrored', () => {
  it('there is a grader for every camera check in both screens, and for nothing else', () => {
    for (const screen of [MODIFIED_SCREEN, FULL_SCREEN]) {
      for (const st of screen) for (const c of st.checks) {
        if (c.source === 'camera') {
          expect(c.grader, c.id).toBe(c.id);
          expect(GRADER_VIEW[c.grader!], `${c.id} is read from its station's view`).toBe(st.view);
        } else expect(c.grader, `${c.id} (${c.source}) is not the camera's`).toBeUndefined();
      }
    }
    expect([...GRADER_IDS].sort()).toEqual(['headFloat', 'heelLine', 'hipLevel', 'kneeWindow', 'shoulderLevel', 'singleLeg']);
    expect(FULL_SCREEN.find((s) => s.id === 'wobbleL')?.stance).toBe('left');
    expect(FULL_SCREEN.find((s) => s.id === 'wobbleR')?.stance).toBe('right');
  });

  for (const c of CASES) {
    describe(c.check, () => {
      it('a clean body passes — clean, and under the synth\'s jitter on 5 seeds', () => {
        const g = grade(c, c.clean());
        expect(g.status, g.note).toBe('pass');
        expect(g.value).not.toBeNull();
        expect(g.readableFrames).toBe(g.frames);
        for (const seed of [1, 2, 3, 4, 5]) expect(grade(c, c.clean(seed)).status, `seed ${seed}`).toBe('pass');
      });

      it('a clear fault is flagged for a closer look, on the side it is on', () => {
        const g = grade(c, c.fault());
        expect(g.status, g.note).toBe('flag');
        expect(g.note).toMatch(/flagged for a closer look/i);
        if (c.faultSide) expect(g.side).toBe(c.faultSide);
        for (const seed of [1, 2, 3]) expect(grade(c, c.fault(seed)).status, `seed ${seed}`).toBe('flag');
      });

      it('the wrong view is unreadable — declared wrong, or a body facing the wrong way', () => {
        const other: StationView = c.view === 'front' ? 'side' : 'front';
        const declared = grade(c, c.clean(), other);
        expect(declared.status).toBe('unreadable');
        expect(declared.reason).toBe('wrongView');
        expect(declared.value).toBeNull();
        const facing = grade(c, c.wrongWay());
        expect(facing.status, facing.note).toBe('unreadable');
        expect(facing.reason).toBe('wrongView');
      });

      it('a dim shot is unreadable', () => {
        const g = grade(c, dimmed(c.clean(), 0.4));
        expect(g.status).toBe('unreadable');
        expect(g.reason).toBe('lowVisibility');
      });

      it('a body half out of the shot is unreadable', () => {
        const g = grade(c, shifted(c.clean(), 0.52));      // the body's middle just past the right edge
        expect(g.status, g.note).toBe('unreadable');
        expect(['outOfFrame', 'noBody', 'wrongView']).toContain(g.reason);
        const low = grade(c, shifted(c.clean(), 0, 0.3));   // feet below the bottom edge
        expect(low.status, low.note).toBe('unreadable');
      });

      it('a mirrored (selfie) camera grades the same as the unmirrored one', () => {
        for (const make of [c.clean, c.fault]) {
          // MIRROR-COACH P3 review (2026-09-26): the single-leg stance checks the leg it saw against the station's by
          // MediaPipe's labels, which a mirrored stream swaps — so the mirrored take is the same grade AT THE OTHER
          // STATION'S LEG, and at its own it reads 'wrongLeg' (the Mirror's stream is not mirrored: landmarks.ts:9-10)
          const other = c.stance === 'left' ? 'right' : 'left';
          const a = grade(c, make());
          const b = c.check === 'singleLeg'
            ? gradeStation(c.check, mirrored(make()), c.view, { ...OPT, stance: other })
            : grade(c, mirrored(make()));
          expect(b.status).toBe(a.status);
          expect(Math.abs(b.value!)).toBeCloseTo(Math.abs(a.value!), 6);
          expect(b.readableFrames).toBe(a.readableFrames);
          // a one-sided label leans on MediaPipe's labels, which a mirrored stream swaps
          if (a.side) expect(b.side).toBe(a.side === 'left' ? 'right' : 'left');
          if (c.check === 'singleLeg') {
            const own = grade(c, mirrored(make()));
            expect(own.status).toBe('unreadable');
            expect(own.reason).toBe('wrongLeg');
          }
        }
      });
    });
  }
});

describe('what each grader reads, in numbers (synthetic, estimated)', () => {
  it('level: + is the LEFT side higher, over the shoulder width; a 5 cm raise is ~0.13, 2 cm ~0.05 (under the line)', () => {
    const up5 = gradeStation('shoulderLevel', front({ shoulderUp: { side: 'left', cm: 5 } }), 'front', OPT);
    expect(up5.value).toBeCloseTo(0.13, 2);
    const up2 = gradeStation('shoulderLevel', front({ shoulderUp: { side: 'right', cm: 2 } }), 'front', OPT);
    expect(up2.value).toBeCloseTo(-0.053, 2);
    expect(up2.status).toBe('pass');
    const hip = gradeStation('hipLevel', front({ hipDrop: { side: 'left', cm: 5 } }), 'front', OPT);
    expect(hip.value!).toBeLessThan(-STATION_THRESHOLDS.hipLevel.flagAt);   // the RIGHT hip is the higher one
    expect(hip.side).toBe('right');
  });

  it('level reads are taken against the body\'s own vertical: a phone propped 6° crooked does not flag a level stance', () => {
    for (const deg of [6, -6]) {
      const clean = gradeStation('shoulderLevel', rolled(front(), deg), 'front', OPT);
      expect(clean.status, `${deg}° ${clean.note}`).toBe('pass');
      expect(Math.abs(clean.value!)).toBeLessThan(0.01);
      expect(gradeStation('hipLevel', rolled(front(), deg), 'front', OPT).status).toBe('pass');
      const up = gradeStation('shoulderLevel', rolled(front({ shoulderUp: { side: 'left', cm: 5 } }), deg), 'front', OPT);
      expect(up.status).toBe('flag');
      expect(up.side).toBe('left');
      expect(up.value!).toBeCloseTo(0.13, 2);
    }
    // a phone that crooked is past the line: nothing is read
    const far = gradeStation('shoulderLevel', rolled(front(), 14), 'front', OPT);
    expect(far.status).toBe('unreadable');
    expect(far.reason).toBe('notUpright');
  });

  it('knee: each side against its own hip–ankle line (squat-audit kneeInwardRatio) — inside is +, both sides reported', () => {
    const g = gradeStation('kneeWindow', front({ kneeIn: { left: 6 } }), 'front', OPT);
    expect(g.bySide!.left).toBeGreaterThan(STATION_THRESHOLDS.kneeWindow.flagAt);
    expect(Math.abs(g.bySide!.right)).toBeLessThan(0.1);
    expect(g.side).toBe('left');
    const both = gradeStation('kneeWindow', front({ kneeIn: { left: 6, right: 6 } }), 'front', OPT);
    expect(both.status).toBe('flag');
    expect(both.side).toBeUndefined();                     // bilateral: no one side
    const three = gradeStation('kneeWindow', front({ kneeIn: { left: 3 } }), 'front', OPT);
    expect(three.status).toBe('pass');                     // ~0.32: under the conservative line
  });

  it('head: the ear ahead of the shoulder, whichever shoulder faces the camera', () => {
    const a = gradeStation('headFloat', turned(toSide, { headForwardCm: 9 }), 'side', OPT);
    const b = gradeStation('headFloat', turned(toOtherSide, { headForwardCm: 9 }), 'side', OPT);
    expect(a.value!).toBeGreaterThan(0.2);
    expect(b.value!).toBeCloseTo(a.value!, 2);
    expect(gradeStation('headFloat', turned(toSide), 'side', OPT).value!).toBeLessThan(0.03);
  });

  it('heel line: + = heel outside its ankle; a tilt both heels share is not the check\'s finding', () => {
    const one = gradeStation('heelLine', tiltHeel(turned(toBack, {}, 12), 'left', 18), 'back', OPT);
    expect(one.bySide!.left - one.bySide!.right).toBeCloseTo(18, 0);
    const both = gradeStation('heelLine', tiltHeel(tiltHeel(turned(toBack, {}, 12), 'left', 18), 'right', 18), 'back', OPT);
    expect(both.status).toBe('pass');
    expect(both.value!).toBeGreaterThan(STATION_THRESHOLDS.heelLine.flagAt);
  });

  it('one leg: touch-downs are counted after the knee first comes up, and one is a flag', () => {
    const g = gradeStation('singleLeg', oneLeg({ stance: 'right', touchDownsAt: [10, 20] }), 'front', { ...OPT, stance: 'right' });
    expect(g.touchDowns).toBe(2);
    expect(g.status).toBe('flag');
    expect(g.side).toBe('right');
    const steady = gradeStation('singleLeg', oneLeg({ stance: 'right' }), 'front', { ...OPT, stance: 'right' });
    expect(steady.touchDowns).toBe(0);
    expect(steady.stanceSec!).toBeGreaterThan(28);
  });

  // MIRROR-COACH P3 live proof (2026-09-26): the right-leg station counted 3 touch-downs on a body with 2 — the hold
  // started while the left station's free foot was still up, and putting it down read as a touch-down.
  it('one leg: the previous station\'s foot still up as the hold starts is not a touch-down', () => {
    for (const stance of ['left', 'right'] as const) {
      const g = gradeStation('singleLeg', oneLeg({ stance, startOnOtherLegSec: 1.5 }), 'front', { ...OPT, stance });
      expect(g.touchDowns, stance).toBe(0);
      expect(g.status, g.note).toBe('pass');
      const two = gradeStation('singleLeg', oneLeg({ stance, startOnOtherLegSec: 1.5, touchDownsAt: [9, 18] }), 'front', { ...OPT, stance });
      expect(two.touchDowns, stance).toBe(2);
      // mirrored, the labels swap for the whole station alike: graded at the other leg, the same two touch-downs
      const mir = gradeStation('singleLeg', mirrored(oneLeg({ stance, startOnOtherLegSec: 1.5, touchDownsAt: [9, 18] })), 'front',
        { ...OPT, stance: stance === 'left' ? 'right' : 'left' });
      expect(mir.touchDowns, `${stance} mirrored`).toBe(2);
    }
  });

  it('a value that rounds to zero names no side', () => {
    const lvl = gradeStation('hipLevel', front(), 'front', OPT);
    expect(formatGradeValue(lvl)).not.toMatch(/left|right/);
    const knee = gradeStation('kneeWindow', front({ kneeIn: { left: 6 } }), 'front', OPT);
    expect(formatGradeValue(knee)).toMatch(/L 0\.\d\d in · R (0\.00|0\.0\d (in|out))/);
  });

  it('one leg: the free foot never coming up, or too short a stance, is unreadable — not a pass', () => {
    const never = gradeStation('singleLeg', oneLeg({ stance: 'left', neverLift: true }), 'front', { ...OPT, stance: 'left' });
    expect(never.status).toBe('unreadable');
    expect(never.reason).toBe('notStarted');
    const short = gradeStation('singleLeg', oneLeg({ stance: 'left', settleSec: 20, holdSec: 10 }), 'front', { ...OPT, stance: 'left' });
    expect(short.status).toBe('unreadable');
    expect(short.reason).toBe('tooShort');
    // P1's one-second single-leg file is a pose, not a thirty-second stance
    const p1 = gradeStation('singleLeg', toAdapterFrames(readFixture('single_leg_left')), 'front', { ...OPT, stance: 'left' });
    expect(p1.status).toBe('unreadable');
  });

  it('one leg: sway under the jitter floor is never a flag, and jitter that could reach the line is unreadable', () => {
    // the synth's jitter alone draws ~0.035 torso lengths a second; a still stance under it passes
    const still = gradeStation('singleLeg', oneLeg({ stance: 'left' }, 7), 'front', { ...OPT, stance: 'left' });
    expect(still.status).toBe('pass');
    expect(still.uncertainty!).toBeGreaterThan(0.02);
    // four times the synth's jitter: its floor times the margin reaches the flag line — the camera cannot tell
    const loud = film(singleLegClip({ stance: 'left' }), { ...JITTER(7), noise: { imageTorso: 0.008, imageLimb: 0.012 } });
    const g = gradeStation('singleLeg', loud, 'front', { ...OPT, stance: 'left' });
    expect(g.status).toBe('unreadable');
    expect(g.reason).toBe('tooNoisy');
  });

  it('the P1 files grade as they should: the standing fixtures pass their stations\' checks', () => {
    const stand = toAdapterFrames(readFixture('stand_front'));
    for (const id of ['shoulderLevel', 'hipLevel', 'kneeWindow'] as const) expect(gradeStation(id, stand, 'front', OPT).status, id).toBe('pass');
    expect(gradeStation('headFloat', toAdapterFrames(readFixture('stand_side')), 'side', OPT).status).toBe('pass');
    expect(gradeStation('heelLine', toAdapterFrames(readFixture('stand_back')), 'back', OPT).status).toBe('pass');
  });

  it('a station grades every camera check it carries, over the same frames, and no other', () => {
    const frontStack = MODIFIED_SCREEN.find((s) => s.id === 'frontStack')!;
    const gs = gradeScreenStation(frontStack, front(), OPT);
    expect(gs.map((g) => g.checkId)).toEqual(['kneeWindow', 'hipLevel', 'shoulderLevel']);
    expect(gs.every((g) => g.stationId === 'frontStack' && g.status === 'pass')).toBe(true);
    expect(gradeScreenStation(MODIFIED_SCREEN.find((s) => s.id === 'breath')!, front(), OPT)).toEqual([]);
    const wobbleR = MODIFIED_SCREEN.find((s) => s.id === 'wobbleR')!;
    expect(gradeScreenStation(wobbleR, oneLeg({ stance: 'right' }), OPT)[0].side).toBe('right');
  });
});

// MIRROR-COACH P3 review (2026-09-26): the review's adversarial cases, each a test. scripts/probes/_station-graders-p3-review.ts
// prints the same cases over more seeds.
describe('the review\'s cases (MIRROR-COACH P3 review)', () => {
  const at = (o: Parameters<typeof singleLegClip>[0], fps: number, seed: number, noise?: { imageTorso?: number; imageLimb?: number }) =>
    film(singleLegClip(o), { ...JITTER(seed), fps, ...(noise ? { noise } : {}) });
  const left = (frames: PoseFrame[]) => gradeStation('singleLeg', frames, 'front', { ...OPT, stance: 'left' });

  it('one leg: the same body grades the same at 15, 30 and 60 fps; under ~14 fps it is lowRate, never a pass', () => {
    for (const fps of [15, 30, 60]) {
      for (const seed of [1, 2, 3]) {
        expect(left(at({ stance: 'left', swayCm: 0.3, swayHz: 0.5 }, fps, seed)).status, `still ${fps} fps seed ${seed}`).toBe('pass');
        const wobble = left(at({ stance: 'left', swayCm: 3, swayHz: 1 }, fps, seed));
        expect(wobble.status, `wobble ${fps} fps seed ${seed}`).toBe('flag');
        expect(wobble.value!).toBeCloseTo(0.21, 1);           // the value does not depend on the rate either
        expect(left(at({ stance: 'left', touchDownsAt: [10] }, fps, seed)).touchDowns, `touch-down ${fps} fps`).toBe(1);
      }
    }
    // the review's case: at 10 fps the 3 cm wobble read 0.064, a PASS; at 8 fps 0.025
    for (const fps of [8, 10]) {
      for (const shape of [{ swayCm: 3, swayHz: 1 }, { swayCm: 0.3, swayHz: 0.5 }, { touchDownsAt: [10] }]) {
        const g = left(at({ stance: 'left', ...shape }, fps, 1));
        expect(g.status, `${fps} fps ${JSON.stringify(shape)}`).toBe('unreadable');
        expect(g.reason).toBe('lowRate');
      }
    }
  });

  it('one leg: ankle jitter on both feet before the first real lift is never a touch-down (20 takes each)', () => {
    for (const k of [2, 3, 5]) {
      for (let seed = 1; seed <= 20; seed++) {
        const g = left(film(singleLegClip({ stance: 'left', swayCm: 0.3, swayHz: 0.5, settleSec: 4, holdSec: 26 }),
          { ...JITTER(seed), noise: { imageLimb: 0.004 * k } }));
        expect(g.status, `limb jitter ×${k} seed ${seed}: ${g.note}`).not.toBe('flag');
        if (k === 2) expect(g.status, `×2 seed ${seed}`).toBe('pass');
      }
    }
  });

  it('one leg: the camera seeing the OTHER leg up is wrongLeg, and the retest names the leg', () => {
    const g = left(oneLeg({ stance: 'right', swayCm: 3, swayHz: 1 }));
    expect(g.status).toBe('unreadable');
    expect(g.reason).toBe('wrongLeg');
    expect(g.side).toBe('left');
    expect(retestHintFor(g)).toBe('Stand on your LEFT leg.');
    expect(toCheckResult(g)).toBeNull();
  });

  it('one leg: the jitter is taken out of the reported sway, and a sway under the line never flags under jitter', () => {
    const cleanStill = left(oneLeg({ stance: 'left', swayCm: 0.3, swayHz: 0.5 }));
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const still = left(oneLeg({ stance: 'left', swayCm: 0.3, swayHz: 0.5 }, seed));
      expect(still.value!, `still seed ${seed}`).toBeLessThan(cleanStill.value! + 0.02);   // was ~3× the clean read
      for (const k of [1, 3]) {
        const g = left(at({ stance: 'left', swayCm: 1.5, swayHz: 1 }, 30, seed, { imageTorso: 0.002 * k, imageLimb: 0.004 * k }));
        expect(g.status, `1.5 cm sway, jitter ×${k}, seed ${seed}: ${g.note}`).not.toBe('flag');
        if (g.value !== null) expect(g.value).toBeLessThan(STATION_THRESHOLDS.singleLeg.swayFlagAt);
      }
    }
  });

  it('one leg: stepping off in the last seconds is the end of the hold; earlier, it is a touch-down', () => {
    const off = (early: number, seed: number) => left(film(withStepOff(singleLegClip({ stance: 'left', settleSec: 1, holdSec: 29 }), early), JITTER(seed)));
    for (const seed of [1, 2]) {
      for (const early of [0.2, 0.6, 2]) {
        const g = off(early, seed);
        expect(g.touchDowns, `${early} s early`).toBe(0);
        expect(g.status, `${early} s early`).toBe('pass');
      }
      expect(off(10, seed).touchDowns).toBe(1);
      expect(off(10, seed).status).toBe('flag');
    }
  });

  it('heel line: a foot turned in (heels untilted) is feetTurned, not a tilted heel; feet turned out alike still read', () => {
    const back = (l: number, r: number, seed?: number) =>
      film(standClip(toBack(turnFoot(turnFoot(standPose(), 'left', l), 'right', r)), 12), seed ? JITTER(seed) : undefined);
    for (const deg of [20, 30, 40]) {
      const g = gradeStation('heelLine', back(deg, 0), 'back', OPT);
      expect(g.status, `${deg}°`).toBe('unreadable');
      expect(g.reason).toBe('feetTurned');
    }
    for (const seed of [1, 2, 3]) expect(gradeStation('heelLine', back(-15, -15, seed), 'back', OPT).status).toBe('pass');
    expect(gradeStation('heelLine', back(10, 0), 'back', OPT).status).toBe('pass');
    // a real one-sided tilt with the feet straight still flags (the fault fixture above), and the turn gate is the table's
    expect(STATION_THRESHOLDS.heelLine.footTurnMaxDiff).toBeGreaterThan(0);
  });

  it('head: the far ankle half hidden from the side (visibility 0.45) still reads the head, from the near ankle', () => {
    for (const vis of [0.45, 0.55]) {
      const frames = turned(toSide, { headForwardCm: 9 }, 10, 1)
        .map((f) => ({ ...f, landmarks: f.landmarks.map((l, i) => (i === RIGHT_ANKLE ? { ...l, visibility: vis } : l)) }));
      const g = gradeStation('headFloat', frames, 'side', OPT);
      expect(g.status, `${vis}: ${g.note}`).toBe('flag');
    }
  });

  it('a read within its own uncertainty of the line is tooNoisy, not a coin toss; clear of it, a flag or a pass', () => {
    const u = 0.01;
    const base = { checkId: 'headFloat' as const, frames: 300, readableFrames: 300, uncertainty: u, spread: 0.02 };
    const line = STATION_THRESHOLDS.headFloat.flagAt;
    expect(decideGrade({ ...base, value: line + u / 2 }).reason).toBe('tooNoisy');
    expect(decideGrade({ ...base, value: line - u / 2 }).reason).toBe('tooNoisy');
    expect(decideGrade({ ...base, value: line + 2 * u }).status).toBe('flag');
    expect(decideGrade({ ...base, value: line - 2 * u }).status).toBe('pass');
    // the level reads, both ways round
    const lvl = { checkId: 'hipLevel' as const, frames: 300, readableFrames: 300, uncertainty: u, spread: 0.02 };
    expect(decideGrade({ ...lvl, value: -(STATION_THRESHOLDS.hipLevel.flagAt + u / 2) }).reason).toBe('tooNoisy');
    expect(decideGrade({ ...lvl, value: -(STATION_THRESHOLDS.hipLevel.flagAt + 2 * u) }).status).toBe('flag');
  });

  it('a phone turned mid-hold is cameraMoved; a frame read with its own aspect grades as the station aspect would', () => {
    const f = front({ shoulderUp: { side: 'left', cm: 2.5 } }, 14, 1);
    const turnedMid = f.map((x, i) => ({ ...x, aspect: i < f.length / 2 ? STATION_ASPECT : 1 / STATION_ASPECT }));
    const g = gradeStation('shoulderLevel', turnedMid, 'front', OPT);
    expect(g.status).toBe('unreadable');
    expect(g.reason).toBe('cameraMoved');
    // the review's case: a landscape stream graded at a portrait default read a 2.5 cm raise as a flag
    const own = gradeStation('shoulderLevel', f.map((x) => ({ ...x, aspect: STATION_ASPECT })), 'front', { aspect: 1 / STATION_ASPECT });
    expect(own.status).toBe('pass');
    expect(own.value!).toBeCloseTo(gradeStation('shoulderLevel', f, 'front', OPT).value!, 6);
  });

  it('the server bounds the counts by the station: frames, seconds on one leg', () => {
    const pass = gradeStation('singleLeg', oneLeg({ stance: 'left' }), 'front', { ...OPT, stance: 'left' });
    expect(regradeFromSummary(pass, { holdSec: 30 })?.status).toBe('pass');
    expect(regradeFromSummary({ ...pass, frames: 30, readableFrames: 30, stanceSec: 20 }, { holdSec: 30 })).toBeNull();
    expect(regradeFromSummary({ ...pass, stanceSec: 1e6 }, { holdSec: 30 })).toBeNull();
    expect(regradeFromSummary({ ...pass, frames: 30 * 121, readableFrames: 30 * 121 }, { holdSec: 30 })).toBeNull();
    const lvl = gradeStation('hipLevel', front(), 'front', OPT);
    expect(regradeFromSummary({ ...lvl, frames: 14 * 121, readableFrames: 14 * 121 }, { holdSec: 14 })).toBeNull();
  });
});

describe('unreadable is never pass', () => {
  it('too few readable frames, however good the value, is unreadable', () => {
    const frames = front({}, 14);
    const few = frames.slice(0, STATION_THRESHOLDS.common.minReadableFrames - 1);
    expect(gradeStation('shoulderLevel', few, 'front', OPT).status).toBe('unreadable');
    // most of the hold unreadable (a sliver read) is unreadable too
    const mostlyDim = [...dimmed(frames.slice(0, 300), 0.4), ...frames.slice(300)];
    const g = gradeStation('shoulderLevel', mostlyDim, 'front', OPT);
    expect(g.readableFrames).toBe(frames.length - 300);
    expect(g.readableFrames).toBeLessThan(minReadableFrames(frames.length));
    expect(g.status).toBe('unreadable');
  });

  it('an unreadable grade becomes no result, so the screen lists it as not measured and never reads it as clean', () => {
    const shoulder = gradeStation('shoulderLevel', front(), 'front', OPT);
    const knee = gradeStation('kneeWindow', dimmed(front(), 0.4), 'front', OPT);
    expect(knee.status).toBe('unreadable');
    expect(toCheckResult(knee)).toBeNull();
    const results = resultsFromGrades([shoulder, knee]);
    expect(results.map((r) => r.checkId)).toEqual(['shoulderLevel']);
    const s = scoreScreen('modified', results);
    expect(s.triage).not.toBe('proceed');
    // CHANGED ON PURPOSE in the MIRROR-COACH P3 follow-up (2026-09-28), owner decision #31: this pinned `score` null (only
    // a complete screen was scored). The score is now over the checks that WERE read — here the one shoulder pass, 100 —
    // always said with its count, and the knee is listed as not read. It still is not 'proceed' and never "clear".
    expect(s.score).toBe(100);
    expect(s).toMatchObject({ readCount: 1, totalCount: 6 });
    expect(s.notRead).toContain('Knee window');
    expect(s.notMeasured.join(' ')).toMatch(/Knee window/);
  });

  it('every way a measurement fails is unreadable, whatever the value says', () => {
    const base = { checkId: 'hipLevel' as const, frames: 300, readableFrames: 300, value: 0, uncertainty: 0, spread: 0 };
    for (const reason of ['wrongView', 'noBody', 'outOfFrame', 'lowVisibility', 'notUpright', 'tooSmall', 'tooFewFrames', 'tooNoisy', 'faceFeetUnseen'] as UnreadableReason[]) {
      expect(decideGrade({ ...base, reason }).status, reason).toBe('unreadable');
    }
    expect(decideGrade({ ...base, uncertainty: STATION_THRESHOLDS.hipLevel.maxUncertainty * 2 }).status).toBe('unreadable');
    expect(decideGrade({ ...base, spread: STATION_THRESHOLDS.hipLevel.maxSpread * 2 }).status).toBe('unreadable');
    expect(decideGrade({ ...base, uncertainty: null }).status).toBe('unreadable');
    expect(decideGrade({ ...base, value: null }).status).toBe('unreadable');
    expect(decideGrade({ ...base, value: NaN }).status).toBe('unreadable');
    expect(decideGrade(base).status).toBe('pass');
  });

  it('a pass carries its side only where the screen needs it: singleLeg names its leg; other passes carry none', () => {
    const leg = gradeStation('singleLeg', oneLeg({ stance: 'left' }), 'front', { ...OPT, stance: 'left' });
    expect(toCheckResult(leg)).toMatchObject({ checkId: 'singleLeg', grade: 'stable', side: 'left', source: 'camera' });
    const lvl = gradeStation('shoulderLevel', front(), 'front', OPT);
    expect(toCheckResult(lvl)).toEqual({ checkId: 'shoulderLevel', grade: 'stable', source: 'camera', detail: formatGradeValue(lvl) });
    const flag = gradeStation('shoulderLevel', front({ shoulderUp: { side: 'right', cm: 5 } }), 'front', OPT);
    expect(toCheckResult(flag)).toMatchObject({ grade: 'fail', side: 'right' });
  });
});

describe('the server re-decides a grade from its summary numbers (regradeFromSummary)', () => {
  const all = (): StationGrade[] => CASES.flatMap((c) => [grade(c, c.clean()), grade(c, c.fault()), grade(c, dimmed(c.clean(), 0.4))]);

  it('agrees with the client on every grade the client makes, through JSON', () => {
    for (const g of all()) {
      const back = regradeFromSummary(JSON.parse(JSON.stringify(g)));
      expect(back, g.checkId).not.toBeNull();
      expect(back!.status, `${g.checkId} ${g.note}`).toBe(g.status);
      expect(back!.side).toBe(g.side);
      expect(back!.value).toBe(g.value);
    }
  });

  it('ignores the posted status, note and side: a value over the line is a flag whatever the client said', () => {
    const flag = grade(CASES[0], CASES[0].fault());
    const lied = { ...JSON.parse(JSON.stringify(flag)), status: 'pass', note: 'Shoulders read level.', side: 'right' };
    const back = regradeFromSummary(lied)!;
    expect(back.status).toBe('flag');
    expect(back.side).toBe('left');
  });

  it('a pass claimed from a dozen frames, or with no value, is unreadable; a knee pass is re-read from its sides', () => {
    const pass = grade(CASES[0], CASES[0].clean());
    expect(regradeFromSummary({ ...pass, readableFrames: 12, frames: 12 })!.status).toBe('unreadable');
    expect(regradeFromSummary({ ...pass, value: null })!.status).toBe('unreadable');
    const knee = grade(CASES[2], CASES[2].clean());
    const claimed = regradeFromSummary({ ...knee, value: 0, bySide: { left: 0.9, right: 0 } })!;
    expect(claimed.status).toBe('flag');                  // the sides say a knee sat well inside its line
    expect(claimed.side).toBe('left');
  });

  it('refuses malformed summaries rather than guessing', () => {
    const pass = grade(CASES[0], CASES[0].clean());
    for (const bad of [
      null, 'x', {}, { ...pass, checkId: 'ribAngle' }, { ...pass, checkId: 'pelvicTilt' }, { ...pass, unit: 'deg' },
      { ...pass, frames: -1 }, { ...pass, readableFrames: pass.frames + 1 }, { ...pass, frames: 1.5 }, { ...pass, value: 'level' },
      { ...grade(CASES[2], CASES[2].clean()), bySide: undefined },
      { ...grade(CASES[5], CASES[5].clean()), touchDowns: undefined },
    ]) expect(regradeFromSummary(bad), JSON.stringify(bad)?.slice(0, 80)).toBeNull();
  });
});

describe('the table is the only source of numbers', () => {
  it('no numeric literal in stationGraders.ts outside STATION_THRESHOLDS except 0, 1 and 2', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/mirror/stationGraders.ts'), 'utf8');
    const start = src.indexOf('export const STATION_THRESHOLDS = {');
    const end = src.indexOf('} as const;', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const code = (src.slice(0, start) + src.slice(end))
      .replace(/\/\*[\s\S]*?\*\//g, '')                // block comments
      .replace(/\/\/.*$/gm, '')                        // line comments
      // a template literal keeps only its ${…} expressions (a number inside one is code, and is checked)
      .replace(/`(?:[^`\\]|\\.)*`/g, (m) => ` ${[...m.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]).join(' ; ')} `)
      .replace(/'(?:[^'\\]|\\.)*'/g, "''");            // string literals
    const nums = [...code.matchAll(/(?<![\w.])(\d+(?:\.\d+)?(?:e-?\d+)?)(?![\w])/g)].map((m) => m[1]);
    const stray = nums.filter((n) => !['0', '1', '2'].includes(n));
    expect(stray, `numbers outside STATION_THRESHOLDS: ${stray.join(', ')}`).toEqual([]);
  });

  it('every threshold the graders compare against is in the table, and none is a book number', () => {
    const T = STATION_THRESHOLDS;
    expect(T.common.minVisibility).toBeGreaterThan(0.45);                 // above every synth hidden-point level
    expect(T.common.minReadableFrames).toBeGreaterThanOrEqual(30);
    expect(T.singleLeg.swayFlagAt).toBeGreaterThan(T.singleLeg.jitterMargin * 0.04);   // above the synth's jitter floor with margin
    expect(T.singleLeg.touchGap).toBeLessThan(T.singleLeg.liftGap);        // hysteresis
    for (const id of ['shoulderLevel', 'hipLevel', 'kneeWindow', 'headFloat', 'heelLine'] as const) expect(T[id].flagAt).toBeGreaterThan(0);
  });
});

// ── MIRROR-COACH P3 follow-up (2026-09-28) ──────────────────────────────────────────────────────────────────────────
// The P3 live proof's "not read · wrong view" on the head float came from the facing test on a SIDE-ON body whose face
// and feet were unseen (stationGraders.ts readHead): the athlete was told the camera saw a different view — untrue — and
// the retest asked them to face the way they already faced. On 42c5e8a0 these read 'wrongView'.
describe('face and feet unseen is its own reason, not a wrong view', () => {
  const hide = (frames: PoseFrame[], ids: readonly number[]) =>
    frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l, i) => (ids.includes(i) ? { ...l, visibility: 0.35 } : l)) }));
  const FACE_AND_FEET = [NOSE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX];

  // CHANGED ON PURPOSE (MIRROR-COACH P3 follow-up review, 2026-09-28): this body's face and feet are all INSIDE the shot,
  // only dimmed to 0.35 — and it was told "Step back so your head and your feet are both in the shot", which makes a dim
  // body smaller and fixes no light. Every frame the hold keeps has passed the framing check (the nose in the top of the
  // shot, both ankles in and seen), so face-and-feet-unseen on a kept frame is nearly always dim: 'lowVisibility'.
  it('a side-on body with the nose and both feet only DIM (all inside the shot): lowVisibility and the light hint — not a wrong view', () => {
    const frames = hide(turned(toSide, {}, 10), FACE_AND_FEET);
    for (const i of FACE_AND_FEET) expect(frames.every((f) => f.landmarks[i].x >= 0 && f.landmarks[i].x <= 1 && f.landmarks[i].y >= 0 && f.landmarks[i].y <= 1)).toBe(true);
    const g = gradeStation('headFloat', frames, 'side', OPT);
    expect(g.status).toBe('unreadable');
    expect(g.reason).toBe('lowVisibility');
    expect(g.note).not.toMatch(/different view/);
    expect(retestHintFor(g)).toBe(RETEST_HINT.lowVisibility);
    expect(retestHintFor(g)).not.toMatch(/step back/i);
  });

  it('the feet OUTSIDE the shot (below the image) with the face dim: faceFeetUnseen, its own line and the step-back hint', () => {
    const FEET = [LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX];
    const frames = hide(turned(toSide, {}, 10), [NOSE]).map((f) => ({ ...f, landmarks: f.landmarks.map((l, i) => (FEET.includes(i) ? { ...l, y: 1.03 } : l)) }));
    const g = gradeStation('headFloat', frames, 'side', OPT);
    expect(g.status).toBe('unreadable');
    expect(g.reason).toBe('faceFeetUnseen');
    expect(g.value).toBeNull();
    expect(g.note).toBe(unreadableLine('headFloat', 'faceFeetUnseen'));
    expect(g.note).toMatch(/outside the shot/);
    expect(g.note).not.toMatch(/different view/);
    expect(retestHintFor(g)).toBe(RETEST_HINT.faceFeetUnseen);
    expect(RETEST_HINT.faceFeetUnseen).toMatch(/head and your feet are both in the shot/);
    expect(RETEST_HINT.faceFeetUnseen).not.toBe(RETEST_HINT.wrongView);
    // the server regrades it the same (REASONS knows the reason), and it is never a result
    expect(regradeFromSummary(JSON.parse(JSON.stringify(g)))).toMatchObject({ status: 'unreadable', reason: 'faceFeetUnseen' });
    expect(toCheckResult(g)).toBeNull();
  });

  it('either the face OR the feet is enough to read the facing (unchanged); a body facing the camera is still wrongView', () => {
    expect(gradeStation('headFloat', hide(turned(toSide, {}, 10), [NOSE]), 'side', OPT).status).toBe('pass');
    expect(gradeStation('headFloat', hide(turned(toSide, {}, 10), [LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX]), 'side', OPT).status).toBe('pass');
    expect(gradeStation('headFloat', front({}, 10), 'side', OPT).reason).toBe('wrongView');
  });
});

describe('a station that ended before its hold ran: notReadStation', () => {
  it('every camera check at the station, not read for the one reason, through the graders\' own decision — the server agrees', () => {
    const profile = MODIFIED_SCREEN.find((s) => s.id === 'profile')!;
    const frontStack = MODIFIED_SCREEN.find((s) => s.id === 'frontStack')!;
    const wobbleR = MODIFIED_SCREEN.find((s) => s.id === 'wobbleR')!;
    expect(notReadStation(profile, 'wrongView')).toEqual([
      expect.objectContaining({ checkId: 'headFloat', status: 'unreadable', reason: 'wrongView', value: null, frames: 0, readableFrames: 0, stationId: 'profile', note: unreadableLine('headFloat', 'wrongView', { frames: 0, readableFrames: 0 }) }),
    ]);
    expect(notReadStation(frontStack, 'wrongView').map((g) => g.checkId)).toEqual(['kneeWindow', 'hipLevel', 'shoulderLevel']);
    expect(notReadStation(wobbleR, 'wrongView')[0]).toMatchObject({ checkId: 'singleLeg', side: 'right' });
    expect(notReadStation(MODIFIED_SCREEN.find((s) => s.id === 'breath')!, 'wrongView')).toEqual([]);   // nothing for the camera
    for (const g of [...notReadStation(profile, 'wrongView'), ...notReadStation(frontStack, 'wrongView'), ...notReadStation(wobbleR, 'wrongView')]) {
      expect(regradeFromSummary(JSON.parse(JSON.stringify(g)), { holdSec: 30 })).toMatchObject({ status: 'unreadable', reason: 'wrongView' });
    }
  });

  it('the wait is in the table, commented, and the runner reads it from there', () => {
    const T = STATION_THRESHOLDS.wrongView;
    expect(T.remindMs).toBeGreaterThan(0);
    expect(T.endMs).toBeGreaterThan(2 * T.remindMs);            // at least two reminders before it gives up
    const src = readFileSync(resolve(process.cwd(), 'lib/mirror/stationGraders.ts'), 'utf8');
    expect(src).toMatch(/THE WRONG VIEW THAT NEVER TURNS[\s\S]{0,1600}wrongView: \{[\s\S]{0,400}remindMs: \d+[\s\S]{0,800}endMs: \d+/);
    // the runner has no number of its own for the wait
    const runner = readFileSync(resolve(process.cwd(), 'lib/mirror/screenRunner.ts'), 'utf8');
    expect(runner).toMatch(/STATION_THRESHOLDS\.wrongView/);
    expect(runner).not.toMatch(/20_?000|7_?000/);
  });

  // MIRROR-COACH P3 follow-up review (2026-09-28): the reset stretch, the backstop and the tick cap are in the table too
  it('the right-view stretch, the station backstop and the runner\'s tick cap are in the table, commented, and read from there', () => {
    const T = STATION_THRESHOLDS;
    expect(T.wrongView.resetAfterMs).toBeGreaterThan(0);
    expect(T.wrongView.resetAfterMs).toBeLessThan(T.wrongView.remindMs);
    expect(T.stalled.endMs).toBeGreaterThan(T.wrongView.endMs);            // the wrong view keeps its own, shorter wait
    expect(T.clock.maxTickMs).toBeGreaterThan(T.singleLeg.maxFrameMs);      // never slows a phone the graders can use
    const src = readFileSync(resolve(process.cwd(), 'lib/mirror/stationGraders.ts'), 'utf8');
    expect(src).toMatch(/THE TURN IS A STRETCH, NOT A FRAME[\s\S]{0,900}resetAfterMs: \d+/);
    expect(src).toMatch(/THE STATION-LEVEL BACKSTOP[\s\S]{0,1600}stalled: \{[\s\S]{0,400}endMs: \d+/);
    expect(src).toMatch(/THE RUNNER'S CLOCK[\s\S]{0,1200}clock: \{\s*maxTickMs: \d+/);
    const runner = readFileSync(resolve(process.cwd(), 'lib/mirror/screenRunner.ts'), 'utf8');
    for (const k of ['wrongView.resetAfterMs', 'stalled.endMs', 'clock.maxTickMs']) expect(runner).toContain(`STATION_THRESHOLDS.${k}`);
    expect(runner).not.toMatch(/60_?000|(?<![\w.])250(?![\w])/);                     // (1000 is its ms → s)
  });
});

// MIRROR-COACH P3 follow-up review (2026-09-28): a grader's own 'wrongView' at the side station — over frames the framing
// check passed as side-on, so the head turned from the body — got the turn cue ("Turn side-on…") to somebody side-on
describe('the head float\'s own wrong view has its own hint; the runner\'s wrong-view end (no frame graded) keeps the turn', () => {
  it('HEAD_TURNED_HINT for a head-float wrongView read over frames; the generic hint for a runner\'s end (frames 0) and for any other check', () => {
    const profile = MODIFIED_SCREEN.find((s) => s.id === 'profile')!;
    const runnerEnd = notReadStation(profile, 'wrongView')[0];
    expect(runnerEnd.frames).toBe(0);
    expect(retestHintFor(runnerEnd)).toBe(RETEST_HINT.wrongView);
    const read = { ...runnerEnd, frames: 301 };
    expect(retestHintFor(read)).toBe(HEAD_TURNED_HINT);
    expect(retestHintFor({ ...read, checkId: 'kneeWindow' })).toBe(RETEST_HINT.wrongView);
    expect(retestHintFor({ reason: 'wrongView' })).toBe(RETEST_HINT.wrongView);        // a caller that does not say the check
    expect(HEAD_TURNED_HINT).not.toMatch(/turn side-on/i);
  });
});

describe('the words the graders say', () => {
  const lines = (): string[] => {
    const out = new Set<string>();
    for (const c of CASES) for (const g of [grade(c, c.clean()), grade(c, c.fault()), grade(c, dimmed(c.clean(), 0.4))]) {
      out.add(g.note); out.add(formatGradeValue(g));
    }
    for (const id of GRADER_IDS) for (const r of Object.keys(RETEST_HINT) as UnreadableReason[]) {
      out.add(unreadableLine(id, r, { readableFrames: 3, frames: 90, stanceSec: 4 }));
      out.add(RETEST_HINT[r]);
    }
    out.add(HEAD_TURNED_HINT);
    return [...out].filter((l) => l !== '—');
  };

  it('no line names a condition, a treatment or a guarantee (lib/share/screen.ts)', () => {
    for (const l of lines()) expect(screenText(l), l).toEqual([]);
  });

  it('no line calls a read a dysfunction, an injury or a risk, or claims to prevent or reduce anything', () => {
    for (const l of lines()) expect(l, l).not.toMatch(/dysfunction|injur|risk|prevent|reduce|diagnos|pain|pelvic tilt|rib/i);
  });

  it('every value shown is labelled estimated', () => {
    for (const c of CASES) {
      const g = grade(c, c.fault());
      expect(formatGradeValue(g)).toMatch(/estimated/);
      expect(g.note).toMatch(/estimated/);
    }
  });
});

void LEFT_HEEL; void RIGHT_HEEL; void measureStation;
