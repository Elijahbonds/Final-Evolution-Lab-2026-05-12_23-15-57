/**
 * Obstacle & ambient-mob field — pure, deterministic layout core.
 *
 * The 3D sports scenes were reported as feeling "empty". This core generates a
 * repeatable set of obstacle props and slow-patrolling ambient mobs from a seed
 * so a scene can populate itself the same way every render (SSR-safe, testable)
 * without hand-placing dozens of objects.
 *
 * PURE MATH ONLY — no THREE, no DOM, no window. Fully unit-testable. Scenes map
 * the returned positions onto cheap primitive meshes (cones / low-poly figures).
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type ObstacleKind = 'cone' | 'barrier' | 'crate';

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  pos: Vec2;
  /** Collision / avoidance radius in world units. */
  radius: number;
}

export interface Mob {
  id: string;
  /** Anchor point the mob patrols around. */
  home: Vec2;
  /** Patrol path radius. */
  patrolRadius: number;
  /** Angular speed (rad/sec) — slow, ambient. // TUNE(elijah) */
  speed: number;
  /** Phase offset so mobs don't move in lockstep. */
  phase: number;
}

export interface FieldConfig {
  /** Rectangular bounds the field is scattered within. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  obstacleCount: number;
  mobCount: number;
  /** Keep-clear discs (e.g. the rim, the player spawn) — nothing spawns inside. */
  exclude?: Array<{ pos: Vec2; radius: number }>;
}

export interface ObstacleField {
  obstacles: Obstacle[];
  mobs: Mob[];
}

/** Deterministic PRNG (mulberry32) so layouts are stable across SSR/tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OBSTACLE_KINDS: ObstacleKind[] = ['cone', 'barrier', 'crate'];
const KIND_RADIUS: Record<ObstacleKind, number> = {
  cone: 0.35,
  barrier: 0.6,
  crate: 0.5,
};

function insideExcluded(
  p: Vec2,
  pad: number,
  exclude?: Array<{ pos: Vec2; radius: number }>,
): boolean {
  if (!exclude) return false;
  for (const e of exclude) {
    const dx = p.x - e.pos.x;
    const dz = p.z - e.pos.z;
    if (dx * dx + dz * dz < (e.radius + pad) * (e.radius + pad)) return true;
  }
  return false;
}

/**
 * Generate a deterministic obstacle + ambient-mob field. Rejection-samples
 * points that fall inside excluded discs so nothing spawns on the rim / player.
 */
export function generateField(cfg: FieldConfig, seed: number): ObstacleField {
  const rng = makeRng(seed);
  const { minX, maxX, minZ, maxZ } = cfg.bounds;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  const pick = (pad: number): Vec2 => {
    // Up to 24 tries to land outside the excluded discs, else accept last.
    let p: Vec2 = { x: 0, z: 0 };
    for (let i = 0; i < 24; i++) {
      p = { x: minX + rng() * spanX, z: minZ + rng() * spanZ };
      if (!insideExcluded(p, pad, cfg.exclude)) return p;
    }
    return p;
  };

  const obstacles: Obstacle[] = [];
  for (let i = 0; i < cfg.obstacleCount; i++) {
    const kind = OBSTACLE_KINDS[Math.floor(rng() * OBSTACLE_KINDS.length)] ?? 'cone';
    const radius = KIND_RADIUS[kind];
    obstacles.push({ id: `obs_${i}`, kind, pos: pick(radius), radius });
  }

  const mobs: Mob[] = [];
  for (let i = 0; i < cfg.mobCount; i++) {
    mobs.push({
      id: `mob_${i}`,
      home: pick(1),
      patrolRadius: 0.8 + rng() * 1.6,
      speed: 0.25 + rng() * 0.35, // TUNE(elijah)
      phase: rng() * Math.PI * 2,
    });
  }

  return { obstacles, mobs };
}

/** Ambient patrol position for a mob at time t (seconds). Pure orbit. */
export function mobPositionAt(mob: Mob, t: number): Vec2 {
  const a = mob.phase + t * mob.speed;
  return {
    x: mob.home.x + Math.cos(a) * mob.patrolRadius,
    z: mob.home.z + Math.sin(a) * mob.patrolRadius,
  };
}

/** Mob facing yaw (logical +Z-forward) from its orbit tangent at time t. */
export function mobFacingAt(mob: Mob, t: number): number {
  const a = mob.phase + t * mob.speed;
  // Tangent of the orbit = derivative of (cos,sin) = (-sin, cos).
  const dx = -Math.sin(a) * mob.patrolRadius;
  const dz = Math.cos(a) * mob.patrolRadius;
  return Math.atan2(dx, dz);
}

/**
 * Nearest-obstacle push-out: given a desired position, if it overlaps any
 * obstacle disc, slide it to the disc edge. Returns the corrected position.
 * Lets a scene add soft collision without bespoke per-object math.
 */
export function resolveObstacleCollision(
  desired: Vec2,
  bodyRadius: number,
  obstacles: Obstacle[],
): Vec2 {
  let { x, z } = desired;
  for (const o of obstacles) {
    const dx = x - o.pos.x;
    const dz = z - o.pos.z;
    const min = o.radius + bodyRadius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = (min - d) / d;
      x += dx * push;
      z += dz * push;
    }
  }
  return { x, z };
}
