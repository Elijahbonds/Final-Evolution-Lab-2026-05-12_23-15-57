// boosts — the creator card as a thing you buy, ported from the iOS build Abacus wrote.
//
// The Swift model (FinalEvolutionLab/Models/CreatorCard.swift) is the reference: a creator, a shards price, an
// accent, an icon, a metrics boost, and links out to the creator's own work. Six first-party cards, no user
// authoring — the platform spec's v1 scope, deliberately.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: A BOUGHT NUMBER NEVER REACHES A MEASUREMENT.
//
// PRQ is not decoration here. It is read by the combat vitals, by karate endless, by the story — all games, where a
// power-up is exactly right — AND by lib/kitchens/buildSnapshot, which is how an athlete's MEAL PRESCRIPTION is
// built, and by profile/scanToSnapshot, which is what the movement screen reads.
//
// So a card that adds +15 PRQ must change how fast you move in a fight and must NOT change what you are told to
// eat. Nutrition advice driven by a number somebody purchased is not advice. The split is in the types: `base` is
// measured and `boosted` is earned-plus-bought, and the functions that feed measurement only ever take `base`.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

// CARD-SAFE-2 (FE PM Oct 12; CREATOR-CARD-UPGRADE-SPEC fix #2): NO PAY-TO-WIN. Shards can be bought with real money
// (lib/shard-packs.ts), so a card bought with shards must not change any rating, PRQ, vertical or fight stat. The
// six cards keep their names, art, taglines and links (Elijah 10:42 PM PT Oct 12: named people consent) and are
// cosmetic only: a frame and links to the creator's own work. Nobody bought one, so there is no refund path.

/** Every key that would make a card change a number. A card (or gear item) carrying any of them is rejected. */
export const STAT_MODIFIER_KEYS = [
  'boost', 'boosts', 'stats', 'stat', 'modifier', 'modifiers', 'statModifier', 'statModifiers',
  'prq', 'vertical', 'efficiency', 'neural', 'readiness', 'power', 'speed', 'damage', 'attack', 'defense', 'health',
] as const;

/** The stat-bearing keys present on a card/gear payload (empty for a cosmetic one). */
export function statModifierKeys(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload as Record<string, unknown>).filter((k) => (STAT_MODIFIER_KEYS as readonly string[]).includes(k));
}

/** Throws if a card carries any stat modifier. Run over the catalogue at load, so a stat-bearing card cannot ship. */
export function assertCosmeticCard(card: unknown): void {
  const bad = statModifierKeys(card);
  if (bad.length) throw new Error(`stat_modifier_rejected: ${bad.join(',')}`);
}

export interface CreatorLink { type: 'masterclass' | 'website' | 'youtube' | 'instagram' | 'spotify' | 'gallery' | 'imdb'; label: string; url: string }

export interface BoostCard {
  id: string;
  creator: string;
  title: string;
  blurb: string;
  costShards: number;
  accent: string;
  /** The creator's own words, shown on the card's face. */
  tagline: string;
  links: CreatorLink[];
}

/** The first-party catalogue: names, prices, art and links carried across from the iOS cards. Cosmetic only. */
export const BOOST_CARDS: BoostCard[] = [
  {
    id: 'bonds-bounce', creator: 'Elijah Bonds', title: 'Bonds Bounce Blueprint',
    blurb: 'The vertical jump architecture.', costShards: 750, accent: '#F27D26',
    tagline: 'Invented the kick-up on a trampoline. Landed it on a ten-foot rim.',
    links: [{ type: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/elijahbonds/' }],
  },
  {
    id: 'amir-signature', creator: 'Amir Smith', title: 'Amir Smith Signature',
    blurb: 'Signature handle and finish package.', costShards: 800, accent: '#00E5FF',
    tagline: 'The handle is the whole move. The finish is just the receipt.',
    links: [],
  },
  {
    id: 'flight-lab-pro', creator: 'Flight Lab', title: 'Flight Lab Pro Card',
    blurb: 'Contest-grade hang and body control.', costShards: 600, accent: '#A855F7',
    tagline: 'Everything above the rim is practice for everything below it.',
    links: [],
  },
  {
    id: 'coach-v-elite', creator: 'Coach V', title: 'Coach V Elite Card',
    blurb: "Coach V's elite movement data.", costShards: 500, accent: '#FFD700',
    tagline: 'Assess, correct, load, perform. In that order, every time.',
    links: [],
  },
  {
    id: 'neural-max', creator: 'Neural Max', title: 'Neural Max Override',
    blurb: 'Reaction and drive, tuned up.', costShards: 400, accent: '#00FF9D',
    tagline: 'The gap between seeing it and doing it is the only gap that matters.',
    links: [],
  },
  {
    id: 'directors-cut', creator: 'Director Stella', title: "Director's Cut Monologue",
    blurb: 'Performance package for the Read.', costShards: 550, accent: '#FF3366',
    tagline: 'Play the beat, not the line.',
    links: [{ type: 'imdb', label: 'IMDb', url: 'https://www.imdb.com/' }],
  },
];

for (const c of BOOST_CARDS) assertCosmeticCard(c);

// -- Buying one ---------------------------------------------------------------------------------------------------
// A card is bought with SHARDS. Shard packs are sold for money, which is exactly why a card carries no stat at all.
//
// The purchase itself is not reimplemented here. The wallet already owns a server-priced, atomic, idempotent spend
// that grants a PlayerEntitlement row (lib/wallet/wallet-service.ts). These three functions are the only bridge: a
// card id becomes a SKU id, and an entitlement row becomes a card id again.

export const BOOST_SKU_PREFIX = 'boost_card_';

export function boostSkuId(cardId: string): string {
  return BOOST_SKU_PREFIX + cardId;
}

/** Null for anything that is not one of ours -- including a well-formed prefix over a card that does not exist. */
export function boostIdFromSku(skuId: string): string | null {
  if (!skuId.startsWith(BOOST_SKU_PREFIX)) return null;
  const id = skuId.slice(BOOST_SKU_PREFIX.length);
  return cardById(id) ? id : null;
}

/** The owned-card ids inside a player's entitlement list. Everything else in there is somebody else's SKU. */
export function ownedFromEntitlements(skuIds: readonly string[]): string[] {
  return skuIds.map(boostIdFromSku).filter((id): id is string => id !== null);
}

export function cardById(id: string): BoostCard | null {
  return BOOST_CARDS.find((c) => c.id === id) ?? null;
}


export interface Vitals {
  /** What was MEASURED. Never contains a bought point. */
  base: number;
  /** What the games use. CARD-SAFE-2: always the measured number; owning cards changes nothing. */
  boosted: number;
  /** Always 0 (CARD-SAFE-2: cards are cosmetic). Kept so existing readers get an honest zero. */
  lift: 0;
}

/**
 * The game-side number. CARD-SAFE-2: owned cards are cosmetic, so this is the measured number, whatever is owned.
 * `ownedIds` is accepted and ignored so no caller can turn a card into points.
 */
export function gameVitals(basePrq: number, _ownedIds: readonly string[] = []): Vitals {
  const base = Math.max(0, Math.min(100, basePrq));
  return { base, boosted: base, lift: 0 };
}

/**
 * THE MEASUREMENT NUMBER. Takes only the base, takes no card list at all, and exists so that a call site which
 * feeds a meal prescription or a movement screen CANNOT accidentally be handed a boosted figure — there is nowhere
 * to put one.
 */
export function measuredPrq(basePrq: number): number {
  return Math.max(0, Math.min(100, basePrq));
}

/** What a purchase costs, and whether it can be afforded. Pure, so the route does not invent its own arithmetic. */
export function purchaseCheck(card: BoostCard | null, shards: number, ownedIds: readonly string[]):
{ ok: boolean; reason?: 'unknown_card' | 'already_owned' | 'insufficient_shards'; cost: number } {
  if (!card) return { ok: false, reason: 'unknown_card', cost: 0 };
  if (ownedIds.includes(card.id)) return { ok: false, reason: 'already_owned', cost: card.costShards };
  if (shards < card.costShards) return { ok: false, reason: 'insufficient_shards', cost: card.costShards };
  return { ok: true, cost: card.costShards };
}
