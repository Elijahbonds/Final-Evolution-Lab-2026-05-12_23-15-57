// StoryHub — Story Mode Phase 1: "The Circuit" hub scaffolding.
//
//   Sectors — three thematic zones as DATA (bounds + gate positions), so
//     the mode renders them and the schema drives everything.
//   WorldGates — trigger volumes that call the mode-loading shim (the
//     MODES registry is the shim: a gate activation resolves to a modeId
//     handoff). Gates can be SEALED (flight/story-gated per the approved
//     spine).
//   Quests/NPCs — manifest-driven (story_quests.json schema), loaded as
//     data, never hardcoded.
//
// Movement reuses the existing Court/Free-3D traversal (CourtMovement) —
// no new physics, per the prompt.

import { Vector3 } from '@babylonjs/core';

// ── Sectors ────────────────────────────────────────────────────────────────
export interface SectorDef {
  id: string;
  label: string;
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** spawn position when entering the sector */
  spawn: Vector3;
}

export const SECTORS: SectorDef[] = [
  { id: 'blacktop', label: 'Blacktop & Arena District', bounds: { x0: -40, z0: -40, x1: 0, z1: 0 }, spawn: new Vector3(-20, 0, -20) },
  { id: 'dojo', label: 'Dojo & Urban Park', bounds: { x0: 0, z0: -40, x1: 40, z1: 0 }, spawn: new Vector3(20, 0, -20) },
  { id: 'loft', label: 'Creator Loft', bounds: { x0: -20, z0: 0, x1: 20, z1: 40 }, spawn: new Vector3(0, 0, 20) },
  // the sky decks — flight-gated per the approved spine
  { id: 'skydecks', label: 'Rooftop Circuit', bounds: { x0: -20, z0: 40, x1: 20, z1: 70 }, spawn: new Vector3(0, 8, 55) },
];

// ── World Gates ────────────────────────────────────────────────────────────
export interface WorldGate {
  id: string;
  label: string;
  sectorId: string;
  pos: Vector3;
  radius: number;
  /** modeId in the MODES registry this gate hands off to */
  modeId: string;
  /** story gate: sealed until a flag (flight, rival tier) is earned */
  requires?: 'flight' | 'rival_tier2';
}

export const WORLD_GATES: WorldGate[] = [
  { id: 'gate_dunk', label: 'Dunk Contest', sectorId: 'blacktop', pos: new Vector3(-28, 0, -28), radius: 2.2, modeId: 'dunk' },
  { id: 'gate_court', label: '1v1 Blacktop', sectorId: 'blacktop', pos: new Vector3(-14, 0, -30), radius: 2.2, modeId: 'onevone' },
  { id: 'gate_dojo', label: 'Showdown Dojo', sectorId: 'dojo', pos: new Vector3(22, 0, -26), radius: 2.2, modeId: 'showdown' },
  { id: 'gate_duel', label: 'Weapon Duel Ring', sectorId: 'dojo', pos: new Vector3(30, 0, -12), radius: 2.2, modeId: 'duel' },
  { id: 'gate_loft', label: 'Creator Studio', sectorId: 'loft', pos: new Vector3(0, 0, 22), radius: 2.2, modeId: 'dance' },
  // flight-gated (spine §4)
  { id: 'gate_sky_trial', label: 'Aerial Time Trial', sectorId: 'skydecks', pos: new Vector3(-8, 8, 58), radius: 2.6, modeId: 'snowboard_slalom', requires: 'flight' },  // slope run stands in until a dedicated aerial mode exists
  { id: 'gate_sky_dojo', label: 'Sky Dojo', sectorId: 'skydecks', pos: new Vector3(8, 8, 62), radius: 2.6, modeId: 'showdown', requires: 'flight' },
];

export class GateSystem {
  constructor(private gates: WorldGate[]) {}

  /** Gate under the player right now (or null). Sealed gates report but
   *  don't activate. */
  gateAt(pos: Vector3, flags: { flight: boolean; rivalTier2: boolean }): { gate: WorldGate; sealed: boolean } | null {
    for (const g of this.gates) {
      if (Vector3.Distance(pos, g.pos) <= g.radius) {
        const sealed = (g.requires === 'flight' && !flags.flight) || (g.requires === 'rival_tier2' && !flags.rivalTier2);
        return { gate: g, sealed };
      }
    }
    return null;
  }

  get all(): WorldGate[] { return this.gates; }
}

// ── Quest manifest schema ──────────────────────────────────────────────────
export interface QuestDef {
  id: string;
  label: string;
  sectorId: string;
  /** gate/mode it points at (if any) */
  gateId?: string;
  /** narrative beat id in the story manifest */
  beatId: string;
  /** completion: play a mode / win N / reach a PRQ tier */
  goal: { type: 'playMode' | 'winMode' | 'prqTier'; modeId?: string; count?: number; tier?: string };
  /** [TUNE] reward placeholder — server-authoritative when wired */
  rewardNote?: string;
}

export function validateQuest(q: QuestDef): string[] {
  const errs: string[] = [];
  if (!q.id || !q.label) errs.push('quest needs id + label');
  if (q.gateId && !WORLD_GATES.some((g) => g.id === q.gateId)) errs.push(`unknown gate ${q.gateId}`);
  if (!SECTORS.some((s) => s.id === q.sectorId)) errs.push(`unknown sector ${q.sectorId}`);
  return errs;
}

export function validateQuestManifest(quests: QuestDef[]): string[] {
  const ids = new Set<string>();
  const errs: string[] = [];
  for (const q of quests) {
    errs.push(...validateQuest(q).map((e) => `${q.id}: ${e}`));
    if (ids.has(q.id)) errs.push(`${q.id}: duplicate id`);
    ids.add(q.id);
  }
  return errs;
}
