/**
 * THE VENICE HUB, V1: the walkable courts district as the Adventure host's world (docs/VENICE-HUB-PLAN.md §5, V1).
 *
 * Pure: world pieces (lib/babylon/adventure/world/pieces.ts) and the host's WorldSource, no Babylon. V1 builds ONE district,
 * the Courts (cells (1..2, 2..3) of the hub grid, layout.ts), with a band of sand to the west and the bike path's edge to the
 * east so the walk round the courts has room. A 1 m rim holds the player in (above A1's 0.45 m step, the hub plaza's own
 * rule, adventure/world/hub/hub.ts). Everything outside is scenery (the sea, the boardwalk) and is not walkable in V1.
 * Every number is [TUNE].
 */

import { block, clearBetween, flat, groundYOf, type GroundPiece } from '@/lib/babylon/adventure/world/pieces';
import type { WorldSource } from '@/lib/babylon/adventure/host/hostWorld';
import { DISTRICTS, SPOTS, cellRect, hubHome, type Rect, type Spot } from './layout';

/** The extra walkable band round the courts district (m): sand to the west, the path's edge to the east. [TUNE] */
export const V1_MARGIN = 14;
/** The rim's height (m): above the movement sim's step-up, so it holds the player in. */
export const V1_RIM_H = 1;

/** The courts district's footprint (m). */
export function courtsRect(): Rect {
  const d = DISTRICTS.find((x) => x.id === 'courts')!;
  const rs = d.cells.map(([i, j]) => cellRect(i, j));
  return { minX: Math.min(...rs.map((r) => r.minX)), maxX: Math.max(...rs.map((r) => r.maxX)), minZ: Math.min(...rs.map((r) => r.minZ)), maxZ: Math.max(...rs.map((r) => r.maxZ)) };
}

/** V1's walkable rectangle: the courts district plus the margin. */
export function v1Area(): Rect {
  const r = courtsRect();
  return { minX: r.minX - V1_MARGIN, maxX: r.maxX + V1_MARGIN, minZ: r.minZ - V1_MARGIN, maxZ: r.maxZ + V1_MARGIN };
}

/** The four painted courts V1 draws. */
export const V1_COURT_SPOT_IDS = ['court.ones', 'court.run', 'court.flight', 'court.arc'] as const;
/** The V1 walk-up spots: the four courts plus the camera hoop (IRL hang-time check). */
export const V1_SPOT_IDS = [...V1_COURT_SPOT_IDS, 'court.camera'] as const;
export const v1CourtSpots = (): Spot[] => SPOTS.filter((s) => (V1_COURT_SPOT_IDS as readonly string[]).includes(s.id));
export const v1Spots = (): Spot[] => SPOTS.filter((s) => (V1_SPOT_IDS as readonly string[]).includes(s.id));

export interface HubWorld { pieces: GroundPiece[]; area: Rect; source: WorldSource; spawn: { pos: { x: number; y: number; z: number }; yaw: number } }

export function buildHubWorld(): HubWorld {
  const a = v1Area();
  const pieces: GroundPiece[] = [
    flat('venice.floor', a.minX, a.maxX, a.minZ, a.maxZ, 0),
    block('venice.rim.w', a.minX - 1, a.minX, a.minZ - 1, a.maxZ + 1, V1_RIM_H),
    block('venice.rim.e', a.maxX, a.maxX + 1, a.minZ - 1, a.maxZ + 1, V1_RIM_H),
    block('venice.rim.n', a.minX, a.maxX, a.minZ - 1, a.minZ, V1_RIM_H),
    block('venice.rim.s', a.minX, a.maxX, a.maxZ, a.maxZ + 1, V1_RIM_H),
  ];
  const home = hubHome('V1');
  // the court gate faces the courts (toward −x, −z: the middle of the four)
  const r = courtsRect();
  const yaw = Math.atan2((r.minX + r.maxX) / 2 - home.at[0], (r.minZ + r.maxZ) / 2 - home.at[1]);
  return {
    pieces,
    area: a,
    spawn: { pos: { x: home.at[0], y: 0, z: home.at[1] }, yaw },
    source: {
      groundY: (x, z) => groundYOf(pieces, x, z),
      clear: (p, q) => clearBetween(pieces, p, q),
      rails: { id: 'venice.rails', segments: [] },
      walls: [],
      bounds: { minX: a.minX, maxX: a.maxX, minZ: a.minZ, maxZ: a.maxZ },
    },
  };
}

/** Where a player coming back from a court's game stands: beside the court, on its sideline facing in. */
export function returnSpawnFor(spotId: string): { pos: { x: number; y: number; z: number }; yaw: number } | null {
  const s = SPOTS.find((x) => x.id === spotId);
  if (!s || !(V1_SPOT_IDS as readonly string[]).includes(s.id)) return null;
  const x = s.at[0] + s.radius + 2.5, z = s.at[1];
  return { pos: { x, y: 0, z }, yaw: Math.atan2(s.at[0] - x, 0) };
}
