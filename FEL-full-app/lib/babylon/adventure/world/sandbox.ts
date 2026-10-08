/**
 * The A4 test yard (ADVENTURE PLAN A4: "the integration sandbox"): one scene where every verb of Phase A can be tried
 * — run, grind, switch, wall-run, home, lock, fight, cast, fuse, fly, ride — and where the headless integration tests
 * play the same layout. Pure data plus a small runtime (the gate and the camp's respawn), no Babylon: world/view.ts
 * draws it.
 *
 * THE LAYOUT (metres; +z is forward from the spawn, +x to the right):
 *   the yard        x −64..64, z −24..250, flat at y 0, a 3 m wall round it.
 *   the straight    the lane x −6..6 from the spawn to z 150: room to build to the top FLOW tier (14 m/s in ~7 s).
 *   the walls       two 5 m run-walls flanking the straight at x ±7, z 60..100 (MatrixFocus-style wall runs).
 *   the slope       x 24..40: a 15% ramp up from z 30 to a plateau at y 9 (z 90..110), and down again to z 150.
 *   the rail loop   x −40..−20: a closed circuit at 1.2 m (two 100 m straights joined by two smooth turns) and a
 *                   parallel rail beside its inner straight, switchable both ways (rails/adapters addParallelSwitches).
 *   the camp        z 150..190: two of each monster type (A2's five archetypes; the flyers on the wing).
 *   the gate        a wall across z 196..198 with a 10 m gate in it; the gate drops when the camp is cleared.
 *   the arena       z 198..250: the placeholder boss.
 * THE BODY BUDGET (plan: ≤ 12 skinned bodies in a story scene): the player, the partner and the ten camp monsters,
 * or — once the camp is cleared and the gate is down — the player, the partner and the boss. Never more than 12.
 *
 * Names are generic and every number is a starting value. [TUNE] [PLACEHOLDER]
 */

import type { AdventureWorld, RailNetwork, RailSegment, Vec3, WallSegment } from '../contracts';
import { validateRailNetwork } from '../contracts';
import { addParallelSwitches, linkEnds } from '../rails/adapters';
import type { MonsterArchetype } from '../combat/monsters/defs';
import { block, clearBetween, flat, groundYOf, ramp, type BlockPiece, type GroundPiece } from './pieces';
import type { WorldSource } from '../host/hostWorld';

export const YARD = { minX: -64, maxX: 64, minZ: -24, maxZ: 250 } as const;
export const RAIL_Y = 1.2;
export const GATE_ID = 'gate';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export interface CampSpawn { id: string; type: MonsterArchetype; pos: Vec3 }

export interface SandboxSpec {
  id: string;
  pieces: GroundPiece[];
  rails: RailNetwork;
  walls: WallSegment[];
  bounds: NonNullable<AdventureWorld['bounds']>;
  player: { pos: Vec3; yaw: number };
  partner: { pos: Vec3; yaw: number };
  camp: CampSpawn[];
  boss: { id: string; pos: Vec3 };
  /** The gate's piece (a block switched off when it opens). */
  gate: BlockPiece;
}

/** The rail loop: two straights and two turns, linked end to end, plus a parallel rail with switches. */
export function sandboxRails(): RailNetwork {
  const y = RAIL_Y;
  const segs: RailSegment[] = [
    { id: 'loop.in', points: [v(-22, y, 20), v(-22, y, 120)], speedBias: 0, switches: [] },
    { id: 'loop.far', points: [v(-22, y, 120), v(-22, y, 127), v(-26, y, 132), v(-30, y, 133.5), v(-34, y, 132), v(-38, y, 127), v(-38, y, 120)],
      smooth: true, speedBias: 1.5, minSpeed: 8, switches: [] },
    { id: 'loop.out', points: [v(-38, y, 120), v(-38, y, 20)], speedBias: 0, switches: [] },
    { id: 'loop.near', points: [v(-38, y, 20), v(-38, y, 13), v(-34, y, 8), v(-30, y, 6.5), v(-26, y, 8), v(-22, y, 13), v(-22, y, 20)],
      smooth: true, speedBias: 1.5, minSpeed: 8, switches: [] },
    // the parallel rail: 3 m inside the inner straight, for the switch
    { id: 'side', points: [v(-19, y, 40), v(-19, y, 100)], speedBias: 0.5, switches: [] },
  ];
  const linked = linkEnds(segs, 0.05);
  return addParallelSwitches({ id: 'sandbox.rails', segments: linked }, { minGapM: 2, maxGapM: 4, everyM: 8, windowM: 2 });
}

/** A wall-run wall: the block (so the run stops at it and sight is blocked) and its run face. */
function runWall(id: string, x0: number, x1: number, z0: number, z1: number, faceX: number, nx: -1 | 1, h: number): [BlockPiece, WallSegment] {
  return [block(id, x0, x1, z0, z1, h), { a: { x: faceX, z: z0 }, b: { x: faceX, z: z1 }, nx, nz: 0, height: h }];
}

export function buildSandbox(): SandboxSpec {
  const Y = YARD;
  const [wallE, faceE] = runWall('wall.east', 7, 7.6, 60, 100, 7, -1, 5);
  const [wallW, faceW] = runWall('wall.west', -7.6, -7, 60, 100, -7, 1, 5);
  const gate = block(GATE_ID, -5, 5, 196, 198, 5);
  const pieces: GroundPiece[] = [
    flat('yard', Y.minX, Y.maxX, Y.minZ, Y.maxZ, 0),
    // the perimeter
    block('rim.s', Y.minX, Y.maxX, Y.minZ, Y.minZ + 1, 3), block('rim.n', Y.minX, Y.maxX, Y.maxZ - 1, Y.maxZ, 3),
    block('rim.w', Y.minX, Y.minX + 1, Y.minZ, Y.maxZ, 3), block('rim.e', Y.maxX - 1, Y.maxX, Y.minZ, Y.maxZ, 3),
    // the slope: up 15%, a plateau, down again
    ramp('slope.up', 24, 40, 30, 90, 'z', 0, 9), block('slope.top', 24, 40, 90, 110, 9), ramp('slope.down', 24, 40, 110, 150, 'z', 9, 0),
    wallE, wallW,
    // the arena wall and its gate
    block('arena.w', Y.minX, -5, 196, 198, 6), block('arena.e', 5, Y.maxX, 196, 198, 6), gate,
  ];
  const camp: CampSpawn[] = [
    { id: 'brute.1', type: 'brute', pos: v(-8, 0, 168) }, { id: 'brute.2', type: 'brute', pos: v(9, 0, 176) },
    { id: 'skitter.1', type: 'skitter', pos: v(-3, 0, 158) }, { id: 'skitter.2', type: 'skitter', pos: v(4, 0, 160) },
    { id: 'caster.1', type: 'caster', pos: v(-15, 0, 184) }, { id: 'caster.2', type: 'caster', pos: v(15, 0, 186) },
    { id: 'flyer.1', type: 'flyer', pos: v(-6, 3, 174) }, { id: 'flyer.2', type: 'flyer', pos: v(6, 3, 180) },
    { id: 'swarm.1', type: 'swarm', pos: v(0, 0, 166) }, { id: 'swarm.2', type: 'swarm', pos: v(-2, 0, 170) },
  ];
  return {
    id: 'sandbox',
    pieces,
    rails: sandboxRails(),
    walls: [faceE, faceW],
    bounds: { minX: Y.minX, maxX: Y.maxX, minZ: Y.minZ, maxZ: Y.maxZ },
    player: { pos: v(0, 0, 0), yaw: 0 },
    partner: { pos: v(1.6, 0, -1.2), yaw: 0 },
    camp,
    boss: { id: 'boss', pos: v(0, 0, 228) },
    gate,
  };
}

/** The host's view of the sandbox: ground and sight from the pieces (the gate counts while it is shut). */
export function sandboxWorldSource(spec: SandboxSpec): WorldSource {
  return {
    groundY: (x, z) => groundYOf(spec.pieces, x, z),
    clear: (a, b) => clearBetween(spec.pieces, a, b),
    rails: spec.rails,
    walls: spec.walls,
    bounds: spec.bounds,
  };
}

/** Authoring lint for the yard: the rails validate, every spawn stands on ground, the walls are in the yard. */
export function validateSandbox(spec: SandboxSpec): string[] {
  const errs = [...validateRailNetwork(spec.rails)];
  const onGround = (p: Vec3, what: string) => {
    const g = groundYOf(spec.pieces, p.x, p.z);
    if (g === null) errs.push(`${what}: over a void at (${p.x}, ${p.z})`);
    else if (Math.abs(g) > 0.01) errs.push(`${what}: stands at ${g} inside a block`);
  };
  onGround(spec.player.pos, 'player'); onGround(spec.partner.pos, 'partner'); onGround(spec.boss.pos, 'boss');
  for (const c of spec.camp) onGround(c.pos, c.id);
  const b = spec.bounds;
  for (const w of spec.walls) for (const p of [w.a, w.b]) if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) errs.push('a wall leaves the yard');
  if (!spec.rails.segments.some((s) => s.switches.length > 0)) errs.push('no rail switch');
  return errs;
}
