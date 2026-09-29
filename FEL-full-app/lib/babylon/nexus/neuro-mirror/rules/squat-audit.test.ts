// SquatAudit's knee read on a squat the app's own virtual webcam films (MIRROR-COACH P1, 2026-09-25).
//
// The old knee check (`lk.x > la.x`, squat-audit.ts:133-134 before this pass) was tested on a hand-built frame that put
// the subject's LEFT shoulder on the image's LEFT — a mirrored subject — so it passed while being backwards on the
// stream the Mirror actually reads (not mirrored: lib/pose/landmarks.ts:9-10, mediapipe-adapter.ts:184-187). This
// builds the squat in 3-D instead and films it through lib/pose/synth.ts, whose synthesize() REFUSES a mirrored source
// (assertHandedness), so the fixture cannot quietly mirror the subject again. Knees go IN, then OUT, each leg alone
// and both together, and the audit has to tell them apart.
//
// What this proves and what it does not: the SIGN of the read is right on the app's documented camera geometry, and
// the read is mirror-invariant (so it stays right if MediaPipe's left/right convention turns out the other way round).
// It does NOT prove the thresholds or that a real phone camera shows a caving knee this clearly — that needs a real
// recording, which is why the COACH stays silent on it (VALGUS_CUE_VERIFIED in cue-engine.ts).
import { describe, expect, it } from 'vitest';
import { LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_KNEE, LEFT_ANKLE, RIGHT_KNEE, RIGHT_ANKLE } from '@/lib/pose/landmarks';
import {
  MIN_HIP_HALF, SQUAT_THRESHOLDS, SquatAudit, frontalReadable, kneeInwardRatio, squareOn, torsoTurnSample, yawFromSamples,
  type SquatFrameResult,
} from './squat-audit';
import { SIDE_WIDTH_MAX } from '@/lib/mirror/framing';
import type { PoseFrame } from '../pose/mediapipe-adapter';
import { filmSquat, type SquatShape } from './__fixtures__/synthSquat';

/** Film one squat (noise-free, nothing dropped: the geometry alone) and run the audit over it. */
function film(shiftL: number, shiftR: number, opts: { mirror?: boolean; up?: Omit<SquatShape, 'shiftL' | 'shiftR'> } = {}): { frames: PoseFrame[]; reads: SquatFrameResult[] } {
  const frames = filmSquat({ shiftL, shiftR, ...opts.up }, undefined, opts.mirror);
  const audit = new SquatAudit();
  return { frames, reads: frames.map((f) => audit.evaluate(f)) };
}

const flagged = (reads: SquatFrameResult[]) => reads.some((r) => r.faults.includes('kneeValgus'));
const worst = (reads: SquatFrameResult[], side: 'left' | 'right') =>
  Math.max(...reads.filter((r) => r.valgusBySide && r.phase !== 'standing').map((r) => r.valgusBySide![side]));
const least = (reads: SquatFrameResult[], side: 'left' | 'right') =>
  Math.min(...reads.filter((r) => r.valgusBySide && r.phase !== 'standing').map((r) => r.valgusBySide![side]));

/** The rule this pass replaced, verbatim (squat-audit.ts:133-135 before 2026-09-25), kept here as the witness. */
function legacyValgusRatio(f: PoseFrame): number {
  const L = f.landmarks;
  const hipHalf = Math.max(1e-3, Math.abs(L[23].x - L[24].x) / 2);
  const leftIn = Math.max(0, L[LEFT_KNEE].x - L[LEFT_ANKLE].x);
  const rightIn = Math.max(0, L[RIGHT_ANKLE].x - L[RIGHT_KNEE].x);
  return Math.max(leftIn, rightIn) / hipHalf;
}

describe('the fixture is the stream the Mirror reads (not mirrored)', () => {
  it('facing the camera, the subject\'s left shoulder lands on the image RIGHT', () => {
    const { frames } = film(0, 0);
    const f = frames[0];
    expect(f.landmarks[LEFT_SHOULDER].x).toBeGreaterThan(f.landmarks[RIGHT_SHOULDER].x);
  });
});

describe('knee valgus is read per side, against each knee\'s own hip–ankle line', () => {
  it('both knees caving IN is flagged, and both sides read inward', () => {
    const { reads } = film(-0.06, -0.06);
    expect(flagged(reads)).toBe(true);
    expect(worst(reads, 'left')).toBeGreaterThan(0.35);
    expect(worst(reads, 'right')).toBeGreaterThan(0.35);
  });

  it('both knees pushed OUT is NOT flagged, and both sides read outward (negative)', () => {
    const { reads } = film(0.05, 0.05);
    expect(flagged(reads)).toBe(false);
    expect(least(reads, 'left')).toBeLessThan(0);
    expect(least(reads, 'right')).toBeLessThan(0);
  });

  it('the LEFT knee alone caving in is flagged on the left, and the right reads clean', () => {
    const { reads } = film(-0.06, 0);
    expect(flagged(reads)).toBe(true);
    expect(worst(reads, 'left')).toBeGreaterThan(0.35);
    expect(worst(reads, 'right')).toBeLessThan(0.35);
  });

  it('the RIGHT knee alone caving in is flagged on the right, and the left reads clean', () => {
    const { reads } = film(0, -0.06);
    expect(flagged(reads)).toBe(true);
    expect(worst(reads, 'right')).toBeGreaterThan(0.35);
    expect(worst(reads, 'left')).toBeLessThan(0.35);
  });

  it('a knee pushed out on one side and caving on the other flags only the caving one', () => {
    const { reads } = film(0.05, -0.06);
    expect(flagged(reads)).toBe(true);
    expect(least(reads, 'left')).toBeLessThan(0);
    expect(worst(reads, 'right')).toBeGreaterThan(0.35);
  });

  it('a knee tracking straight is clean', () => {
    expect(flagged(film(0, 0).reads)).toBe(false);
  });

  it('never reads a standing frame as a fault', () => {
    const { reads } = film(-0.06, -0.06);
    expect(reads.filter((r) => r.phase === 'standing').every((r) => !r.faults.includes('kneeValgus'))).toBe(true);
  });
});

describe('the sign does not lean on the left/right convention', () => {
  it('a mirrored (selfie) stream gives the same verdicts, with the side labels swapped', () => {
    const inward = film(-0.06, 0, { mirror: true }).reads;
    expect(flagged(inward)).toBe(true);
    // mirrored, the subject's left leg carries MediaPipe's RIGHT label
    expect(worst(inward, 'right')).toBeGreaterThan(0.35);
    expect(flagged(film(0.05, 0.05, { mirror: true }).reads)).toBe(false);
  });

  it('kneeInwardRatio: inward is toward the other hip, whichever side of the image the leg is on', () => {
    // a leg on the image's right (midline at 0.5): a knee at smaller x is inward
    expect(kneeInwardRatio({ x: 0.6, y: 0.5 }, { x: 0.55, y: 0.7 }, { x: 0.6, y: 0.9 }, 0.5, 0.1)).toBeCloseTo(0.5, 5);
    // the same leg with the knee at larger x is outward
    expect(kneeInwardRatio({ x: 0.6, y: 0.5 }, { x: 0.65, y: 0.7 }, { x: 0.6, y: 0.9 }, 0.5, 0.1)).toBeCloseTo(-0.5, 5);
    // a leg on the image's left: larger x is inward
    expect(kneeInwardRatio({ x: 0.4, y: 0.5 }, { x: 0.45, y: 0.7 }, { x: 0.4, y: 0.9 }, 0.5, 0.1)).toBeCloseTo(0.5, 5);
    // hips on top of each other (side-on) or a leg with no height: no read, never a guess
    expect(kneeInwardRatio({ x: 0.5, y: 0.5 }, { x: 0.45, y: 0.7 }, { x: 0.5, y: 0.9 }, 0.5, 0.1)).toBe(0);
    expect(kneeInwardRatio({ x: 0.6, y: 0.5 }, { x: 0.55, y: 0.5 }, { x: 0.6, y: 0.5 }, 0.5, 0.1)).toBe(0);
  });
});

describe('the witness: the replaced rule was backwards on this stream', () => {
  // Kept so the reason for the change is re-measured on every run rather than asserted once in a comment.
  it('the old rule read nothing with both knees 6 cm IN, and flagged both knees 5 cm OUT', () => {
    const inFrames = film(-0.06, -0.06).frames.slice(30);
    const outFrames = film(0.05, 0.05).frames.slice(30);
    const warn = 0.35;
    expect(Math.max(...inFrames.map(legacyValgusRatio))).toBeLessThan(warn);
    expect(Math.max(...outFrames.map(legacyValgusRatio))).toBeGreaterThanOrEqual(warn);
  });
});

describe('armFall is a sideways read (what a front camera can see)', () => {
  // MIRROR-COACH P1 (2026-09-25): the copy called this "arms falling forward"; the audit compares the shoulder
  // midpoint's x with its standing line. Film both, and let the audit say which one it sees.
  const armFall = (reads: SquatFrameResult[]) => reads.some((r) => r.faults.includes('armFall'));

  // deep enough that the audit's depth gate (depth01 > 0.3) is open, so a quiet result means "not seen", not "not asked"
  const deep = 0.55;

  it('the fixture is deep enough for the check to run', () => {
    expect(Math.max(...film(0, 0, { up: { drop: deep } }).reads.map((r) => r.depth01))).toBeGreaterThan(0.3);
  });

  it('the upper body drifting sideways is read', () => {
    expect(armFall(film(0, 0, { up: { drop: deep, sideways: 0.1 } }).reads)).toBe(true);
  });

  it('a big forward lean is not (it moves toward the lens, not across it)', () => {
    expect(armFall(film(0, 0, { up: { drop: deep, lean: 0.25 } }).reads)).toBe(false);
  });
});

// MIRROR-COACH P1 review (2026-09-25): the knee read on a squat that does not face the camera. kneeInwardRatio's doc
// promised 0 for "hips stacked on top of each other, as in a side-on view", but its guard was `hipHalf < 1e-6` and the
// caller floored hipHalf at 1e-3, so it never fired: a side-on squat read its knees' FORWARD travel as caving, flagged
// on 31 of 120 frames, worst 58.5 hip half-widths.
describe('a squat that does not face the camera is not read in the frontal plane', () => {
  const reads = (shape: SquatShape) => { const a = new SquatAudit(); return filmSquat(shape).map((f) => a.evaluate(f)); };
  const moving = (rs: SquatFrameResult[]) => rs.filter((r) => r.present && r.phase !== 'standing');

  for (const turnDeg of [-90, 90]) {
    it(`side-on (${turnDeg}°): no kneeValgus, no lateralShift, no armFall, and it says it is turned`, () => {
      const rs = reads({ turnDeg });
      expect(moving(rs).length).toBeGreaterThan(20);                          // the squat was seen…
      for (const r of rs) {
        expect(r.faults, `${turnDeg}°`).not.toContain('kneeValgus');
        expect(r.faults, `${turnDeg}°`).not.toContain('lateralShift');
        expect(r.faults, `${turnDeg}°`).not.toContain('armFall');
      }
      for (const r of moving(rs)) {
        expect(r.frontal).toBe(false);                                         // …and not read as a frontal squat
        expect(r.valgusBySide).toBeUndefined();
        expect(r.valgusRatio).toBe(0);
        expect(r.note).toMatch(/turned/i);
      }
    });
  }

  it('turned 45°: the same, even with the knees caving (a turned body cannot be judged either way)', () => {
    for (const shape of [{ turnDeg: 45 }, { turnDeg: -45 }, { turnDeg: 45, shiftL: -0.06, shiftR: -0.06 }] as SquatShape[]) {
      const rs = reads(shape);
      for (const r of rs) expect(r.faults, JSON.stringify(shape)).not.toContain('kneeValgus');
      expect(moving(rs).every((r) => r.frontal === false), JSON.stringify(shape)).toBe(true);
    }
  });

  it('square-on is still frontal, and the caving knee is still caught', () => {
    const rs = reads({ shiftL: -0.06, shiftR: -0.06 });
    expect(moving(rs).every((r) => r.frontal === true)).toBe(true);
    expect(rs.some((r) => r.faults.includes('kneeValgus'))).toBe(true);
  });

  it('frontalReadable: collapsed hips, or hips deep apart, are unreadable; a frame with no z reads as square', () => {
    const lh = { x: 0.53, y: 0.55, z: 0 }, rh = { x: 0.47, y: 0.55, z: 0 };
    expect(frontalReadable(lh, rh, 0.55, 0.9)).toBe(true);
    expect(frontalReadable({ ...lh, x: 0.501 }, { ...rh, x: 0.499 }, 0.55, 0.9)).toBe(false);     // stacked
    expect(frontalReadable({ ...lh, z: -0.03 }, { ...rh, z: 0.03 }, 0.55, 0.9)).toBe(false);      // turned ~45°
    expect(frontalReadable({ x: 0.53, y: 0.55 }, { x: 0.47, y: 0.55 }, 0.55, 0.9)).toBe(true);    // no z
  });

  it('kneeInwardRatio: a half-width under MIN_HIP_HALF is no read (the guard the floor used to disable)', () => {
    expect(kneeInwardRatio({ x: 0.5004, y: 0.5 }, { x: 0.45, y: 0.7 }, { x: 0.5, y: 0.9 }, 0.5, 0.0004)).toBe(0);
    expect(kneeInwardRatio({ x: 0.6, y: 0.5 }, { x: 0.55, y: 0.7 }, { x: 0.6, y: 0.9 }, 0.5, MIN_HIP_HALF / 2)).toBe(0);
  });
});

// One frame of jitter is not a knee (the persistence gate, same review). Under the synth's default noise a straight
// squat tripped a single-frame kneeValgus in 26 of 50 squats; the fault now needs valgusPersistFrames frames running.
describe('the knee fault needs the read to hold', () => {
  const flaggedSquats = (shape: SquatShape, persist?: number) => {
    let n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const a = new SquatAudit(persist ? { ...SQUAT_THRESHOLDS, valgusPersistFrames: persist } : SQUAT_THRESHOLDS);
      if (filmSquat(shape, { seed }).map((f) => a.evaluate(f)).some((r) => r.faults.includes('kneeValgus'))) n++;
    }
    return n;
  };

  it('a straight squat under jitter: flagged at one frame (the old behaviour), never at the gate', () => {
    expect(flaggedSquats({}, 1)).toBeGreaterThan(0);
    expect(flaggedSquats({})).toBe(0);
  });

  it('a caving squat under jitter is still caught on every take', () => {
    expect(flaggedSquats({ shiftL: -0.06, shiftR: -0.06 })).toBe(20);
    expect(flaggedSquats({ shiftL: -0.06 })).toBe(20);
  });
});

// MIRROR-COACH P2 (2026-09-26) — THE SAME CAMERA FRAME TWICE. The compositor's render loop runs at the display's rate and
// the adapter hands back its previous frame, unchanged, until the camera delivers the next. Every repeat was a fresh
// read: 1 ms and no hip travel, so a hip near the top read 'standing' — the live proof counted all 11 reps of the guided
// squat inside ONE squat — and the knee's "3 frames running" was ~1.5 camera frames. No test fed a frame twice, which
// is why node passed while live failed. These do.
describe('a repeated camera frame gets the same read back, and moves nothing', () => {
  const twice = <T,>(xs: T[]) => xs.flatMap((x) => [x, x]);

  it('every frame fed twice: the same phases, faults and knee numbers, frame for frame', () => {
    for (const shape of [{}, { shiftL: -0.06, shiftR: -0.06 }, { shiftL: -0.06 }, { shiftL: 0.05, shiftR: 0.05 }] as SquatShape[]) {
      for (const seed of [1, 2, 3]) {
        const frames = filmSquat(shape, { seed });
        const once = new SquatAudit(), rep = new SquatAudit();
        const a = frames.map((f) => once.evaluate(f));
        const b = twice(frames).map((f) => rep.evaluate(f));
        const firstOfEach = b.filter((_, i) => i % 2 === 0), secondOfEach = b.filter((_, i) => i % 2 === 1);
        expect(firstOfEach, JSON.stringify(shape)).toEqual(a);
        expect(secondOfEach, JSON.stringify(shape)).toEqual(a);
      }
    }
  });

  it('a copy of the frame (same clock, new object) is the same camera frame too', () => {
    const frames = filmSquat({ shiftL: -0.06, shiftR: -0.06 });
    const once = new SquatAudit(), rep = new SquatAudit();
    const a = frames.map((f) => once.evaluate(f));
    const b = frames.flatMap((f) => [rep.evaluate(f), rep.evaluate({ ...f, landmarks: f.landmarks.map((l) => ({ ...l })) })]);
    expect(b.filter((_, i) => i % 2 === 1)).toEqual(a);
  });

  it('the knee persistence gate counts POSE frames: two over the line, each seen twice, is still two', () => {
    // hold the knee over the warn line for exactly (valgusPersistFrames − 1) pose frames at the bottom
    const n = SQUAT_THRESHOLDS.valgusPersistFrames;
    const clean = filmSquat({});
    const caving = filmSquat({ shiftL: -0.06, shiftR: -0.06 });
    const probe = new SquatAudit();
    const bottom = caving.findIndex((f) => { const r = probe.evaluate(f); return r.valgusRatio >= SQUAT_THRESHOLDS.valgusWarn && r.phase !== 'standing'; });
    expect(bottom).toBeGreaterThan(30);
    const spliced = [...clean.slice(0, bottom), ...caving.slice(bottom, bottom + n - 1), ...clean.slice(bottom + n - 1)];
    const flaggedIn = (frames: PoseFrame[]) => { const a = new SquatAudit(); return frames.map((f) => a.evaluate(f)).some((r) => r.faults.includes('kneeValgus')); };
    expect(flaggedIn(spliced)).toBe(false);
    expect(flaggedIn(twice(spliced))).toBe(false);          // P1 live: the repeats made n − 1 camera frames look like 2(n − 1)
    // …and n pose frames is a knee, fed once or twice
    const held = [...clean.slice(0, bottom), ...caving.slice(bottom, bottom + n), ...clean.slice(bottom + n)];
    expect(flaggedIn(held)).toBe(true);
    expect(flaggedIn(twice(held))).toBe(true);
  });

  it('calibration counts pose frames too (20 camera frames, not 10 fed twice)', () => {
    const frames = filmSquat({});
    const a = new SquatAudit();
    const reads = twice(frames.slice(0, 20)).map((f) => a.evaluate(f));
    expect(reads.every((r) => /Calibrating/.test(r.note))).toBe(true);
    expect(a.evaluate(frames[20]).note).not.toMatch(/Calibrating/);
  });

  it('reset() forgets the cached read (a new set re-reads the same clock)', () => {
    const frames = filmSquat({});
    const a = new SquatAudit();
    frames.slice(0, 25).forEach((f) => a.evaluate(f));
    a.reset();
    expect(a.evaluate(frames[24]).note).toMatch(/Calibrating/);
  });
});

// MIRROR-COACH P2 (2026-09-26) — THE KNEE IS READ ONLY SQUARE TO THE CAMERA (squareOn). P1 measured the one known false
// positive of the knee read: a straight squat 8° off square reads as caving on 20 of 20 jittered squats (5°: 8 of 20),
// because both knees' forward travel crosses the image the same way. The knee cue is on now, so off square is "not
// square — not read". Synthetic: the synth writes z on the x scale with 2× the x jitter; a phone's z is unverified.
describe('the squareness gate', () => {
  const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
  const flaggedSquats = (shape: SquatShape) =>
    SEEDS.filter((seed) => { const a = new SquatAudit(); return filmSquat(shape, { seed }).some((f) => a.evaluate(f).faults.includes('kneeValgus')); }).length;
  const moving = (shape: SquatShape, seed?: number) => {
    const a = new SquatAudit();
    return filmSquat(shape, seed === undefined ? undefined : { seed }).map((f) => a.evaluate(f)).filter((r) => r.present && r.phase !== 'standing');
  };

  it('a straight squat 8° off square never flags the knee under jitter (20 of 20 did before the gate)', () => {
    const ungated = { ...SQUAT_THRESHOLDS, squareMaxYawDeg: 90, squareMinWidth: 0 };
    const before = SEEDS.filter((seed) => { const a = new SquatAudit(ungated); return filmSquat({ turnDeg: 8 }, { seed }).some((f) => a.evaluate(f).faults.includes('kneeValgus')); }).length;
    expect(before).toBeGreaterThanOrEqual(19);            // the false positive is real on this geometry…
    expect(flaggedSquats({ turnDeg: 8 })).toBe(0);         // …and the gate removes it
    expect(flaggedSquats({ turnDeg: -8 })).toBe(0);
    expect(flaggedSquats({ turnDeg: 5 })).toBe(0);
  });

  it('off square, every knee frame says so: square false, the turn estimated, the note says the knees are not read', () => {
    const rs = moving({ turnDeg: 8 }, 3);
    expect(rs.length).toBeGreaterThan(20);
    for (const r of rs) {
      expect(r.frontal).toBe(true);                       // still a frontal body (20° is frontalReadable's line)…
      expect(r.square).toBe(false);                       // …but not square enough to read a knee
      expect(r.yawDeg!).toBeGreaterThan(SQUAT_THRESHOLDS.squareMaxYawDeg);
      expect(r.note).toMatch(/off square to the camera, so the knees are not read/);
      expect(r.faults).not.toContain('kneeValgus');
    }
  });

  it('square on, the gate stays open under jitter, and a caving knee is still caught on every take', () => {
    for (const seed of SEEDS.slice(0, 5)) expect(moving({}, seed).every((r) => r.square === true), `seed ${seed}`).toBe(true);
    expect(flaggedSquats({ shiftL: -0.06, shiftR: -0.06 })).toBe(20);
    expect(flaggedSquats({ shiftL: -0.06 })).toBe(20);
    expect(flaggedSquats({ shiftR: -0.06 })).toBe(20);
    expect(flaggedSquats({ shiftL: 0.05, shiftR: 0.05 })).toBe(0);   // knees pushed out: never
  });

  it('a caving knee off square is not read either way (the cost of the gate: quiet, never a wrong cue)', () => {
    expect(flaggedSquats({ shiftL: -0.06, shiftR: -0.06, turnDeg: 8 })).toBe(0);
  });

  // MIRROR-COACH P2 review (2026-09-26): the sideways reads (lateralShift, armFall) are gated on square as well. Before,
  // a straight squat 8° off square was cued "Stay centred" on 20 of 20 jittered takes while the Mirror asked the
  // athlete to square up.
  it('a straight squat 8° off square: no lateralShift and no armFall under jitter (the ungated audit flags the shift)', () => {
    const faulted = (shape: SquatShape, fault: 'lateralShift' | 'armFall', t = SQUAT_THRESHOLDS) =>
      SEEDS.filter((seed) => { const a = new SquatAudit(t); return filmSquat(shape, { seed }).some((f) => a.evaluate(f).faults.includes(fault)); }).length;
    const ungated = { ...SQUAT_THRESHOLDS, squareMaxYawDeg: 90, squareMinWidth: 0 };
    expect(faulted({ turnDeg: 8 }, 'lateralShift', ungated)).toBeGreaterThanOrEqual(15);  // the false read is real here…
    for (const turnDeg of [8, -8]) {
      expect(faulted({ turnDeg }, 'lateralShift'), `${turnDeg}°`).toBe(0);               // …and the gate removes it
      expect(faulted({ turnDeg }, 'armFall'), `${turnDeg}°`).toBe(0);
    }
    // square on, a real sideways drift of the upper body is still caught
    expect(faulted({ drop: 0.55, sideways: 0.1 }, 'armFall')).toBeGreaterThan(0);
  });

  it('torsoTurnSample / yawFromSamples: depth apart over width apart is tan θ; mirrored and back-on read the same |θ|', () => {
    const at = (deg: number) => {
      const t = (deg * Math.PI) / 180, w = 0.1;
      return { ls: { x: 0.5 + w * Math.cos(t), y: 0.3, z: w * Math.sin(t) }, rs: { x: 0.5 - w * Math.cos(t), y: 0.3, z: -w * Math.sin(t) } };
    };
    for (const deg of [0, 3, 8, 20]) {
      const { ls, rs } = at(deg);
      const hips = { lh: { ...ls, y: 0.5, x: 0.5 + (ls.x - 0.5) / 2, z: ls.z / 2 }, rh: { ...rs, y: 0.5, x: 0.5 + (rs.x - 0.5) / 2, z: rs.z / 2 } };
      const s = torsoTurnSample(ls, rs, hips.lh, hips.rh);
      expect(yawFromSamples([s]), `${deg}°`).toBeCloseTo(deg, 6);
      // a selfie stream: x flipped, labels swapped
      const m = torsoTurnSample({ ...rs, x: 1 - rs.x }, { ...ls, x: 1 - ls.x }, { ...hips.rh, x: 1 - hips.rh.x }, { ...hips.lh, x: 1 - hips.lh.x });
      expect(yawFromSamples([m]), `${deg}° mirrored`).toBeCloseTo(deg, 6);
    }
    // no z at all (a hand-built frame) reads square; an empty window reads 0
    expect(yawFromSamples([torsoTurnSample({ x: 0.6, y: 0.3 }, { x: 0.4, y: 0.3 }, { x: 0.55, y: 0.5 }, { x: 0.45, y: 0.5 })])).toBe(0);
    expect(yawFromSamples([])).toBe(0);
  });

  it('squareOn: frontal, not collapsed (framing.ts side-width, reused), and within the yaw line', () => {
    expect(squareOn(true, 0.57, 1)).toBe(true);
    expect(squareOn(true, 0.57, SQUAT_THRESHOLDS.squareMaxYawDeg + 0.1)).toBe(false);
    expect(squareOn(false, 0.57, 0)).toBe(false);                             // turned (frontalReadable)
    expect(squareOn(true, SQUAT_THRESHOLDS.squareMinWidth - 0.01, 0)).toBe(false); // shoulders collapsed: side-on
    expect(squareOn(true, null, 0)).toBe(true);                               // no torso to measure: the yaw read decides
    expect(SQUAT_THRESHOLDS.squareMinWidth).toBe(SIDE_WIDTH_MAX);
  });
});
