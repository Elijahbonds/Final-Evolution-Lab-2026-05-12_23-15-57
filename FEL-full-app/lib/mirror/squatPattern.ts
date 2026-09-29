// squatPattern — the corrective squat wrapped for the Phase-4 pattern-audit contract (MIRROR-COACH P4, 2026-09-25,
// lane 1: registry-and-lunge).
//
// THE SQUAT ITSELF DOES NOT CHANGE. Its live behaviour — the stateful, per-camera-frame
// lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts SquatAudit class, lib/mirror/squatStage.ts's breathe → check →
// work → review session, cue-engine.ts's voice — is what mirror-harness.tsx runs, exactly as it did before this
// phase. This file only wraps that SAME code behind the contract's pure, whole-capture shape (lib/mirror/patterns.ts
// MirrorPattern: `audit(frames, ctx) => PatternReading`), the way lib/mirror/hingeAudit.ts and pushupAudit.ts already
// do for their own patterns, so the squat can sit in MIRROR_PATTERNS as the registry's first entry (the brief's own
// words: "the existing squat is registered as the first entry, behaviour unchanged") and be graded the same way a
// fixture, a coach's summary, or a future Movement Screen station would grade any other registered pattern.
//
// Pure: an array of pose frames in, one PatternReading out — a single grade for the WHOLE capture, worst reading per
// check, the same shape hingeAudit.ts's auditHinge uses. This is a SEPARATE representation from the live session:
// the harness keeps running SquatAudit frame-by-frame for its real-time HUD and voice (unaffected by this file).
import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import type { PoseFrame as AdapterFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { SquatAudit, type SquatFault, type SquatFrameResult } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CUES } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { SQUAT_CHECK_REPS, SQUAT_WORK_REPS } from './squatStage';
import type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading } from './patterns';

/** The checks this contract reports for the squat — every SquatFault, in the order the live "four checks" list
 *  shows them, plus 'shallow' last (squat-audit.ts's own note: depth is reported per frame, the fault is a rep-level
 *  read — here, over the whole capture, the coarser "did it ever get reasonably deep" version of the same idea). */
const SQUAT_PATTERN_FAULT_IDS: readonly SquatFault[] = ['kneeValgus', 'heelRise', 'armFall', 'lateralShift', 'shallow'];
/** A capture never gets deep enough to call any rep full below this depth01 (squatStage.ts SHALLOW_REP_DROP is 0.1,
 *  a full rep is depth01 1; 0.5 — roughly thighs past parallel — sits between, FEL judgement, conservative). */
const SHALLOW_DEPTH01_MIN = 0.5;

const r2 = (x: number) => Math.round(x * 100) / 100;
const unreadable = (id: SquatFault, unit: string): PatternFaultReading => ({ id, value: 0, unit, status: 'unreadable' });
const UNIT: Record<SquatFault, string> = {
  kneeValgus: 'hipHalfWidths', heelRise: 'bool', armFall: 'bool', lateralShift: 'hipHalfWidths', shallow: 'fraction',
};

/** lib/pose/landmarks.ts's PoseFrame (image: Lm[], .v) → the mediapipe-adapter frame SquatAudit reads (landmarks: [],
 *  .visibility) — the same two-shapes bridge lib/mirror/hingeAudit.ts writes locally for framing.ts (lungeAudit.ts's
 *  own header explains why the Mirror carries both shapes). */
function toAdapterFrame(f: PoseFrame): AdapterFrame {
  return { present: f.present, timestampMs: f.t, landmarks: f.image.map((l: Lm) => ({ x: l.x, y: l.y, z: l.z, visibility: l.v })) };
}

/**
 * Grade a whole squat capture (every rep together, like hingeAudit.ts's auditHinge) — NOT the per-frame stream the
 * live session runs on. `ctx.side` and `ctx.baseline` are accepted for the contract (a squat reads both legs at
 * once, so `side` is not used) and reserved for the per-athlete baseline store a later phase adds.
 */
export function auditSquat(frames: PoseFrame[], ctx: MirrorPatternContext = {}): PatternReading {
  void ctx.side; void ctx.baseline;
  const audit = new SquatAudit();
  const reads: SquatFrameResult[] = frames.map((f) => audit.evaluate(toAdapterFrame(f)));
  // calibration ("Calibrating the standing line") and an absent frame both read present:false or a placeholder note —
  // only a frame the audit actually measured counts as readable (present.length below is the contract's readableFrames)
  const present = reads.filter((r) => r.present && !/Calibrating/i.test(r.note));
  if (present.length === 0) {
    return { faults: SQUAT_PATTERN_FAULT_IDS.map((id) => unreadable(id, UNIT[id])), readableFrames: 0, note: 'No body in view.' };
  }

  // the frontal/square reads (kneeValgus, armFall, lateralShift, heelRise — MIRROR-COACH P4's heel fix gates it the
  // same way) are only as good as the frames that were square to the camera; never square is "not read", not "clean"
  const squareVotes = present.filter((r) => r.phase !== 'standing' && r.square !== undefined);
  const everSquare = squareVotes.some((r) => r.square === true);

  const faults: PatternFaultReading[] = [];
  const boolFault = (id: 'heelRise' | 'armFall'): PatternFaultReading => {
    if (!everSquare) return unreadable(id, UNIT[id]);
    const fired = present.some((r) => r.faults.includes(id));
    return { id, value: fired ? 1 : 0, unit: UNIT[id], status: fired ? 'fault' : 'ok' };
  };
  faults.push(
    everSquare
      ? { id: 'kneeValgus', value: r2(Math.max(0, ...present.map((r) => r.valgusRatio))), unit: UNIT.kneeValgus, status: present.some((r) => r.faults.includes('kneeValgus')) ? 'fault' : 'ok' }
      : unreadable('kneeValgus', UNIT.kneeValgus),
  );
  faults.push(boolFault('heelRise'));
  faults.push(boolFault('armFall'));
  faults.push(
    everSquare
      ? { id: 'lateralShift', value: r2(Math.max(0, ...present.map((r) => r.lateralDrift))), unit: UNIT.lateralShift, status: present.some((r) => r.faults.includes('lateralShift')) ? 'fault' : 'ok' }
      : unreadable('lateralShift', UNIT.lateralShift),
  );
  const maxDepth01 = Math.max(0, ...present.map((r) => r.depth01));
  faults.push({ id: 'shallow', value: r2(maxDepth01), unit: UNIT.shallow, status: maxDepth01 < SHALLOW_DEPTH01_MIN ? 'fault' : 'ok' });

  const flagged = faults.filter((f) => f.status === 'fault').map((f) => f.id);
  const note = !everSquare
    ? 'Estimated: not square enough to the camera, across this clip, to read the knees or the sideways checks — depth alone: '
      + `${(maxDepth01 * 100).toFixed(0)}%.`
    : flagged.length
      ? `Estimated: ${flagged.join(', ')} on at least one rep.`
      : `Estimated: no faults over this capture · depth ${(maxDepth01 * 100).toFixed(0)}%.`;

  return { faults, readableFrames: present.length, note };
}

/** cue-engine.ts's own reviewed copy, reused rather than re-written — one CueRule per check this pattern reports
 *  (elbowFlare/shrug/trunkOffset are the press/row's own faults, not the squat's — cue-engine.ts FAULT_PRIORITY). */
export const SQUAT_CUES: readonly CueRule[] = SQUAT_PATTERN_FAULT_IDS.map((id) => ({ faultId: id, ...CUES[id] }));

/**
 * The registry entry (MIRROR-COACH P4 lane 1) — the brief's own words: "the existing squat is registered as the
 * first entry, behaviour unchanged". Same check/work split the live session already runs (squatStage.ts); no
 * max-effort or bracing cue here (a bodyweight squat, camera-only), so youthSafe is true throughout.
 */
export const squatPattern: MirrorPattern = {
  id: 'squat',
  label: 'Corrective Squat',
  view: 'front',
  reps: { checkReps: SQUAT_CHECK_REPS, workReps: SQUAT_WORK_REPS },
  audit: auditSquat,
  cues: SQUAT_CUES,
  youthSafe: true,
};
