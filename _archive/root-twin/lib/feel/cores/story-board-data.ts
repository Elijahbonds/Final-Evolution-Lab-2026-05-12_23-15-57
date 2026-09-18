/**
 * lib/feel/cores/story-board-data.ts
 * ==================================
 * M9 Step 17 — Story board data for the Board/Story core.
 *
 * Ported VERBATIM from the engineering donor (data/storyBoard.js, itself from
 * the C++ story_mode.h: kBoardSpaces + kZoneBosses): the 20-space board looping
 * the expanded Venice Beach court across five zones, plus the four zone bosses.
 *
 * These are DONOR values, not feel scaffolding — they define the board's shape
 * and the boss roster, so they are preserved exactly (NOT // TUNE). The feel
 * numbers that dress this board (hop arc, damage ranges, cooldowns) live in
 * story-constants.ts and are all // TUNE(elijah).
 */

export type SpaceType =
  | 'carnival' // shard bonus + extra roll
  | 'rail' // grind bonus (v1: score bonus)
  | 'flight' // flight bonus (v1: score bonus)
  | 'boss' // boss fight in this zone
  | 'bonus' // flat shard bonus
  | 'obstacle'; // HP damage

export type Zone =
  | 'boardwalk'
  | 'courtFloor'
  | 'skateApron'
  | 'beachAccess'
  | 'rooftopRow';

export interface Vec3Lit {
  x: number;
  y: number;
  z: number;
}

export interface BoardSpace {
  type: SpaceType;
  pos: Vec3Lit;
  zone: Zone;
  bonus: number;
}

export interface ZoneBoss {
  name: string;
  maxHp: number;
  aggression: number;
  shard: string;
  final?: boolean;
}

/** Donor kBoardSpaces — 20 spaces, 5 zones. Preserved verbatim. */
export const BOARD_SPACES: BoardSpace[] = [
  // Boardwalk (0–4)
  { type: 'carnival', pos: { x: 0, y: 0, z: -9 }, zone: 'boardwalk', bonus: 20 },
  { type: 'rail', pos: { x: -6, y: 1.2, z: -9.5 }, zone: 'boardwalk', bonus: 15 },
  { type: 'bonus', pos: { x: -12, y: 0, z: -6 }, zone: 'boardwalk', bonus: 30 },
  { type: 'rail', pos: { x: -12, y: 1.2, z: 0 }, zone: 'boardwalk', bonus: 15 },
  { type: 'obstacle', pos: { x: -12, y: 0, z: 6 }, zone: 'boardwalk', bonus: 10 },
  // Court Floor (5–8)
  { type: 'carnival', pos: { x: 0, y: 0, z: 7.8 }, zone: 'courtFloor', bonus: 20 },
  { type: 'boss', pos: { x: 0, y: 0, z: 0 }, zone: 'courtFloor', bonus: 0 },
  { type: 'bonus', pos: { x: 7.8, y: 0, z: 0 }, zone: 'courtFloor', bonus: 25 },
  { type: 'obstacle', pos: { x: 7.8, y: 0, z: -7.5 }, zone: 'courtFloor', bonus: 15 },
  // Skate Apron (9–12)
  { type: 'rail', pos: { x: 8.5, y: 0, z: -4 }, zone: 'skateApron', bonus: 15 },
  { type: 'flight', pos: { x: 8.5, y: 0.6, z: 4.5 }, zone: 'skateApron', bonus: 20 },
  { type: 'boss', pos: { x: 0, y: 0, z: 8 }, zone: 'skateApron', bonus: 0 },
  { type: 'bonus', pos: { x: -8.5, y: 0, z: 4.5 }, zone: 'skateApron', bonus: 25 },
  // Beach Access (13–16)
  { type: 'flight', pos: { x: -9.5, y: 0, z: 8.5 }, zone: 'beachAccess', bonus: 20 },
  { type: 'carnival', pos: { x: -6, y: 0, z: 11 }, zone: 'beachAccess', bonus: 20 },
  { type: 'boss', pos: { x: 0, y: 0, z: 12 }, zone: 'beachAccess', bonus: 0 },
  { type: 'obstacle', pos: { x: 6, y: 0, z: 11 }, zone: 'beachAccess', bonus: 12 },
  // Rooftop Row (17–19)
  { type: 'rail', pos: { x: 6, y: 5.5, z: 0 }, zone: 'rooftopRow', bonus: 15 },
  { type: 'flight', pos: { x: 0, y: 6.5, z: 0 }, zone: 'rooftopRow', bonus: 25 },
  { type: 'boss', pos: { x: -6, y: 5.5, z: 0 }, zone: 'rooftopRow', bonus: 0 },
];

/** Donor kZoneBosses (boardwalk has no boss tile). Preserved verbatim. */
export const ZONE_BOSSES: Partial<Record<Zone, ZoneBoss>> = {
  courtFloor: { name: 'The Lockdown', maxHp: 80, aggression: 0.8, shard: 'shard_lockdown_key' },
  skateApron: { name: 'Grind King', maxHp: 70, aggression: 0.75, shard: 'shard_grind_crown' },
  beachAccess: { name: 'Sunset Sentinel', maxHp: 90, aggression: 0.85, shard: 'shard_sunset_seal' },
  rooftopRow: { name: 'The Architect', maxHp: 120, aggression: 0.95, shard: 'shard_architect_core', final: true },
};

/** Number of distinct zone bosses that must be defeated to complete the story. */
export const TOTAL_BOSSES = Object.keys(ZONE_BOSSES).length;

export const SPACE_COLORS: Record<SpaceType, string> = {
  carnival: '#F2A65A',
  rail: '#7FB5D6',
  flight: '#B48BD8',
  boss: '#C94C4C',
  bonus: '#8FD68A',
  obstacle: '#6E6E7E',
};
