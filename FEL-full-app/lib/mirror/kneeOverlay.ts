// kneeOverlay — where the knee correction's arrows go (MIRROR-COACH P2, 2026-09-26). Pure: landmarks in, canvas
// segments out; mirror-harness.tsx paintSkeleton draws them.
//
// P1 fixed the arrows' direction inside paintSkeleton (they used to be drawn from a fixed per-index direction, which was
// backwards on the app's non-mirrored stream, under a line about a band that does not exist) — but the overlay stayed
// dark while the knee cue was off, and nothing tested it. Now the knee cue is ON (cue-engine.ts VALGUS_CUE_VERIFIED,
// owner decision #19), so the geometry is here, where kneeOverlay.test.ts can hold it: each arrow starts just outside its
// knee and points AWAY from the midpoint of the hips — the direction "knees out" means — whichever side of the image the
// leg is on, mirrored stream or not. It is painted only for a knee fault the coach may cue (cueableFaults), which the
// audit raises only on a body square to the camera (squat-audit.ts squareOn).

export interface OverlayPoint { x: number; y: number; visibility?: number }
export interface KneeArrow {
  /** Which landmark the arrow belongs to (25 = MediaPipe's left knee, 26 = right). */
  knee: 25 | 26;
  /** +1 = the arrow points to larger x on the canvas, −1 = smaller x. Always toward this leg's own side of the hips. */
  dir: 1 | -1;
  /** The shaft, tail to tip, and the two barbs from the tip — canvas pixels. */
  tail: { x: number; y: number };
  tip: { x: number; y: number };
  barbs: [{ x: number; y: number }, { x: number; y: number }];
}

const LEFT_HIP = 23, RIGHT_HIP = 24;
/** Pixels: the gap from the knee to the tail, the tip, and the barbs' length back and spread. */
const GAP = 10, REACH = 34, BARB_BACK = 6, BARB_SPREAD = 6;
const MIN_VIS = 0.5;

/** The knee arrows for one frame on a W×H canvas: none when the hips are not both there, one per visible knee. */
export function kneeArrows(landmarks: readonly (OverlayPoint | undefined)[], W: number, H: number): KneeArrow[] {
  const lh = landmarks[LEFT_HIP], rh = landmarks[RIGHT_HIP];
  if (!lh || !rh) return [];
  const midX = ((lh.x + rh.x) / 2) * W;
  const out: KneeArrow[] = [];
  for (const knee of [25, 26] as const) {
    const k = landmarks[knee];
    if (!k || (k.visibility ?? 1) < MIN_VIS) continue;
    const kx = k.x * W, ky = k.y * H;
    // "out" for this leg is the side ITS HIP is on (the same rule as squat-audit.ts kneeInwardRatio), not the side the
    // knee is on: a knee caving far enough to cross the midline still gets its arrow pointing back out. Hips stacked
    // on the midline (side-on — never cued) fall back to the knee's own side.
    const hip = knee === 25 ? lh : rh;
    const dir: 1 | -1 = (Math.sign(hip.x * W - midX) || Math.sign(kx - midX) || 1) > 0 ? 1 : -1;
    const tipX = kx + dir * REACH;
    out.push({
      knee, dir,
      tail: { x: kx + dir * GAP, y: ky },
      tip: { x: tipX, y: ky },
      barbs: [{ x: tipX - dir * BARB_BACK, y: ky - BARB_SPREAD }, { x: tipX - dir * BARB_BACK, y: ky + BARB_SPREAD }],
    });
  }
  return out;
}

/** The line painted under the arrows: the action, never a cause (no band, no muscle). */
export const KNEE_OVERLAY_LINE = 'KNEES OUT — PRESS THE FLOOR APART';
