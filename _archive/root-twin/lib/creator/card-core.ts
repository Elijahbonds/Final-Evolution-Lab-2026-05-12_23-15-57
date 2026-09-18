/**
 * lib/creator/card-core.ts — PURE creator-card logic (no I/O, no server-only).
 *
 * Shared by the card service, the render component, and the test runner. Keep it
 * pure: only string/number/regex work so scripts/wallet-tests.ts can import it
 * without a database or the `server-only` guard.
 */

export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const CARD_RARITIES: CardRarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Visual identity per rarity. Colors chosen to read on the #050505 canvas. */
export const RARITY_META: Record<CardRarity, { label: string; ring: string; glow: string; order: number }> = {
  common:    { label: 'Common',    ring: '#8A94A6', glow: 'rgba(138,148,166,0.35)', order: 0 },
  rare:      { label: 'Rare',      ring: '#00E5FF', glow: 'rgba(0,229,255,0.45)',   order: 1 },
  epic:      { label: 'Epic',      ring: '#A855F7', glow: 'rgba(168,85,247,0.5)',   order: 2 },
  legendary: { label: 'Legendary', ring: '#FFD700', glow: 'rgba(255,215,0,0.55)',   order: 3 },
};

export function rarityLabel(r: string): string {
  return (RARITY_META as Record<string, { label: string }>)[r]?.label ?? 'Common';
}

export function isValidRarity(r: string): r is CardRarity {
  return (CARD_RARITIES as string[]).includes(r);
}

/**
 * Derive a card's rarity from measured achievement. This is the ONE source of
 * truth for rarity so a card can never claim a tier it did not earn.
 *   • PRQ is the strongest signal (skill across attributes).
 *   • wins and topScore provide secondary lift.
 * TUNE(elijah): thresholds are first-pass and meant to be adjusted with data.
 */
export function deriveRarity(opts: { prq: number; wins: number; topScore: number }): CardRarity {
  const prq = Number.isFinite(opts.prq) ? opts.prq : 0;
  const wins = Number.isFinite(opts.wins) ? opts.wins : 0;
  const topScore = Number.isFinite(opts.topScore) ? opts.topScore : 0;
  // Composite score: PRQ dominates, wins & topScore nudge. // TUNE(elijah)
  const composite = prq + wins * 2 + Math.min(topScore, 500) / 50;
  if (composite >= 90 || prq >= 85) return 'legendary';
  if (composite >= 60 || prq >= 60) return 'epic';
  if (composite >= 30 || prq >= 35) return 'rare';
  return 'common';
}

// --- slug + accent validation --------------------------------------------

const SLUG_MAX = 32;

/** Slugify a display name into a URL-safe handle (lowercase, dash-joined). */
export function slugify(input: string): string {
  const base = (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
  return base;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug);
}

/**
 * Build a candidate slug, appending a short suffix for uniqueness when needed.
 * Pure: the caller supplies the suffix (e.g. a counter or random token).
 */
export function slugCandidate(displayName: string, suffix?: string): string {
  let base = slugify(displayName) || 'athlete';
  if (base.length < 2) base = `${base}x`;
  if (!suffix) return base.slice(0, SLUG_MAX);
  const trimmed = base.slice(0, Math.max(2, SLUG_MAX - suffix.length - 1));
  return `${trimmed}-${suffix}`.slice(0, SLUG_MAX);
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function isValidAccent(hex: string): boolean {
  return HEX.test(hex);
}
/** Fall back to the FEL cyan when an accent is missing or malformed. */
export function safeAccent(hex: string | null | undefined): string {
  return hex && HEX.test(hex) ? hex : '#00E5FF';
}

/** Clamp free-text card fields to sane lengths (defensive, pure). */
export function clampCardText(v: string | null | undefined, max: number): string {
  return (v ?? '').toString().trim().slice(0, max);
}
