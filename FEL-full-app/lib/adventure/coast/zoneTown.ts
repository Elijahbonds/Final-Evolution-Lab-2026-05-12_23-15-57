/**
 * THE HARBOUR TOWN AND THE SPORTS SPOTS, phase D (lane/coast-d; docs/COAST-ISLANDS-PLAN.md phase D).
 *
 * A small town at the landward end of the dock: one street running inland, four houses on its south side (procedural boxes
 * and gables), the shipped Venice boardwalk kit's four shopfronts and three stalls on its north side as the market strip, and
 * four townsfolk. Four sports spots open modes that already ship, each in one tap, the Venice courts' way (spotReturn.ts):
 * surf on the beach south of the dock, beach volleyball on the beach to the north, golf from a tee on Palm Key's headland, the
 * kart from a start line at the town's far end. Every name is [PLACEHOLDER]; every number [TUNE].
 *
 * Pure: no Babylon. Buildings are SOLID to the sim (zoneWorld asks `buildingTopAt`): a house is a wall to walk into.
 */

import { DOCK_Z, ISLANDS, mainlandShoreX, terrainY, ZONE_SPOTS, type ZoneSpot } from './zoneLayout';

/** The town's street: from the dock's landward end, inland along z = DOCK_Z. */
export const STREET = { z: DOCK_Z, x0: mainlandShoreX(DOCK_Z) + 14, x1: mainlandShoreX(DOCK_Z) + 92, halfWidth: 6 } as const;

export interface House { id: string; minX: number; maxX: number; minZ: number; maxZ: number; /** wall height above its base (m) */ h: number; color: string; roof: string }

const sx = STREET.x0;
export const HOUSES: readonly House[] = [
  { id: 'house.1', minX: sx + 10, maxX: sx + 18, minZ: DOCK_Z + 9, maxZ: DOCK_Z + 16, h: 4.2, color: '#F2E3C6', roof: '#C0533C' },
  { id: 'house.2', minX: sx + 24, maxX: sx + 33, minZ: DOCK_Z + 9, maxZ: DOCK_Z + 17, h: 5.0, color: '#CFE6E9', roof: '#3E6E8E' },
  { id: 'house.3', minX: sx + 39, maxX: sx + 47, minZ: DOCK_Z + 9, maxZ: DOCK_Z + 16, h: 4.4, color: '#F6D7D2', roof: '#8A4A6A' },
  { id: 'house.4', minX: sx + 53, maxX: sx + 62, minZ: DOCK_Z + 9, maxZ: DOCK_Z + 18, h: 5.4, color: '#E9EBCF', roof: '#5E7A3A' },
];

/**
 * The market strip: the shipped Venice boardwalk kit (public/models/props/venice/env2/venice_boardwalk_kit.glb: four 7 m
 * shopfronts in a 28 m row, three stalls in front of them; fronts face +z, origin at the row's base centre), on the street's
 * north side facing it. Its wall is solid (the kit's bounds: 0.75 m behind the origin, the awnings 2.1 m in front).
 */
export const MARKET = { x: sx + 34, z: DOCK_Z - 13, halfWidth: 14.1, wallBack: 0.75, wallFront: 1.2 } as const;
export const MARKET_KIT_URL = '/models/props/venice/env2/venice_boardwalk_kit.glb';

export interface Solid { id: string; minX: number; maxX: number; minZ: number; maxZ: number; top: number }

/** Everything in town you cannot walk through, with its top (m): each house from its lowest corner, the market's wall. */
export function townSolids(): Solid[] {
  const out: Solid[] = HOUSES.map((h) => ({ id: h.id, minX: h.minX, maxX: h.maxX, minZ: h.minZ, maxZ: h.maxZ, top: houseBase(h) + h.h }));
  const m = MARKET;
  out.push({ id: 'market.wall', minX: m.x - m.halfWidth, maxX: m.x + m.halfWidth, minZ: m.z - m.wallBack, maxZ: m.z + m.wallFront, top: terrainY(m.x, m.z) + 6 });
  return out;
}

/** A house stands on its lowest corner (its walls go down into the slope a little on the high side). */
export function houseBase(h: House): number {
  return Math.min(terrainY(h.minX, h.minZ), terrainY(h.maxX, h.minZ), terrainY(h.minX, h.maxZ), terrainY(h.maxX, h.maxZ));
}

let solidsCache: Solid[] | null = null;
/** The top of a building at (x, z), or null where there is none. */
export function buildingTopAt(x: number, z: number): number | null {
  solidsCache ??= townSolids();
  for (const s of solidsCache) if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s.top;
  return null;
}

// ── the sports spots ───────────────────────────────────────────────────────────────────────────────────────────────

export type SportMarker = 'surfboard' | 'net' | 'flag' | 'startline';
export interface SportSpot extends ZoneSpot {
  kind: 'sport';
  /** The registry key (lib/babylon/modes/registry.ts MODES) and the mode's own page. */
  modeKey: string;
  route: string;
  /** What the game is called on the card. */
  game: string;
  marker: SportMarker;
}

const shore60 = mainlandShoreX(60), shoreN = mainlandShoreX(-20), palm = ISLANDS[0];
export const SPORT_SPOTS: readonly SportSpot[] = [
  { id: 'surf.break', label: '[PLACEHOLDER] The Break', kind: 'sport', modeKey: 'surf', route: '/play/surf', game: 'Surf',
    at: [shore60 + 3, 60], radius: 4.5, marker: 'surfboard' },
  { id: 'volley.net', label: '[PLACEHOLDER] The Beach Net', kind: 'sport', modeKey: 'volleyball', route: '/play/volleyball', game: 'Beach Volleyball',
    at: [shoreN + 24, -20], radius: 5, marker: 'net' },
  { id: 'golf.tee', label: '[PLACEHOLDER] Headland Tee', kind: 'sport', modeKey: 'golf', route: '/play/golf', game: 'Golf',
    at: [palm.at[0] - 10, palm.at[1] - 12], radius: 4, marker: 'flag' },
  { id: 'kart.start', label: '[PLACEHOLDER] Harbour Start Line', kind: 'sport', modeKey: 'velocitykart', route: '/play/velocity-kart', game: 'Velocity Kart',
    at: [STREET.x1 + 6, DOCK_Z], radius: 5, marker: 'startline' },
];

// ── the townsfolk ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface Townsperson extends ZoneSpot {
  kind: 'person';
  name: string;
  /** What they say when you walk up (one line, before their quest is taken or when they have none). */
  hello: string;
  /** Their quest, if any (zoneQuests.ts). */
  questId: string | null;
}

export const TOWNSFOLK: readonly Townsperson[] = [
  { id: 'npc.harbour', kind: 'person', name: '[PLACEHOLDER] Marisol', label: '[PLACEHOLDER] Marisol, the harbourmaster',
    hello: 'Welcome to the coast. They say a stone creature lives out past Palm Key.', questId: 'q.reefstone',
    at: [sx + 4, DOCK_Z + 4], radius: 2.6 },
  { id: 'npc.coach', kind: 'person', name: '[PLACEHOLDER] Teo', label: '[PLACEHOLDER] Teo, the beach coach',
    hello: 'The net is always up. Fancy a game?', questId: 'q.net',
    at: [shoreN + 24 + 5, -14], radius: 2.6 },
  { id: 'npc.kid', kind: 'person', name: '[PLACEHOLDER] Pip', label: '[PLACEHOLDER] Pip',
    hello: 'Have you seen the Shellhoppers by the dock? I want to meet one!', questId: 'q.shell',
    at: [sx + 22, DOCK_Z - 4], radius: 2.6 },
  { id: 'npc.vendor', kind: 'person', name: '[PLACEHOLDER] Ana', label: '[PLACEHOLDER] Ana at the market',
    hello: 'Fresh fruit, fresh fish, fresh gossip. Everyone ends up at the market.', questId: null,
    at: [MARKET.x + 3, MARKET.z + 6], radius: 2.6 },
];

/** Every spot in the zone: the boat back to Venice, the sports spots, the townsfolk. */
export const ALL_SPOTS: readonly ZoneSpot[] = [...ZONE_SPOTS, ...SPORT_SPOTS, ...TOWNSFOLK];

/** The spot under (x, z), nearest first, or null. */
export function spotAtAll(x: number, z: number, spots: readonly ZoneSpot[] = ALL_SPOTS): ZoneSpot | null {
  let best: ZoneSpot | null = null, bd = Infinity;
  for (const s of spots) { const d = Math.hypot(x - s.at[0], z - s.at[1]); if (d <= s.radius && d < bd) { best = s; bd = d; } }
  return best;
}

export const sportSpotById = (id: string): SportSpot | undefined => SPORT_SPOTS.find((s) => s.id === id);

/** Where you stand when a game sends you back to its spot: just outside the ring, facing it. */
export function returnSpawnFor(spotId: string): { pos: { x: number; y: number; z: number }; yaw: number } | null {
  const s = sportSpotById(spotId);
  if (!s) return null;
  const x = s.at[0] + s.radius + 1.5, z = s.at[1];
  return { pos: { x, y: terrainY(x, z), z }, yaw: Math.atan2(s.at[0] - x, 0) };
}

/** Segments in a sports spot's ground ring (zoneTownView groundRing): 2 triangles each. */
export const RING_SEGMENTS = 40;

/** coast.townOn: 1 = the harbour town is built (new); 0 = the beach as in phase B. */
export const COAST_TOWN_ON = 1;
/** coast.townsfolk: how many townsfolk stand in town (roster bodies, each a skinned body and its maps: a phone cost). */
export const COAST_TOWNSFOLK = 4;
/** coast.townLoadAfterSec: the market kit and the townsfolk start loading this long after the zone is playable (0 = with the zone). */
export const COAST_TOWN_LOAD_AFTER_SEC = 0.5;
/** coast.sportsOn: 1 = the sports spots open their games (new); 0 = none. */
export const COAST_SPORTS_ON = 1;
