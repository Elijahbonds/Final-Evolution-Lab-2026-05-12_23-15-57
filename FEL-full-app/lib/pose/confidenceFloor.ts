// confidenceFloor — "move closer, or add more light" instead of a misread (MIRROR PHASE 3, lane/capture, 2026-10-07).
//
// Phones run the lite pose model (modelChoice.ts), and the Mirror runs lite everywhere. Lite holds a small, distant or
// badly lit body less steadily than full, and when it is unsure it does not stop: it keeps handing over positions, with
// low visibility. Those positions still reach the graders, which then read a knee that "caves" because the model was
// guessing. framing.ts already says 'dim' and 'tooFar' BEFORE a set; nothing said it DURING one. This is that line: one
// sentence, shown while the camera cannot see the body clearly, so the athlete fixes the shot instead of being coached
// on a guess. It runs on the device for every age, sends nothing and stores nothing.
//
// THE READ. Per frame, the visibility of the four joint pairs every grader leans on (shoulders, hips, knees, ankles):
// for each pair, the better-seen side (a side-on body hides its far side honestly, and a hinge or a push-up is filmed
// side-on), then the mean of the pairs. A joint outside the picture does not count: a cut-off foot is framing's
// "step back" (lib/mirror/liveCamera.ts InShotLine), not low light. With no body, or fewer than MIN_PAIRS pairs in the
// picture, a frame gives no read. The line shows once the median of the last FLOOR_WINDOW_MS of reads is under
// CONFIDENCE_FLOOR, and goes once it is back over CONFIDENCE_FLOOR + FLOOR_CLEAR_MARGIN (so it does not flicker).
//
// Lite only: full is the steadier model and keeps its own reads. Every number here is PROPOSED: measured on the repo's
// fixtures so it never fires on good data (confidenceFloor.test.ts), and tuned by the owner-led capture's dim and far
// takes (docs/MIRROR-CAPTURE-PROTOCOL.md; the replay report prints its catch and false-alarm rates).
//
// Pure: frames in, a line out. No DOM, no clock of its own.
import type { PoseModel } from './assets';
import {
  LEFT_ANKLE, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, RIGHT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER,
} from './landmarks';

/** The one line (plain words for every age; it blames the shot, never the athlete). */
export const CONFIDENCE_FLOOR_LINE = 'Move closer, or add more light — I can\'t see you clearly.';

/**
 * Under this median visibility (0–1) of the four joint pairs, lite is guessing. PROPOSED. framing.ts says 'dim' before
 * a set at a 0.55 mean over nine joints, both sides counted; this read takes each pair's better side, so it sits lower
 * to stay silent on a side-on body. Measured on the fixtures (confidenceFloor.test.ts): the lowest 1 s median on any good
 * fixture frame is far above it.
 */
export const CONFIDENCE_FLOOR = 0.5;
/** Back over the floor by this much before the line goes. PROPOSED. */
export const FLOOR_CLEAR_MARGIN = 0.1;
/** The median is taken over this long of reads, and the line never shows before a full window of them. PROPOSED. */
export const FLOOR_WINDOW_MS = 1000;
/** Fewer joint pairs than this in the picture: no read (framing's "step back" covers it). */
export const MIN_PAIRS = 3;

const PAIRS: readonly (readonly [number, number])[] = [
  [LEFT_SHOULDER, RIGHT_SHOULDER], [LEFT_HIP, RIGHT_HIP], [LEFT_KNEE, RIGHT_KNEE], [LEFT_ANKLE, RIGHT_ANKLE],
];
/** A point this far outside the picture (normalised) is out of shot, not unseen. */
const EDGE = 0.02;

/** Either frame shape the app carries: lib/pose's (image[].v) or the MediaPipe adapter's (landmarks[].visibility). */
export interface FloorFrame {
  present?: boolean;
  image?: readonly { x: number; y: number; v: number }[];
  landmarks?: readonly { x: number; y: number; visibility?: number }[];
}

type Pt = { x: number; y: number; vis: number };
function points(f: FloorFrame): Pt[] {
  if (f.image && f.image.length) return f.image.map((l) => ({ x: l.x, y: l.y, vis: l.v }));
  if (f.landmarks && f.landmarks.length) return f.landmarks.map((l) => ({ x: l.x, y: l.y, vis: l.visibility ?? 1 }));
  return [];
}
const inPicture = (p: Pt | undefined): p is Pt =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -EDGE && p.x <= 1 + EDGE && p.y >= -EDGE && p.y <= 1 + EDGE;

/** One frame's read (0–1), or null when there is no body or too little of it in the picture to say. */
export function frameConfidence(f: FloorFrame): number | null {
  if (f.present === false) return null;
  const p = points(f);
  if (p.length < 33) return null;
  const pairs: number[] = [];
  for (const [a, b] of PAIRS) {
    const seen = [p[a], p[b]].filter(inPicture).map((q) => (Number.isFinite(q.vis) ? q.vis : 0));
    if (seen.length) pairs.push(Math.max(...seen));
  }
  if (pairs.length < MIN_PAIRS) return null;
  return pairs.reduce((s, v) => s + v, 0) / pairs.length;
}

/** The floor speaks for lite only (and for frames whose model is not known: the Mirror and the dev feed run lite). */
export const floorApplies = (model: PoseModel | null | undefined): boolean => model !== 'full';

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface ConfidenceFloorOptions {
  /** The model the frames came from. 'full' turns the floor off. Default: lite. */
  model?: PoseModel | null;
  /** Override the floor (the replay report tries candidates; the app never passes one). */
  floor?: number;
}

/**
 * Feed it every pose frame; it answers with the line while the camera cannot see the body clearly, else null.
 * `nowMs` is the frame's own time (the pose clock), so a paused set never ages the window.
 */
export class ConfidenceFloor {
  private readonly reads: { t: number; c: number }[] = [];
  private isLow = false;
  private med: number | null = null;
  private readonly on: boolean;
  private readonly floor: number;

  constructor(o: ConfidenceFloorOptions = {}) {
    this.on = floorApplies(o.model ?? 'lite');
    this.floor = o.floor ?? CONFIDENCE_FLOOR;
  }

  step(frame: FloorFrame, nowMs: number): string | null {
    if (!this.on) return null;
    const c = frameConfidence(frame);
    // no body, or a body mostly out of the picture: framing's lines own that, and the window starts again after it
    if (c === null) { this.reads.length = 0; this.med = null; this.isLow = false; return null; }
    // a clock that jumps back (a new session on the same floor) starts the window again
    if (this.reads.length && nowMs < this.reads[this.reads.length - 1].t) this.reads.length = 0;
    this.reads.push({ t: nowMs, c });
    while (this.reads.length && this.reads[0].t < nowMs - FLOOR_WINDOW_MS) this.reads.shift();
    this.med = median(this.reads.map((r) => r.c));
    const full = nowMs - this.reads[0].t >= FLOOR_WINDOW_MS * 0.9;
    if (!this.isLow && full && this.med < this.floor) this.isLow = true;
    else if (this.isLow && this.med >= this.floor + FLOOR_CLEAR_MARGIN) this.isLow = false;
    return this.isLow ? CONFIDENCE_FLOOR_LINE : null;
  }

  /** True while the line shows: a grader may hold its cue meanwhile (what the line is for). */
  get low(): boolean { return this.isLow; }
  /** The median read over the window, or null with no read. */
  get confidence(): number | null { return this.med; }

  reset(): void { this.reads.length = 0; this.isLow = false; this.med = null; }
}
