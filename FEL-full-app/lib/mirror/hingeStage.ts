// hingeStage — the hip hinge, live (MIRROR-MOVES P2, 2026-10-07; plan Phase 2 / items #4 and #19: "hinge is not in the
// Pattern union"; owner decision 2026-10-07: hinge AND push-up). The Playbook's Movement 1, read from the SIDE.
//
// The live session is lib/mirror/sideRepStage.ts (setup side-on → check → work → review, each rep graded by the tested
// batch audit). This file is the hinge's wiring for it: the rep signal (how far the hip folds — hingeAudit.ts
// hipFlexionDeg on the near side), the grade (hingeAudit.ts auditHinge over the rep's frames), the coaching order, the
// review's words, and the safety-first framing the tab shows before Start.
//
// SAFETY FIRST, IN THE ORDER AND IN THE FRAMING. The coach's order puts the back's line first: the dowel-line read (ear,
// shoulder and hip off one straight line — a 2-D proxy, never a spine measurement, hingeAudit.ts (b)) outranks the hip:knee
// ratio and the shin. Before Start the tab says bodyweight only, side-on with the phone at hip height, and to hinge only as
// far as the back stays long — and to stop if anything hurts. Nothing here is a diagnosis; every number is an estimate.
//
// The thresholds the grade uses are hingeAudit.ts's HINGE_THRESHOLDS — PROPOSED, untouched here (the capture lane tunes
// them). The two numbers below only find where a rep starts and ends; they are new and marked TUNE.
import type { Lm } from '@/lib/pose/landmarks';
import { LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER } from '@/lib/pose/landmarks';
import { HINGE_CUES, auditHinge, hipFlexionDeg, type HingeFaultId } from './hingeAudit';
import { cueTableFor } from './patternCues';
import type { SideRepSpec } from './sideRepStage';

/** The hip has folded this far (degrees of hip flexion, 2-D) — the rep has started down. TUNE(elijah): the clean hinge
 *  fixture folds to ~83°, the knee-dominant one to ~68°; standing reads ~4°. */
export const HINGE_REP_DOWN_DEG = 35;
/** …and back under this, standing again — the rep is done. TUNE(elijah) */
export const HINGE_REP_UP_DEG = 15;

/** The coaching order: the back's line first (safety), then the hip:knee share, then the shin. */
export const HINGE_FAULTS: readonly HingeFaultId[] = ['dowelLine', 'hingeRatio', 'shinAngle'];

/** What each fault is called in the review — what the camera saw, never a cause or a diagnosis. */
export const HINGE_FAULT_LABEL: Readonly<Record<HingeFaultId, string>> = {
  dowelLine: 'Head-to-hips line breaking (the broomstick line)',
  hingeRatio: 'Knees doing the work — hips not travelling back',
  shinAngle: 'Shin drifting forward over the toes',
};

const vis = (l: Lm | undefined): l is Lm => !!l && l.v >= 0.5;
const pts = (image: readonly Lm[], side: 'left' | 'right') => side === 'left'
  ? { sh: image[LEFT_SHOULDER], hip: image[LEFT_HIP], knee: image[LEFT_KNEE] }
  : { sh: image[RIGHT_SHOULDER], hip: image[RIGHT_HIP], knee: image[RIGHT_KNEE] };

export const HINGE_LIVE: SideRepSpec<HingeFaultId> = {
  id: 'hinge',
  faults: HINGE_FAULTS,
  // patterns.ts hingePattern.reps — the squat's check/work convention
  checkReps: 3,
  workReps: 8,
  signal: (image, side) => {
    const p = pts(image, side);
    return vis(p.sh) && vis(p.hip) && vis(p.knee) ? hipFlexionDeg(p.sh, p.hip, p.knee) : null;
  },
  down: (deg) => deg >= HINGE_REP_DOWN_DEG,
  up: (deg) => deg <= HINGE_REP_UP_DEG,
  // on the feet: the shoulder is above the hip (image y down) — a body lying on the floor is not hinging
  inPosition: (image, side) => { const p = pts(image, side); return vis(p.sh) && vis(p.hip) && p.sh.y < p.hip.y; },
  audit: (frames, side) => auditHinge(frames, { side }),
};

/** The hinge's own coach table: hingeAudit.ts HINGE_CUES, in HINGE_FAULTS order. */
export const HINGE_CUE_TABLE = cueTableFor(HINGE_CUES, HINGE_FAULTS);

/** Before Start: how to set the phone up, and the safety line. Said on the tab, not spoken. */
export const HINGE_FRAMING = [
  'Stand side-on to the phone, about 2–3 m away, with the phone at hip height — the camera reads your hips travelling back, which it cannot see from the front.',
  'Bodyweight only. Hinge only as far as your back stays long, like a broomstick along it from head to hips — stop the set if anything hurts.',
] as const;

/** During setup: what to do before the first rep counts. */
export const HINGE_SETUP_LINE = 'Side-on to the camera, standing tall, arms hanging — the check starts when you are still.';
