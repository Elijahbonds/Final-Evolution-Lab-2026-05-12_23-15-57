// pushupStage — the push-up, live (MIRROR-MOVES P2, 2026-10-07; owner decision 2026-10-07: hinge AND push-up). Read from
// the SIDE, with the phone on the floor.
//
// The live session is lib/mirror/sideRepStage.ts (setup side-on → check → work → review, each rep graded by the tested
// batch audit). This file is the push-up's wiring for it: the rep signal (the near elbow's angle), the grade
// (pushupAudit.ts auditPushup over the rep's frames — depth, body line, head line, hand set-up, the knee variant read as
// it reads it), the coaching order, the review's words and the framing the tab shows before Start.
//
// NO NEW GRADING NUMBER. The rep is armed and closed on pushupAudit.ts's own armedElbowDeg — the same line the audit counts
// its reps by — so the live count and the grade can never disagree about where a rep is. The one new rule is the start
// position: the body lying along the floor (the shoulder-to-hip line nearer horizontal than vertical), so the elbows
// bending while someone gets down to the floor never count as a rep. Every threshold the grade uses is PUSHUP_THRESHOLDS,
// PROPOSED, untouched here (the capture lane tunes them).
import type { Lm } from '@/lib/pose/landmarks';
import { LM } from '@/lib/pose/landmarks';
import { PUSHUP_CUES, PUSHUP_THRESHOLDS, auditPushup } from './pushupAudit';
import { cueTableFor } from './patternCues';
import type { SideRepSpec } from './sideRepStage';

export type PushupFault = 'bodyLine' | 'handSetup' | 'headLine' | 'depth';

/** The coaching order: the body line first (a sagging plank), then the hands under the shoulders, the head, the depth. */
export const PUSHUP_FAULTS: readonly PushupFault[] = ['bodyLine', 'handSetup', 'headLine', 'depth'];

/** What each fault is called in the review — what the camera saw, never a cause or a diagnosis. */
export const PUSHUP_FAULT_LABEL: Readonly<Record<PushupFault, string>> = {
  bodyLine: 'Hips off the head-to-heels line (sagging or piking)',
  handSetup: 'Hands not under the shoulders at the top',
  headLine: 'Head reaching off the body line',
  depth: 'Reps stopping short of the bottom',
};

const vis = (l: Lm | undefined): l is Lm => !!l && l.v >= PUSHUP_THRESHOLDS.minVis;
const IDX = {
  left: { sh: LM.left_shoulder, el: LM.left_elbow, wr: LM.left_wrist, hip: LM.left_hip },
  right: { sh: LM.right_shoulder, el: LM.right_elbow, wr: LM.right_wrist, hip: LM.right_hip },
} as const;

/** The 2-D interior angle at b, degrees (pushupAudit.ts's own angleDeg). */
function angleDeg(a: Lm, b: Lm, c: Lm): number {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const ul = Math.hypot(ux, uy), vl = Math.hypot(vx, vy);
  if (ul < 1e-6 || vl < 1e-6) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (ul * vl)))) * 180) / Math.PI;
}

export const PUSHUP_LIVE: SideRepSpec<PushupFault> = {
  id: 'pushup',
  faults: PUSHUP_FAULTS,
  // patterns.ts pushupPattern.reps — the squat's check/work convention
  checkReps: 3,
  workReps: 8,
  signal: (image, side) => {
    const i = IDX[side];
    const sh = image[i.sh], el = image[i.el], wr = image[i.wr];
    return vis(sh) && vis(el) && vis(wr) ? angleDeg(sh, el, wr) : null;
  },
  down: (deg) => deg < PUSHUP_THRESHOLDS.armedElbowDeg,
  up: (deg) => deg >= PUSHUP_THRESHOLDS.armedElbowDeg,
  // lying along the floor: the shoulder-to-hip line nearer horizontal than vertical in the image
  inPosition: (image, side) => {
    const i = IDX[side];
    const sh = image[i.sh], hip = image[i.hip];
    return vis(sh) && vis(hip) && Math.abs(sh.y - hip.y) < Math.abs(sh.x - hip.x);
  },
  audit: (frames, side) => auditPushup(frames, { side }),
};

/** The push-up's own coach table: pushupAudit.ts PUSHUP_CUES, in PUSHUP_FAULTS order. */
export const PUSHUP_CUE_TABLE = cueTableFor(PUSHUP_CUES, PUSHUP_FAULTS);

/** Before Start: how to set the phone up. Said on the tab, not spoken. */
export const PUSHUP_FRAMING = [
  'Put the phone on the floor, side-on to you, about 2 m away, so it sees you from head to heels — the camera reads your body line and depth from the side.',
  'Knees down is a push-up too: the Mirror reads that variant the same way. Stop the set if anything hurts.',
] as const;

/** During setup: what to do before the first rep counts. */
export const PUSHUP_SETUP_LINE = 'Side-on to the camera, in your plank with straight arms — the check starts when you are still.';
