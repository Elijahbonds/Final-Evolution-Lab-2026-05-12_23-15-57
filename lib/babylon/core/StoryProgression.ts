// StoryProgression — Story Mode Phase 2: PRQ-biased progression.
//
//   PRQ hook is READ-ONLY: we consume the existing prqScore/prqGrade from
//     lib/prq.ts (never modify scoring). Difficulty and narrative beats
//     adapt to the player's CURRENT grade — a RECOVERING player gets
//     forgiving encounters; ELITE gets Vane at full cockiness.
//   Skill trees — three paths (Kinetic/Combat/Creative) as DATA: nodes,
//     prerequisites, costs. No hardcoded branches.
//   Influence — a typed, server-authoritative-READY structure: the client
//     tracks a display mirror only; grants route through the server when
//     the wallet is live. No client minting, ever.

import { prqGrade, type PrqGrade } from '../../prq';

// ── PRQ-adaptive difficulty (read-only PRQ) ────────────────────────────────
export interface DifficultyBias {
  aiDifficulty: number;        // multiplier for AI aggression/skill
  beatVariant: 'forgiving' | 'standard' | 'spicy';
  rivalTaunt: string;          // flavor, keyed to grade
}

export function biasForGrade(grade: PrqGrade['key']): DifficultyBias {
  switch (grade) {
    case 'RECOVERING':
      return { aiDifficulty: 0.8, beatVariant: 'forgiving', rivalTaunt: 'Vane barely looks up.' };
    case 'READY':
      return { aiDifficulty: 1.0, beatVariant: 'standard', rivalTaunt: 'Vane nods, once.' };
    case 'PRIMED':
      return { aiDifficulty: 1.15, beatVariant: 'standard', rivalTaunt: 'Vane warms up for you.' };
    case 'ELITE':
      return { aiDifficulty: 1.3, beatVariant: 'spicy', rivalTaunt: 'Vane clears his calendar.' };
  }
}

// ── Skill trees (data-driven) ──────────────────────────────────────────────
export interface SkillNode {
  id: string;
  label: string;
  path: 'kinetic' | 'combat' | 'creative';
  cost: number;                // [TUNE] influence cost (server-settled when live)
  requires: string[];          // node ids
  /** gameplay effect key the relevant mode reads */
  effect: string;
}

export const SKILL_TREES: SkillNode[] = [
  // kinetic
  { id: 'k1', label: 'Second Wind', path: 'kinetic', cost: 2, requires: [], effect: 'stamina_regen_up' },
  { id: 'k2', label: 'Spring Loading', path: 'kinetic', cost: 3, requires: ['k1'], effect: 'jump_boost' },
  { id: 'k3', label: 'Breakaway Gear', path: 'kinetic', cost: 4, requires: ['k2'], effect: 'sprint_overdrive' },
  // combat
  { id: 'c1', label: 'Read the Room', path: 'combat', cost: 2, requires: [], effect: 'parry_window_up' },
  { id: 'c2', label: 'Counterweight', path: 'combat', cost: 3, requires: ['c1'], effect: 'guard_impact_up' },
  { id: 'c3', label: 'Substitution Mastery', path: 'combat', cost: 4, requires: ['c2'], effect: 'substitution_cooldown_down' },
  // creative
  { id: 'v1', label: 'Showboat License', path: 'creative', cost: 2, requires: [], effect: 'style_tap_bonus' },
  { id: 'v2', label: 'Signature Series', path: 'creative', cost: 3, requires: ['v1'], effect: 'variety_memory_relief' },
  { id: 'v3', label: 'Garden Kinship', path: 'creative', cost: 4, requires: ['v2'], effect: 'companion_xp_up' },
];

export class SkillTree {
  private owned = new Set<string>();

  canUnlock(id: string, influenceAvailable: number): { ok: boolean; reason?: string } {
    const node = SKILL_TREES.find((n) => n.id === id);
    if (!node) return { ok: false, reason: 'unknown node' };
    if (this.owned.has(id)) return { ok: false, reason: 'already unlocked' };
    if (influenceAvailable < node.cost) return { ok: false, reason: 'insufficient influence' };
    for (const req of node.requires) {
      if (!this.owned.has(req)) return { ok: false, reason: `requires ${req}` };
    }
    return { ok: true };
  }

  /** Record a server-CONFIRMED unlock. The client never grants itself
   *  influence — the caller must have settled the spend server-side first. */
  confirmUnlock(id: string): void { this.owned.add(id); }
  has(id: string): boolean { return this.owned.has(id); }
  get effects(): string[] { return [...this.owned].map((id) => SKILL_TREES.find((n) => n.id === id)!.effect); }
}

// ── Influence (typed, server-ready, no client minting) ─────────────────────
export interface InfluenceWallet {
  /** display mirror of the server balance — NEVER written by gameplay */
  readonly balance: number;
  /** server-assigned ledger cursor for sync */
  readonly ledgerCursor: string | null;
}

export function mirrorInfluence(serverBalance: number, cursor: string | null): InfluenceWallet {
  return { balance: serverBalance, ledgerCursor: cursor };
}
