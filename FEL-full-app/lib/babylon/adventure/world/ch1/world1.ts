/**
 * World 1, Chapter 1's world (Phase B). Traversal-forward, built from world pieces (world/pieces.ts): the party
 * arrives through the hub's first gate far to the south and works its way north, back toward the hub, across:
 *
 *   the start      P0, z −600..−520: a long run-up (the run builds to the FLOW tiers).
 *   the rail run   a boosted rail from P0 over a 60 m void to P1 (z −460..−420): land on it and grind across.
 *   the wall run   a 16 m void (z −420..−404) beside a run-wall: jump into the wall, run it, kick off to P2. A plain jump
 *                  and air dash fall short (about 14 m); the wall run and its kick carry about 18 m. [TUNE]
 *   the chain      a 26 m chasm (z −372..−346) with three wisps hanging over it: jump, home onto each in turn, bounce on.
 *   the field      P3, z −346..−180, wide: the first camp, the mid-boss (a champion), the second camp.
 *   the arena      P4, z −180..−110: Chapter 1's boss. Its north edge looks out over a 74 m void at the hub: after
 *                  the boss falls the party fuses for the first time and FLIES home across it (owner: flight first
 *                  unlocks after Chapter 1's boss).
 * A fall into any void puts the party back at the last checkpoint (the story runtime). Every void is impassable on
 * foot from the hub's side, so World 1 is reached through its gate and left by air.
 *
 * THE BODY BUDGET (plan: ≤ 12 bodies in a story scene): the party plus at most five monsters at once (a camp is
 * spawned when its beat starts and cleared away once down; the wisps only while the party is near the chasm).
 * Every name [PLACEHOLDER]; every number [TUNE].
 */

import { block, flat } from '../pieces';
import { v3, type StoryWorldSpec } from '../story/spec';

export const W1_ID = 'w1';
export const W1_RAIL_Y = 1.2;

/** The wall-run wall: its face is x = 6, facing the lane (−x). */
export const W1_WALL = { x0: 6, x1: 7, z0: -430, z1: -396, h: 5 } as const;
/** The voids, south to north (the tests and the headless script read them). */
export const W1_GAPS = {
  rail: { z0: -520, z1: -460 },
  wall: { z0: -420, z1: -404 },
  chain: { z0: -372, z1: -346 },
  home: { z0: -110, z1: -36 },
} as const;

export function buildWorld1(): StoryWorldSpec {
  const W = W1_WALL;
  return {
    id: W1_ID,
    title: '[PLACEHOLDER] World 1',
    area: { minX: -32, maxX: 32, minZ: -600, maxZ: -110 },
    killY: -30,
    pieces: [
      flat('w1.p0', -10, 10, -600, -520, 0),
      flat('w1.p1', -10, 10, -460, -420, 0),
      flat('w1.p2', -10, 10, -404, -372, 0),
      flat('w1.p3', -18, 18, -346, -180, 0),
      flat('w1.p4', -30, 30, -180, -110, 0),
      // the run-wall over the wall gap (deep: it reads as a cliff face)
      block('w1.wall', W.x0, W.x1, W.z0, W.z1, W.h, -14),
      // the field's cover (line of sight breaks for the casters, something to fight around)
      block('w1.cover.a', -12, -9, -296, -292, 2.2), block('w1.cover.b', 9, 12, -250, -246, 2.2),
      block('w1.cover.c', -15, -12, -204, -200, 2.2),
      // the arena's side walls
      block('w1.arena.w', -30, -29, -180, -110, 2), block('w1.arena.e', 29, 30, -180, -110, 2),
    ],
    rails: [
      { id: 'w1.rail', points: [v3(0, W1_RAIL_Y, -546), v3(0, W1_RAIL_Y + 1.5, -495), v3(0, W1_RAIL_Y, -446)], smooth: true,
        speedBias: 1.5, minSpeed: 8, switches: [] },
    ],
    walls: [{ a: { x: W.x0, z: W.z0 }, b: { x: W.x0, z: W.z1 }, nx: -1, nz: 0, height: W.h }],
    spawns: {
      'w1.start': { pos: v3(0, 0, -592), yaw: 0 },
      'w1.rail': { pos: v3(0, 0, -438), yaw: 0 },
      'w1.wallrun': { pos: v3(0, 0, -394), yaw: 0 },
      'w1.chain': { pos: v3(0, 0, -338), yaw: 0 },
      'w1.camp1': { pos: v3(0, 0, -322), yaw: 0 },
      'w1.mid': { pos: v3(0, 0, -282), yaw: 0 },
      'w1.camp2': { pos: v3(0, 0, -238), yaw: 0 },
      'w1.arena': { pos: v3(0, 0, -172), yaw: 0 },
      'w1.edge': { pos: v3(0, 0, -116), yaw: 0 },
    },
    encounters: [
      { id: 'w1.wisps', life: 'world', nearM: 70, monsters: [
        { id: 'wisp.1', def: 'wisp', pos: v3(0, 3, -366), fly: true },
        { id: 'wisp.2', def: 'wisp', pos: v3(0, 3, -358), fly: true },
        { id: 'wisp.3', def: 'wisp', pos: v3(0, 3, -350), fly: true },
      ] },
      { id: 'w1.camp1', monsters: [
        { id: 'c1.skitter.1', def: 'skitter', pos: v3(-5, 0, -306) }, { id: 'c1.skitter.2', def: 'skitter', pos: v3(5, 0, -304) },
        { id: 'c1.swarm.1', def: 'swarm', pos: v3(-2, 0, -300) }, { id: 'c1.swarm.2', def: 'swarm', pos: v3(2, 0, -298) },
        { id: 'c1.flyer.1', def: 'flyer', pos: v3(0, 3, -296), fly: true },
      ] },
      { id: 'w1.mid', monsters: [{ id: 'mid.champion', def: 'champion', pos: v3(0, 0, -262) }] },
      { id: 'w1.camp2', monsters: [
        { id: 'c2.caster.1', def: 'caster', pos: v3(-8, 0, -214) }, { id: 'c2.caster.2', def: 'caster', pos: v3(8, 0, -212) },
        { id: 'c2.swarm.1', def: 'swarm', pos: v3(-2, 0, -222) }, { id: 'c2.swarm.2', def: 'swarm', pos: v3(2, 0, -220) },
        { id: 'c2.skitter.1', def: 'skitter', pos: v3(0, 0, -206) },
      ] },
      { id: 'w1.boss', monsters: [], boss: { id: 'boss.ch1', def: 'ch1', pos: v3(0, 0, -140) } },
    ],
    gates: [],
    decor: [
      { x: 0, z: -110.5, w: 60, d: 0.6, h: 0.4, color: '#facc15' },   // the arena's lip: the edge you fly from
    ],
  };
}
