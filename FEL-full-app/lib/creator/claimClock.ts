// HOW OLD A CLAIM IS ALLOWED TO GET (2026-09-13).
//
// Pulled out into its own leaf because two surfaces need the same answer and they sit on opposite sides of
// the dependency graph: `card-stats.ts` is a pure display leaf, `cardProgression.ts` reads the whole profile
// layer. A second copy of these thresholds is a card that says "verified" on one screen and "measured 8
// months ago" on the next.
//
// The thresholds themselves are a judgement, so they are stated once, here, with the reasoning:
//
//   · FRESH (under a month) — a reading you would still act on. It wears the shield.
//   · STALE (under six months) — shown, with its age, not vouched for. Somebody who trained hard for four
//     months has genuinely changed, and so has somebody who stopped.
//   · EXPIRED (six months or more) — the number is withheld and only its age is published. Past this point
//     the honest sentence is when it was taken, not what it said.
//
// Pure: no imports at all.

/** A reading you would still act on. */
export const FRESH_DAYS = 30;
/** Past this, the number itself is withheld and only its age is published. */
export const EXPIRES_DAYS = 180;

export type Freshness = 'fresh' | 'stale' | 'expired';

export function freshnessOf(ageDays: number): Freshness {
  if (ageDays < FRESH_DAYS) return 'fresh';
  if (ageDays < EXPIRES_DAYS) return 'stale';
  return 'expired';
}

/** Whole days between a timestamp and now, or null when the timestamp is unreadable. */
export function ageDaysOf(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** How long ago, in the words a card uses. */
export function ageLabel(ageDays: number): string {
  if (ageDays <= 0) return 'today';
  if (ageDays === 1) return 'yesterday';
  if (ageDays < 30) return `${ageDays} days ago`;
  const months = Math.round(ageDays / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(ageDays / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** The line printed under a measured block. Always says something, including when the number is gone. */
export function freshnessNote(ageDays: number): string {
  const when = ageLabel(ageDays);
  switch (freshnessOf(ageDays)) {
    case 'fresh': return `Measured ${when}.`;
    case 'stale': return `Measured ${when} — not a current reading.`;
    default: return `Last measured ${when}. Nothing current to show.`;
  }
}
