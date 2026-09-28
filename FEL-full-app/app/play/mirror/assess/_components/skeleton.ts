// The skeleton on a 2-D canvas: live over the (mirrored) camera picture, and frozen on a blank canvas for a worst rep.
// No Babylon, no WebGL: a phone that cannot run a 3-D scene can still run the screen (lane brief).
import type { Lm } from '@/lib/pose/landmarks';
import { SIDE } from '@/lib/pose/landmarks';

export const SKELETON_COLOURS = { tracking: '#FFFFFF', clean: '#00FF9D', fault: '#FFB020' } as const;
export type SkeletonState = keyof typeof SKELETON_COLOURS;

/** Bones, as MediaPipe index pairs (the face is left out: a nose and two ears read better than twelve points). */
const BONES: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

export interface DrawOptions {
  colour: string;
  /** Joints to ring in amber (a flagged metric's points). */
  highlight?: number[];
  /** Mirror x (a frozen skeleton drawn the way the athlete saw themselves). The live overlay mirrors with CSS instead. */
  mirror?: boolean;
  /** Reference lines in normalised image coordinates (a hip–ankle line, a vertical through the ankle). */
  guides?: [{ x: number; y: number }, { x: number; y: number }][];
  minVisibility?: number;
  lineWidth?: number;
}

/** Draw one pose onto `ctx`, the landmarks' normalised coordinates stretched to the canvas. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, img: readonly Lm[], o: DrawOptions): void {
  const { width: W, height: H } = ctx.canvas;
  const minV = o.minVisibility ?? 0.35;
  const X = (x: number) => (o.mirror ? 1 - x : x) * W, Y = (y: number) => y * H;
  const seen = (i: number) => !!img[i] && img[i].v >= minV;
  ctx.lineCap = 'round';
  ctx.lineWidth = o.lineWidth ?? Math.max(2, W / 160);
  ctx.strokeStyle = o.colour;
  ctx.globalAlpha = 0.9;
  for (const [a, b] of BONES) {
    if (!seen(a) || !seen(b)) continue;
    ctx.beginPath();
    ctx.moveTo(X(img[a].x), Y(img[a].y));
    ctx.lineTo(X(img[b].x), Y(img[b].y));
    ctx.stroke();
  }
  ctx.fillStyle = o.colour;
  const r = Math.max(2.5, W / 110);
  for (const i of JOINTS) {
    if (!seen(i)) continue;
    ctx.beginPath();
    ctx.arc(X(img[i].x), Y(img[i].y), r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.guides?.length) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = Math.max(1.5, W / 240);
    for (const [p, q] of o.guides) {
      ctx.beginPath();
      ctx.moveTo(X(p.x), Y(p.y));
      ctx.lineTo(X(q.x), Y(q.y));
      ctx.stroke();
    }
    ctx.restore();
  }
  if (o.highlight?.length) {
    ctx.strokeStyle = SKELETON_COLOURS.fault;
    ctx.lineWidth = Math.max(2, W / 200);
    for (const i of o.highlight) {
      if (!img[i]) continue;
      ctx.beginPath();
      ctx.arc(X(img[i].x), Y(img[i].y), r * 2.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** The joints a metric reads, for the frozen view's rings, and the reference line it is measured against. */
export function metricFocus(metric: string, side: 'left' | 'right' | undefined, img: readonly Lm[]): { highlight: number[]; guides: DrawOptions['guides'] } {
  const s = SIDE[side ?? 'left'];
  const line = (a: number, b: number): [{ x: number; y: number }, { x: number; y: number }] => [{ x: img[a].x, y: img[a].y }, { x: img[b].x, y: img[b].y }];
  const vertical = (i: number): [{ x: number; y: number }, { x: number; y: number }] => [{ x: img[i].x, y: img[i].y }, { x: img[i].x, y: img[i].y - 0.35 }];
  switch (metric) {
    case 'valgusLeft': case 'valgusRight': case 'fppa': case 'landingValgusLeft': case 'landingValgusRight':
      return { highlight: [s.hip, s.knee, s.ankle], guides: [line(s.hip, s.ankle)] };
    case 'tibia': return { highlight: [s.knee, s.ankle, s.heel], guides: [vertical(s.ankle)] };
    case 'trunkTibia': return { highlight: [s.shoulder, s.hip, s.knee, s.ankle], guides: [vertical(s.ankle), vertical(s.hip)] };
    case 'depthKneeFlex': case 'hipCrease': case 'depth': return { highlight: [s.hip, s.knee, s.ankle], guides: [[{ x: img[s.knee].x - 0.2, y: img[s.knee].y }, { x: img[s.knee].x + 0.2, y: img[s.knee].y }]] };
    case 'shoulderFlex': return { highlight: [s.hip, s.shoulder, s.wrist], guides: [line(s.hip, s.shoulder)] };
    case 'heelRise': return { highlight: [SIDE.left.heel, SIDE.right.heel], guides: [] };
    case 'pelvicDrop': return { highlight: [23, 24], guides: [[{ x: img[23].x, y: img[23].y }, { x: img[24].x, y: img[23].y }]] };
    case 'trunkLean': return { highlight: [11, 12, 23, 24], guides: [vertical(23)] };
    case 'lateralShift': return { highlight: [23, 24, 27, 28], guides: [] };
    default: return { highlight: [], guides: [] };
  }
}
