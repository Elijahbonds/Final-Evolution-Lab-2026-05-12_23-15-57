/**
 * The story's map (Phase B): every story world laid out in ONE coordinate space — the hub at the origin, World 1 to
 * its south across a void — and handed to the host as one world source (ground, sight, rails, walls, bounds). The
 * host never swaps its world: a gate is a warp between named spawns, and the flight home is a real flight. Phase F's
 * open world puts the same pieces on a bigger grid and streams them; nothing here assumes one arena.
 *
 * Pure: data and lookups, no Babylon.
 */

import { validateRailNetwork, type AdventureWorld, type RailNetwork, type Vec3, type WallSegment } from '../../contracts';
import { clearBetween, groundYOf, type GroundPiece } from '../pieces';
import type { WorldSource } from '../../host/hostWorld';
import { buildHub, HUB_ID } from '../hub/hub';
import { buildWorld1 } from '../ch1/world1';
import { STORY_BESTIARY, STORY_BOSSES } from '../ch1/bestiary';
import type { EncounterSpec, StoryGateSpec, StorySpawn, StoryWorldSpec } from './spec';

export interface StoryMap {
  hubId: string;
  worlds: ReadonlyMap<string, StoryWorldSpec>;
  pieces: GroundPiece[];
  rails: RailNetwork;
  walls: WallSegment[];
  bounds: NonNullable<AdventureWorld['bounds']>;
}

/** The margin flight may stray past the worlds' footprints, metres. [TUNE] */
export const MAP_FLIGHT_MARGIN = 24;

export function buildStoryMap(worlds: StoryWorldSpec[] = [buildHub(), buildWorld1()]): StoryMap {
  const byId = new Map(worlds.map((w) => [w.id, w]));
  const pieces = worlds.flatMap((w) => w.pieces);
  const rails: RailNetwork = { id: 'story.rails', segments: worlds.flatMap((w) => w.rails) };
  const walls = worlds.flatMap((w) => w.walls);
  const m = MAP_FLIGHT_MARGIN;
  const bounds = {
    minX: Math.min(...worlds.map((w) => w.area.minX)) - m, maxX: Math.max(...worlds.map((w) => w.area.maxX)) + m,
    minZ: Math.min(...worlds.map((w) => w.area.minZ)) - m, maxZ: Math.max(...worlds.map((w) => w.area.maxZ)) + m,
  };
  return { hubId: HUB_ID, worlds: byId, pieces, rails, walls, bounds };
}

/** The host's view of the map: ground and sight from every world's pieces. */
export function storyWorldSource(map: StoryMap): WorldSource {
  return {
    groundY: (x, z) => groundYOf(map.pieces, x, z),
    clear: (a, b) => clearBetween(map.pieces, a, b),
    rails: map.rails,
    walls: map.walls,
    bounds: map.bounds,
  };
}

export function spawnOf(map: StoryMap, worldId: string, spawnId: string): StorySpawn | null {
  return map.worlds.get(worldId)?.spawns[spawnId] ?? null;
}

/** A spawn by id alone (spawn ids are unique across the map; validateStoryMap holds that). */
export function findSpawn(map: StoryMap, spawnId: string): { worldId: string; spawn: StorySpawn } | null {
  for (const w of map.worlds.values()) { const s = w.spawns[spawnId]; if (s) return { worldId: w.id, spawn: s }; }
  return null;
}

export function encounterOf(map: StoryMap, id: string): { worldId: string; enc: EncounterSpec } | null {
  for (const w of map.worlds.values()) { const e = w.encounters.find((x) => x.id === id); if (e) return { worldId: w.id, enc: e }; }
  return null;
}

export function gatesOf(map: StoryMap): { worldId: string; gate: StoryGateSpec }[] {
  const out: { worldId: string; gate: StoryGateSpec }[] = [];
  for (const w of map.worlds.values()) for (const g of w.gates) out.push({ worldId: w.id, gate: g });
  return out;
}

/** Which world a point stands in (by footprint), or null over the voids between. */
export function worldAt(map: StoryMap, p: Pick<Vec3, 'x' | 'z'>): string | null {
  for (const w of map.worlds.values()) {
    const a = w.area;
    if (p.x >= a.minX && p.x <= a.maxX && p.z >= a.minZ && p.z <= a.maxZ) return w.id;
  }
  return null;
}

/** Authoring lint for the whole map (empty = valid). */
export function validateStoryMap(map: StoryMap): string[] {
  const errs = [...validateRailNetwork(map.rails)];
  const ids = { spawn: new Set<string>(), enc: new Set<string>(), actor: new Set<string>(), gate: new Set<string>(), piece: new Set<string>() };
  const once = (set: Set<string>, id: string, what: string) => { if (set.has(id)) errs.push(`duplicate ${what} ${id}`); set.add(id); };
  const ws = [...map.worlds.values()];
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    const a = ws[i].area, b = ws[j].area;
    if (a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ) errs.push(`${ws[i].id} and ${ws[j].id} overlap`);
  }
  const onGround = (p: Vec3, what: string, air = false) => {
    const g = groundYOf(map.pieces, p.x, p.z);
    if (g === null) { if (!air) errs.push(`${what}: over a void at (${p.x}, ${p.z})`); return; }
    if (!air && Math.abs(g - p.y) > 0.01) errs.push(`${what}: stands at y ${p.y} but the ground is ${g}`);
    if (air && p.y < g) errs.push(`${what}: below the ground`);
  };
  for (const w of ws) {
    if (!w.title.startsWith('[PLACEHOLDER]')) errs.push(`${w.id}: title must stay [PLACEHOLDER] until the owner names it`);
    for (const p of w.pieces) {
      once(ids.piece, p.id, 'piece');
      if (p.minX < w.area.minX - 1e-6 || p.maxX > w.area.maxX + 1e-6 || p.minZ < w.area.minZ - 1e-6 || p.maxZ > w.area.maxZ + 1e-6) errs.push(`${w.id}: piece ${p.id} leaves the world's area`);
    }
    for (const [id, s] of Object.entries(w.spawns)) { once(ids.spawn, id, 'spawn'); onGround(s.pos, `${w.id}/${id}`); }
    for (const e of w.encounters) {
      once(ids.enc, e.id, 'encounter');
      for (const m of e.monsters) {
        once(ids.actor, m.id, 'actor');
        if (!STORY_BESTIARY[m.def]) errs.push(`${e.id}: unknown monster ${m.def}`);
        onGround(m.pos, `${e.id}/${m.id}`, !!m.fly);
      }
      if (e.boss) {
        once(ids.actor, e.boss.id, 'actor');
        if (!STORY_BOSSES[e.boss.def]) errs.push(`${e.id}: unknown boss ${e.boss.def}`);
        onGround(e.boss.pos, `${e.id}/${e.boss.id}`);
      }
      if (!e.monsters.length && !e.boss) errs.push(`${e.id}: empty encounter`);
    }
    for (const g of w.gates) {
      once(ids.gate, g.id, 'gate');
      if (!g.label.startsWith('[PLACEHOLDER]')) errs.push(`${g.id}: label must stay [PLACEHOLDER]`);
      if (g.to && !spawnOf(map, g.to.worldId, g.to.spawnId)) errs.push(`${g.id}: leads to a missing spawn ${g.to.worldId}/${g.to.spawnId}`);
      onGround(g.pos, `gate ${g.id}`);
    }
    for (const r of w.rails) {
      for (const p of r.points) if (p.x < w.area.minX || p.x > w.area.maxX || p.z < w.area.minZ || p.z > w.area.maxZ) errs.push(`${r.id}: leaves ${w.id}`);
    }
  }
  if (!map.worlds.has(map.hubId)) errs.push(`no hub ${map.hubId}`);
  return errs;
}
