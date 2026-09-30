// pushupAudit — the Mirror's side-on read of the push-up (MIRROR-COACH P4, 2026-09-29).
//
// WHY THE SIDE VIEW. Depth (the elbow bend), the body line (hips sagging or piking off the shoulder–ankle line) and
// the head line (the neck craning forward) are all SAGITTAL-PLANE reads — from the front the body's whole length
// collapses to one silhouette and none of them can be measured. This is the same reasoning framing.ts and
// squat-audit.ts already give for the hinge (side) and the squat/lunge (front): a pattern declares the view its own
// measurements need, and the framing check enforces THAT view, not always square-on.
//
// PURE, BATCH. Where squat-audit.ts and lungeAudit.ts are stateful classes fed one live camera frame at a time, this
// is the shape lib/mirror/patterns.ts's PHASE-4 PATTERN CONTRACT asks every new pattern for: `audit(frames, ctx) =>
// PatternReading` over a whole recorded capture. It still calibrates from the capture's own first readable frames
// and tracks a running rep phase — that discipline does not go away — it is just all done in one pass over an array
// instead of being called back into on every tick.
//
// WHICH SIDE IS VISIBLE. The Mirror's own convention (framing.ts, squat-audit.ts) is a side view shows the subject's
// LEFT shoulder to the camera — but a mirrored (selfie) stream swaps MediaPipe's left/right labels for the very same
// silhouette (lib/pose/landmarks.ts MIRROR_INDEX). Rather than assume the label, every frame is read from WHICHEVER
// side's shoulder/hip/knee/ankle/wrist are better seen (ctx.side, when given, only breaks a near-tie), so this reads
// a mirrored capture exactly as it reads a direct one — pushupAudit.test.ts proves it on both.
//
// KNEE PUSH-UPS. A bent-knee push-up plants the KNEE, not the ankle, on the floor: from the side the knee then sits
// AT OR BELOW the ankle in the image (image y DOWN — "below" is the larger value, nearer the floor), where a
// straight-leg push-up holds the knee well clear of the floor, above the ankle. That single comparison is the
// variant switch; nothing else about the read changes mode. The body-line check then reads shoulder–hip–KNEE
// instead of shoulder–hip–ANKLE, because the ankle is airborne on a knee push-up and has nothing to say about the
// plank (lib/mirror/fixtures/build.ts kneePushupPose is the fixture this was proved against).
//
// EVERY NUMBER IS AN ESTIMATE FROM 33 2-D LANDMARKS (screen.ts's rule, squat-audit.ts's own header). Nothing here is
// a depth camera or a force plate; "hips off the line" is a 2-D projection, not a measured joint torque.
import { LM, type Lm, type PoseFrame } from '@/lib/pose/landmarks';
import { checkFraming, type FramingFrame } from './framing';
import type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading } from './patterns';

type Side = 'left' | 'right';

export interface PushupThresholds {
  minVis: number;
  /**
   * Elbow angle (degrees) below which a rep is ARMED (the descent has clearly started) and above which a rep
   * CLOSES (back near the top) — a lenient hysteresis line, deliberately far from partialElbowDeg. Measured: even a
   * very shallow rep (peak depth 35% of the range) still dips to ≈145°, well under this line, so it is still
   * counted as an attempted rep (and then judged partial on its OWN, separate depth line) rather than never
   * registering at all.
   */
  armedElbowDeg: number;
  /** A rep's bottom (its minimum elbow angle) above this is a PARTIAL rep — it never came close to the floor. Measured:
   *  a clean full-depth fixture bottoms at 60°; a rep that only covers 40% of the range bottoms at ~144°. */
  partialElbowDeg: number;
  /**
   * Body-line offset (shoulder–hip–ankle, or shoulder–hip–knee on a knee push-up), image-y-down, normalised by the
   * line's own length: + = PIKE (hip above the line), − = SAG (hip below it). Measured on lib/mirror/fixtures/build.ts's
   * pushupPose: a straight plank reads ≈ +0.02 (a small, constant projection artefact of the fixture's own geometry —
   * the hip, ankle and shoulder joints sit at very slightly different lateral depths — not a real sag or pike); an
   * 8 cm sag reads ≈ −0.06; an 8 cm pike reads ≈ +0.095. The warn line sits well clear of the clean read on both
   * sides of it.
   */
  bodyLineWarn: number;
  /** Consecutive readable frames a body-line offset must hold before it counts (one noisy frame is not a sag). */
  bodyLinePersistFrames: number;
  /** Ear offset ahead of the ankle→shoulder line (extended past the shoulder), same normalisation as bodyLineWarn.
   *  Measured: a neutral neck on the clean fixture reads ≈ 0.04. */
  headLineWarn: number;
  /** Wrist-to-shoulder horizontal offset at the top of the rep, as a share of the straight-arm length: how far the
   *  hands are walked out from under the shoulders. Measured: the clean fixture's own (slightly elbows-back) set-up
   *  reads ≈ −0.06. */
  handSetupWarn: number;
  /**
   * The knee-push-up switch: knee image-y minus ankle image-y, over the ankle→shoulder line's length. Measured: a
   * straight-leg push-up reads ≈ −0.10 (the knee held well clear, above the ankle); a knee push-up reads ≈ +0.24 (the
   * knee at the floor, the ankle lifted behind it). The line sits near zero, slightly toward "straight-leg" so an
   * ambiguous read defaults to the more common case.
   */
  kneeVariantMarginRatio: number;
  /** Below this many readable frames, nothing is scored at all — the same "a glance is not a read" floor
   *  hingeAudit.ts/setupLine.ts/carryAudit.ts (CARRY_THRESHOLDS.minReadableFrames) already apply. MIRROR-COACH P4
   *  review (2026-09-29): this audit shipped with no such floor — only a `readableFrames === 0` bail — so 3 real
   *  data points out of an 80-frame capture (heavy occlusion) still returned a fully graded `reps: 1 (ok)` reading. */
  minReadableFrames: number;
}
export const PUSHUP_THRESHOLDS: PushupThresholds = {
  minVis: 0.5,
  armedElbowDeg: 165,        // TUNE(elijah): clean fixture's still-top frames read ≈169°; a knee variant's ≈171°
  partialElbowDeg: 110,      // TUNE(elijah): a 40%-depth rep bottoms at ≈144°, a full rep at ≈60°
  bodyLineWarn: 0.045,       // TUNE(elijah) — see the field comment above for what this was measured against
  bodyLinePersistFrames: 4,
  headLineWarn: 0.12,        // TUNE(elijah)
  handSetupWarn: 0.15,       // TUNE(elijah)
  kneeVariantMarginRatio: 0.02,
  minReadableFrames: 10,
};

export const PUSHUP_CUES: readonly CueRule[] = [
  { faultId: 'depth', cue: 'All the way down — chest to a fist off the floor.',
    escalate: 'Still stopping short. Slow the descent and own the bottom before you press.',
    regress: 'Knees down. Same line, same depth, less weight to press.' },
  { faultId: 'bodyLine', cue: 'One straight line, head to heels — set it before you move.',
    escalate: 'Your hips are leading. Squeeze the glutes and the line holds itself.',
    regress: 'Knees down, or hands on a box — same line, less line to hold.' },
  { faultId: 'headLine', cue: 'Eyes on the floor just past your hands — a long neck, not a reaching chin.',
    escalate: 'The chin is leading again. Pack it back and let the eyes drop.',
    regress: 'Pause at the top. Set the neck first, THEN start the rep.' },
  { faultId: 'handSetup', cue: 'Hands stacked under your shoulders before you go down.',
    escalate: 'Still walked out. Reset the top position — hands under shoulders, then descend.',
    regress: 'From your knees: set the hands under the shoulders, hold two seconds, then rep.' },
];

const vis = (l: Lm | undefined, t: number): l is Lm => !!l && l.v >= t;

/** The 2-D interior angle at `b`, degrees — an ESTIMATE (a 2-D projection of a 3-D joint). */
function angleDeg(a: Lm, b: Lm, c: Lm): number {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const ul = Math.hypot(ux, uy), vl = Math.hypot(vx, vy);
  if (ul < 1e-6 || vl < 1e-6) return 0;
  const cosv = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (ul * vl)));
  return (Math.acos(cosv) * 180) / Math.PI;
}

/**
 * `p`'s signed offset from the line near→far, parametrised by x (the body runs mostly along x in a side view) and
 * normalised by the line's own length: + = p sits ABOVE the line (smaller image y — piked, or a neutral neck for the
 * head-line check), − = p sits BELOW it (bigger image y — sagging, or a craning neck). 0 when the line has no x-span
 * to parametrise by (a body edge-on to itself — should not happen on a real side view).
 */
function lineOffsetRatio(near: Lm, far: Lm, p: Lm): number {
  const dx = far.x - near.x, dy = far.y - near.y, len = Math.hypot(dx, dy);
  if (Math.abs(dx) < 1e-6 || len < 1e-6) return 0;
  const t = (p.x - near.x) / dx;
  const lineY = near.y + dy * t;
  return (lineY - p.y) / len;
}

const IDX = {
  left: { shoulder: LM.left_shoulder, elbow: LM.left_elbow, wrist: LM.left_wrist, hip: LM.left_hip, knee: LM.left_knee, ankle: LM.left_ankle, ear: LM.left_ear },
  right: { shoulder: LM.right_shoulder, elbow: LM.right_elbow, wrist: LM.right_wrist, hip: LM.right_hip, knee: LM.right_knee, ankle: LM.right_ankle, ear: LM.right_ear },
} as const;

/** Which side's landmarks are actually visible on this frame, by the SUM of their visibility (robust to one missing point). */
function sideVisibility(f: PoseFrame, side: Side, t: PushupThresholds): number {
  const idx = IDX[side];
  const pts = [idx.shoulder, idx.elbow, idx.wrist, idx.hip, idx.knee, idx.ankle].map((i) => f.image[i]);
  if (!pts.every((p) => vis(p, t.minVis))) return -1;
  return pts.reduce((s, p) => s + p!.v, 0);
}

const asFramingFrame = (f: PoseFrame): FramingFrame => ({
  present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })),
});

const r2 = (x: number) => Math.round(x * 100) / 100;
/** Readable frames from the START of the capture the hand set-up is sampled over — a still beat before the rep moves. */
const HAND_SETUP_WINDOW = 10;

function ok(id: string, value: number, unit: string, fault: boolean, side?: Side): PatternFaultReading {
  return { id, ...(side ? { side } : {}), value: r2(value), unit, status: fault ? 'fault' : 'ok' };
}
function unreadable(id: string, unit: string): PatternFaultReading {
  return { id, value: 0, unit, status: 'unreadable' };
}

/**
 * The push-up audit. `ctx.side`, when given, is only a HINT — the near side is auto-detected every frame from which
 * side's landmarks the camera actually sees, so a mirrored (selfie) capture, or an athlete who turns and re-sets
 * on their other side mid-set, still reads correctly.
 */
export function auditPushup(frames: PoseFrame[], ctx: MirrorPatternContext = {}): PatternReading {
  // 1) THE VIEW. A push-up is read side-on; the wrong view is unreadable, once, with a plain prompt — no retry loop
  // (P1's lesson: a stalled station that keeps repeating the same line is worse than one honest "not read"). This
  // reads framing.ts's OWN 'turned' verdict, not its overall `ok` — checkFraming's bodyFill/centring reads assume a
  // standing body (head near the top of frame, feet near the bottom); a push-up lies across the frame, so bodyFill
  // (measured: ≈0.18 on a clean, well-framed push-up fixture, against FILL_MIN 0.45) always reads "too far" there.
  // 'turned' is the one framing.ts issue that is still exactly the right question for a horizontal body: is the
  // subject side-on to the camera at all.
  const framingFrames = frames.map(asFramingFrame);
  const sideOnCount = framingFrames.filter((f) => !checkFraming(f, 'side').issues.includes('turned') && !checkFraming(f, 'side').issues.includes('noBody')).length;
  const presentCount = frames.filter((f) => f.present).length;
  if (presentCount === 0) {
    return { faults: [unreadable('reps', 'reps'), unreadable('depth', 'deg'), unreadable('bodyLine', 'ratio'), unreadable('headLine', 'ratio'), unreadable('handSetup', 'ratio')], readableFrames: 0, note: 'Step into the shot — I cannot see you yet.' };
  }
  if (sideOnCount < presentCount * 0.5) {
    return { faults: [unreadable('reps', 'reps'), unreadable('depth', 'deg'), unreadable('bodyLine', 'ratio'), unreadable('headLine', 'ratio'), unreadable('handSetup', 'ratio')], readableFrames: 0, note: 'Turn side-on to the camera — I read a push-up from the side.' };
  }

  const t = PUSHUP_THRESHOLDS;

  // 2) WHICH SIDE. Sum each side's visibility over the readable frames; the better-seen side wins. ctx.side breaks
  // a near tie (within 5%) rather than overriding a clearly better-seen side — the camera, not the athlete's guess
  // at handedness, decides what is actually legible.
  let leftScore = 0, rightScore = 0, readableFrames = 0;
  for (const f of frames) {
    if (!f.present) continue;
    const l = sideVisibility(f, 'left', t), r = sideVisibility(f, 'right', t);
    if (l >= 0) leftScore += l;
    if (r >= 0) rightScore += r;
    if (l >= 0 || r >= 0) readableFrames++;
  }
  // MIRROR-COACH P4 review (2026-09-29): this used to bail out only at `readableFrames === 0` — every sibling audit
  // (hingeAudit.ts, setupLine.ts, carryAudit.ts) has its own `minReadableFrames` floor so "a glance is not a read";
  // this one had none, so 3 real data points out of an 80-frame capture (heavy occlusion) still returned a fully
  // graded `reps: 1 (ok)`, `bodyLine: ok`, `headLine: ok`, `handSetup: ok`. Reports the ACTUAL count read, not 0,
  // when some frames were seen but not enough to trust.
  if (readableFrames < t.minReadableFrames) {
    return { faults: [unreadable('reps', 'reps'), unreadable('depth', 'deg'), unreadable('bodyLine', 'ratio'), unreadable('headLine', 'ratio'), unreadable('handSetup', 'ratio')], readableFrames, note: 'I can see you, but not well enough to read the push-up — more light, or step back a little.' };
  }
  const tie = Math.abs(leftScore - rightScore) <= 0.05 * Math.max(leftScore, rightScore, 1e-6);
  const side: Side = tie && ctx.side ? ctx.side : rightScore > leftScore ? 'right' : 'left';
  const idx = IDX[side];

  // 3) THE VARIANT SWITCH — read once, from the majority of readable frames (a single noisy frame should not flip
  // the whole set between the straight-leg and knee reads).
  let kneeVotes = 0, variantFrames = 0;
  for (const f of frames) {
    if (!f.present) continue;
    const knee = f.image[idx.knee], ankle = f.image[idx.ankle], shoulder = f.image[idx.shoulder];
    if (!vis(knee, t.minVis) || !vis(ankle, t.minVis) || !vis(shoulder, t.minVis)) continue;
    const lineLen = Math.max(1e-3, Math.hypot(shoulder.x - ankle.x, shoulder.y - ankle.y));
    if ((knee.y - ankle.y) / lineLen >= t.kneeVariantMarginRatio) kneeVotes++;
    variantFrames++;
  }
  const kneeVariant = variantFrames > 0 && kneeVotes > variantFrames / 2;

  // 4) PER-FRAME MEASUREMENTS, THEN REP COUNTING off the elbow-angle track (hysteresis around armedElbowDeg — armed
  // on the first drop below it, the rep's bottom is the minimum reached, it counts on the return above it).
  let reps = 0, armed = false, repMin = 180;
  const repBottoms: number[] = [];
  let bodyLineRun = 0, bodyLinePersisted = false, worstBodyLine = 0, bodyLineSamples = 0;
  let worstHeadLine = 0, headLineSamples = 0;
  const handSetupSamples: number[] = [];
  let topSeen = false;

  for (const f of frames) {
    if (!f.present) continue;
    const sh = f.image[idx.shoulder], el = f.image[idx.elbow], wr = f.image[idx.wrist];
    const hip = f.image[idx.hip], ankle = f.image[idx.ankle], knee = f.image[idx.knee], ear = f.image[idx.ear];
    if (![sh, el, wr, hip].every((p) => vis(p, t.minVis))) continue;

    const elbow = angleDeg(sh, el, wr);

    // rep counting
    if (!armed && elbow < t.armedElbowDeg) { armed = true; repMin = elbow; }
    else if (armed) {
      repMin = Math.min(repMin, elbow);
      if (elbow >= t.armedElbowDeg) { reps++; repBottoms.push(repMin); armed = false; repMin = 180; }
    }
    if (!topSeen && elbow >= t.armedElbowDeg) topSeen = true;

    // body line: shoulder–hip–ANKLE normally, shoulder–hip–KNEE on a knee push-up (the ankle is airborne there).
    // The WORST offset is reported regardless of persistence (so the review sees what the camera saw), but the
    // fault STATUS only trips once the offset has held bodyLinePersistFrames frames running — one noisy frame is
    // not a sag (the same discipline squat-audit.ts's valgusPersistFrames applies to the knee).
    const floorRef = kneeVariant ? knee : ankle;
    if (vis(floorRef, t.minVis)) {
      const off = lineOffsetRatio(floorRef, sh, hip);
      bodyLineSamples++;
      if (Math.abs(off) > Math.abs(worstBodyLine)) worstBodyLine = off;
      bodyLineRun = Math.abs(off) >= t.bodyLineWarn ? bodyLineRun + 1 : 0;
      if (bodyLineRun >= t.bodyLinePersistFrames) bodyLinePersisted = true;
    }

    // head line: the ear against the ankle→shoulder line, extended past the shoulder toward the head
    if (vis(ear, t.minVis) && vis(ankle, t.minVis)) {
      const off = lineOffsetRatio(ankle, sh, ear);
      headLineSamples++;
      if (Math.abs(off) > Math.abs(worstHeadLine)) worstHeadLine = off;
    }

    // hand set-up: read from the FIRST readable frames — the set-up an athlete takes before the rep moves at all —
    // never from "elbow near straight" anywhere in the capture. A wrist walked out from under the shoulder also
    // drags the shoulder–elbow–wrist angle down, so gating on that angle (or on the elbow-driven `armed` phase)
    // would silently drop the very frames a bad set-up needs reading on: measured, a 10–30 cm walked-out wrist pulls
    // the very FIRST frame's own elbow angle under armedElbowDeg, arming a "rep" before anything has moved.
    if (handSetupSamples.length < HAND_SETUP_WINDOW) {
      const armLen = Math.hypot(sh.x - el.x, sh.y - el.y) + Math.hypot(el.x - wr.x, el.y - wr.y);
      if (armLen > 1e-3) handSetupSamples.push((wr.x - sh.x) / armLen);
    }
  }
  // a rep still under way when the capture ends counts too (an athlete who stopped mid-rep still showed a bottom)
  if (armed) { reps++; repBottoms.push(repMin); }

  const worstBottom = repBottoms.length ? Math.min(...repBottoms) : (topSeen ? 180 : 0);
  const partial = repBottoms.length > 0 && worstBottom > t.partialElbowDeg;
  const handSetup = handSetupSamples.length ? handSetupSamples.reduce((a, b) => a + b, 0) / handSetupSamples.length : 0;

  const faults: PatternFaultReading[] = [
    ok('reps', reps, 'reps', false, side),
    repBottoms.length
      ? ok('depth', worstBottom, 'deg', partial, side)
      : unreadable('depth', 'deg'),
    bodyLineSamples > 0
      ? ok('bodyLine', worstBodyLine, 'ratio', bodyLinePersisted, side)
      : unreadable('bodyLine', 'ratio'),
    headLineSamples > 0
      ? ok('headLine', worstHeadLine, 'ratio', Math.abs(worstHeadLine) >= t.headLineWarn, side)
      : unreadable('headLine', 'ratio'),
    handSetupSamples.length
      ? ok('handSetup', handSetup, 'ratio', Math.abs(handSetup) >= t.handSetupWarn, side)
      : unreadable('handSetup', 'ratio'),
    // MIRROR-COACH P4 review (2026-09-29): this used to report 'ok' unconditionally, even when `variantFrames === 0`
    // — the only check in this file whose status could never be 'unreadable'. Defensive hardening: tracing the call
    // graph shows this branch cannot be reached through a real capture today (sideVisibility, section 2, already
    // requires the chosen side's own knee+ankle before it can be `side` at all — a superset of what this loop needs,
    // see pushupAudit.test.ts's own note on this), but every sibling check in this file gates the same way and this
    // one should not be the sole exception if that coupling ever changes.
    variantFrames > 0
      ? { id: 'kneeVariant', side, value: kneeVariant ? 1 : 0, unit: 'bool', status: 'ok' }
      : unreadable('kneeVariant', 'bool'),
  ];

  // MIRROR-COACH P4 review (2026-09-29): `activeFaults.length === 0` used to be read as "clean line" — but that only
  // means nothing read 'fault'; a check that never got enough data reads 'unreadable', which ALSO leaves
  // activeFaults empty. Reproduced: zeroing only LEFT_EAR/RIGHT_EAR visibility on an otherwise clean, full-depth rep
  // left headLine 'unreadable' (reps/depth/bodyLine/handSetup all 'ok') yet still said "clean line" — asserting the
  // neck/head line was checked and fine when it was never read. Fixed the same way hingeAudit.ts's/setupLine.ts's
  // own notes already do: a clean claim requires every check to have actually read 'ok'.
  const activeFaults = faults.filter((f) => f.status === 'fault').map((f) => f.id);
  const anyUnreadable = faults.some((f) => f.status === 'unreadable');
  const note = reps === 0
    ? `Estimated: no full rep read yet · reading the ${side} side${kneeVariant ? ' (knee push-up)' : ''}`
    : activeFaults.length
      ? `Estimated: ${reps} rep${reps === 1 ? '' : 's'} (${side} side) · ${activeFaults.join(', ')}`
      : anyUnreadable
        ? `Estimated: ${reps} rep${reps === 1 ? '' : 's'} (${side} side) · not everything was readable enough to call the line clean`
        : `Estimated: ${reps} rep${reps === 1 ? '' : 's'} (${side} side) · clean line`;

  return { faults, readableFrames, note };
}

export const pushupPattern: MirrorPattern = {
  id: 'pushup',
  label: 'Push-up',
  view: 'side',
  // FEL judgment, matching the squat's own check/work split (lib/mirror/squatStage.ts SQUAT_CHECK_REPS/SQUAT_WORK_REPS).
  reps: { checkReps: 3, workReps: 8 },
  audit: auditPushup,
  cues: PUSHUP_CUES,
  youthSafe: true,
};
