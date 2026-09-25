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
  // lab credits, folded into the wallet 2026-09-04
  WELCOME_GRANT: { label: 'Welcome grant', kind: 'earn' },
  LC_MIGRATION: { label: 'Balance carried into the wallet', kind: 'earn' },
  ARENA_ENTRY: { label: 'Arena entry', kind: 'spend' },
  ARENA_WINNINGS: { label: 'Arena winnings', kind: 'earn' },
  ARENA_REFUND: { label: 'Arena refund', kind: 'earn' },
  SHOP_PURCHASE: { label: 'Shop purchase', kind: 'spend' },
  LESSON_COMPLETE: { label: 'Lesson complete', kind: 'earn' },
  LADDER_PRIZE: { label: 'Ladder prize', kind: 'earn' },
  SESSION_CREDITS: { label: 'Session credits', kind: 'earn' },
  HOUSE_TREASURY: { label: 'House treasury', kind: 'earn' },
  DUNK_CONTEST_PLACED: { label: 'Dunk contest placement', kind: 'earn' },
  DUNK_STREAK_MILESTONE: { label: 'Dunk streak milestone', kind: 'earn' },
  DUNK_FIRST_CLEAR: { label: 'First dunk clear', kind: 'earn' },
  MODE_SESSION_COMPLETED: { label: 'Session completed', kind: 'earn' },
  MODE_SESSION_WON: { label: 'Session won', kind: 'earn' },
  SCENEIT_FREEUSE_IDENTIFIED: { label: 'Scene It — Free-Use Legend', kind: 'earn' },
  MP_MATCH_WON: { label: 'Multiplayer match won', kind: 'earn' },
  MP_MATCH_PLAYED: { label: 'Multiplayer match played', kind: 'earn' },
  REFERRAL_BONUS: { label: 'Referral bonus', kind: 'earn' },
  // HOTFIX (2026-09-24): the Playbook's chapter shards (5d8e23c, 2026-09-20) shipped without a label, so the ledger read
  // "edu chapter complete" and wallet-tests has been red in CI ever since.
  EDU_CHAPTER_COMPLETE: { label: 'Playbook chapter complete', kind: 'earn' },
  MOVEMENT_SCREEN_COMPLETED: { label: 'Movement screen', kind: 'earn' },
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
