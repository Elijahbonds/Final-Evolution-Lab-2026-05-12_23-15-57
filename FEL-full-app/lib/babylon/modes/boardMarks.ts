// BOARD MARKS (vis-board, visual wave 2, 2026-10-13) — what a landing and a carve leave on the floor. Pure planning for the shared
// ground-decal pool (visual/GroundDecals, `scene.metadata.felDecals.stamp`): where to lay a mark, how big, how it is tinted.
// The modes call `stamp` themselves with what these return. Nothing here reads a score or a judgement — a mark's size comes from
// the speed and the drop the board already had, so the picture follows the physics and never the other way round.

export type MarkSurface = 'concrete' | 'snow';

export interface MarkPlan {
  kind: 'carve' | 'scuff' | 'foot';
  x: number; z: number; yaw: number;
  scale: number;
}

/** Pure: a clean touchdown rolls out on its wheels or edge (a carve mark, longer for a bigger drop); a sketchy one drags
 *  (a scuff); a bail is a slide and a scuff of the hands and feet (a big scuff, then footprints either side). */
export function landingMarks(at: { x: number; z: number }, yaw: number, grade: 'clean' | 'sketchy' | 'bail', speed01: number, drop01: number): MarkPlan[] {
  const sp = Math.max(0, Math.min(1, speed01)), dr = Math.max(0, Math.min(1, drop01));
  if (grade === 'clean') return [{ kind: 'carve', x: at.x, z: at.z, yaw, scale: 0.7 + 0.5 * sp + 0.5 * dr }];
  if (grade === 'sketchy') return [{ kind: 'scuff', x: at.x, z: at.z, yaw, scale: 0.8 + 0.4 * sp + 0.4 * dr }];
  // a bail: the slide, and the two feet that skidded out either side of it
  const sx = Math.cos(yaw), sz = -Math.sin(yaw);
  return [
    { kind: 'scuff', x: at.x, z: at.z, yaw, scale: 1.2 + 0.6 * sp + 0.5 * dr },
    { kind: 'foot', x: at.x + sx * 0.32, z: at.z + sz * 0.32, yaw: yaw + 0.15, scale: 1 },
    { kind: 'foot', x: at.x - sx * 0.32, z: at.z - sz * 0.32, yaw: yaw - 0.15, scale: 1 },
  ];
}

/**
 * The line a hard carve draws: a mark every `stepM` of travel while the board is on the ground, fast enough and turning hard
 * enough to bite. Lifting off (or stopping) ends the line, so a new one starts clean.
 */
export class CarveMarker {
  private lx = 0; private lz = 0; private live = false;
  constructor(private readonly stepM = 0.9, private readonly minSpeed = 4, private readonly minTurn = 0.35) {}

  reset(): void { this.live = false; }

  /** `turn01` is how hard the edge is set (0..1). Returns the mark to lay now, or null. */
  step(x: number, z: number, yaw: number, speed: number, turn01: number, grounded: boolean): MarkPlan | null {
    if (!grounded || speed < this.minSpeed || turn01 < this.minTurn) { this.live = false; return null; }
    if (!this.live) { this.live = true; this.lx = x; this.lz = z; return null; }
    const dx = x - this.lx, dz = z - this.lz;
    if (dx * dx + dz * dz < this.stepM * this.stepM) return null;
    this.lx = x; this.lz = z;
    return { kind: 'carve', x, z, yaw, scale: 0.55 + 0.45 * Math.min(1, turn01) };
  }
}
