/**
 * lib/wallet/reason-labels.ts — human-readable labels for ledger reason codes.
 * Pure + shared by the ledger-history UI and tests. No side effects.
 */

export interface ReasonLabel {
  label: string;
  kind: 'earn' | 'spend' | 'purchase' | 'refund' | 'admin';
}

export const REASON_LABELS: Record<string, ReasonLabel> = {
  DUNK_ATTEMPT_SCORED: { label: 'Dunk scored', kind: 'earn' },
  DUNK_ROUTINE_COMPLETED: { label: 'Dunk routine completed', kind: 'earn' },
  DAILY_FIRST_SESSION: { label: 'Daily first session', kind: 'earn' },
  DUNK_CONTEST_PLACED: { label: 'Dunk contest placement', kind: 'earn' },
  DUNK_STREAK_MILESTONE: { label: 'Dunk streak milestone', kind: 'earn' },
  DUNK_FIRST_CLEAR: { label: 'First dunk clear', kind: 'earn' },
  MODE_SESSION_COMPLETED: { label: 'Session completed', kind: 'earn' },
  MODE_SESSION_WON: { label: 'Session won', kind: 'earn' },
  SCENEIT_FREEUSE_IDENTIFIED: { label: 'Scene It — Free-Use Legend', kind: 'earn' },
  MP_MATCH_WON: { label: 'Multiplayer match won', kind: 'earn' },
  MP_MATCH_PLAYED: { label: 'Multiplayer match played', kind: 'earn' },
  REFERRAL_BONUS: { label: 'Referral bonus', kind: 'earn' },
  CREATIVE_CARD_PUBLISH: { label: 'Creative card published', kind: 'earn' },
  CREATIVE_CARD_REMIX_ROYALTY: { label: 'Remix royalty', kind: 'earn' },
  PURCHASE_COIN_PACK: { label: 'Coin pack purchase', kind: 'purchase' },
  PURCHASE_SHARD_PACK: { label: 'Shard pack purchase', kind: 'purchase' },
  SPEND_CATALOG_ITEM: { label: 'Store purchase', kind: 'spend' },
  ADMIN_ADJUST: { label: 'Admin adjustment', kind: 'admin' },
  PURCHASE_REFUND: { label: 'Refund', kind: 'refund' },
};

export function reasonLabel(code: string): ReasonLabel {
  return REASON_LABELS[code] ?? { label: code.replace(/_/g, ' ').toLowerCase(), kind: 'earn' };
}
