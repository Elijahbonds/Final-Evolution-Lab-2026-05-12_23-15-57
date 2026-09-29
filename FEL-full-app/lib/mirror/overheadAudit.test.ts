// overheadAudit.test — clean, asymmetric reach, shrug, elbow bend, wrong view, low visibility and a mirrored
// (selfie) capture, all through P1's landmark-fixture harness (lib/mirror/fixtures/build.ts's own overheadPose,
// FIXTURE_CAMERA and CLEAN_FILM). MIRROR-COACH P4, 2026-09-29.
import { describe, expect, it } from 'vitest';
import { synthesize } from '@/lib/pose/synth';
import { LEFT_EAR, MIRROR_INDEX, RIGHT_EAR, type PoseFrame } from '@/lib/pose/landmarks';
import { FIXTURE_CAMERA, CLEAN_FILM, filmFixture, overheadPose, type OverheadOpts } from './fixtures/build';
import { auditOverhead, OVERHEAD_CUES, OVERHEAD_THRESHOLDS, overheadPattern } from './overheadAudit';

const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
function repCurve(hold0: number, down: number, bottom: number, up: number, hold1: number): number[] {
  const d: number[] = [];
  for (let i = 0; i < hold0; i++) d.push(0);
  for (let i = 0; i < down; i++) d.push(ease((i + 1) / down));
  for (let i = 0; i < bottom; i++) d.push(1);
  for (let i = 0; i < up; i++) d.push(ease(1 - (i + 1) / up));
  for (let i = 0; i < hold1; i++) d.push(0);
  return d;
}
const REP = () => repCurve(18, 20, 10, 20, 12);

function filmOverhead(opts: OverheadOpts = {}): PoseFrame[] {
  const frames = REP().map((d) => overheadPose(d, opts));
  return synthesize({ fps: 30, frames }, { ...CLEAN_FILM, camera: FIXTURE_CAMERA }).frames;
}

function mirrorFrames(frames: PoseFrame[]): PoseFrame[] {
  return frames.map((f) => ({
    ...f,
    image: f.present ? MIRROR_INDEX.map((m) => ({ ...f.image[m], x: 1 - f.image[m].x })) : f.image,
  }));
}
function lowVisibility(frames: PoseFrame[], factor: number): PoseFrame[] {
  return frames.map((f) => ({ ...f, image: f.image.map((l) => ({ ...l, v: l.v * factor })) }));
}
/** Heavy occlusion: every frame EXCEPT the given indices reads absent — the shape a bad connection or a body mostly
 *  out of frame leaves behind. MIRROR-COACH P4 review (2026-09-29): this is how the ghost-rep / false-"full reach"
 *  note bugs below were reproduced against the real module, not asserted from reading the code. */
function onlyFrames(frames: PoseFrame[], keepIdx: readonly number[]): PoseFrame[] {
  const keep = new Set(keepIdx);
  return frames.map((f, i) => (keep.has(i) ? f : { ...f, present: false }));
}

const byId = (r: ReturnType<typeof auditOverhead>, id: string, side?: 'left' | 'right') =>
  r.faults.find((f) => f.id === id && (side === undefined || f.side === side));

describe('the overhead audit: a clean reach', () => {
  const r = auditOverhead(filmOverhead({}), {});
  it('counts one rep', () => {
    expect(byId(r, 'reps')?.value).toBe(1);
  });
  it('reads both arms fully overhead', () => {
    expect(byId(r, 'elevation', 'left')?.status).toBe('ok');
    expect(byId(r, 'elevation', 'right')?.status).toBe('ok');
  });
  it('reads the two arms as symmetric', () => {
    expect(byId(r, 'asymmetry')?.status).toBe('ok');
    expect(byId(r, 'asymmetry')?.value).toBeLessThan(OVERHEAD_THRESHOLDS.asymmetryWarn);
  });
  it('reads no shrug on either side', () => {
    expect(byId(r, 'shrug', 'left')?.status).toBe('ok');
    expect(byId(r, 'shrug', 'right')?.status).toBe('ok');
  });
  it('reads both elbows locked out', () => {
    expect(byId(r, 'elbowBend', 'left')?.status).toBe('ok');
    expect(byId(r, 'elbowBend', 'right')?.status).toBe('ok');
  });
  it('says so in the note when nothing faults', () => {
    expect(r.note).toMatch(/even|full reach/);
  });
});

describe('the overhead audit: asymmetric reach', () => {
  it('the SHORT arm is the one flagged, the other reads clean', () => {
    // the fixture's own (3-D, world-space) truth puts the short arm ≈50° from vertical; the audit's 2-D image read
    // agrees on DIRECTION and MAGNITUDE well past the warn line, not to the degree — a camera estimate, not a
    // clinical angle (this file's own header). overheadTruth is read in overheadAudit.test.ts's other tests instead,
    // where the fixture is symmetric and there is no camera-angle foreshortening to disagree with.
    const r = auditOverhead(filmOverhead({ armDegR: 130 }), {});
    expect(byId(r, 'elevation', 'left')?.status).toBe('ok');
    expect(byId(r, 'elevation', 'right')?.status).toBe('fault');
    expect(byId(r, 'elevation', 'right')!.value).toBeGreaterThan(OVERHEAD_THRESHOLDS.elevationWarn);
    expect(byId(r, 'asymmetry')?.status).toBe('fault');
  });
});

describe('the overhead audit: the shrug proxy', () => {
  it('no shrug reads clean on both sides', () => {
    const r = auditOverhead(filmOverhead({}), {});
    expect(byId(r, 'shrug', 'left')?.value).toBeLessThan(OVERHEAD_THRESHOLDS.shrugWarn);
  });
  it('a shoulder that hikes toward the ear as the arm goes up is a FAULT, on the side it happens', () => {
    const r = auditOverhead(filmOverhead({ shrugL: 0.06 }), {});
    expect(byId(r, 'shrug', 'left')?.status).toBe('fault');
    expect(byId(r, 'shrug', 'right')?.status).toBe('ok');
  });
});

describe('the overhead audit: elbow lock-out', () => {
  it('a bent elbow at the top is a FAULT on that side only', () => {
    const r = auditOverhead(filmOverhead({ elbowBendL: 30 }), {});
    expect(byId(r, 'elbowBend', 'left')?.status).toBe('fault');
    expect(byId(r, 'elbowBend', 'right')?.status).toBe('ok');
  });
});

describe('the overhead audit: no lumbar or rib claim', () => {
  it('reports only elevation, asymmetry, shrug, elbowBend and reps — nothing spine- or rib-shaped', () => {
    const r = auditOverhead(filmOverhead({}), {});
    const ids = new Set(r.faults.map((f) => f.id));
    for (const bad of ['lumbar', 'rib', 'spine', 'posture', 'trunk']) expect(ids.has(bad)).toBe(false);
  });
});

describe('the overhead audit: view, visibility and a mirrored camera', () => {
  it('the wrong view (side-on) is UNREADABLE, once, with a face-the-camera prompt', () => {
    const side = filmFixture('stand_side');
    const r = auditOverhead(side, {});
    expect(byId(r, 'elevation', 'left')?.status).toBe('unreadable');
    expect(byId(r, 'asymmetry')?.status).toBe('unreadable');
    expect(r.note).toMatch(/square-on|front/i);
    expect(r.readableFrames).toBe(0);
  });
  it('unreadable is never "ok" on a low-visibility capture', () => {
    const dim = lowVisibility(filmOverhead({}), 0.1);
    const r = auditOverhead(dim, {});
    for (const f of r.faults) expect(f.status).not.toBe('ok');
  });
  it('a mirrored (selfie) stream reads the SAME asymmetry, with the faulting arm\'s label swapped', () => {
    const direct = auditOverhead(filmOverhead({ armDegR: 130 }), {});
    const mirrored = auditOverhead(mirrorFrames(filmOverhead({ armDegR: 130 })), {});
    expect(byId(mirrored, 'asymmetry')?.value).toBeCloseTo(byId(direct, 'asymmetry')!.value, 0);
    // the physically short arm is still short — MediaPipe just calls it the other label now
    expect(byId(mirrored, 'elevation', 'left')?.status).toBe('fault');
    expect(byId(mirrored, 'elevation', 'right')?.status).toBe('ok');
  });
});

describe('the overhead audit: a heavily-occluded capture never claims a clean, verified reach (MIRROR-COACH P4 fix)', () => {
  it('two present frames of an 80-frame reach: every check unreadable, the note says so — never "both arms even, full reach"', () => {
    const sparse = onlyFrames(filmOverhead({}), [14, 46]);
    const r = auditOverhead(sparse, {});
    expect(r.readableFrames).toBeLessThan(OVERHEAD_THRESHOLDS.minReadableFrames);
    for (const f of r.faults) expect(f.status).not.toBe('ok');
    expect(r.note).not.toMatch(/full reach/);
  });
  it('a "ghost rep" is never counted: reps only increments when a side\'s top-of-rep was actually captured', () => {
    const sparse = onlyFrames(filmOverhead({}), [14, 46]);
    const r = auditOverhead(sparse, {});
    expect(byId(r, 'reps')?.value ?? 0).toBe(0);
  });
  it('just under minReadableFrames is unreadable, not a partial grade', () => {
    const dim = onlyFrames(filmOverhead({}), Array.from({ length: OVERHEAD_THRESHOLDS.minReadableFrames - 1 }, (_, i) => 20 + i));
    const r = auditOverhead(dim, {});
    for (const f of r.faults) expect(f.status).not.toBe('ok');
  });
});

describe('the overhead audit: one check unreadable never lets the note claim the whole reach was clean (MIRROR-COACH P4 fix)', () => {
  it('zeroing both ears (shrug unreadable) on an otherwise clean, fully-read reach: note does not say "full reach"', () => {
    const noEars = filmOverhead({}).map((f) => ({
      ...f,
      image: f.image.map((l, i) => (i === LEFT_EAR || i === RIGHT_EAR ? { ...l, v: 0 } : l)),
    }));
    const r = auditOverhead(noEars, {});
    expect(byId(r, 'shrug', 'left')?.status).toBe('unreadable');
    expect(byId(r, 'shrug', 'right')?.status).toBe('unreadable');
    // everything the ears do not touch still reads clean — this is not a wholesale unreadable capture
    expect(byId(r, 'elevation', 'left')?.status).toBe('ok');
    expect(byId(r, 'elevation', 'right')?.status).toBe('ok');
    expect(r.note).not.toMatch(/both arms even, full reach/);
  });
});

describe('the overhead pattern export', () => {
  it('is registered with the contract\'s own shape', () => {
    expect(overheadPattern.id).toBe('overhead');
    expect(overheadPattern.view).toBe('front');
    expect(overheadPattern.youthSafe).toBe(true);
    expect(overheadPattern.cues.length).toBeGreaterThan(0);
    expect(overheadPattern.audit).toBe(auditOverhead);
  });
  it('carries a three-level cue per fault id; none brace, claim a rib, posture, health, risk, injury or a diagnosis', () => {
    for (const c of OVERHEAD_CUES) {
      expect(c.cue).not.toMatch(/\bbrace|postur|health|risk|injur|diagnos|prevent|\brib/i);
      expect(c.escalate).not.toMatch(/\bbrace|postur|health|risk|injur|diagnos|prevent|\brib/i);
      expect(c.regress).not.toMatch(/\bbrace|postur|health|risk|injur|diagnos|prevent|\brib/i);
    }
  });
});
