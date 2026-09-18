// FusionColosseum — Story Mode Phase 5: genetic fusion, evolution branching,
// and the real-time Monster Colosseum.
//
//   FusionMatrix — trait/movelist inheritance from two parents. ALL
//     probability/weight values are [TUNE]. Fusion resolves moves AT
//     FUSION TIME (clip + hitbox data land on the offspring manifest),
//     never at battle time.
//   Evolution — branching by training history + PRQ bias, data-driven.
//   Colosseum combat — companions fight on the SAME combat stack as
//     players: CombatAnimTree states + FightCore's FighterState/
//     resolveStrike hit resolution. Moves are per-species DATA (clip ref,
//     hitbox timing, stamina cost) so new species need no new code.

import { Companion, type CompanionAttr, type SpeciesDef } from './EvolutionGarden';
import { FighterState, resolveStrike, type AttackDef } from './FightCore';

// ── Move manifest (per species, data-driven) ───────────────────────────────
export interface CompanionMove {
  id: string;
  label: string;
  clip: string;                // animation registry name (resolver-backed)
  atk: AttackDef;              // range/startup/stun/knockback/chi/guardDmg
  staminaCost: number;         // [TUNE]
  hitType: 'strike' | 'pounce' | 'cast';
}

export const COMPANION_MOVES: Record<string, CompanionMove[]> = {
  cinderpup: [
    { id: 'bite', label: 'Bite', clip: 'karate_punch_light', staminaCost: 6, hitType: 'strike',
      atk: { id: 'bite', label: 'BITE', clip: 'jab', dmg: 7, range: 1.4, startupMs: 140, stunSec: 0.3, knockback: 0.5, chiGain: 8, guardDmg: 6 } },
    { id: 'emberdash', label: 'Ember Dash', clip: 'run_forward', staminaCost: 14, hitType: 'pounce',
      atk: { id: 'emberdash', label: 'EMBER DASH', clip: 'run', dmg: 12, range: 2.4, startupMs: 220, stunSec: 0.5, knockback: 1.4, chiGain: 10, guardDmg: 12 } },
  ],
  strideraptor: [
    { id: 'talonrake', label: 'Talon Rake', clip: 'karate_kick_roundhouse', staminaCost: 8, hitType: 'strike',
      atk: { id: 'talonrake', label: 'TALON RAKE', clip: 'roundhouse', dmg: 9, range: 1.9, startupMs: 170, stunSec: 0.4, knockback: 0.8, chiGain: 9, guardDmg: 9 } },
    { id: 'skydive', label: 'Sky Dive', clip: 'jump_up', staminaCost: 18, hitType: 'pounce',
      atk: { id: 'skydive', label: 'SKY DIVE', clip: 'jumpshot', dmg: 15, range: 2.8, startupMs: 300, stunSec: 0.6, knockback: 2.0, chiGain: 12, guardDmg: 18 } },
  ],
  gardenite: [
    { id: 'vinewhip', label: 'Vine Whip', clip: 'karate_punch_light', staminaCost: 5, hitType: 'cast',
      atk: { id: 'vinewhip', label: 'VINE WHIP', clip: 'jab', dmg: 6, range: 2.6, startupMs: 160, stunSec: 0.3, knockback: 0.4, chiGain: 7, guardDmg: 7 } },
    { id: 'sporeburst', label: 'Spore Burst', clip: 'karate_counter_throw', staminaCost: 16, hitType: 'cast',
      atk: { id: 'sporeburst', label: 'SPORE BURST', clip: 'uppercut', dmg: 11, range: 2.2, startupMs: 280, stunSec: 0.8, knockback: 0.6, chiGain: 10, guardDmg: 14 } },
  ],
};

// ── Fusion (all weights [TUNE]) ────────────────────────────────────────────
export interface FusionResult {
  stats: Record<CompanionAttr, number>;
  moves: CompanionMove[];      // resolved NOW (clip+hitbox travel with it)
  dominantSpecies: string;
}

/** Fuse two companions: per-stat, take the higher with a bias roll; the
 *  movelist is the union (deduped), resolved against the manifest NOW. */
export function fuse(a: Companion, b: Companion, roll: () => number = Math.random): FusionResult {
  const stats = {} as Record<CompanionAttr, number>;
  const attrs = Object.keys(a.stats) as CompanionAttr[];
  for (const at of attrs) {
    const hi = Math.max(a.stats[at], b.stats[at]);
    const lo = Math.min(a.stats[at], b.stats[at]);
    stats[at] = Math.round(hi * 0.7 + lo * 0.3 + (roll() - 0.5) * 4);   // [TUNE]
  }
  const movesA = COMPANION_MOVES[a.species.id] ?? [];
  const movesB = COMPANION_MOVES[b.species.id] ?? [];
  const byId = new Map<string, CompanionMove>();
  for (const m of [...movesA, ...movesB]) if (!byId.has(m.id)) byId.set(m.id, m);
  return {
    stats,
    moves: [...byId.values()],
    dominantSpecies: a.xp >= b.xp ? a.species.id : b.species.id,
  };
}

// ── Evolution branch (data-driven, history + PRQ-biased) ──────────────────
export function evolutionBranch(c: Companion): string {
  // train-dominant attribute picks the branch flavor at final stage
  const top = (Object.entries(c.stats) as [CompanionAttr, number][]).sort((x, y) => y[1] - x[1])[0][0];
  const combat = ['strength', 'power'].includes(top);
  const swift = ['speed', 'agility'].includes(top);
  return `${c.stageLabel} — ${combat ? 'War' : swift ? 'Swift' : 'Sage'} line`;   // [TUNE] names
}

// ── Colosseum battle (reuses FightCore resolution) ─────────────────────────
export interface ColosseumFighter { companion: Companion; state: FighterState; stamina: number }

export function makeFighter(c: Companion): ColosseumFighter {
  const hp = 60 + Math.round(c.stats.endurance * 0.8);      // stats matter
  return { companion: c, state: new FighterState(hp), stamina: 100 };
}

/** One companion swing through the SHARED FightCore resolution. */
export function companionStrike(attacker: ColosseumFighter, defender: ColosseumFighter, move: CompanionMove, dist: number, nowMs: number): string {
  if (attacker.stamina < move.staminaCost) return 'EXHAUSTED';
  attacker.stamina -= move.staminaCost;
  const outcome = resolveStrike(move.atk, dist, defender.state, nowMs);
  if (outcome === 'hit') {
    const dealt = move.atk.dmg + Math.round(attacker.companion.stats.power * 0.15);
    defender.state.hp = Math.max(0, defender.state.hp - dealt);
    defender.state.stunSec = Math.max(defender.state.stunSec, move.atk.stunSec);
    return `${move.label} HIT for ${dealt}`;
  }
  return `${move.label} — ${outcome.toUpperCase()}`;
}
