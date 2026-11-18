/**
 * VENICE HUB, improvement pass phase 8 (moving around): what you cannot walk through, and when a court's card comes up.
 *
 * SOLIDS (venue.veniceSolids). V1's world was one flat floor inside a rim: the player walked through the hoops, the boardwalk
 * row and (with phase 5's furniture) the fences, benches and light poles. Each becomes a block piece (adventure/world/pieces:
 * ground on top, a wall at its sides — the movement sim's own step rule, nothing retuned): the fences' three sides (the walk-up
 * side stays open), the benches (seat height, 0.48 m, just above the 0.45 m step: you walk round them, or jump on), the light
 * poles, the board posts, each hoop's post, and the boardwalk row's front. Palms are added at runtime once the dressing has
 * landed (their places come from the shipped dunk layout). Every block is a box: no slopes, no ledges to wedge on. The ground
 * itself stays level — the sand, the park slab and the bike path are drawn a centimetre apart, one floor to the sim.
 *
 * THE WALK-UP (venue.walkupV2). V1 offered a court's game anywhere in a 28 × 28 m box round its centre — behind the fence too.
 * V2: on the court (inside its fence) or in its ring (the gold ring on the open sideline, ring radius + 1 m), after a short
 * dwell so walking past does not flash the card; once up, the card stays until you are a metre past either edge.
 * Pure logic: it reads the furniture's placements from courtsDressing (one source for what is drawn and what is solid).
 */

import { block, type BlockPiece } from '@/lib/babylon/adventure/world/pieces';
import type { Spot } from './layout';
import { BENCH, benchSpots, BOARD_POST_BACK, FENCE, fenceRuns, poleSpots, RING } from './courtsDressing';
import { COURT_HALF as COURT } from './courtsView';

export const VENICE_SOLIDS = 1;
export const WALKUP_V2 = 1;

/** The fence's thickness as a wall (m). */
const FENCE_T = 0.24;

/** Where a court's hoop post stands. assumption: the hoop prop's post is at its origin (courtsView places the origin 0.9 m inside
 *  the far baseline), so the block is a 0.6 m square there. */
export function hoopAt(s: Spot): [number, number] { return [s.at[0], s.at[1] - COURT.l + 0.9]; }

/** The boardwalk row's shop fronts from the dunk's dressing round Court 3 (measured from the running hub: x −78..−50, z −78.2..−75.4). */
export const BOARDWALK_ROW = { minX: -78, maxX: -50, minZ: -78.2, maxZ: -75.4, h: 3 } as const;

/** Every solid for the four courts. `furniture`: phase 5's fences, benches and poles are drawn (venue.veniceLookV2). */
export function hubSolids(spots: readonly Spot[], furniture: boolean): BlockPiece[] {
  const out: BlockPiece[] = [];
  const sq = (id: string, x: number, z: number, half: number, h: number) => out.push(block(id, x - half, x + half, z - half, z + half, h));
  for (const s of spots) {
    const [hx, hz] = hoopAt(s); sq(`venice.hoop.${s.id}`, hx, hz, 0.3, 3);
    if (!furniture) continue;
    for (const [i, [x0, z0, x1, z1]] of fenceRuns(s.at[0], s.at[1]).entries()) {
      out.push(block(`venice.fence.${s.id}.${i}`, Math.min(x0, x1) - FENCE_T / 2, Math.max(x0, x1) + FENCE_T / 2, Math.min(z0, z1) - FENCE_T / 2, Math.max(z0, z1) + FENCE_T / 2, FENCE.h));
    }
    for (const [i, [x, z]] of benchSpots(s).entries()) out.push(block(`venice.bench.${s.id}.${i}`, x - BENCH.d / 2 - 0.05, x + BENCH.d / 2 + 0.05, z - BENCH.w / 2, z + BENCH.w / 2, BENCH.h));
    for (const [i, [x, z]] of poleSpots(s).entries()) sq(`venice.pole.${s.id}.${i}`, x, z, 0.15, 7.5);
    for (const dx of [-2.4, 2.4]) sq(`venice.boardpost.${s.id}.${dx}`, s.at[0] + dx, s.at[1] - FENCE.halfL - BOARD_POST_BACK, 0.1, 5.2);
  }
  const b = BOARDWALK_ROW;
  out.push(block('venice.boardwalk.row', b.minX, b.maxX, b.minZ, b.maxZ, b.h));
  return out;
}

/** A palm trunk as a solid (added once the dressing has placed it). */
export const palmSolid = (i: number, x: number, z: number): BlockPiece => block(`venice.palm.${i}`, x - 0.3, x + 0.3, z - 0.3, z + 0.3, 6);

// ── the walk-up ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** How long the player stands in a court's place before its card comes up (s). [TUNE] */
export const WALKUP_DWELL = 0.25;
/** How far past the edge the card stays up once shown (m). */
export const WALKUP_HOLD = 1;

/** V1's rule: anywhere in a box 14 m round the court's centre. */
export function v1Hit(spots: readonly Spot[], x: number, z: number): Spot | null {
  for (const s of spots) if (Math.abs(x - s.at[0]) <= 14 && Math.abs(z - s.at[1]) <= 14) return s;
  return null;
}

/** V2's place: on the court (inside the fence) or in its ring; `grow` widens both (the hold). */
export function inCourtPlace(s: Spot, x: number, z: number, grow = 0): boolean {
  const onCourt = Math.abs(x - s.at[0]) <= FENCE.halfW + grow && Math.abs(z - s.at[1]) <= FENCE.halfL + grow;
  const rx = s.at[0] + COURT.w + RING.out, inRing = Math.hypot(x - rx, z - s.at[1]) <= RING.r + 1 + grow;
  return onCourt || inRing;
}

/** V2's walk-up: dwell to show, hold to keep. Call each look-up with the time since the last one. */
export class Walkup {
  private shown: Spot | null = null;
  private pending: Spot | null = null;
  private dwell = 0;
  constructor(private readonly spots: readonly Spot[]) {}
  step(dt: number, x: number, z: number): Spot | null {
    if (this.shown && inCourtPlace(this.shown, x, z, WALKUP_HOLD)) return this.shown;
    this.shown = null;
    const here = this.spots.find((s) => inCourtPlace(s, x, z)) ?? null;
    if (!here) { this.pending = null; this.dwell = 0; return null; }
    if (here !== this.pending) { this.pending = here; this.dwell = 0; }
    this.dwell += dt;
    if (this.dwell >= WALKUP_DWELL) { this.shown = here; this.pending = null; this.dwell = 0; }
    return this.shown;
  }
}

/**
 * The probes' walk to a court's ring (window.__VENICE__.walkTo): with the fences solid, a straight line from the court gate to a
 * western court runs into an eastern court's fence. A player walks round; this does the same with the open corridors: east of the
 * near column of courts, along the gap between the two rows of courts, down the far column's corridor, then into the ring from the
 * open side. Pure; the stuck check's random walks do not use it.
 */
export function probeRoute(spots: readonly Spot[], from: { x: number; z: number }, to: Spot): Array<{ x: number; z: number }> {
  // each column's corridor: past its rings and benches on the open (east) side
  const corridor = (x: number) => {
    const cols = [...new Set(spots.map((s) => s.at[0]))].sort((a, b) => a - b);
    const col = cols.reduce((best, c) => (Math.abs(x - (c + COURT.w + RING.out)) < Math.abs(x - (best + COURT.w + RING.out)) ? c : best), cols[0]);
    return col + COURT.w + RING.out + RING.r + 4.5;
  };
  const rows = [...new Set(spots.map((s) => s.at[1]))].sort((a, b) => a - b);
  const midZ = rows.length > 1 ? (rows[0] + rows[rows.length - 1]) / 2 : to.at[1] + FENCE.halfL + 6;
  const ring = { x: to.at[0] + COURT.w + RING.out, z: to.at[1] };
  const a = corridor(from.x), b = corridor(ring.x);
  return [{ x: a, z: from.z }, { x: a, z: midZ }, { x: b, z: midZ }, { x: b, z: ring.z }, ring];
}
