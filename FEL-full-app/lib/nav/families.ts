// families — the shelf every mode lives on.
//
// THE PROBLEM THIS SOLVES, measured before it was written: /modes rendered all 37 entries of MODE_INFO as one flat
// two-column grid, and the app carried 33 top-level routes with no hierarchy at all. A player looking for basketball
// scrolled past karate, golf, a kart and a marketplace to find it. Nothing was hidden and nothing could be found —
// the same complaint the scope audit made about the documentation, in the interface.
//
// Families are the fix, and the rule for them is the one a shelf has: a mode belongs to exactly ONE family, always,
// and every family is something a person would actually say out loud. "Hoops." "Combat." "Board sports." Not
// "Tier B" and not "rollout wave 3".
//
// Pure data and pure lookups. The tab shell renders it; nothing here knows what a component is.

import { PALETTE } from '@/lib/design/palette';

export type FamilyId = 'hoops' | 'combat' | 'board' | 'racing' | 'field' | 'party' | 'craft';

export interface Family {
  id: FamilyId;
  /** What it is called on the bubble. One word where one word will do. */
  label: string;
  /** The line under the label — what a stranger needs to know to pick. */
  blurb: string;
  /** The family's colour, used for the bubble's glow and the mode cards inside it. */
  accent: string;
  /** MODE_INFO keys, in the order they should be shown: the flagship first. */
  modes: string[];
}

/**
 * Order matters twice over: the families are listed strongest first, because the first bubble is the one a new
 * player taps, and each family's modes lead with its flagship for the same reason.
 */
export const FAMILIES: Family[] = [
  {
    id: 'hoops', label: 'Hoops', blurb: 'Dunk contests, ones, threes, the arc.', accent: PALETTE.ember,
    modes: ['dunkContest', 'hoops1v1', 'hoops3v3', 'threePoint', 'dunkduel'],
  },
  {
    id: 'combat', label: 'Combat', blurb: 'Waves, duels and the tournament.', accent: PALETTE.crimson,
    modes: ['karateEndless', 'karateVersus', 'mixedcombat', 'duel', 'showdown'],
  },
  {
    id: 'board', label: 'Board', blurb: 'Concrete, powder and open water.', accent: PALETTE.cyan,
    modes: ['skateboarding', 'snowboarding', 'surfing', 'bigAir'],
  },
  {
    id: 'racing', label: 'Racing', blurb: 'Karts on the boardwalk, planes through canyons.', accent: PALETTE.violet,
    modes: ['velocitykart', 'aeroaces', 'freerun', 'sprint'],
  },
  {
    id: 'field', label: 'Field & Court', blurb: 'The other sports, one skill each.', accent: PALETTE.emerald,
    modes: ['football', 'soccer', 'baseball', 'tennis', 'volleyball', 'golf', 'tiebreak'],
  },
  {
    id: 'party', label: 'Party', blurb: 'What you put on when people are round.', accent: PALETTE.gold,
    modes: ['carnival', 'brainBrawl', 'whoSceneIt', 'irl'],
  },
  {
    id: 'craft', label: 'Craft', blurb: 'Rhythm, performance and the story.', accent: PALETTE.indigo,
    modes: ['dance', 'musicAcademy', 'acting', 'storyMode'],
  },
];

/**
 * Modes that are deliberately NOT on the Play shelf, each with a reason. They are not hidden — they live on their
 * own tab, which is the whole point of the reorganisation.
 */
export const OFF_SHELF: Record<string, string> = {
  mirror: 'the movement screen lives on Train, beside the programming it feeds',
  training: 'Iron Paradise is training, not a game to pick from a shelf',
  kitchens: 'the Fuel floor and the kitchen marketplace live on Train',
  marketplace: 'the store is reached from Profile, where the wallet is',
};

const BY_MODE = new Map<string, Family>();
for (const f of FAMILIES) for (const m of f.modes) BY_MODE.set(m, f);

/** The family a mode belongs to, or null when it is deliberately off the shelf. */
export function familyOf(modeKey: string): Family | null {
  return BY_MODE.get(modeKey) ?? null;
}

export function familyById(id: string): Family | null {
  return FAMILIES.find((f) => f.id === id) ?? null;
}

/** Every mode key that appears on the Play shelf, in shelf order. */
export function shelvedModes(): string[] {
  return FAMILIES.flatMap((f) => f.modes);
}
