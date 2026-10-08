/**
 * Partner magic (the owner's "C", 2026-10-06): "the partner's element is yours, and it grows when you fuse".
 *
 *   - A partner spell has no element of its own; at cast time it takes the partner's: the fusion's element while
 *     fused, else the caster's element (A3 sets a player's `stats.element` to the partner's), else the partner
 *     actor's own. No partner and no element: the spell is refused (nothing is spent).
 *   - Its power grows with the fusion tier (A3's, from bond), and again while the fusion is active.
 *
 * Pure. [TUNE] numbers.
 */

import type { AdventureActor, AdventureWorld, Element, FusionState } from '../contracts';

/** Power by fusion tier 0..3. Tier 0 (never fused) is the bond's base. [TUNE] */
export const PARTNER_TIER_MULT: readonly [number, number, number, number] = [1, 1.2, 1.4, 1.6];
/** On top, while fused. [TUNE] */
export const FUSED_MULT = 1.25;

export function partnerSpellMult(fusion: Pick<FusionState, 'tier' | 'active'>): number {
  const t = Math.max(0, Math.min(3, Math.floor(fusion.tier))) as 0 | 1 | 2 | 3;
  return PARTNER_TIER_MULT[t] * (fusion.active ? FUSED_MULT : 1);
}

/** The element a partner spell takes for this caster right now, or null. */
export function partnerElementOf(caster: AdventureActor, world: Pick<AdventureWorld, 'actors'>): Element | null {
  if (caster.fusion.active && caster.fusion.element) return caster.fusion.element;
  if (caster.stats.element) return caster.stats.element;
  const p = caster.partnerId ? world.actors.get(caster.partnerId) : undefined;
  return p?.stats.element ?? caster.fusion.element ?? null;
}
