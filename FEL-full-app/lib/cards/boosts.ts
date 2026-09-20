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

export interface BoostMetrics {
  /** Points added to the PRQ shown in GAME surfaces. Never to the measured one. */
  prq: number;
  vertical: number;
  efficiency: number;
  neural: number;
  readiness: number;
}

export interface CreatorLink { type: 'masterclass' | 'website' | 'youtube' | 'instagram' | 'spotify' | 'gallery' | 'imdb'; label: string; url: string }

export interface BoostCard {
  id: string;
  creator: string;
  title: string;
  blurb: string;
  costShards: number;
  accent: string;
  boost: BoostMetrics;
  /** The creator's own words, shown on the card's face. */
  tagline: string;
  links: CreatorLink[];
}

const M = (o: Partial<BoostMetrics>): BoostMetrics =>
  ({ prq: 0, vertical: 0, efficiency: 0, neural: 0, readiness: 0, ...o });

/** The first-party catalogue, prices and boosts carried across from the iOS cards. */
export const BOOST_CARDS: BoostCard[] = [
  {
    id: 'bonds-bounce', creator: 'Elijah Bonds', title: 'Bonds Bounce Blueprint',
    blurb: 'The vertical jump architecture.', costShards: 750, accent: '#F27D26',
    boost: M({ prq: 12, vertical: 25, efficiency: 8 }),
    tagline: 'Invented the kick-up on a trampoline. Landed it on a ten-foot rim.',
    links: [{ type: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/elijahbonds/' }],
  },
  {
    id: 'amir-signature', creator: 'Amir Smith', title: 'Amir Smith Signature',
    blurb: 'Signature handle and finish package.', costShards: 800, accent: '#00E5FF',
    boost: M({ prq: 14, efficiency: 12, neural: 10 }),
    tagline: 'The handle is the whole move. The finish is just the receipt.',
    links: [],
  },
  {
    id: 'flight-lab-pro', creator: 'Flight Lab', title: 'Flight Lab Pro Card',
    blurb: 'Contest-grade hang and body control.', costShards: 600, accent: '#A855F7',
    boost: M({ prq: 10, vertical: 18, readiness: 6 }),
    tagline: 'Everything above the rim is practice for everything below it.',
    links: [],
  },
  {
    id: 'coach-v-elite', creator: 'Coach V', title: 'Coach V Elite Card',
    blurb: "Coach V's elite movement data.", costShards: 500, accent: '#FFD700',
    boost: M({ prq: 15, vertical: 20, neural: 10, readiness: 5 }),
    tagline: 'Assess, correct, load, perform. In that order, every time.',
    links: [],
  },
  {
    id: 'neural-max', creator: 'Neural Max', title: 'Neural Max Override',
    blurb: 'Reaction and drive, tuned up.', costShards: 400, accent: '#00FF9D',
    boost: M({ prq: 8, neural: 22, readiness: 8 }),
    tagline: 'The gap between seeing it and doing it is the only gap that matters.',
    links: [],
  },
  {
    id: 'directors-cut', creator: 'Director Stella', title: "Director's Cut Monologue",
    blurb: 'Performance package for the Read.', costShards: 550, accent: '#FF3366',
    boost: M({ prq: 9, efficiency: 10, neural: 14 }),
    tagline: 'Play the beat, not the line.',
    links: [{ type: 'imdb', label: 'IMDb', url: 'https://www.imdb.com/' }],
  },
];

// -- Buying one ---------------------------------------------------------------------------------------------------
// A boost card is bought with SHARDS, which are earned and are never sold for money (prisma/schema.prisma: "shards
// = low-volume prestige currency, milestone-earned, NEVER purchasable"). So the lift below is earned twice over --
// once as shards, once as the choice of which card to spend them on. That is why the game side may have it at all.
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

/** However many cards somebody owns, the game-side PRQ lift is capped. A wallet is not a ladder. */
export const BOOST_PRQ_CAP = 25;

export interface Vitals {
  /** What was MEASURED. Never contains a bought point. */
  base: number;
  /** What the GAMES use: measured plus owned boosts, capped. */
  boosted: number;
  /** The lift, for showing the two apart on screen. */
  lift: number;
}

/**
 * The game-side number. `ownedIds` is whatever the player has bought; unknown ids are ignored rather than trusted,
 * because the list arrives from a client and a made-up id must not become points.
 */
export function gameVitals(basePrq: number, ownedIds: readonly string[]): Vitals {
  const base = Math.max(0, Math.min(100, basePrq));
  const raw = [...new Set(ownedIds)]
    .map(cardById)
    .filter((c): c is BoostCard => c !== null)
    .reduce((sum, c) => sum + c.boost.prq, 0);
  const lift = Math.min(BOOST_PRQ_CAP, raw);
  return { base, boosted: Math.max(0, Math.min(100, base + lift)), lift };
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
