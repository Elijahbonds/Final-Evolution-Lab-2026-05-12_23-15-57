/**
 * THE COAST'S CREATURES, phase B (lane/coast-b; docs/COAST-ISLANDS-PLAN.md): a few placeholder creatures that live in the
 * zone, so the creature log has something to log. They wander near home and never fight (fights are a later phase).
 *
 * Their bodies are the Adventure's shipped creature placeholder (lib/babylon/adventure/world/view.ts buildCreatureBody: an
 * element's colour, a capsule and a head, wings from stage 2), the same body a creature partner wears. Nothing new is drawn
 * or downloaded. Every name is [PLACEHOLDER]; every number [TUNE].
 *
 * Pure: no Babylon, no clock, no Math.random (the wander is a fixed sequence per creature, so a run replays).
 */

import type { Element } from '@/lib/babylon/adventure/contracts';
import { ISLANDS, hash01, mainlandShoreX, surfaceY, walkable } from './zoneLayout';

export interface CreatureDef {
  id: string;
  name: string;
  /** Where the log says it lives (one short line). */
  where: string;
  element: Element;
  /** 0 a hatchling, 1, 2 winged (the placeholder body's stages). */
  stage: number;
  home: readonly [x: number, z: number];
  /** How far from home it wanders (m). */
  wanderR: number;
  /** Walking speed (m/s). */
  speed: number;
  /** Lowest ground it stands on (m): above the waterline for land creatures, in the shallows for a shore one. */
  minY: number;
}

const palmKey = ISLANDS[0], reefRock = ISLANDS[1];

export const ZONE_CREATURES: readonly CreatureDef[] = [
  { id: 'shellhopper', name: '[PLACEHOLDER] Shellhopper', where: 'The shallows below the Landing', element: 'water', stage: 0,
    home: [mainlandShoreX(12) + 2, 12], wanderR: 7, speed: 1.1, minY: -0.6 },
  { id: 'embergull', name: '[PLACEHOLDER] Ember Gull', where: 'The dunes above the beach', element: 'fire', stage: 2,
    home: [mainlandShoreX(-6) + 34, -6], wanderR: 12, speed: 1.6, minY: 0.4 },
  { id: 'palmglider', name: '[PLACEHOLDER] Palm Glider', where: 'Under the palms on Palm Key', element: 'wind', stage: 2,
    home: [palmKey.at[0] + 6, palmKey.at[1] + 4], wanderR: 14, speed: 1.8, minY: 0.4 },
  { id: 'reefstone', name: '[PLACEHOLDER] Reef Stone', where: 'Among the rocks of Reef Rock', element: 'earth', stage: 1,
    home: [reefRock.at[0], reefRock.at[1]], wanderR: 9, speed: 0.7, minY: 0.4 },
];

export interface CreatureState { id: string; x: number; y: number; z: number; yaw: number; moving: boolean }

/** May this creature stand at (x, z)? Inside its wander circle, on ground a person could stand on, not too low for it. */
export function creatureCanStand(d: CreatureDef, x: number, z: number): boolean {
  return Math.hypot(x - d.home[0], z - d.home[1]) <= d.wanderR && walkable(x, z) && surfaceY(x, z) >= d.minY;
}

interface Walker { def: CreatureDef; s: CreatureState; tx: number; tz: number; wait: number; n: number; seed: number }

/** The zone's creatures, wandering. `step` moves them; `near` reports who is within a distance of a point. */
export class CreatureHerd {
  readonly walkers: Walker[];
  constructor(defs: readonly CreatureDef[] = ZONE_CREATURES) {
    this.walkers = defs.map((def, i) => {
      const y = surfaceY(def.home[0], def.home[1]);
      const w: Walker = { def, s: { id: def.id, x: def.home[0], y, z: def.home[1], yaw: 0, moving: false }, tx: def.home[0], tz: def.home[1], wait: 1 + i * 0.4, n: 0, seed: 101 + i * 17 };
      return w;
    });
  }

  get states(): CreatureState[] { return this.walkers.map((w) => w.s); }

  /** The next wander point: a fixed sequence of tries inside the circle; home when none fits. */
  private pick(w: Walker): void {
    for (let k = 0; k < 12; k++) {
      w.n++;
      const a = hash01(w.seed, w.n, 1) * Math.PI * 2, r = Math.sqrt(hash01(w.seed, w.n, 2)) * w.def.wanderR;
      const x = w.def.home[0] + Math.cos(a) * r, z = w.def.home[1] + Math.sin(a) * r;
      if (creatureCanStand(w.def, x, z)) { w.tx = x; w.tz = z; return; }
    }
    w.tx = w.def.home[0]; w.tz = w.def.home[1];
  }

  step(dt: number): void {
    for (const w of this.walkers) {
      const s = w.s;
      if (w.wait > 0) { w.wait -= dt; s.moving = false; if (w.wait <= 0) this.pick(w); continue; }
      const dx = w.tx - s.x, dz = w.tz - s.z, d = Math.hypot(dx, dz);
      if (d < 0.2) { w.wait = 1.5 + hash01(w.seed, w.n, 3) * 3; s.moving = false; continue; }
      const k = Math.min(1, (w.def.speed * dt) / d);
      const nx = s.x + dx * k, nz = s.z + dz * k;
      if (!creatureCanStand(w.def, nx, nz)) { w.wait = 0.5; s.moving = false; continue; }
      s.x = nx; s.z = nz; s.y = surfaceY(nx, nz); s.yaw = Math.atan2(dx, dz); s.moving = true;
    }
  }

  /** The creatures within `r` metres of (x, z), on the ground plane. */
  near(x: number, z: number, r: number): CreatureState[] {
    const out: CreatureState[] = [];
    for (const w of this.walkers) if (Math.hypot(w.s.x - x, w.s.z - z) <= r) out.push(w.s);
    return out;
  }
}

/** coast.creaturesOn: 1 = the zone's creatures wander and can be logged (new); 0 = an empty zone, as in phase A. */
export const COAST_CREATURES_ON = 1;
/** coast.logSeenM: a creature this close is SEEN, and goes in the log (m). */
export const COAST_LOG_SEEN_M = 16;
/** coast.logMeetM: walk up this close and you have MET it (m). */
export const COAST_LOG_MEET_M = 3;
