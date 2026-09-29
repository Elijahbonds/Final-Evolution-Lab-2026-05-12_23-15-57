// pushupAudit.test — every fixture through the real audit (MIRROR-COACH P4, 2026-09-29): clean, sag, pike, partial,
// the knee variant, wrong view, low visibility and a mirrored (selfie) capture. Built through P1's landmark-fixture
// harness (lib/mirror/fixtures/build.ts's own pushupPose/kneePushupPose, FIXTURE_CAMERA and CLEAN_FILM) — never a
// hand-typed landmark — the same discipline lib/babylon/nexus/neuro-mirror/rules/squat-audit.test.ts and
// lungeAudit.test.ts hold. lib/pose/synth.ts itself is movement play's file and is only read here through build.ts's
// own exported pose functions and camera spec, per this phase's instructions.
import { describe, expect, it } from 'vitest';
import { synthesize } from '@/lib/pose/synth';
import { LEFT_EAR, LEFT_WRIST, MIRROR_INDEX, RIGHT_EAR, type PoseFrame } from '@/lib/pose/landmarks';
import { FIXTURE_CAMERA, CLEAN_FILM, filmFixture, pushupPose, type PushupOpts } from './fixtures/build';
import { auditPushup, PUSHUP_CUES, PUSHUP_THRESHOLDS, pushupPattern } from './pushupAudit';

// a still top (0.6 s), a smooth descent, a short hold at depth, a smooth rise, a short still top — one clean rep
const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
function repCurve(hold0: number, down: number, bottom: number, up: number, hold1: number, peak = 1): number[] {
  const d: number[] = [];
  for (let i = 0; i < hold0; i++) d.push(0);
  for (let i = 0; i < down; i++) d.push(ease((i + 1) / down) * peak);
  for (let i = 0; i < bottom; i++) d.push(peak);
  for (let i = 0; i < up; i++) d.push(ease(1 - (i + 1) / up) * peak);
  for (let i = 0; i < hold1; i++) d.push(0);
  return d;
}
const REP = (peak = 1) => repCurve(18, 20, 10, 20, 12, peak);

function filmPushup(opts: PushupOpts = {}, peak = 1): PoseFrame[] {
  const frames = REP(peak).map((d) => pushupPose(d, opts));
  return synthesize({ fps: 30, frames }, { ...CLEAN_FILM, camera: FIXTURE_CAMERA }).frames;
}

/** A mirrored (selfie) capture: x flipped AND MediaPipe's left/right labels swapped — the same transform
 *  fixtures.test.ts and fixtures/stations.ts use, applied to lib/pose/landmarks.ts's own PoseFrame. */
function mirrorFrames(frames: PoseFrame[]): PoseFrame[] {
  return frames.map((f) => ({
    ...f,
    image: f.present ? MIRROR_INDEX.map((m) => ({ ...f.image[m], x: 1 - f.image[m].x })) : f.image,
  }));
}

function lowVisibility(frames: PoseFrame[], factor: number): PoseFrame[] {
  return frames.map((f) => ({ ...f, image: f.image.map((l) => ({ ...l, v: l.v * factor })) }));
}

const byId = (r: ReturnType<typeof auditPushup>, id: string) => r.faults.find((f) => f.id === id);

describe('the push-up audit: a clean rep', () => {
  const clean = filmPushup({});
  const r = auditPushup(clean, {});

  it('counts exactly one rep', () => {
    expect(byId(r, 'reps')?.value).toBe(1);
    expect(r.readableFrames).toBeGreaterThan(0);
  });
  it('reads full depth, not partial', () => {
    expect(byId(r, 'depth')?.status).toBe('ok');
  });
  it('reads a straight line and a neutral neck', () => {
    expect(byId(r, 'bodyLine')?.status).toBe('ok');
    expect(byId(r, 'headLine')?.status).toBe('ok');
  });
  it('reads the hands as set up under the shoulders', () => {
    expect(byId(r, 'handSetup')?.status).toBe('ok');
  });
  it('reads the straight-leg variant, not the knee one', () => {
    expect(byId(r, 'kneeVariant')?.value).toBe(0);
  });
  it('says which side it read, and names no fault when there is none', () => {
    expect(r.note).toMatch(/left|right/);
    expect(r.note).toMatch(/clean line/);
  });
});

describe('the push-up audit: depth', () => {
  it('a full-depth rep is never called partial', () => {
    const r = auditPushup(filmPushup({}), {});
    expect(byId(r, 'depth')?.status).toBe('ok');
  });
  it('a rep that never gets close to the floor is PARTIAL, not silently passed', () => {
    const r = auditPushup(filmPushup({}, 0.35), {});
    expect(byId(r, 'reps')?.value).toBe(1);
    expect(byId(r, 'depth')?.status).toBe('fault');
    expect(byId(r, 'depth')!.value).toBeGreaterThan(PUSHUP_THRESHOLDS.partialElbowDeg);
  });
});

describe('the push-up audit: body line', () => {
  it('a sagging plank is a FAULT, signed negative', () => {
    const r = auditPushup(filmPushup({ hipOffM: -0.08 }), {});
    const f = byId(r, 'bodyLine')!;
    expect(f.status).toBe('fault');
    expect(f.value).toBeLessThan(0);
  });
  it('a piked plank is a FAULT, signed positive — the opposite sign of a sag', () => {
    const r = auditPushup(filmPushup({ hipOffM: 0.08 }), {});
    const f = byId(r, 'bodyLine')!;
    expect(f.status).toBe('fault');
    expect(f.value).toBeGreaterThan(0);
  });
  it('a small, noisy wobble under the warn line never latches a fault (persistence gate)', () => {
    // one single bad frame among clean ones — the persistence gate (bodyLinePersistFrames) must not fire on it
    const frames = filmPushup({});
    const spiked = frames.map((f, i) => {
      if (i !== 10 || !f.present) return f;
      const bad = [...f.image];
      bad[23] = { ...bad[23], y: bad[23].y - 0.2 };   // one frame's hip yanked far off the line
      return { ...f, image: bad };
    });
    const r = auditPushup(spiked, {});
    expect(byId(r, 'bodyLine')?.status).toBe('ok');
  });
});

describe('the push-up audit: knee push-ups', () => {
  it('auto-detects the knee variant from the knee sitting at the floor line', () => {
    const r = auditPushup(filmPushup({ kneeVariant: true }), {});
    expect(byId(r, 'kneeVariant')?.value).toBe(1);
  });
  it('grades the knee variant\'s body line against shoulder–hip–KNEE, not the (airborne) ankle', () => {
    const clean = auditPushup(filmPushup({ kneeVariant: true }), {});
    expect(clean.faults.find((f) => f.id === 'bodyLine')?.status).toBe('ok');
    const sagging = auditPushup(filmPushup({ kneeVariant: true, hipOffM: -0.08 }), {});
    expect(sagging.faults.find((f) => f.id === 'bodyLine')?.status).toBe('fault');
  });
  it('still counts reps and reads depth on a knee push-up', () => {
    const r = auditPushup(filmPushup({ kneeVariant: true }), {});
    expect(byId(r, 'reps')?.value).toBe(1);
    expect(byId(r, 'depth')?.status).toBe('ok');
  });
});

describe('the push-up audit: head line and hand set-up', () => {
  // The ear is derived from the Head/Neck joints through lib/pose/synth.ts's own head-orientation frame (bodyPoints),
  // which a plain Head-joint nudge does not push around predictably (moving Head alone also rotates the local frame
  // the ear is placed in, since it is built off the Head→Neck direction) — measured directly: shifting Head 30 cm
  // barely moves the read ear position at all. So a craning-forward neck is built the more direct way: the clean
  // capture's own EAR LANDMARK is shifted in the image after filming, the same technique the body-line persistence
  // test above uses for its one spiked frame.
  function filmWithHeadForward(aheadImg: number): PoseFrame[] {
    return filmPushup({}).map((f) => {
      if (!f.present) return f;
      const image = [...f.image];
      image[LEFT_EAR] = { ...image[LEFT_EAR], x: image[LEFT_EAR].x - aheadImg };
      return { ...f, image };
    });
  }
  it('a neutral neck reads OK', () => {
    const r = auditPushup(filmPushup({}), {});
    expect(byId(r, 'headLine')?.status).toBe('ok');
  });
  it('a head craned well ahead of the line is a FAULT', () => {
    const r = auditPushup(filmWithHeadForward(0.20), {});
    expect(byId(r, 'headLine')?.status).toBe('fault');
  });

  // Moving the LeftHand JOINT pre-synthesis also drags the shoulder–elbow–wrist angle the audit reads as "depth" (a
  // walked-out wrist looks bent from that angle alone) — the same confound the audit's own header notes about
  // gating hand set-up on the elbow. Shifting the filmed WRIST LANDMARK directly isolates the one thing this check
  // reads (where the wrist sits under the shoulder) from the elbow-angle-driven rep phase.
  function filmWithHandsWalked(outImg: number): PoseFrame[] {
    return filmPushup({}).map((f) => {
      if (!f.present) return f;
      const image = [...f.image];
      image[LEFT_WRIST] = { ...image[LEFT_WRIST], x: image[LEFT_WRIST].x - outImg };
      return { ...f, image };
    });
  }
  it('hands walked well out from under the shoulders is a FAULT', () => {
    const r = auditPushup(filmWithHandsWalked(0.20), {});
    expect(byId(r, 'handSetup')?.status).toBe('fault');
  });
});

describe('the push-up audit: view, visibility and a mirrored camera', () => {
  it('the wrong view (front-on) is UNREADABLE, once, with a turn-side-on prompt — no other check pretends to read it', () => {
    const front = filmFixture('stand_front');
    const r = auditPushup(front, {});
    expect(byId(r, 'reps')?.status).toBe('unreadable');
    expect(byId(r, 'depth')?.status).toBe('unreadable');
    expect(byId(r, 'bodyLine')?.status).toBe('unreadable');
    expect(r.note).toMatch(/side-on/i);
    expect(r.readableFrames).toBe(0);
  });
  it('unreadable is never "ok" on a low-visibility capture', () => {
    const dim = lowVisibility(filmPushup({}), 0.1);
    const r = auditPushup(dim, {});
    for (const f of r.faults) expect(f.status).not.toBe('ok');
  });
  it('a mirrored (selfie) stream reads the same rep, depth and body line as the direct one — only the side label swaps', () => {
    const direct = auditPushup(filmPushup({ hipOffM: -0.08 }), {});
    const mirrored = auditPushup(mirrorFrames(filmPushup({ hipOffM: -0.08 })), {});
    expect(mirrored.faults.find((f) => f.id === 'reps')?.value).toBe(direct.faults.find((f) => f.id === 'reps')?.value);
    const dBody = direct.faults.find((f) => f.id === 'bodyLine')!, mBody = mirrored.faults.find((f) => f.id === 'bodyLine')!;
    expect(mBody.status).toBe(dBody.status);
    expect(mBody.value).toBeCloseTo(dBody.value, 1);
    expect(mBody.side).not.toBe(dBody.side);       // the label the camera would actually give — swapped, on purpose
  });
  // MIRROR-COACH P4 review (2026-09-29): this audit had no minReadableFrames floor at all — only a bare
  // `readableFrames === 0` bail — so heavy occlusion (most of the capture absent) still returned a fully graded
  // reading off a handful of real data points. hingeAudit.ts/setupLine.ts/carryAudit.ts all carry this floor.
  it('heavy occlusion (well under minReadableFrames present) is unreadable, not a partial grade', () => {
    const clean = filmPushup({});
    const sparse = clean.map((f, i) => (i < PUSHUP_THRESHOLDS.minReadableFrames - 5 && f.present ? f : { ...f, present: false }));
    const r = auditPushup(sparse, {});
    expect(r.readableFrames).toBeLessThan(PUSHUP_THRESHOLDS.minReadableFrames);
    for (const f of r.faults) expect(f.status).not.toBe('ok');
  });
});

describe('the push-up audit: one unreadable check never lets the note claim the whole line was clean (MIRROR-COACH P4 fix)', () => {
  it('zeroing only the ears (headLine unreadable) on an otherwise clean rep: note does not say "clean line"', () => {
    const noEars = filmPushup({}).map((f) => ({
      ...f,
      image: f.image.map((l, i) => (i === LEFT_EAR || i === RIGHT_EAR ? { ...l, v: 0 } : l)),
    }));
    const r = auditPushup(noEars, {});
    expect(byId(r, 'headLine')?.status).toBe('unreadable');
    // everything the ears do not touch still reads clean — this is not a wholesale unreadable capture
    expect(byId(r, 'reps')?.status).toBe('ok');
    expect(byId(r, 'bodyLine')?.status).toBe('ok');
    expect(r.note).not.toMatch(/clean line/);
  });
});

// MIRROR-COACH P4 review (2026-09-29), a correction rather than a reproduction: the review flagged `kneeVariant`
// reporting `status: 'ok'` unconditionally, even when `variantFrames === 0` (e.g. "legs cropped out of a tight or
// too-close shot"). The source fix (gate it on `variantFrames > 0`, matching every other check in this file) is
// applied above regardless, as cheap defensive hardening — but tracing the actual call graph shows that scenario
// cannot happen through a real capture TODAY: `sideVisibility` (section 2, which both picks `side` and gates the
// whole reading's `readableFrames`) already requires the CHOSEN side's own knee+ankle to be visible before that side
// can contribute to `readableFrames` at all, and the variant loop (section 3) checks that same side's
// knee+ankle+shoulder — a strict subset of sideVisibility's six-point requirement. So any capture that clears
// `minReadableFrames` necessarily has the chosen side's knee+ankle visible on real frames, which means
// `variantFrames > 0` on those same frames. No fixture manipulation this file's own helpers can build reaches the
// 'unreadable' branch without ALSO tripping the (now-added) minReadableFrames gate first, at which point
// `kneeVariant` is not part of the returned fault list at all — so no regression test is added for this one; the
// note above documents why, rather than asserting a scenario that cannot occur.

describe('the push-up pattern export', () => {
  it('is registered with the contract\'s own shape', () => {
    expect(pushupPattern.id).toBe('pushup');
    expect(pushupPattern.view).toBe('side');
    expect(pushupPattern.youthSafe).toBe(true);
    expect(pushupPattern.cues.length).toBeGreaterThan(0);
    expect(pushupPattern.audit).toBe(auditPushup);
  });
  // MIRROR-COACH P4 review (2026-09-29): PUSHUP_CUES.bodyLine used to read "brace before you move" — a bracing
  // instruction sitting inside a pattern marked youthSafe: true (a minor is never meant to see a max-effort/bracing
  // cue, owner decision #6). Fixed to "set it before you move"; this test is the regression guard hingeAudit.test.ts
  // and setupLine.test.ts already carry for their own cue tables, extended here so pushupAudit.ts gets the same one.
  it('carries a three-level cue per fault id; none brace, claim a rib, posture, health, risk, injury or a diagnosis', () => {
    for (const c of PUSHUP_CUES) {
      expect(c.cue).not.toMatch(/\bbrace|postur|health|risk|injur|diagnos|prevent|\brib/i);
      expect(c.escalate).not.toMatch(/\bbrace|postur|health|risk|injur|diagnos|prevent|\brib/i);
      expect(c.regress).not.toMatch(/\bbrace|postur|health|risk|injur|diagnos|prevent|\brib/i);
    }
  });
});
