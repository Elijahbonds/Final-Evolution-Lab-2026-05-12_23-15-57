/**
 * A story world as data (Phase B): the hub and each chapter's world are built from world pieces (world/pieces.ts, A4)
 * with their own rails, walls, named spawns, encounters and gates — the same shape the open world will stream later
 * (plan, "The open world": pieces in local terms, checkpoints as `{worldId, spawnId}`, never raw coordinates).
 *
 * The worlds of one story share ONE coordinate space (storyMap.ts lays them out on the ground plane, apart, with voids
 * between), so the host never swaps its world: a gate is a warp between spawns, and the flight home at the end of
 * Chapter 1 is a real flight across the void. Pure data.
 */

import type { RailSegment, Vec3, WallSegment } from '../../contracts';
import type { GroundPiece } from '../pieces';

export interface StorySpawn { pos: Vec3; yaw: number }

/** One monster of an encounter: a bestiary key (world/ch1/bestiary.ts STORY_BESTIARY) at a spot. */
export interface EncounterMonster { id: string; def: string; pos: Vec3; fly?: boolean }

export interface EncounterSpec {
  id: string;
  monsters: EncounterMonster[];
  /** The boss of a boss encounter: a STORY_BOSSES key. */
  boss?: { id: string; def: string; pos: Vec3 };
  /**
   * 'beat' (default): spawned when its story beat starts, cleared away once down (the body budget).
   * 'world': lives in the world while the party is near (the homing chain's anchors): spawned when the player comes
   * within `nearM`, cleared when they are far, never counted as a fight.
   */
  life?: 'beat' | 'world';
  nearM?: number;
}

/** A hub gate (StoryHub.WorldGate's shape, in plain numbers): where it stands and where it leads. */
export interface StoryGateSpec {
  id: string;
  /** `[PLACEHOLDER] …` */
  label: string;
  pos: Vec3;
  radius: number;
  /** The world and spawn a step through it lands on; null = a sealed gate with nowhere to go yet. */
  to: { worldId: string; spawnId: string } | null;
  /** StoryHub's gate rule: sealed until the flag is earned ('flight' = story/flags FLAG_FLIGHT_UNLOCKED). */
  requires?: 'flight';
  /** Opens once this chapter is reached (its chapter id); absent = open from the start. */
  opensWith?: string;
}

export interface StoryWorldSpec {
  id: string;
  /** `[PLACEHOLDER] …` */
  title: string;
  pieces: GroundPiece[];
  rails: RailSegment[];
  walls: WallSegment[];
  spawns: Record<string, StorySpawn>;
  encounters: EncounterSpec[];
  gates: StoryGateSpec[];
  /** The world's footprint on the ground plane (for the map's bounds and the view's ground). */
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** A fall below this y is a fall out of the world (the respawn at the checkpoint). */
  killY: number;
  /** View-only dressing (no collision): decor boxes [x, z, w, d, h, color]. */
  decor?: { x: number; z: number; w: number; d: number; h: number; y?: number; color: string }[];
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
