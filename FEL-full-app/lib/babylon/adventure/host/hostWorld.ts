/**
 * The world the systems step against (contracts.AdventureWorld), as the host builds it: the authored ground, rails and
 * walls from a world source (world/pieces, the sandbox now, Chapter 1 in Phase B), the live actors, and `near()`
 * answered from the host's spatial grid. Pure.
 */

import type { ActorId, AdventureActor, AdventureWorld, RailNetwork, Vec3, WallSegment } from '../contracts';
import { SpatialGrid } from './spatialGrid';

/** What a world builder hands the host: the ground and sight questions, the rails, the walls, the sides. */
export interface WorldSource {
  groundY(x: number, z: number): number | null;
  clear(a: Vec3, b: Vec3): boolean;
  rails: RailNetwork;
  walls: readonly WallSegment[];
  bounds?: AdventureWorld['bounds'];
}

/** A body that is in the world's table but not in its space: a fused partner (inside its player, contracts v2). */
export const isHiddenBody = (a: AdventureActor): boolean => a.kind === 'partner' && a.fusion.active;

export class HostWorld implements AdventureWorld {
  readonly actors = new Map<ActorId, AdventureActor>();
  readonly grid = new SpatialGrid();
  rails: RailNetwork;
  walls: readonly WallSegment[];
  bounds: AdventureWorld['bounds'];

  constructor(private readonly src: WorldSource) {
    this.rails = src.rails;
    this.walls = src.walls;
    this.bounds = src.bounds ?? null;
  }

  groundY(x: number, z: number): number | null { return this.src.groundY(x, z); }
  clear(a: Vec3, b: Vec3): boolean { return this.src.clear(a, b); }
  /** Bodies within r of p, hidden ones left out (a reused scratch array: see SpatialGrid). */
  near(p: Vec3, r: number): AdventureActor[] { return this.grid.near(p, r); }

  /** Re-index the grid (the host calls this before every system pass of a step). */
  reindex(): void { this.grid.rebuild(this.actors.values(), isHiddenBody); }

  add(a: AdventureActor): AdventureActor { this.actors.set(a.id, a); return a; }

  remove(id: ActorId): void {
    const a = this.actors.get(id);
    if (!a) return;
    this.actors.delete(id);
    this.grid.forget(a);
  }
}
