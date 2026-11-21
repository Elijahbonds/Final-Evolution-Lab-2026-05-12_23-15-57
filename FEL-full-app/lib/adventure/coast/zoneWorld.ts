/**
 * THE COAST ZONE, as the Adventure host's world (lane/coast-islands, phase A; docs/COAST-ISLANDS-PLAN.md).
 *
 * Pure: the host's WorldSource (lib/babylon/adventure/host/hostWorld.ts) over zoneLayout's terrain and decks. No Babylon.
 *
 * THE WATER'S EDGE. The movement sim (lib/babylon/adventure/movement) knows ground and walls, not water, and a void is a fall
 * with no floor. So:
 *   * on the ground, water deeper than WADE_DEPTH answers as a WALL (DEEP_WALL_Y, above the sim's 0.45 m step from any
 *     shallow or deck): a runner stops at the edge of the deep water, as at a wall;
 *   * in the air (a jump off the dock), the sim has no walls, so the mode runs `WaterEdge.hold` after every frame: a body
 *     over deep water goes back to the last place it could stand, its run stopped. It is a NEW rule (knob
 *     `coast.deepWaterTurnBack`, 1; 0 = off, for a probe that wants to see the raw sim).
 * The zone's outer edge answers the same way. Nothing here changes a movement number.
 */

import type { WorldSource } from '@/lib/babylon/adventure/host/hostWorld';
import type { Vec3 } from '@/lib/babylon/adventure/contracts';
import { arrivalSpawn, surfaceY, walkable, ZONE_MAX_X, ZONE_MAX_Z, ZONE_MIN_X, ZONE_MIN_Z } from './zoneLayout';
import { buildingTopAt } from './zoneTown';

/** The wall deep water and the zone's edge answer with (m): above any deck or shallow by more than the sim's step-up. */
export const DEEP_WALL_Y = 2;

/** coast.deepWaterTurnBack: 1 = a body over deep water is put back where it could stand (new); 0 = off. */
export const COAST_DEEP_WATER_TURN_BACK = 1;

export interface CoastWorld { source: WorldSource; spawn: { pos: Vec3; yaw: number } }

/** The ground the sim stands on. With the town (phase D), a building's top stands where it is: a wall to walk into. */
export function coastGroundY(x: number, z: number, town = true): number {
  if (!walkable(x, z)) return DEEP_WALL_Y;
  const b = town ? buildingTopAt(x, z) : null;
  return b === null ? surfaceY(x, z) : Math.max(b, surfaceY(x, z));
}

export function buildCoastWorld(o: { town?: boolean; spawn?: { pos: Vec3; yaw: number } | null } = {}): CoastWorld {
  const town = o.town !== false;
  return {
    spawn: o.spawn ?? arrivalSpawn(),
    source: {
      groundY: (x, z) => coastGroundY(x, z, town),
      clear: () => true,   // no line-of-sight blockers: nothing in this zone locks on or homes yet (no combat)
      rails: { id: 'coast.rails', segments: [] },
      walls: [],
      bounds: { minX: ZONE_MIN_X, maxX: ZONE_MAX_X, minZ: ZONE_MIN_Z, maxZ: ZONE_MAX_Z },
    },
  };
}

/** The body fields the edge rule reads and writes (an AdventureActor has them all). */
export interface EdgeBody { pos: Vec3; vel: Vec3 }

/**
 * The water's edge for one body: remembers the last place it could stand and puts it back there when it ends a frame over
 * deep water. Returns true when it acted. No allocation.
 */
export class WaterEdge {
  private x: number;
  private z: number;
  turnedBack = 0;
  constructor(start: { x: number; z: number }) { this.x = start.x; this.z = start.z; }

  hold(b: EdgeBody, on = true): boolean {
    if (walkable(b.pos.x, b.pos.z)) { this.x = b.pos.x; this.z = b.pos.z; return false; }
    if (!on) return false;
    b.pos.x = this.x; b.pos.z = this.z;
    b.vel.x = 0; b.vel.z = 0;
    // it may have "landed" on the deep water's wall: drop it to what it can stand on (the sim lands it next step)
    const g = surfaceY(this.x, this.z);
    if (b.pos.y > g + 0.05 && b.vel.y >= 0) b.vel.y = 0;
    this.turnedBack++;
    return true;
  }
}
