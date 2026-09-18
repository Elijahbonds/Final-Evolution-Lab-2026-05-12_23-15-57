/**
 * lib/card-catalog.ts — first-party Creator Card catalog. [SHIP] scope only.
 *
 * v1 is a closed, first-party storefront: cards are fixed at build time
 * (spec: "Content is first-party and fixed at build time"), so the catalog
 * is a typed constant, not a DB table. Ownership lives in the DB
 * (CardOwnership); the card definitions live here.
 *
 * Pricing (spec Part 2 [SHIP] table): Drill −80, Course −150, Avatar −250.
 * Challenge is not priced in the spec table; 100 LC keeps it between the
 * drill and course tiers (tunable — see REFINEMENT.md assumptions).
 */

export const CARD_TYPES = ['drill', 'challenge', 'avatar', 'course'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export type HeroMode = 'dunking' | 'karate';

/** What owning the card grants. Discriminated by card type. */
export type CardUnlock =
  | { type: 'drill'; drillId: string }
  | { type: 'challenge'; mode: HeroMode; challengeId: string }
  | { type: 'avatar'; slot: 'head' | 'torso' | 'effect'; assetId: string }
  | { type: 'course'; trackId: string; moduleId: string };

export interface Card {
  id: string;
  type: CardType;
  title: string;
  description: string;
  costLC: number;
  heroMode: HeroMode;
  /** Art/preview asset path under public/ (placeholder paths — see REFINEMENT.md). */
  assetRef: string;
  unlocks: CardUnlock;
}

/** Spec-driven price points, config-style so tuning is a one-place change. */
export const CARD_PRICES: Record<CardType, number> = {
  drill: 80, // ~8 lessons or 1 module
  challenge: 100, // between drill and course (assumption, spec-silent)
  course: 150, // mid-tier
  avatar: 250, // aspirational cosmetic
};

export const CARD_CATALOG: readonly Card[] = [
  // --- Drill Cards (unlock a Skill Lab drill or variant) -------------------
  {
    id: 'card_drill_dunk_approach_tempo',
    type: 'drill',
    title: 'Approach Tempo',
    description:
      'Skill Lab drill variant: dial in your last three steps with a metronome overlay.',
    costLC: CARD_PRICES.drill,
    heroMode: 'dunking',
    assetRef: '/cards/drill-dunk-approach-tempo.jpg',
    unlocks: { type: 'drill', drillId: 'drill_dunk_approach_tempo' },
  },
  {
    id: 'card_drill_dunk_gather_step',
    type: 'drill',
    title: 'Gather Step Isolator',
    description:
      'Skill Lab drill variant: isolate the gather step and grade plant timing rep by rep.',
    costLC: CARD_PRICES.drill,
    heroMode: 'dunking',
    assetRef: '/cards/drill-dunk-gather-step.jpg',
    unlocks: { type: 'drill', drillId: 'drill_dunk_gather_step' },
  },
  {
    id: 'card_drill_karate_jab_counter',
    type: 'drill',
    title: 'Jab Counter Loop',
    description:
      'Skill Lab drill variant: read the jab, slip, and counter inside a shrinking window.',
    costLC: CARD_PRICES.drill,
    heroMode: 'karate',
    assetRef: '/cards/drill-karate-jab-counter.jpg',
    unlocks: { type: 'drill', drillId: 'drill_karate_jab_counter' },
  },
  {
    id: 'card_drill_karate_roundhouse_chain',
    type: 'drill',
    title: 'Roundhouse Chains',
    description:
      'Skill Lab drill variant: chain roundhouse reps without dropping guard between kicks.',
    costLC: CARD_PRICES.drill,
    heroMode: 'karate',
    assetRef: '/cards/drill-karate-roundhouse-chain.jpg',
    unlocks: { type: 'drill', drillId: 'drill_karate_roundhouse_chain' },
  },

  // --- Challenge Cards (timed/scored objective in a hero mode) -------------
  {
    id: 'card_challenge_dunk_power_hour',
    type: 'challenge',
    title: 'Power Hour',
    description:
      'Hero-mode challenge: land 10 clean dunks in 60 seconds. Score is graded on finish quality.',
    costLC: CARD_PRICES.challenge,
    heroMode: 'dunking',
    assetRef: '/cards/challenge-dunk-power-hour.jpg',
    unlocks: {
      type: 'challenge',
      mode: 'dunking',
      challengeId: 'challenge_dunk_power_hour',
    },
  },
  {
    id: 'card_challenge_karate_untouchable',
    type: 'challenge',
    title: 'Untouchable',
    description:
      'Hero-mode challenge: win a full karate session without taking a single hit.',
    costLC: CARD_PRICES.challenge,
    heroMode: 'karate',
    assetRef: '/cards/challenge-karate-untouchable.jpg',
    unlocks: {
      type: 'challenge',
      mode: 'karate',
      challengeId: 'challenge_karate_untouchable',
    },
  },

  // --- Avatar Cards (cosmetic / avatar part) --------------------------------
  {
    id: 'card_avatar_neon_visor',
    type: 'avatar',
    title: 'Neon Visor',
    description: 'Cosmetic head piece: an electric cyan visor with a soft bloom trail.',
    costLC: CARD_PRICES.avatar,
    heroMode: 'dunking',
    assetRef: '/cards/avatar-neon-visor.jpg',
    unlocks: { type: 'avatar', slot: 'head', assetId: 'avatar_neon_visor' },
  },
  {
    id: 'card_avatar_carbon_gi',
    type: 'avatar',
    title: 'Carbon Weave Gi',
    description: 'Cosmetic torso piece: a matte carbon-fiber gi with ember stitching.',
    costLC: CARD_PRICES.avatar,
    heroMode: 'karate',
    assetRef: '/cards/avatar-carbon-gi.jpg',
    unlocks: { type: 'avatar', slot: 'torso', assetId: 'avatar_carbon_gi' },
  },

  // --- Course Cards (bundle an education module, Part 1 bridge) -------------
  {
    id: 'card_course_dunk_takeoff',
    type: 'course',
    title: 'Takeoff Mechanics',
    description:
      'Course bundle: the Takeoff Mechanics module from Dunk Fundamentals — lessons, clips, and drills.',
    costLC: CARD_PRICES.course,
    heroMode: 'dunking',
    assetRef: '/cards/course-dunk-takeoff.jpg',
    unlocks: {
      type: 'course',
      trackId: 'track_dunk_fundamentals',
      moduleId: 'module_dunk_takeoff_mechanics',
    },
  },
  {
    id: 'card_course_karate_contact',
    type: 'course',
    title: 'Contact & Finish',
    description:
      'Course bundle: the Contact & Finish module from Karate Fundamentals — lessons, clips, and drills.',
    costLC: CARD_PRICES.course,
    heroMode: 'karate',
    assetRef: '/cards/course-karate-contact.jpg',
    unlocks: {
      type: 'course',
      trackId: 'track_karate_fundamentals',
      moduleId: 'module_karate_contact_finish',
    },
  },
] as const;

const CARD_INDEX: ReadonlyMap<string, Card> = new Map(
  CARD_CATALOG.map((card) => [card.id, card])
);

export function getCardById(cardId: string): Card | undefined {
  return CARD_INDEX.get(cardId);
}

export function getCardsByType(type: CardType): Card[] {
  return CARD_CATALOG.filter((card) => card.type === type);
}
