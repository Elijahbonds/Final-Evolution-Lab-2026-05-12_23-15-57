// hingeAudit.test — MIRROR-COACH P4, 2026-09-29. Every fixture is filmed through lib/pose/synth.ts's virtual webcam
// (lib/mirror/fixtures/hingeSetupBuild.ts), never hand-placed — see that file's header for why.
import { describe, expect, it } from 'vitest';
import { LEFT_EAR, RIGHT_EAR, LEFT_HIP, RIGHT_HIP } from '@/lib/pose/landmarks';
import {
  hingeClean, hingeWrongView, hingeSquatty, hingeHeadPoke, mirrorFrames, dimVisibility,
} from './fixtures/hingeSetupBuild';
import {
  auditHinge, pickNearSide, hipFlexionDeg, kneeFlexionDeg, dowelLineDeviationDeg, shinForwardLeanDeg,
  HINGE_THRESHOLDS, HINGE_CUES, hingePattern,
} from './hingeAudit';

const faultOf = (r: ReturnType<typeof auditHinge>, id: string) => r.faults.find((f) => f.id === id)!;

describe('auditHinge — clean hip hinge', () => {
  const clean = hingeClean();
  const r = auditHinge(clean);

  it('reads a hip-led ratio, ok', () => {
    const f = faultOf(r, 'hingeRatio');
    expect(f.status).toBe('ok');
    expect(f.value).toBeGreaterThanOrEqual(HINGE_THRESHOLDS.hingeRatioMin);
  });
  it('the dowel line reads straight, ok', () => {
    expect(faultOf(r, 'dowelLine').status).toBe('ok');
  });
  it('the shin barely leans, ok', () => {
    expect(faultOf(r, 'shinAngle').status).toBe('ok');
  });
  it('picks a near side and reports it on every fault', () => {
    const side = pickNearSide(clean.filter((f) => f.present), HINGE_THRESHOLDS.minVis);
    expect(side).not.toBeNull();
    for (const f of r.faults) expect(f.side).toBe(side);
  });
  it('reads a real number of frames, not the whole clip padded', () => {
    expect(r.readableFrames).toBeGreaterThan(HINGE_THRESHOLDS.minReadableFrames);
    expect(r.readableFrames).toBeLessThanOrEqual(clean.length);
  });
  it('the note is estimated and names all three reads', () => {
    expect(r.note).toMatch(/^Estimated:/);
    expect(r.note).toMatch(/hinge ratio/);
    expect(r.note).toMatch(/dowel line/);
    expect(r.note).toMatch(/shin/);
  });
});

describe('auditHinge — knee-dominant ("squat-shaped") rep', () => {
  const r = auditHinge(hingeSquatty());

  it('flags the hinge ratio — a squat when a hinge was asked for', () => {
    const f = faultOf(r, 'hingeRatio');
    expect(f.status).toBe('fault');
    expect(f.value).toBeLessThan(HINGE_THRESHOLDS.hingeRatioMin);
  });
  it('the dowel line is unaffected — this is a leg fault, not a trunk one', () => {
    expect(faultOf(r, 'dowelLine').status).toBe('ok');
  });
  it('the shin drifts forward too — the same knee-forward travel the ratio read', () => {
    const f = faultOf(r, 'shinAngle');
    expect(f.status).toBe('fault');
    expect(f.value).toBeGreaterThan(HINGE_THRESHOLDS.shinAngleWarnDeg);
  });
});

describe('auditHinge — good hip:knee mechanics with a head poke', () => {
  const r = auditHinge(hingeHeadPoke());

  it('the hinge ratio still reads ok — the legs did their job', () => {
    expect(faultOf(r, 'hingeRatio').status).toBe('ok');
  });
  it('the dowel line flags — a broken ear–shoulder–hip line', () => {
    const f = faultOf(r, 'dowelLine');
    expect(f.status).toBe('fault');
    expect(f.value).toBeGreaterThan(HINGE_THRESHOLDS.dowelLineWarnDeg);
  });
  it('the shin is unaffected — the poke never touched a leg joint', () => {
    expect(faultOf(r, 'shinAngle').status).toBe('ok');
  });
});

describe('auditHinge — wrong view (facing the camera instead of side-on)', () => {
  const r = auditHinge(hingeWrongView());

  it('every check is unreadable, never a guess', () => {
    for (const f of r.faults) expect(f.status).toBe('unreadable');
    expect(r.readableFrames).toBe(0);
  });
  it('says turn side-on, once, and does not loop (the caller decides whether to ask again — P1\'s lesson)', () => {
    expect(r.note).toBe('Turn side-on to the camera.');
  });
});

describe('auditHinge — no body / too little in view', () => {
  it('an empty clip: unreadable, not a crash', () => {
    const r = auditHinge([]);
    expect(r.readableFrames).toBe(0);
    for (const f of r.faults) expect(f.status).toBe('unreadable');
    expect(r.note).toMatch(/no body/i);
  });
  it('every frame absent: the same', () => {
    const r = auditHinge([{ t: 0, present: false, image: [] }, { t: 33, present: false, image: [] }]);
    for (const f of r.faults) expect(f.status).toBe('unreadable');
  });
});

describe('auditHinge — low visibility degrades ONE check, not the whole reading', () => {
  it('the ear too dim to place: dowel line unreadable, the leg reads unaffected', () => {
    const dimmed = dimVisibility(hingeClean(), [LEFT_EAR, RIGHT_EAR]);
    const r = auditHinge(dimmed);
    expect(faultOf(r, 'dowelLine').status).toBe('unreadable');
    expect(faultOf(r, 'hingeRatio').status).toBe('ok');
    expect(faultOf(r, 'shinAngle').status).toBe('ok');
  });
  it('the hips too dim to place: the whole leg read (and the dowel line, which needs the hip too) goes unreadable', () => {
    const dimmed = dimVisibility(hingeClean(), [LEFT_HIP, RIGHT_HIP]);
    const r = auditHinge(dimmed);
    expect(faultOf(r, 'hingeRatio').status).toBe('unreadable');
    expect(faultOf(r, 'dowelLine').status).toBe('unreadable');
  });
});

describe('auditHinge — a mirrored (selfie) camera reads the same shape, only the side label trades places', () => {
  it('clean hinge, mirrored', () => {
    const clean = hingeClean();
    const straight = auditHinge(clean);
    const mirrored = auditHinge(mirrorFrames(clean));
    const straightSide = straight.faults[0].side, mirroredSide = mirrored.faults[0].side;
    expect(mirroredSide).not.toBe(straightSide);
    for (const id of ['hingeRatio', 'dowelLine', 'shinAngle'] as const) {
      expect(faultOf(mirrored, id).status).toBe(faultOf(straight, id).status);
      expect(faultOf(mirrored, id).value).toBeCloseTo(faultOf(straight, id).value, 0);
    }
  });
  it('a knee-dominant rep, mirrored, still flags the same way', () => {
    const squatty = hingeSquatty();
    const straight = auditHinge(squatty), mirrored = auditHinge(mirrorFrames(squatty));
    expect(faultOf(mirrored, 'hingeRatio').status).toBe('fault');
    expect(faultOf(mirrored, 'hingeRatio').value).toBeCloseTo(faultOf(straight, 'hingeRatio').value, 0);
  });
});

describe('the pure geometry functions', () => {
  it('hipFlexionDeg is 0 for a straight vertical line, and grows as the hip folds', () => {
    expect(hipFlexionDeg({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 })).toBeCloseTo(0, 5);
    expect(hipFlexionDeg({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.8 })).toBeGreaterThan(10);
  });
  it('kneeFlexionDeg is 0 straight, and grows as the knee bends', () => {
    expect(kneeFlexionDeg({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }, { x: 0.5, y: 1.1 })).toBeCloseTo(0, 5);
    expect(kneeFlexionDeg({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }, { x: 0.3, y: 1.0 })).toBeGreaterThan(10);
  });
  it('dowelLineDeviationDeg is 0 for three collinear points', () => {
    expect(dowelLineDeviationDeg({ x: 0.52, y: 0.2 }, { x: 0.5, y: 0.3 }, { x: 0.46, y: 0.5 })).toBeCloseTo(0, 0);
  });
  it('shinForwardLeanDeg reads the same sign of "forward" whichever way the foot points in the image', () => {
    // toe to the RIGHT of the heel (image x): "forward" is +x
    const a = shinForwardLeanDeg({ x: 0.55, y: 0.6 }, { x: 0.5, y: 0.9 }, { x: 0.48, y: 0.92 }, { x: 0.58, y: 0.92 });
    // the same body, mirrored: toe to the LEFT of the heel now, and every x flipped — the read must match
    const b = shinForwardLeanDeg({ x: 0.45, y: 0.6 }, { x: 0.5, y: 0.9 }, { x: 0.52, y: 0.92 }, { x: 0.42, y: 0.92 });
    expect(a).toBeCloseTo(b, 5);
    expect(a).toBeGreaterThan(0); // the knee sits ahead of the ankle, toward the toe
  });
});

describe('auditHinge — a baseline is accepted (the pattern contract) but never changes a status', () => {
  it('a baseline in ctx does not move the fault read, with or without one', () => {
    const clean = hingeClean();
    const bare = auditHinge(clean);
    const withBaseline = auditHinge(clean, { baseline: { hingeRatio: 1 } });
    expect(withBaseline).toEqual(bare); // not read yet (see auditHinge's own comment) — accepted, inert
  });
});

describe('hingePattern — the Movement Screen registry entry (lib/mirror/patterns.ts\'s contract)', () => {
  it('matches the phase-4 pattern contract shape', () => {
    expect(hingePattern.id).toBe('hinge');
    expect(hingePattern.view).toBe('side');
    expect(hingePattern.reps).toEqual({ checkReps: 3, workReps: 8 });
    expect(hingePattern.timed).toBeUndefined();
    expect(hingePattern.youthSafe).toBe(true);
  });
  it('carries one three-level cue per fault id, none naming a muscle, a rib, a diagnosis, risk or injury', () => {
    const ids = HINGE_CUES.map((c) => c.faultId).sort();
    expect(ids).toEqual(['dowelLine', 'hingeRatio', 'shinAngle']);
    for (const c of HINGE_CUES) {
      expect(c.cue).not.toMatch(/risk|injur|diagnos|prevent|\brib/i);
      expect(c.escalate).not.toMatch(/risk|injur|diagnos|prevent|\brib/i);
      expect(c.regress).not.toMatch(/risk|injur|diagnos|prevent|\brib/i);
    }
  });
  it('runs the same audit the standalone function does', () => {
    const clean = hingeClean();
    expect(hingePattern.audit(clean, {})).toEqual(auditHinge(clean, {}));
  });
});
