// overheadAudit — the Mirror's front-on read of the overhead reach, both arms (MIRROR-COACH P4, 2026-09-29).
//
// WHY THE FRONT VIEW. Left/right symmetry and a shrug (the shoulder hiking toward the ear) are FRONTAL-plane reads —
// they need both shoulders in the same shot, which a side view never gives. This is the same declared-view reasoning
// framing.ts and squat-audit.ts give for the squat and the lunge.
//
// WHAT THIS DOES NOT READ, AND WHY. No lumbar, rib or breath measurement of any kind. From the FRONT, in 2-D, there
// is no way to see the spine extend or the ribs flare — that is a SIDE-view, and even from the side the pose model
// has no rib landmark (lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts's own header makes the same point about
// its "trunkOffset" fault: a shoulder-vs-hip MIDPOINT offset, never a rib). An overhead reach that looks fine here
// and loads the low back badly is real and this audit cannot see it; it reads what 33 2-D landmarks, front-on, can:
// where the wrist ends up, whether the two arms agree, and whether the shoulder does the trap's job.
//
// PURE, BATCH, same contract as pushupAudit.ts (lib/mirror/patterns.ts's PHASE-4 PATTERN CONTRACT): the whole
// capture goes in, one PatternReading comes out.
//
// LEFT/RIGHT ARE MEDIAPIPE'S LABELS, READ DIRECTLY — unlike pushupAudit.ts's side view, a front-on reach needs BOTH
// shoulders in the same frame, so there is no "which side is better seen" choice to make. A mirrored (selfie) stream
// still reads correctly in the sense squat-audit.ts documents: the same verdict, the same magnitude, with the LEFT
// and RIGHT labels swapped between the two arms — overheadAudit.test.ts proves it.
//
// EVERY NUMBER IS AN ESTIMATE FROM 33 2-D LANDMARKS. "Elevation" is the 2-D angle a shoulder→wrist line makes with
// vertical in the image, not a true 3-D shoulder-flexion angle; a reach toward or away from the camera reads as more
// overhead than it is. Labelled 'estimated' throughout, per screen.ts's own rule.
import { LM, type Lm, type PoseFrame } from '@/lib/pose/landmarks';
import { checkFraming, type FramingFrame } from './framing';
import type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading } from './patterns';

type Side = 'left' | 'right';

export interface OverheadThresholds {
  minVis: number;
  /** Average elevation (degrees from vertical) below which the reach counts as "armed" toward the top, and above
   *  which a completed rep's phase returns to "down". Measured: hanging at the sides reads ≈180°; a full reach ≈3°. */
  armedElevationDeg: number;
  /** A rep's top elevation above this, per arm, is NOT a full overhead reach. Measured: a full reach reads ≈3°; an
   *  arm stopping at shoulder height (a lateral raise) or short of it reads well past 45°. */
  elevationWarn: number;
  /** The two arms' elevation at the top, degrees apart, above which the reach is asymmetric. Measured: a clean reach
   *  reads 0°; one arm 50° short of the other reads ≈47° apart. */
  asymmetryWarn: number;
  /** The shoulder–ear gap's SHRINK at the top, as a share of its standing (arms-down) value: how much the shoulder
   *  hiked up toward the ear. Measured: no shrug reads ≈0; a 6 cm shoulder rise reads ≈0.25 (a quarter of the gap
   *  closed). */
  shrugWarn: number;
  /** Elbow angle (degrees) at the top below which the arm is not locked out. Measured: a straight reach reads ≈178°
   *  (the synth's own rest pose is not a perfect 178° even fully extended); a 30° bend at the top reads ≈155°. */
  elbowBendWarn: number;
  /** Below this many readable frames, nothing is scored at all — the same "a glance is not a read" floor
   *  hingeAudit.ts/setupLine.ts/carryAudit.ts (CARRY_THRESHOLDS.minReadableFrames) already apply. MIRROR-COACH P4
   *  review (2026-09-29): this audit shipped with no such floor at all — only a `readableFrames === 0` bail — so 3
   *  real data points out of an 80-frame capture (heavy occlusion) still returned a fully graded reading. */
  minReadableFrames: number;
}
export const OVERHEAD_THRESHOLDS: OverheadThresholds = {
  minVis: 0.5,
  armedElevationDeg: 120,   // TUNE(elijah)
  elevationWarn: 30,        // TUNE(elijah)
  asymmetryWarn: 15,        // TUNE(elijah)
  shrugWarn: 0.15,          // TUNE(elijah) — see the field comment above for what this was measured against
  elbowBendWarn: 165,       // TUNE(elijah)
  minReadableFrames: 10,
};

export const OVERHEAD_CUES: readonly CueRule[] = [
  { faultId: 'elevation', cue: 'All the way up — reach past your ears, not out to the sides.',
    escalate: 'Still stopping short. Slow the press and finish tall before you come back down.',
    regress: 'Half the range, both arms even — build the reach before you chase the top.' },
  { faultId: 'asymmetry', cue: 'Match the arms — both reach the same height, together.',
    escalate: 'One arm is still leading. Slow down and let the short side catch up.',
    regress: 'One arm at a time, in front of a mirror, until they match.' },
  { faultId: 'shrug', cue: 'Shoulders down and away from your ears as you press.',
    escalate: 'The shoulders are climbing again. Set them down first, then reach.',
    regress: 'Lighter reach, shoulders pinned — the arm does the reaching, not the neck.' },
  { faultId: 'elbowBend', cue: 'Lock it out at the top — arm straight, not stopping bent.',
    escalate: 'Still finishing bent. Press through to a straight arm before you lower.',
    regress: 'Smaller range, but straight at the top every time.' },
];

const vis = (l: Lm | undefined, t: number): l is Lm => !!l && l.v >= t;

function angleDeg(a: Lm, b: Lm, c: Lm): number {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const ul = Math.hypot(ux, uy), vl = Math.hypot(vx, vy);
  if (ul < 1e-6 || vl < 1e-6) return 0;
  const cosv = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (ul * vl)));
  return (Math.acos(cosv) * 180) / Math.PI;
}

/** The shoulder→wrist line's angle from image-up (0,-1), degrees: 0 = straight overhead, 180 = hanging at the side. */
function elevationDeg(shoulder: Lm, wrist: Lm): number {
  const dx = wrist.x - shoulder.x, dy = wrist.y - shoulder.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) return 180;
  // (0,-1) is "up" in image coordinates (y grows downward); acos of the dot product with the unit reach vector
  const cosv = Math.max(-1, Math.min(1, -dy / l));
  return (Math.acos(cosv) * 180) / Math.PI;
}

const IDX = {
  left: { shoulder: LM.left_shoulder, elbow: LM.left_elbow, wrist: LM.left_wrist, ear: LM.left_ear },
  right: { shoulder: LM.right_shoulder, elbow: LM.right_elbow, wrist: LM.right_wrist, ear: LM.right_ear },
} as const;

const asFramingFrame = (f: PoseFrame): FramingFrame => ({
  present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })),
});

const r2 = (x: number) => Math.round(x * 100) / 100;
function reading(id: string, value: number, unit: string, fault: boolean, side?: Side): PatternFaultReading {
  return { id, ...(side ? { side } : {}), value: r2(value), unit, status: fault ? 'fault' : 'ok' };
}
function unreadable(id: string, unit: string, side?: Side): PatternFaultReading {
  return { id, ...(side ? { side } : {}), value: 0, unit, status: 'unreadable' };
}

interface SideTrack {
  /** This side's elevation at the frame of the deepest (best) combined reach this rep — the "at the top" read. */
  elevAtTop: number[];
  elbowAtTop: number[];
  /** Standing (arms-down) shoulder–ear gap samples, for the shrug baseline. */
  standGap: number[];
  /** The smallest shoulder–ear gap seen anywhere in the capture (the most-shrugged moment). */
  minGap: number;
  anyGap: boolean;
  anyVisible: boolean;
}
const newTrack = (): SideTrack => ({ elevAtTop: [], elbowAtTop: [], standGap: [], minGap: Infinity, anyGap: false, anyVisible: false });

/** The overhead-reach audit, both arms, front-on. */
export function auditOverhead(frames: PoseFrame[], _ctx: MirrorPatternContext = {}): PatternReading {
  // 1) THE VIEW — front-on, or unreadable once with a plain prompt (no retry loop).
  const framingFrames = frames.map(asFramingFrame);
  const presentCount = frames.filter((f) => f.present).length;
  const frontCount = framingFrames.filter((f) => checkFraming(f, 'front').ok).length;
  const emptyReading = (note: string): PatternReading => ({
    faults: [
      unreadable('elevation', 'deg', 'left'), unreadable('elevation', 'deg', 'right'),
      unreadable('asymmetry', 'deg'), unreadable('shrug', 'ratio', 'left'), unreadable('shrug', 'ratio', 'right'),
      unreadable('elbowBend', 'deg', 'left'), unreadable('elbowBend', 'deg', 'right'), unreadable('reps', 'reps'),
    ],
    readableFrames: 0, note,
  });
  if (presentCount === 0) return emptyReading('Step into the shot — I cannot see you yet.');
  if (frontCount < presentCount * 0.5) return emptyReading('Face the camera square-on — I read an overhead reach from the front.');

  const t = OVERHEAD_THRESHOLDS;
  const left = newTrack(), right = newTrack();
  let readableFrames = 0, reps = 0, armed = false;
  let repBestElev = Infinity;

  let repShoulderL: Lm | null = null, repElbowL: Lm | null = null, repWristL: Lm | null = null;
  let repShoulderR: Lm | null = null, repElbowR: Lm | null = null, repWristR: Lm | null = null;

  for (const f of frames) {
    if (!f.present) continue;
    const ls = f.image[IDX.left.shoulder], le = f.image[IDX.left.elbow], lw = f.image[IDX.left.wrist], lEar = f.image[IDX.left.ear];
    const rs = f.image[IDX.right.shoulder], re = f.image[IDX.right.elbow], rw = f.image[IDX.right.wrist], rEar = f.image[IDX.right.ear];
    const leftOk = vis(ls, t.minVis) && vis(le, t.minVis) && vis(lw, t.minVis);
    const rightOk = vis(rs, t.minVis) && vis(re, t.minVis) && vis(rw, t.minVis);
    if (!leftOk && !rightOk) continue;
    readableFrames++;

    const elevL = leftOk ? elevationDeg(ls, lw) : null;
    const elevR = rightOk ? elevationDeg(rs, rw) : null;
    if (leftOk) left.anyVisible = true;
    if (rightOk) right.anyVisible = true;

    // the shrug gap: shoulder-to-ear image distance, tracked (min) and baselined off the "arms mostly down" frames
    if (leftOk && vis(lEar, t.minVis)) {
      const gap = Math.hypot(ls.x - lEar.x, ls.y - lEar.y);
      left.anyGap = true;
      left.minGap = Math.min(left.minGap, gap);
      if ((elevL ?? 180) >= 150) left.standGap.push(gap);
    }
    if (rightOk && vis(rEar, t.minVis)) {
      const gap = Math.hypot(rs.x - rEar.x, rs.y - rEar.y);
      right.anyGap = true;
      right.minGap = Math.min(right.minGap, gap);
      if ((elevR ?? 180) >= 150) right.standGap.push(gap);
    }

    // rep phase: armed on the way up (whichever side is readable; the average when both are), the BEST (lowest
    // combined) elevation frame in the rep is where "at the top" is read for both arms and the elbow
    const combined = elevL !== null && elevR !== null ? (elevL + elevR) / 2 : elevL ?? elevR ?? 180;
    if (!armed && combined < t.armedElevationDeg) { armed = true; repBestElev = combined; }
    else if (armed) {
      if (combined < repBestElev) {
        repBestElev = combined;
        repShoulderL = leftOk ? ls : repShoulderL; repElbowL = leftOk ? le : repElbowL; repWristL = leftOk ? lw : repWristL;
        repShoulderR = rightOk ? rs : repShoulderR; repElbowR = rightOk ? re : repElbowR; repWristR = rightOk ? rw : repWristR;
      }
      if (combined >= t.armedElevationDeg) {
        // MIRROR-COACH P4 review (2026-09-29): `reps++` used to fire here UNCONDITIONALLY, whether or not either
        // side's shoulder/elbow/wrist were ever actually captured for this rep — repShoulderL/R only get set above
        // when a frame's `combined` beats the running `repBestElev`, which a rep that arms and closes across very
        // few present frames (heavy occlusion; two frames of a 60-frame scripted reach was enough to reproduce it)
        // can skip entirely. That left `reps: 1` reported with every elevation/asymmetry/shrug/elbowBend fault
        // 'unreadable' — a "ghost rep" feeding the false-positive "both arms even, full reach" note above. A rep
        // with nothing captured on EITHER side is not countable: it does not increment the athlete-facing rep count.
        const capturedL = !!(repShoulderL && repElbowL && repWristL);
        const capturedR = !!(repShoulderR && repElbowR && repWristR);
        if (capturedL) { left.elevAtTop.push(elevationDeg(repShoulderL!, repWristL!)); left.elbowAtTop.push(angleDeg(repShoulderL!, repElbowL!, repWristL!)); }
        if (capturedR) { right.elevAtTop.push(elevationDeg(repShoulderR!, repWristR!)); right.elbowAtTop.push(angleDeg(repShoulderR!, repElbowR!, repWristR!)); }
        if (capturedL || capturedR) reps++;
        armed = false; repBestElev = Infinity;
        repShoulderL = repElbowL = repWristL = repShoulderR = repElbowR = repWristR = null;
      }
    }
  }
  // a rep still under way at the end of the capture is read at its best point so far, the same as pushupAudit.ts —
  // same "nothing captured, nothing counted" gate as above.
  if (armed) {
    const capturedL = !!(repShoulderL && repElbowL && repWristL);
    const capturedR = !!(repShoulderR && repElbowR && repWristR);
    if (capturedL) { left.elevAtTop.push(elevationDeg(repShoulderL!, repWristL!)); left.elbowAtTop.push(angleDeg(repShoulderL!, repElbowL!, repWristL!)); }
    if (capturedR) { right.elevAtTop.push(elevationDeg(repShoulderR!, repWristR!)); right.elbowAtTop.push(angleDeg(repShoulderR!, repElbowR!, repWristR!)); }
    if (capturedL || capturedR) reps++;
  }

  if (readableFrames < t.minReadableFrames) return emptyReading('I can see you, but not well enough to read the reach — more light, or step back a little.');

  const worst = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  const elevL = worst(left.elevAtTop), elevR = worst(right.elevAtTop);
  const elbowL = left.elbowAtTop.length ? Math.min(...left.elbowAtTop) : null;
  const elbowR = right.elbowAtTop.length ? Math.min(...right.elbowAtTop) : null;
  const asym = elevL !== null && elevR !== null ? Math.abs(elevL - elevR) : null;

  const shrinkOf = (side: SideTrack): number | null => {
    if (!side.anyGap || side.standGap.length === 0 || !Number.isFinite(side.minGap)) return null;
    const base = side.standGap.reduce((a, b) => a + b, 0) / side.standGap.length;
    if (base < 1e-6) return null;
    return 1 - side.minGap / base;
  };
  const shrinkL = shrinkOf(left), shrinkR = shrinkOf(right);

  const faults: PatternFaultReading[] = [
    elevL !== null ? reading('elevation', elevL, 'deg', elevL > t.elevationWarn, 'left') : unreadable('elevation', 'deg', 'left'),
    elevR !== null ? reading('elevation', elevR, 'deg', elevR > t.elevationWarn, 'right') : unreadable('elevation', 'deg', 'right'),
    asym !== null ? reading('asymmetry', asym, 'deg', asym >= t.asymmetryWarn) : unreadable('asymmetry', 'deg'),
    shrinkL !== null ? reading('shrug', shrinkL, 'ratio', shrinkL >= t.shrugWarn, 'left') : unreadable('shrug', 'ratio', 'left'),
    shrinkR !== null ? reading('shrug', shrinkR, 'ratio', shrinkR >= t.shrugWarn, 'right') : unreadable('shrug', 'ratio', 'right'),
    elbowL !== null ? reading('elbowBend', elbowL, 'deg', elbowL < t.elbowBendWarn, 'left') : unreadable('elbowBend', 'deg', 'left'),
    elbowR !== null ? reading('elbowBend', elbowR, 'deg', elbowR < t.elbowBendWarn, 'right') : unreadable('elbowBend', 'deg', 'right'),
    { id: 'reps', value: reps, unit: 'reps', status: 'ok' },
  ];

  // MIRROR-COACH P4 review (2026-09-29): this used to call `activeFaults.length === 0` "both arms even, full reach"
  // — but that only means nothing read 'fault'; a check that read 'unreadable' (occlusion, a rep too short to
  // capture a top-of-rep sample) ALSO leaves activeFaults empty, so a capture where every arm/shrug/elbow check was
  // never actually read still claimed a clean, verified reach. Reproduced: two present frames of a 60-frame scripted
  // reach (everything else marked absent) left every check 'unreadable' yet still said "both arms even, full reach".
  // Fixed the same way hingeAudit.ts's/setupLine.ts's own notes already do: a clean claim requires every check to
  // have actually read 'ok', not merely "not a fault".
  const activeFaults = [...new Set(faults.filter((f) => f.status === 'fault').map((f) => f.id))];
  const anyUnreadable = faults.some((f) => f.status === 'unreadable');
  const note = reps === 0
    ? 'Estimated: no full reach read yet'
    : activeFaults.length
      ? `Estimated: ${reps} rep${reps === 1 ? '' : 's'} · ${activeFaults.join(', ')}`
      : anyUnreadable
        ? `Estimated: ${reps} rep${reps === 1 ? '' : 's'} · not enough of the reach was readable to call it clean`
        : `Estimated: ${reps} rep${reps === 1 ? '' : 's'} · both arms even, full reach`;

  return { faults, readableFrames, note };
}

export const overheadPattern: MirrorPattern = {
  id: 'overhead',
  label: 'Overhead reach',
  view: 'front',
  reps: { checkReps: 3, workReps: 8 },
  audit: auditOverhead,
  cues: OVERHEAD_CUES,
  youthSafe: true,
};
