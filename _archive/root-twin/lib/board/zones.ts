// lib/board/zones.ts
//
// PURE 3-zone skatepark model + natural carve/pump momentum. NO THREE / DOM /
// React imports. Imported by BOTH the live board physics (board-physics.ts,
// skate mode terrain) and the headless test suite (scripts/sports-tests.ts).
//
// M14-P10: the Venice skatepark is expanded from a single symmetric bowl into
// three readable zones a rider can flow between, and pumping the transitions
// (bowl walls / vert wall) while carving builds real momentum instead of the
// old constant push. This module is the single source of truth for the zone
// layout, the analytic terrain height of the skate map, and the pump gain.
// Every feel number is tagged //TUNE(elijah).

export type SkateZone = 'flow' | 'bowl' | 'vert';

export interface ZoneDef {
  id: SkateZone;
  label: string;
  centerX: number;
  centerZ: number;
  radius: number;
  /** How much speed a clean pump in this zone's transition returns. */
  pumpGain: number;
}

// Park bounds are +/-13 (see MAPS['venice-skatepark']). The three zones tile
// the play area left->right: a deep bowl, a central flow/street, a vert wall.
export const SKATE_ZONES: Record<SkateZone, ZoneDef> = {
  bowl: { id: 'bowl', label: 'DEEP BOWL', centerX: -7, centerZ: -3, radius: 5.5, pumpGain: 1.6 }, // TUNE(elijah)
  flow: { id: 'flow', label: 'FLOW STREET', centerX: 0, centerZ: 5, radius: 6.0, pumpGain: 0.6 }, // TUNE(elijah)
  vert: { id: 'vert', label: 'VERT WALL', centerX: 8, centerZ: -5, radius: 5.5, pumpGain: 2.0 }, // TUNE(elijah)
};

export const ZONE_ORDER: SkateZone[] = ['bowl', 'flow', 'vert'];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Which zone a world point belongs to (nearest zone centre; flow is default). */
export function zoneAt(x: number, z: number): SkateZone {
  let best: SkateZone = 'flow';
  let bestD = Infinity;
  for (const id of ZONE_ORDER) {
    const zn = SKATE_ZONES[id];
    const d = dist2(x, z, zn.centerX, zn.centerZ) / zn.radius;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

// ---- Analytic terrain shapes (all smooth, all bounded) --------------------

/** Perimeter quarterpipe so a rider can never leave the park bounds. */
function perimeterWall(x: number, z: number): number {
  const qp = (d: number): number => {
    if (d <= 0) return 0;
    const h = 0.55 * d * d; // TUNE(elijah) steeper so past the bound is a true wall
    return h < 3.6 ? h : 3.6 + (d - Math.sqrt(3.6 / 0.55)) * 0.12;
  };
  return qp(Math.abs(x) - 11) + qp(Math.abs(z) - 15);
}

/** Smooth circular bowl depression with a raised coping lip at the rim. */
function bowlDepression(
  x: number,
  z: number,
  cx: number,
  cz: number,
  R: number,
  depth: number,
): number {
  const d = dist2(x, z, cx, cz);
  if (d >= R + 2.2) return 0;
  if (d <= R) {
    const inner = 1 - d / R; // 1 at centre -> 0 at rim
    return -depth * inner * inner; // parabolic dip
  }
  // Just outside the rim: coping lip rises then flattens back to grade.
  const o = d - R; // 0..2.2
  return Math.min(1.1, o * o * 0.55);
}

/** Steep vert quarterpipe wall rising toward the +x edge, centred on cz. */
function vertWall(x: number, z: number, x0: number, cz: number, halfZ: number): number {
  if (x <= x0) return 0;
  const zc = clamp(1 - Math.abs(z - cz) / halfZ, 0, 1);
  const dx = x - x0;
  const h = dx < 3.4 ? 0.5 * dx * dx : 2.9 + (dx - 3.4) * 0.16;
  return zc * zc * h;
}

/** Small street funbox / ledge in the flow zone. */
function funbox(x: number, z: number, cx: number, cz: number, r: number, h: number): number {
  const d = dist2(x, z, cx, cz);
  if (d >= r) return 0;
  const t = 1 - d / r;
  return h * t * t;
}

/**
 * Analytic ground height of the 3-zone skatepark at (x,z).
 * Deterministic; composed of smooth, bounded features so the physics'
 * finite-difference gradient stays well-behaved everywhere.
 */
export function skateHeight(x: number, z: number): number {
  const perim = perimeterWall(x, z);
  const bowl = bowlDepression(x, z, SKATE_ZONES.bowl.centerX, SKATE_ZONES.bowl.centerZ, SKATE_ZONES.bowl.radius, 3.4); // TUNE(elijah)
  const vert = vertWall(x, z, SKATE_ZONES.vert.centerX - 2, SKATE_ZONES.vert.centerZ, 5.5);
  const ledge = funbox(x, z, 1.5, 6, 2.6, 0.6) + funbox(x, z, -2.5, 8, 2.0, 0.45); // TUNE(elijah)
  return perim + bowl + vert + ledge;
}

// ---- Pump / carve momentum ------------------------------------------------

export const PUMP_STEEP_MIN = 0.35; // TUNE(elijah) gradient magnitude that counts as a transition
export const PUMP_MAX_IMPULSE = 6.5; // TUNE(elijah) m/s per second cap of pump gain

/**
 * Speed impulse (m/s) added over dt from pumping a transition.
 * @param zone       current zone (gain differs per zone).
 * @param slopeMag   |terrain gradient| at the rider (steepness of transition).
 * @param carveAlign 0..1 how hard the rider is carving (|steer| * speedNorm).
 * @param dt         frame delta seconds.
 * Returns 0 on flat ground — you only pump a transition, and only while carving.
 */
export function pumpImpulse(
  zone: SkateZone,
  slopeMag: number,
  carveAlign: number,
  dt: number,
): number {
  if (slopeMag < PUMP_STEEP_MIN) return 0;
  const steep = clamp((slopeMag - PUMP_STEEP_MIN) / 1.2, 0, 1);
  const gain = SKATE_ZONES[zone].pumpGain * steep * clamp(carveAlign, 0, 1);
  return Math.min(PUMP_MAX_IMPULSE, gain) * dt;
}
