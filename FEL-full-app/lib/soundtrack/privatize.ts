// lib/soundtrack/privatize.ts — CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06: "old minor/unknown-age acting voice clips
// = make private (no deletion)"). The plan for scripts/soundtrack/privatize-minor-cards.ts, pure so it is tested here.
//
// The READ gate (lib/creator/creative-card-review.ts publicCardWhere / canViewCard) already hides these cards from
// everyone but their owner and the review staff, whatever the stored row says. This flips the stored row too, so the data
// agrees with what is served: isPublic → false and stats.privatizedAt is stamped. Nothing is deleted: the owner still
// has the card, and the uploaded file is untouched.

import { isPublicCreator } from '@/lib/creator/creative-card-review';

export interface PrivatizeRow {
  id: string; ownerId: string; primary: string; isPublic: boolean; stats: unknown;
  owner: { dobYear: number | null } | null;
}

export interface PrivatizePlan { flip: { id: string; ownerId: string }[]; skippedAdult: number; alreadyPrivate: number }

/** Which rows to make private: public cards (of `disciplines`) whose owner is not a verified adult. */
export function planPrivatize(rows: PrivatizeRow[], disciplines: readonly string[], now: Date = new Date()): PrivatizePlan {
  const plan: PrivatizePlan = { flip: [], skippedAdult: 0, alreadyPrivate: 0 };
  for (const r of rows) {
    if (!disciplines.includes(r.primary)) continue;
    if (isPublicCreator(r.owner?.dobYear, now)) { plan.skippedAdult++; continue; }
    if (!r.isPublic) { plan.alreadyPrivate++; continue; }
    plan.flip.push({ id: r.id, ownerId: r.ownerId });
  }
  return plan;
}

/** The stats a flipped row gets: everything it had, plus when it was made private. */
export function privatizedStats(stats: unknown, now: Date = new Date()): Record<string, unknown> {
  return { ...((stats as Record<string, unknown>) ?? {}), privatizedAt: now.toISOString() };
}
