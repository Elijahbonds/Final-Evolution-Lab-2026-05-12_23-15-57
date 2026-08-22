// EvolutionGarden — Story Mode Phase 4: companion core loop.
//
//   Species manifest — data-driven: base stats, diet of training biases,
//     mount capability, evolution stages (resolved by training history in
//     Phase 5). Placeholder species marked [TUNE].
//   CompanionStats — the companion's PRQ-mirror: the SAME attributes the
//     player trains, so the Garden visibly parallels the player's growth
//     (approved spine §3).
//   GardenEventBus — gameplay results (mode, score, quality) become
//     companion training events via an observer pattern. Modes PUBLISH;
//     the garden SUBSCRIBES. No cross-mode coupling.
//   MountSystem — mount-capable species attach to the avatar rig via a
//     socket node (extends, never forks, the canonical rig); flight swaps
//     to a dedicated FlightController (altitude/pitch/boost stamina tied
//     to the companion's endurance).

import { Vector3 } from '@babylonjs/core';

// ── Species manifest ───────────────────────────────────────────────────────
export type CompanionAttr = 'strength' | 'speed' | 'endurance' | 'agility' | 'power' | 'flexibility' | 'recovery' | 'mental';

export interface SpeciesDef {
  id: string;
  label: string;              // [TUNE] placeholder name
  baseStats: Partial<Record<CompanionAttr, number>>;
  /** which mode families feed which stats (training bias) */
  trainingBias: { modeFamily: 'court' | 'combat' | 'board' | 'precision' | 'rhythm'; attr: CompanionAttr; rate: number }[];
  mountCapableAtStage: number | null;    // null = never mountable
  stages: string[];                       // evolution stage labels
}

export const SPECIES: SpeciesDef[] = [
  {
    id: 'cinderpup', label: '[TUNE] Cinderpup', mountCapableAtStage: null,
    baseStats: { strength: 40, speed: 55, endurance: 35 },
    trainingBias: [
      { modeFamily: 'court', attr: 'speed', rate: 1.2 },
      { modeFamily: 'combat', attr: 'power', rate: 1.0 },
    ],
    stages: ['Pup', 'Ember Hound', 'Pyre Wolf'],
  },
  {
    id: 'strideraptor', label: '[TUNE] Strideraptor', mountCapableAtStage: 2,
    baseStats: { speed: 60, agility: 55, endurance: 40 },
    trainingBias: [
      { modeFamily: 'board', attr: 'agility', rate: 1.2 },
      { modeFamily: 'court', attr: 'speed', rate: 1.1 },
      { modeFamily: 'precision', attr: 'mental', rate: 0.8 },
    ],
    stages: ['Chick', 'Strider', 'Skyraptor'],
  },
  {
    id: 'gardenite', label: '[TUNE] Gardenite', mountCapableAtStage: null,
    baseStats: { recovery: 60, mental: 50, flexibility: 45 },
    trainingBias: [
      { modeFamily: 'precision', attr: 'mental', rate: 1.3 },
      { modeFamily: 'rhythm', attr: 'recovery', rate: 1.0 },
    ],
    stages: ['Sprout', 'Bloom', 'Elderwood'],
  },
];

// ── Companion instance ─────────────────────────────────────────────────────
export class Companion {
  stats: Record<CompanionAttr, number>;
  stage = 0;
  xp = 0;

  constructor(public species: SpeciesDef) {
    const base = { strength: 30, speed: 30, endurance: 30, agility: 30, power: 30, flexibility: 30, recovery: 30, mental: 30 };
    this.stats = { ...base, ...species.baseStats } as Record<CompanionAttr, number>;
  }

  get mountCapable(): boolean {
    return this.species.mountCapableAtStage !== null && this.stage >= this.species.mountCapableAtStage;
  }

  get stageLabel(): string { return this.species.stages[this.stage] ?? this.species.stages.at(-1)!; }
}

// ── Training event bus (observer — modes publish, garden subscribes) ───────
export interface TrainingEvent {
  modeFamily: SpeciesDef['trainingBias'][number]['modeFamily'];
  quality01: number;          // how well the session went
}

type Handler = (e: TrainingEvent) => void;

export class GardenEventBus {
  private subs = new Set<Handler>();
  subscribe(fn: Handler): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  publish(e: TrainingEvent): void { this.subs.forEach((fn) => fn(e)); }
}

/** Default garden subscriber: apply a training event to a companion per its
 *  species bias. Returns the XP gained (for UI). */
export function trainFromEvent(c: Companion, e: TrainingEvent): number {
  let gained = 0;
  for (const bias of c.species.trainingBias) {
    if (bias.modeFamily !== e.modeFamily) continue;
    const d = bias.rate * e.quality01 * 2;      // [TUNE]
    const attr = bias.attr;
    c.stats[attr] = Math.min(100, c.stats[attr] + d);
    gained += d;
  }
  c.xp += gained;
  // evolution: stage up at XP thresholds [TUNE]
  const nextAt = (c.stage + 1) * 25;
  if (c.stage < c.species.stages.length - 1 && c.xp >= nextAt) c.stage++;
  return gained;
}

// ── Mount + flight ─────────────────────────────────────────────────────────
/** The rig attachment: a socket node parented to the avatar root. The rig
 *  itself is untouched (canonical rig preserved; we EXTEND with a socket). */
export const MOUNT_SOCKET_BONE = 'Hips';      // rider sits at the hips

/** Flight controller — active while mounted. Altitude + pitch/yaw, boost
 *  drains companion endurance, regen while gliding. */
export class FlightController {
  vel = Vector3.Zero();
  stamina: number;
  pitch = 0; yaw = 0;

  constructor(companion: Companion) {
    this.stamina = companion.stats.endurance;
  }

  get canBoost(): boolean { return this.stamina > 5; }

  /** frame: pitch/yaw steer, boost drains, glide regens */
  update(dt: number, pitchIn: number, yawIn: number, boost: boolean): void {
    this.yaw += yawIn * 1.8 * dt;
    this.pitch = Math.max(-0.8, Math.min(0.8, this.pitch + pitchIn * 1.4 * dt));
    const boosting = boost && this.canBoost;
    this.stamina = Math.max(0, Math.min(100, this.stamina + (boosting ? -14 : 6) * dt));
    const speed = boosting ? 16 : 9;
    const fwd = new Vector3(Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.yaw));
    this.vel = fwd.scale(speed);
    // gravity always tugs when not boosting
    if (!boosting) this.vel.y -= 2.2 * dt;
  }
}
