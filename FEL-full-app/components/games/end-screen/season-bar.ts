// The season bar's fill, tier by tier — the card's LEVEL UP moment.
//
// FEL has no account level (PlayerProfile.xp is a running total with no curve: grep levelFor / xpToLevel finds nothing),
// so the bar that "levels up" is the one progression track that has levels: the season pass. Its tiers are the server's
// (lib/season/season-pass-core.ts, TIER_XP(t) = 450 + 68t), and the session answer carries the state AFTER the run:
// { gained, tier, into, need, tierUps }. The bar has to start where the run started, so the state BEFORE is rebuilt from
// those numbers with the same TIER_XP the server tiered with:
//
//   tierBefore = tier − tierUps.length
//   intoBefore = into − gained + Σ TIER_XP(t) for t in [tierBefore, tier)
//
// and the fill plays as one segment per tier crossed: from intoBefore to full, a TIER UP, then from 0 to full again for
// any whole tier jumped, then 0 → into on the tier the run ended in. When the numbers do not add up (a season that changed
// shape, a capped track) the bar does not invent a history: it shows one honest segment, from (into − gained) clamped at 0
// to into, and no crossing.

import { TIER_XP } from '@/lib/season/season-pass-core';
import type { SeasonRecap } from './types';

export interface BarSegment {
  /** The tier this segment fills (0-indexed, as the server counts: the bar reads T{tier} → T{tier+1}). */
  tier: number;
  from: number;
  to: number;
  need: number;
  /** This segment ends in a tier-up: the bar fills, flashes TIER UP, and the next segment starts at 0. */
  crossed: boolean;
}

export interface SeasonFill {
  segments: BarSegment[];
  tierBefore: number;
  intoBefore: number;
  /** Tier-ups this run (the server's own list, never recounted). */
  tierUps: number;
  /** The rebuild was consistent; false = the single honest segment above. */
  exact: boolean;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function seasonFill(s: Pick<SeasonRecap, 'gained' | 'tier' | 'into' | 'need' | 'tierUps'>): SeasonFill {
  const ups = Array.isArray(s.tierUps) ? s.tierUps.length : 0;
  const tier = finite(s.tier) ? s.tier : 0;
  const into = finite(s.into) ? Math.max(0, s.into) : 0;
  const need = finite(s.need) && s.need > 0 ? s.need : Math.max(1, into);
  const gained = finite(s.gained) ? Math.max(0, s.gained) : 0;

  const tierBefore = tier - ups;
  let crossedXp = 0;
  for (let t = tierBefore; t < tier; t++) crossedXp += TIER_XP(t);
  const intoBefore = into - gained + crossedXp;

  const exact = tierBefore >= 0 && intoBefore >= 0 && (ups === 0 ? intoBefore <= into : intoBefore < TIER_XP(tierBefore));
  if (!exact) {
    return { segments: [{ tier, from: Math.max(0, into - gained), to: into, need, crossed: false }], tierBefore: tier, intoBefore: Math.max(0, into - gained), tierUps: ups, exact: false };
  }

  const segments: BarSegment[] = [];
  for (let t = tierBefore; t < tier; t++) {
    segments.push({ tier: t, from: t === tierBefore ? intoBefore : 0, to: TIER_XP(t), need: TIER_XP(t), crossed: true });
  }
  segments.push({ tier, from: ups > 0 ? 0 : intoBefore, to: into, need, crossed: false });
  return { segments, tierBefore, intoBefore, tierUps: ups, exact: true };
}

/** 0..100, for a width. */
export function pct(v: number, need: number): number {
  if (!(need > 0)) return 0;
  return Math.max(0, Math.min(100, (v / need) * 100));
}

/** What a tier-up paid, in words — from the rewards the server booked (never a guess at what a tier holds). */
export function tierRewardWords(up: SeasonRecap['tierUps'][number]): string[] {
  const out: string[] = [];
  const lanes = [...(up.rewards?.free ?? []), ...(up.rewards?.pro ?? [])];
  for (const r of lanes) {
    if (r.kind === 'lc' && finite(r.amt) && r.amt > 0) out.push(`+${r.amt} LC`);
    else if (r.kind === 'cosmetic') out.push(r.name ? r.name : `${r.rarity ? `${r.rarity[0].toUpperCase()}${r.rarity.slice(1)} ` : ''}cosmetic`);
  }
  return out;
}
