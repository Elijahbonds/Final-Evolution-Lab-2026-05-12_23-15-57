// freeRunCourse — the authored course of FreeRun (A+ mission #10): start gate to finish gate with TWO routes — the low
// line along the ground (gaps to precision-jump, boxes to vault, bars to slide under) and the high line (a wall to run,
// ledges to cat-leap, a rooftop path) worth the tier's route bonus. Pure data first (tested), meshes built from it by the
// mode with static Havok aggregates so nothing falls through.

import type { Tier } from '../core/FreeRunCore';

export type PieceKind = 'ground' | 'gap' | 'vault' | 'bar' | 'wall' | 'ledge' | 'roof' | 'start' | 'finish' | 'checkpoint';

export interface Piece {
  kind: PieceKind;
  /** Centre of the box. */
  x: number; y: number; z: number;
  /** Full extents. */
  w: number; h: number; d: number;
  route?: 'low' | 'high';
  /** Checkpoint order (checkpoints only). */
  index?: number;
}

/** The course runs along +Z. Ground slabs are 12 m wide; the high line sits on the +X side, 3.5 m up. */
export function coursePieces(tier: Tier): Piece[] {
  const p: Piece[] = [];
  const gapW = 2.2 + tier.id * 0.5;                    // wider gaps at higher tiers
  let z = 0;
  const slab = (len: number, route?: 'low' | 'high') => { p.push({ kind: 'ground', x: 0, y: -0.5, z: z + len / 2, w: 12, h: 1, d: len, route }); z += len; };
  p.push({ kind: 'start', x: 0, y: 1.6, z: 1.5, w: 6, h: 3.2, d: 0.3 });
  slab(10);
  // vault box across the low line
  p.push({ kind: 'vault', x: -2.5, y: 0.5, z: z + 1, w: 5, h: 1.0, d: 1.2, route: 'low' });
  // the wall the high line starts on
  p.push({ kind: 'wall', x: 6.5, y: 2, z: z + 6, w: 0.6, h: 4, d: 12, route: 'high' });
  slab(14);
  p.push({ kind: 'checkpoint', x: 0, y: 1.6, z: z - 1, w: 12, h: 3.2, d: 0.3, index: 1 });
  // gaps to precision-jump on the low line, ledges above for the high line
  for (let i = 0; i < tier.gaps; i++) {
    p.push({ kind: 'gap', x: 0, y: -3, z: z + gapW / 2, w: 12, h: 0.2, d: gapW, route: 'low' });
    z += gapW;
    slab(6);
    p.push({ kind: 'ledge', x: 6.5, y: 3.5, z: z - 3, w: 3, h: 0.4, d: 4, route: 'high' });
  }
  // a bar to slide under
  p.push({ kind: 'bar', x: 0, y: 1.25, z: z + 1, w: 12, h: 0.3, d: 0.3, route: 'low' });
  slab(10);
  p.push({ kind: 'checkpoint', x: 0, y: 1.6, z: z - 1, w: 12, h: 3.2, d: 0.3, index: 2 });
  // the rooftop path (high line) over a long drop — the drop is a trick launch for the brave
  p.push({ kind: 'roof', x: 6.5, y: 3.5, z: z + 8, w: 4, h: 0.4, d: 16, route: 'high' });
  p.push({ kind: 'vault', x: 2.5, y: 0.5, z: z + 5, w: 5, h: 1.0, d: 1.2, route: 'low' });
  slab(18);
  p.push({ kind: 'finish', x: 0, y: 1.6, z: z - 1.5, w: 12, h: 3.2, d: 0.3 });
  return p;
}

export function courseLength(pieces: readonly Piece[]): number {
  const f = pieces.find((q) => q.kind === 'finish');
  return f ? f.z : 0;
}

export function checkpoints(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((q) => q.kind === 'checkpoint').sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** Respawn point after a fall: the last checkpoint passed (or the start), on the ground, centred. */
export function respawnFor(pieces: readonly Piece[], lastCheckpoint: number): { x: number; y: number; z: number } {
  const cp = checkpoints(pieces).find((q) => q.index === lastCheckpoint);
  return cp ? { x: 0, y: 0, z: cp.z + 1 } : { x: 0, y: 0, z: 3 };
}

/** Is a point over a gap (and below the ground) — the fall test the mode runs each frame. */
export function overGap(pieces: readonly Piece[], x: number, z: number): boolean {
  return pieces.some((q) => q.kind === 'gap' && Math.abs(x - q.x) <= q.w / 2 && Math.abs(z - q.z) <= q.d / 2);
}

/** Which route a position sits on: the high line is the +X shelf above 2.5 m. */
export function routeAt(x: number, y: number): 'high' | 'low' { return x > 4 && y > 2.5 ? 'high' : 'low'; }
