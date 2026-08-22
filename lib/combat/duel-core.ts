/**
 * FEL — 1v1 Duel Core (Soul-Calibur-style weapon duel resolution)
 * ───────────────────────────────────────────────────────────────
 * PURE module: NO `three`, NO React, NO DOM. Imports nothing runtime.
 * This is the single source of truth for how a melee attack resolves against a
 * defender in the 1v1 fighter. Both the live scene (karate-versus-3d) and the
 * headless combat test-suite import THIS module — the scene is a thin skin over
 * these numbers so the tests exercise the real gameplay math.
 *
 * DESIGN — EQUAL FOOTING (no pay-to-win):
 *   The three attack classes below are the SAME for every character. A player's
 *   chosen weapon skin is purely COSMETIC (see ./weapons). Nothing here reads a
 *   character id or an entitlement — damage/reach/speed come only from the
 *   attack class, so two players with different weapons fight on identical math.
 *
 * SOUL-CALIBUR HEURISTICS captured here:
 *   • Horizontal attacks TRACK lateral movement — they catch a side-stepping foe
 *     but are middling damage.
 *   • Vertical attacks are the big hitters but travel in a straight line, so a
 *     lateral side-step SLIPS them entirely (whiff→sidestepped).
 *   • Kicks are fast, short, low-commit pokes that also track laterally.
 *   • Guarding chips damage to near-zero but fills a GUARD METER; enough chip
 *     and the guard BREAKS, letting the next hit land full.
 *   • A perfectly-timed guard (perfect parry) negates the hit entirely.
 */

// ── Attack taxonomy ────────────────────────────────────────────────────────
export type AttackClass = 'horizontal' | 'vertical' | 'kick';

/** Defender guard posture at the instant of resolution. */
export type GuardState = 'none' | 'guarding' | 'perfect';

/**
 * How the DEFENDER is moving relative to their own facing at impact.
 *  - still:       not moving
 *  - lateral:     side-stepping (perpendicular to facing) — dodges verticals
 *  - advancing:   walking toward the attacker
 *  - retreating:  walking away from the attacker (can walk out of range)
 */
export type DefenderMotion = 'still' | 'lateral' | 'advancing' | 'retreating';

export type AttackOutcome =
  | 'whiff'          // out of range — nothing connects
  | 'sidestepped'    // linear (vertical) attack slipped by a lateral step
  | 'blocked'        // guarded — chip damage only, guard meter rises
  | 'perfectBlocked' // perfect parry — zero damage
  | 'guardBreak'     // guard meter overflowed — full damage lands through guard
  | 'hit';           // clean hit — full damage

export interface AttackProfile {
  /** Clean-hit damage. */
  damage: number;
  /** Fraction of `damage` that leaks through a normal guard as chip. */
  guardChipFactor: number;
  /** How much this attack loads the defender's guard meter when blocked. */
  guardDamage: number;
  /** Hit-stun applied to the defender on a clean hit (ms). */
  hitStunMs: number;
  /** Startup before the active window (ms) — bigger = slower, more punishable. */
  startupMs: number;
  /** Recovery after the active window (ms). */
  recoveryMs: number;
  /** Max horizontal distance (world units) at which this attack can connect. */
  reach: number;
  /** When true, the attack curves to catch a laterally side-stepping foe. */
  tracksLateral: boolean;
}

/**
 * The attack table. IDENTICAL for all characters — this is the anti-pay-to-win
 * guarantee. Every number is a feel value reserved for tuning.
 */
export const ATTACK_TABLE: Record<AttackClass, AttackProfile> = {
  // Fast, tracks, middling damage — the bread-and-butter poke that punishes steps.
  horizontal: {
    damage: 12,          // TUNE(elijah)
    guardChipFactor: 0.12, // TUNE(elijah)
    guardDamage: 14,     // TUNE(elijah)
    hitStunMs: 300,      // TUNE(elijah)
    startupMs: 140,      // TUNE(elijah)
    recoveryMs: 240,     // TUNE(elijah)
    reach: 2.3,          // TUNE(elijah)
    tracksLateral: true,
  },
  // Big damage, but LINEAR — a lateral side-step slips it. Slow & committal.
  vertical: {
    damage: 18,          // TUNE(elijah)
    guardChipFactor: 0.14, // TUNE(elijah)
    guardDamage: 22,     // TUNE(elijah)
    hitStunMs: 420,      // TUNE(elijah)
    startupMs: 240,      // TUNE(elijah)
    recoveryMs: 380,     // TUNE(elijah)
    reach: 2.6,          // TUNE(elijah)
    tracksLateral: false,
  },
  // Fast, short, low commit — tracks laterally, chips guard the least.
  kick: {
    damage: 8,           // TUNE(elijah)
    guardChipFactor: 0.10, // TUNE(elijah)
    guardDamage: 10,     // TUNE(elijah)
    hitStunMs: 240,      // TUNE(elijah)
    startupMs: 110,      // TUNE(elijah)
    recoveryMs: 200,     // TUNE(elijah)
    reach: 2.1,          // TUNE(elijah)
    tracksLateral: true,
  },
};

/** Guard meter at/above which the guard SHATTERS and the hit lands full. */
export const GUARD_BREAK_THRESHOLD = 40; // TUNE(elijah)

export interface AttackContext {
  attack: AttackClass;
  /** Defender's guard posture. */
  guard: GuardState;
  /** How the defender is moving at impact. */
  defenderMotion: DefenderMotion;
  /** Current horizontal separation (world units) between attacker and defender. */
  spacing: number;
  /** Defender's guard meter BEFORE this attack (0..∞, breaks at threshold). */
  guardMeter: number;
}

export interface AttackResult {
  outcome: AttackOutcome;
  /** Damage the defender actually takes. */
  damage: number;
  /** Hit-stun the defender suffers (ms) — 0 unless a hit/guardBreak lands. */
  hitStunMs: number;
  /** Guard meter AFTER this attack (reset to 0 on a break). */
  guardMeter: number;
  /** True when this attack shattered the guard. */
  guardBroke: boolean;
}

/**
 * Resolve a single attack against a defender. Deterministic & pure — the same
 * context always yields the same result (no RNG here; the scene adds flavor).
 *
 * Resolution order (first match wins):
 *   1. Out of range           → whiff
 *   2. Perfect parry          → perfectBlocked (0 dmg)
 *   3. Linear attack vs a lateral side-step (attack does NOT track) → sidestepped
 *   4. Guarding:
 *        a. meter would break  → guardBreak (full dmg, meter resets)
 *        b. otherwise          → blocked (chip dmg, meter rises)
 *   5. Otherwise              → hit (full dmg)
 */
export function resolveAttack(ctx: AttackContext): AttackResult {
  const p = ATTACK_TABLE[ctx.attack];
  const meter = Math.max(0, ctx.guardMeter);

  // 1. Range gate.
  if (ctx.spacing > p.reach) {
    return { outcome: 'whiff', damage: 0, hitStunMs: 0, guardMeter: meter, guardBroke: false };
  }

  // 2. Perfect parry negates everything.
  if (ctx.guard === 'perfect') {
    return { outcome: 'perfectBlocked', damage: 0, hitStunMs: 0, guardMeter: 0, guardBroke: false };
  }

  // 3. A linear (non-tracking) attack is slipped by a lateral side-step —
  //    ONLY when the defender is not guarding (a guarding foe plants and blocks).
  if (ctx.guard === 'none' && ctx.defenderMotion === 'lateral' && !p.tracksLateral) {
    return { outcome: 'sidestepped', damage: 0, hitStunMs: 0, guardMeter: meter, guardBroke: false };
  }

  // 4. Guarding.
  if (ctx.guard === 'guarding') {
    const nextMeter = meter + p.guardDamage;
    if (nextMeter >= GUARD_BREAK_THRESHOLD) {
      // Guard shatters — the hit lands full and the meter resets.
      return { outcome: 'guardBreak', damage: p.damage, hitStunMs: p.hitStunMs, guardMeter: 0, guardBroke: true };
    }
    const chip = Math.round(p.damage * p.guardChipFactor);
    return { outcome: 'blocked', damage: chip, hitStunMs: 0, guardMeter: nextMeter, guardBroke: false };
  }

  // 5. Clean hit.
  return { outcome: 'hit', damage: p.damage, hitStunMs: p.hitStunMs, guardMeter: meter, guardBroke: false };
}

// ── 8-directional movement helpers (movement-system / future-PvP layer) ─────
// The 1v1 scene currently drives a 1-D AI, so the sidestep path above is
// exercised by the core + tests rather than by the in-scene bot. These helpers
// are the shared 8-way basis every duel mover uses.

export type Dir8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const SQRT1_2 = Math.SQRT1_2; // 1/√2 ≈ 0.7071

/** Unit vectors on the ground plane (x = right/east, z = forward/north). */
export const DIR8_VECTORS: Record<Dir8, { x: number; z: number }> = {
  N: { x: 0, z: 1 },
  NE: { x: SQRT1_2, z: SQRT1_2 },
  E: { x: 1, z: 0 },
  SE: { x: SQRT1_2, z: -SQRT1_2 },
  S: { x: 0, z: -1 },
  SW: { x: -SQRT1_2, z: -SQRT1_2 },
  W: { x: -1, z: 0 },
  NW: { x: -SQRT1_2, z: SQRT1_2 },
};

export const DIR8_ORDER: Dir8[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

/** Snap an analog stick / move vector to the nearest of 8 compass directions. */
export function vectorToDir8(x: number, z: number): Dir8 | null {
  if (Math.abs(x) < 1e-4 && Math.abs(z) < 1e-4) return null;
  const ang = Math.atan2(z, x); // radians, E = 0
  const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return DIR8_ORDER[idx];
}

/**
 * Classify how a defender is moving relative to their own facing.
 * facing is the unit vector the defender is looking along. A movement mostly
 * ALONG facing = advancing; mostly AGAINST = retreating; mostly PERPENDICULAR
 * = lateral (side-step); negligible = still.
 */
export function classifyMotion(
  moveX: number,
  moveZ: number,
  facingX: number,
  facingZ: number,
): DefenderMotion {
  const speed = Math.hypot(moveX, moveZ);
  if (speed < 0.05) return 'still'; // TUNE(elijah) — dead-zone
  const fLen = Math.hypot(facingX, facingZ) || 1;
  const fx = facingX / fLen;
  const fz = facingZ / fLen;
  const dot = (moveX * fx + moveZ * fz) / speed; // cosine of angle to facing
  if (dot > 0.5) return 'advancing';
  if (dot < -0.5) return 'retreating';
  return 'lateral';
}
