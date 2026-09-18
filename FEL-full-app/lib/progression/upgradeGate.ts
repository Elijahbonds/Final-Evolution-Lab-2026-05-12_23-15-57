// FEL PRO — the attribute-upgrade gate (2026-09-12).
//
// THE PRODUCT RULE, stated once so the code can be checked against it:
//   · Playing is free, forever.
//   · Scanning the PRQ is free. The attributes that scan earns are the player's BASE, and they
//     keep them whether or not they ever pay.
//   · Upgrades accumulated over time — the points training and sessions add ON TOP of the base —
//     are ACTIVE only while a FEL Pro subscription is active.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it never deletes, zeroes or rewrites a stored attribute.
// A lapsed subscription pauses the upgrades; it does not burn them. Everything the player earned
// is still on their profile, and the day they resubscribe it applies again. Destroying earned
// progress because a card expired would be a different product, and a worse one.
//
// It also never GRANTS points. If decay has taken a player below their scan base, the gate hands
// back the lower real number rather than topping them up to base — being unsubscribed must never
// be an advantage, and a gate that can add is a gate that can be farmed.

import type { AttributeVector } from '../prq-engine';

/** Weekly price, in whole USD. Single source of truth for copy and checkout alike. */
export const FEL_PRO_WEEKLY_USD = 6;

/** The Subscription.product value that unlocks upgrades. */
export const FEL_PRO_PRODUCT = 'FEL_PRO';

export interface AttributeGateInput {
  /** What the PRQ scan alone earns. Always the player's, subscription or not. */
  base: AttributeVector;
  /** The stored profile, including every upgrade accumulated over time. Never mutated here. */
  earned: AttributeVector;
  /** An ACTIVE FEL Pro subscription. */
  hasPro: boolean;
}

export interface GatedAttribute {
  base: number;
  earned: number;
  effective: number;
  /** Points held back because the subscription is not active. Always >= 0. */
  paused: number;
}

export interface AttributeGateResult {
  /** What the game should actually use this session. */
  effective: AttributeVector;
  upgradesActive: boolean;
  /** Total points currently withheld across all attributes — the honest number to show a player. */
  pausedPoints: number;
  /** Per attribute, so a UI can show exactly what is paused rather than a vague pitch. */
  detail: Record<string, GatedAttribute>;
}

/**
 * Resolve the attributes a session should run with.
 *
 * Subscribed: the earned profile, upgrades and all.
 * Not subscribed: the lower of earned and base — the base they scanned for, never more, never
 * less than they actually are.
 */
export function gateAttributes(input: AttributeGateInput): AttributeGateResult {
  const keys = new Set([...Object.keys(input.base), ...Object.keys(input.earned)]);
  const effective: AttributeVector = {};
  const detail: Record<string, GatedAttribute> = {};
  let pausedPoints = 0;

  for (const k of keys) {
    const base = num(input.base[k]);
    const earned = num(input.earned[k]);
    const eff = input.hasPro ? earned : Math.min(earned, base);
    const paused = Math.max(0, earned - eff);
    effective[k] = eff;
    detail[k] = { base, earned, effective: eff, paused };
    pausedPoints += paused;
  }

  return {
    effective,
    upgradesActive: input.hasPro,
    pausedPoints: round2(pausedPoints),
    detail,
  };
}

/** True when any upgrade is being withheld — i.e. there is something to win back by subscribing. */
export function hasPausedUpgrades(result: AttributeGateResult): boolean {
  return !result.upgradesActive && result.pausedPoints > 0;
}

/**
 * Honest one-line status for the UI. Says what is true rather than what converts:
 * a player with nothing paused is not told they are missing out.
 */
export function upgradeStatusLine(result: AttributeGateResult): string {
  if (result.upgradesActive) return 'FEL Pro active — your upgrades are applied.';
  if (result.pausedPoints <= 0) return `Playing on your scanned base. FEL Pro ($${FEL_PRO_WEEKLY_USD}/week) keeps future upgrades active.`;
  return `${result.pausedPoints} upgrade point${result.pausedPoints === 1 ? '' : 's'} paused — still saved, and they reapply if you subscribe ($${FEL_PRO_WEEKLY_USD}/week).`;
}

/** Does this subscription list grant Pro? Mirrors /api/account/subscription's own test. */
export function hasActivePro(
  subs: ReadonlyArray<{ product?: string | null; status?: string | null }> | null | undefined,
): boolean {
  if (!subs) return false;
  return subs.some((s) => s.product === FEL_PRO_PRODUCT && s.status === 'ACTIVE');
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;
