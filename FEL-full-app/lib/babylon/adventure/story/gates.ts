/**
 * The hub's gates and the story's quests (Phase B), on core/StoryHub.ts as the plan's reuse table says
 * ("story/: core/StoryHub.ts (GateSystem, WorldGate, QuestDef, validateQuestManifest)"):
 *
 *   HubGates      the map's gates as StoryHub `WorldGate`s in one `GateSystem`: `gateAt` answers which gate the
 *                 player stands in and whether it is SEALED by its `requires: 'flight'` rule (the story's
 *                 flightUnlocked flag is StoryHub's `flight`). On top of StoryHub's seal, a gate is shut when it leads
 *                 nowhere yet (no chapter behind it) or when its chapter has not been reached.
 *   storyQuests   one StoryHub `QuestDef` per chapter: its gate, its first beat, its world (StoryHub's sector).
 *   validateStoryQuests  StoryHub's `validateQuestManifest` for what it checks generally (id, label, duplicates). Its
 *                 sector and gate checks are hard-wired to The Circuit's own SECTORS / WORLD_GATES tables, so for the
 *                 Adventure those two are checked here against the story map instead (an option on the core function
 *                 would be routed to its owner: LANES.md §3).
 *
 * StoryHub imports Babylon's Vector3 (it is a core module); the gate positions are built once here, and each query
 * reuses one scratch vector, so a per-frame check allocates nothing.
 */

import { Vector3 } from '@babylonjs/core';
import { GateSystem, validateQuestManifest, type QuestDef, type WorldGate } from '@/lib/babylon/core/StoryHub';
import type { Vec3 } from '../contracts';
import type { StoryIndex } from './format';
import { gatesOf, type StoryMap } from '../world/story/storyMap';
import type { StoryGateSpec } from '../world/story/spec';

export type GateShut = 'flight' | 'nowhere' | 'unreached';

export interface GateAnswer { gate: StoryGateSpec; open: boolean; shut: GateShut | null }

export class HubGates {
  readonly system: GateSystem;
  private readonly specs = new Map<string, StoryGateSpec>();
  private readonly scratch = new Vector3();

  constructor(map: StoryMap) {
    const wgs: WorldGate[] = [];
    for (const { worldId, gate } of gatesOf(map)) {
      this.specs.set(gate.id, gate);
      wgs.push({
        id: gate.id, label: gate.label, sectorId: worldId, pos: new Vector3(gate.pos.x, gate.pos.y, gate.pos.z),
        radius: gate.radius, modeId: 'adventure', ...(gate.requires ? { requires: gate.requires } : {}),
      });
    }
    this.system = new GateSystem(wgs);
  }

  spec(id: string): StoryGateSpec | null { return this.specs.get(id) ?? null; }

  /** The gate the player stands in (or null), and whether it lets them through. */
  at(p: Vec3, o: { flight: boolean; reached: (chapterId: string) => boolean }): GateAnswer | null {
    this.scratch.set(p.x, p.y, p.z);
    const hit = this.system.gateAt(this.scratch, { flight: o.flight, rivalTier2: false });
    if (!hit) return null;
    const gate = this.specs.get(hit.gate.id)!;
    return { gate, ...this.open(gate, hit.sealed, o.reached) };
  }

  /** A gate's state without standing in it (the view colours open and shut gates). */
  stateOf(id: string, o: { flight: boolean; reached: (chapterId: string) => boolean }): { open: boolean; shut: GateShut | null } | null {
    const gate = this.specs.get(id);
    if (!gate) return null;
    return this.open(gate, gate.requires === 'flight' && !o.flight, o.reached);
  }

  private open(gate: StoryGateSpec, sealed: boolean, reached: (id: string) => boolean): { open: boolean; shut: GateShut | null } {
    if (sealed) return { open: false, shut: 'flight' };
    if (!gate.to) return { open: false, shut: 'nowhere' };
    if (gate.opensWith && !reached(gate.opensWith)) return { open: false, shut: 'unreached' };
    return { open: true, shut: null };
  }
}

/** One quest per chapter: the hub gate that leads to its world, its first beat. */
export function storyQuests(ix: StoryIndex, map: StoryMap, firstBeat: (chapterId: string) => string | null): QuestDef[] {
  const gates = gatesOf(map);
  return ix.chapters.map((c) => {
    const g = gates.find((x) => x.gate.to?.worldId === c.worldId);
    return {
      id: `quest.${c.id}`, label: c.title, sectorId: g?.worldId ?? map.hubId, ...(g ? { gateId: g.gate.id } : {}),
      beatId: firstBeat(c.id) ?? '', goal: { type: 'playMode', modeId: 'adventure' },
      rewardNote: '[TUNE] Adventure XP per beat; account XP and LC wait for the session route (Phase B report)',
    };
  });
}

/** StoryHub's manifest check, with its Circuit-only table checks swapped for the story map's (see the header). */
export function validateStoryQuests(quests: QuestDef[], map: StoryMap): string[] {
  const circuitOnly = /: unknown (sector|gate) /;
  const errs = validateQuestManifest(quests).filter((e) => !circuitOnly.test(e));
  const gateIds = new Set(gatesOf(map).map((g) => g.gate.id));
  for (const q of quests) {
    if (!map.worlds.has(q.sectorId)) errs.push(`${q.id}: unknown world ${q.sectorId}`);
    if (q.gateId && !gateIds.has(q.gateId)) errs.push(`${q.id}: unknown gate ${q.gateId}`);
    if (!q.beatId) errs.push(`${q.id}: no first beat`);
  }
  return errs;
}
