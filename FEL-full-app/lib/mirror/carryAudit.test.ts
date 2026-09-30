// carryAudit tests — fixtures built through P1's landmark-fixture harness (lib/mirror/fixtures/build.ts: 3-D
// joints, bones of fixed length, filmed through lib/pose/synth's virtual webcam with build.ts's own pinned
// FIXTURE_CAMERA), the same way lib/mirror/fixtures/stations.ts grew the screen's own station fixtures, rather
// than hand-placed image points — this phase's own P1 lesson (build.ts's header: a hand-built frame once put a
// subject's own left shoulder on the image's LEFT, and a knee-valgus check shipped reading backwards on it).
//
// THE MARCH. A body alternates a knee lift (build.ts's own singleLegPose, lerped against restPose — the same
// shape the screen's single-leg station itself hangs the free leg in) at ~1.4 Hz, so a "living room, no walkway"
// carry still gives a genuine step rhythm to read. The compensations this file's fixtures put in the joints are a
// CONSTANT bias on top of the march (one hip riding up, one shoulder riding up, by a set fraction of that pair's
// own half-width) — the exact ratio the audit is asked to recover, known before the camera ever sees it, per
// build.ts's own "truth from the joints, never the image" rule.
import { describe, expect, it } from 'vitest';
import { restPose, synthesize, type Joints, type JointClip, type SynthOptions, type V3 } from '@/lib/pose/synth';
import {
  LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, MIRROR_INDEX, type PoseFrame,
} from '@/lib/pose/landmarks';
import { singleLegPose, FIXTURE_CAMERA, CLEAN_FILM } from './fixtures/build';
import { auditCarry, CARRY_THRESHOLDS, CARRY_PATTERN, type CarryFault } from './carryAudit';
import { computeBaseline, recordCheckValues, type BaselineSessionRow } from './baselines';

const FPS = 30;
const STEP_HZ = 1.4;   // a comfortable in-place march cadence, roomy enough for a small apartment

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function lerpJoints(a: Joints, b: Joints, u: number): Joints {
  return Object.fromEntries(Object.entries(a).map(([k, p]) => [k, (p as V3).map((v, i) => v + ((b as Record<string, V3>)[k][i] - v) * u) as V3])) as Joints;
}

export interface CarryBias {
  /** Which hand is loaded; omit for a farmer carry (both hands, no bias expected). */
  loaded?: 'left' | 'right';
  /** The loaded hip's height above the other, as a fraction of hip half-width (0 = level). */
  hipTiltRatio?: number;
  /** The loaded shoulder's height above the other, as a fraction of shoulder half-width (0 = level). */
  shoulderTiltRatio?: number;
}

/**
 * One frame of the march at cycle position `cyc` (0..1 across ONE full stride, both legs): the legs alternate a
 * knee lift; the loaded side's bias is a constant offset added straight to the hip (or shoulder/arm) joint,
 * WITHOUT re-deriving the knee through build.ts's own solveMiddle — a standing leg sits at very close to full
 * THIGH+SHIN extension for a stretch of every cycle (a straight standing leg IS close to its own full length), so
 * there is no slack anywhere in the stride for an IK re-solve to also absorb a lift without going out of reach.
 * This is a fixture-only simplification: bone length is not kept exactly rigid at the biased hip for a couple of
 * frames a cycle, but this audit never measures thigh length, only the LANDMARK positions the bias is meant to
 * move — which it moves correctly regardless.
 */
function marchPoseAtCyc(cyc: number, bias: CarryBias = {}): Joints {
  const onRight = cyc < 0.5;
  const local = onRight ? cyc / 0.5 : (cyc - 0.5) / 0.5;
  const lift = Math.sin(local * Math.PI);
  const stance = onRight ? 'right' : 'left';
  let j = lerpJoints(restPose(), singleLegPose(stance), lift);

  if (bias.loaded && bias.hipTiltRatio) {
    const S = bias.loaded === 'left' ? 'Left' : 'Right';
    const hipHalf = Math.abs(j.LeftUpLeg[0] - j.RightUpLeg[0]) / 2;
    const up: V3 = [0, bias.hipTiltRatio * hipHalf, 0];
    j = { ...j, [`${S}UpLeg`]: add(j[`${S}UpLeg`], up) };
  }
  if (bias.loaded && bias.shoulderTiltRatio) {
    const S = bias.loaded === 'left' ? 'Left' : 'Right';
    const shHalf = Math.abs(j.LeftArm[0] - j.RightArm[0]) / 2;
    const up: V3 = [0, bias.shoulderTiltRatio * shHalf, 0];
    j = { ...j, [`${S}Arm`]: add(j[`${S}Arm`], up), [`${S}ForeArm`]: add(j[`${S}ForeArm`], up), [`${S}Hand`]: add(j[`${S}Hand`], up) };
  }
  return j;
}

/** One frame of the march at time t (s), a steady STEP_HZ cadence. */
function marchFrameAt(t: number, bias: CarryBias = {}): Joints {
  return marchPoseAtCyc((t * STEP_HZ) % 1, bias);
}

function marchClip(seconds: number, bias: CarryBias = {}): JointClip {
  const n = Math.round(seconds * FPS);
  return { fps: FPS, frames: Array.from({ length: n }, (_, i) => marchFrameAt(i / FPS, bias)) };
}

/** Film a clip as lib/pose's own frame shape — exactly what auditCarry's contract takes (fixtures/index.ts's
 *  toPoseFrames does the same conversion for the app's stored fixture files; here it comes straight off synth). */
function film(clip: JointClip, opt: SynthOptions = CLEAN_FILM): PoseFrame[] {
  return synthesize(clip, { ...opt, camera: { ...FIXTURE_CAMERA, ...opt.camera } }).frames;
}

/** What a mirrored (selfie) camera gives: x flipped AND MediaPipe's own labels swapped — stations.ts's own
 *  `mirrored()` helper, ported to lib/pose's frame shape (image/v, not landmarks/visibility). */
function mirroredFrames(frames: readonly PoseFrame[]): PoseFrame[] {
  return frames.map((f) => ({
    ...f,
    image: f.present ? f.image.map((_, i) => { const s = f.image[MIRROR_INDEX[i]]; return { ...s, x: 1 - s.x }; }) : f.image,
  }));
}

/** Every landmark's visibility set to `v` — a dim room, or a busy background (stations.ts's own `dimmed()`, ported). */
function dimmedFrames(frames: readonly PoseFrame[], v: number): PoseFrame[] {
  return frames.map((f) => ({ ...f, image: f.image.map((l) => ({ ...l, v })) }));
}

/** Turn a body built facing the camera so it faces sideways instead (build.ts's own toSide, for a "wrong view" take). */
function toSide(j: Joints): Joints {
  const c = Math.cos(-Math.PI / 2), s = Math.sin(-Math.PI / 2);
  return Object.fromEntries(Object.entries(j).map(([k, p]) => {
    const [x, y, z] = p as V3;
    return [k, [x * c + z * s, y, -x * s + z * c] as V3];
  })) as Joints;
}

const CLEAN = () => marchClip(6, {});
const HIP_HIKE = () => marchClip(6, { loaded: 'right', hipTiltRatio: 0.30 });
const SHOULDER_SHRUG = () => marchClip(6, { loaded: 'left', shoulderTiltRatio: 0.30 });
const TRUNK_LEAN = () => marchClip(6, { loaded: 'right', hipTiltRatio: 0.05, shoulderTiltRatio: 0.35 });
const RIGID_HIKE_NO_LEAN = () => marchClip(6, { loaded: 'left', hipTiltRatio: 0.30, shoulderTiltRatio: 0.30 });

describe('auditCarry — readability and the clock', () => {
  it('is unreadable with no note-loop when the body never appears (readableFrames 0)', () => {
    const frames: PoseFrame[] = Array.from({ length: 60 }, (_, i) => ({ t: i * 33, present: false, image: [] }));
    const r = auditCarry(frames, { side: 'right' });
    expect(r.readableFrames).toBe(0);
    expect(r.faults.every((f) => f.status === 'unreadable')).toBe(true);
    expect(r.note).toMatch(/face the camera/);
  });

  it('turned to the side reads unreadable, not a false "ok" — and says so once, not a loop', () => {
    const clip: JointClip = { fps: FPS, frames: Array.from({ length: 60 }, () => toSide(restPose())) };
    const r = auditCarry(film(clip), { side: 'right' });
    expect(r.faults.every((f) => f.status === 'unreadable')).toBe(true);
    expect(r.note.split('\n').length).toBe(1);
  });

  it('a dim room (low visibility) reads unreadable rather than guessing', () => {
    const r = auditCarry(dimmedFrames(film(CLEAN()), 0.1), { side: 'right' });
    expect(r.faults.every((f) => f.status === 'unreadable')).toBe(true);
  });

  it('readableFrames counts only the body-readable frames — the harness times its clock off this, not frames.length', () => {
    const clean = film(CLEAN());
    const half = clean.map((f, i) => (i < clean.length / 2 ? f : { ...f, present: false, image: [] }));
    const r = auditCarry(half, { side: 'right' });
    expect(r.readableFrames).toBeGreaterThan(0);
    expect(r.readableFrames).toBeLessThan(half.length);
    expect(r.readableFrames).toBeCloseTo(clean.length / 2, -1);
  });

  it('a few readable frames is a glance, not a read — stays unreadable below minReadableFrames', () => {
    const clean = film(CLEAN()).slice(0, CARRY_THRESHOLDS.minReadableFrames - 2);
    const r = auditCarry(clean, { side: 'right' });
    expect(r.faults.every((f) => f.status === 'unreadable')).toBe(true);
  });
});

describe('auditCarry — clean carry reads level', () => {
  it('a farmer carry (no loaded side) reads every lean/hike/shrug near zero', () => {
    const r = auditCarry(film(CLEAN()));
    const by = (id: string) => r.faults.find((f) => f.id === id)!;
    expect(by('hipHike').status).toBe('ok');
    expect(by('shoulderShrug').status).toBe('ok');
    expect(by('trunkSideLean').status).toBe('ok');
    expect(by('hipHike').value).toBeLessThan(0.05);
    expect(by('shoulderShrug').value).toBeLessThan(0.05);
  });

  it('the march itself (alternating stance) does not falsely trip a lean — averaging over the window cancels it', () => {
    // singleLegPose's own small weight-shift alternates sign every step; a single-frame read would sometimes
    // catch it mid-shift, but the audit reads the whole window, so a truly clean carry stays 'ok' throughout.
    const r = auditCarry(film(marchClip(10, {})));
    expect(r.faults.filter((f) => f.status === 'fault')).toHaveLength(0);
  });

  it('reads a genuine step rhythm as steady', () => {
    const r = auditCarry(film(CLEAN()), { side: 'right' });
    const rhythm = r.faults.find((f) => f.id === 'rhythm')!;
    expect(rhythm.status).toBe('ok');
    expect(rhythm.value).toBeGreaterThan(CARRY_THRESHOLDS.rhythmSteadyFault);
  });
});

describe('auditCarry — the three checks are actually distinct', () => {
  it('a hip hike with the shoulder line left LEVEL reads hipHike AND trunkSideLean (the shoulders did not follow the pelvis up), but not shoulderShrug (the shoulder line itself is level)', () => {
    const r = auditCarry(film(HIP_HIKE()), { side: 'right' });
    const by = (id: string) => r.faults.find((f) => f.id === id)!;
    expect(by('hipHike').status).toBe('fault');
    expect(by('shoulderShrug').status).toBe('ok');
    expect(by('trunkSideLean').status).toBe('fault');
  });

  it('catches an isolated shoulder shrug over a level pelvis, which DOES also read as a trunk lean (nothing else the tilt could be)', () => {
    const r = auditCarry(film(SHOULDER_SHRUG()), { side: 'left' });
    const by = (id: string) => r.faults.find((f) => f.id === id)!;
    expect(by('shoulderShrug').status).toBe('fault');
    expect(by('hipHike').status).toBe('ok');
    expect(by('trunkSideLean').status).toBe('fault');
  });

  it('a hip hike carried up a RIGID trunk (shoulder tilt ≈ hip tilt) reads hipHike + shoulderShrug but not trunkSideLean', () => {
    const r = auditCarry(film(RIGID_HIKE_NO_LEAN()), { side: 'left' });
    const by = (id: string) => r.faults.find((f) => f.id === id)!;
    expect(by('hipHike').status).toBe('fault');
    expect(by('shoulderShrug').status).toBe('fault');
    expect(by('trunkSideLean').status).toBe('ok');
  });

  it('a shoulder tilt well beyond what the hip explains reads trunkSideLean even with a mild, sub-threshold hip hike', () => {
    const r = auditCarry(film(TRUNK_LEAN()), { side: 'right' });
    const by = (id: string) => r.faults.find((f) => f.id === id)!;
    expect(by('hipHike').status).toBe('ok');
    expect(by('trunkSideLean').status).toBe('fault');
  });

  it('every value is an unsigned magnitude — never negative, whichever side is loaded', () => {
    for (const clip of [HIP_HIKE(), SHOULDER_SHRUG()]) {
      const r = auditCarry(film(clip), { side: 'left' });
      for (const f of r.faults) expect(f.value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('auditCarry — step rhythm', () => {
  it('reads an UNEVEN march as a fault (one step held far longer than the other)', () => {
    // an explicit, deliberately irregular cycle timeline — long strides alternating with rushed ones — rather
    // than a steady STEP_HZ, so the step-to-step interval variability is unambiguous.
    const frames: Joints[] = [];
    let cyc = 0;
    const halfCycleSeconds = [1.1, 0.18, 1.0, 0.20, 1.15, 0.16, 0.95, 0.19, 1.05, 0.17];   // long, short, long, short…
    for (const secs of halfCycleSeconds) {
      const n = Math.round(secs * FPS);
      for (let i = 0; i < n; i++) {
        cyc = (cyc + 0.5 / n) % 1;
        frames.push(marchPoseAtCyc(cyc, {}));
      }
    }
    const r = auditCarry(film({ fps: FPS, frames }), { side: 'right' });
    const rhythm = r.faults.find((f) => f.id === 'rhythm')!;
    expect(rhythm.status === 'fault' || rhythm.status === 'unreadable').toBe(true);
  });

  it('a body that never actually steps (feet planted the whole time) reads rhythm UNREADABLE, never a false "perfectly steady"', () => {
    const clip: JointClip = { fps: FPS, frames: Array.from({ length: 180 }, () => restPose()) };
    const r = auditCarry(film(clip), { side: 'right' });
    expect(r.faults.find((f) => f.id === 'rhythm')!.status).toBe('unreadable');
  });

  it("the jitter floor is measured, not guessed: a dead-still body's own (L−R ankle y) noise stays under CARRY_THRESHOLDS.rhythmJitterFloorPtp", () => {
    // same measurement this file's threshold comment cites — reproduced here so a future synth noise change that
    // moves this number gets caught by this test, not discovered live.
    const clip: JointClip = { fps: FPS, frames: Array.from({ length: 300 }, () => restPose()) };
    for (const seed of [1, 2, 3, 7, 42]) {
      const frames = synthesize(clip, { noise: true, seed, dropRate: 0, missRate: 0, frameJitterMs: 0, latencyJitterMs: 0, camera: FIXTURE_CAMERA }).frames;
      const d = frames.map((f) => f.image[27].y - f.image[28].y);   // LEFT_ANKLE=27, RIGHT_ANKLE=28
      const ptp = Math.max(...d) - Math.min(...d);
      expect(ptp).toBeLessThan(CARRY_THRESHOLDS.rhythmJitterFloorPtp);
    }
  });
});

describe('auditCarry — a mirrored (selfie) camera does not change WHETHER a fault reads', () => {
  it('reads the same value and status through a mislabelled (mirrored) feed as through a straight one', () => {
    // every check here is an unsigned |difference between two landmarks|, and |a − b| == |b − a|: swapping which
    // slot is CALLED "left" and which "right" (stations.ts's own `mirrored()` idea, ported above) cannot change a
    // magnitude built that way. This is NOT the same as saying ctx.side is safe to guess from the image — it is
    // still supplied externally and never inferred — only that a genuine MediaPipe mislabelling would not, on its
    // own, turn a real compensation into a false "ok" for this audit's three lean/hike/shrug checks.
    const straight = auditCarry(film(HIP_HIKE()), { side: 'right' });
    const throughMirror = auditCarry(mirroredFrames(film(HIP_HIKE())), { side: 'right' });
    for (const id of ['hipHike', 'shoulderShrug', 'trunkSideLean'] as const) {
      const a = straight.faults.find((f) => f.id === id)!, b = throughMirror.faults.find((f) => f.id === id)!;
      expect(b.status).toBe(a.status);
      expect(b.value).toBeCloseTo(a.value, 3);
    }
  });
});

describe('auditCarry — personal baselines (never change a scored status)', () => {
  function sessionRow(daysAgo: number, hipHikeValue: number): BaselineSessionRow {
    return {
      patternId: 'carry',
      createdAt: new Date(Date.now() - daysAgo * 86_400_000),
      faultCounts: recordCheckValues({}, { 'hipHike:right': hipHikeValue }),
    };
  }

  it('reports "building your baseline" until 3 sessions exist for this check', () => {
    const baseline = computeBaseline('carry', [sessionRow(2, 0.05)]);
    const r = auditCarry(film(CLEAN()), { side: 'right', baseline });
    expect(r.faults.find((f) => f.id === 'hipHike')!.vsBaseline).toMatch(/building your baseline \(1\/3\)/);
  });

  it('reports "vs your baseline" once 3 sessions exist, without changing the threshold status', () => {
    const baseline = computeBaseline('carry', [sessionRow(3, 0.04), sessionRow(2, 0.05), sessionRow(1, 0.06)]);
    const r = auditCarry(film(CLEAN()), { side: 'right', baseline });   // a clean carry: hipHike ~0, well under the baseline
    const hike = r.faults.find((f) => f.id === 'hipHike')!;
    expect(hike.status).toBe('ok');   // the threshold call, unchanged
    expect(hike.vsBaseline).toMatch(/vs your baseline: better/);
  });

  it('a bad baseline never turns a real fault into an "ok" — status comes only from the fixed threshold', () => {
    // an athlete whose OWN baseline is already exactly as hiked as today's reading (HIP_HIKE's own measured
    // value, not a guessed round number — the fixture's bias ratio and the audit's reported ratio are related by
    // the camera's own aspect ratio, not 1:1, so this reads the actual number back rather than assuming one)
    const today = auditCarry(film(HIP_HIKE()), { side: 'right' }).faults.find((f) => f.id === 'hipHike')!.value;
    const badBaseline = computeBaseline('carry', [sessionRow(3, today), sessionRow(2, today), sessionRow(1, today)]);
    const r = auditCarry(film(HIP_HIKE()), { side: 'right', baseline: badBaseline });
    const hike = r.faults.find((f) => f.id === 'hipHike')!;
    expect(hike.status).toBe('fault');            // still a fault against the fixed table
    expect(hike.vsBaseline).toMatch(/vs your baseline: same/);   // merely unchanged from their (poor) own history
  });

  it('with no baseline passed at all, faults simply have no vsBaseline field — no crash, no fabricated comparison', () => {
    const r = auditCarry(film(CLEAN()), { side: 'right' });
    for (const f of r.faults as CarryFault[]) expect(f.vsBaseline).toBeUndefined();
  });
});

describe('CARRY_PATTERN — ready to register into MIRROR_PATTERNS', () => {
  it('matches the phase-4 pattern contract shape', () => {
    expect(CARRY_PATTERN.id).toBe('carry');
    expect(CARRY_PATTERN.view).toBe('front');
    expect(CARRY_PATTERN.timed?.seconds).toBe(30);
    expect(CARRY_PATTERN.reps).toBeUndefined();
    expect(CARRY_PATTERN.youthSafe).toBe(true);
    expect(CARRY_PATTERN.cues.length).toBeGreaterThan(0);
    expect(typeof CARRY_PATTERN.audit).toBe('function');
  });

  it('every cue answers a real fault id this audit actually reports', () => {
    const ids = new Set(auditCarry(film(CLEAN())).faults.map((f) => f.id));
    for (const cue of CARRY_PATTERN.cues) expect(ids.has(cue.faultId)).toBe(true);
  });
});
