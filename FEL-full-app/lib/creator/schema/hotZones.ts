// HOT ZONES — the section that was going to need a new row kind, and did not (2026-09-14). Spec §8.
//
// This was the real test of §10 step 2. A court grid with a state ladder looks nothing like a 0–99 slider
// or a tiered trait, and it is exactly the section where somebody adds `if (section === 'hotZones')` to
// the editor and quietly ends the abstraction.
//
// It did not need one. A zone cycling Frigid → Cold → Neutral → Hot → Burning is STRUCTURALLY a slot: a
// named cycle through a fixed option list. It renders through the same rows, the same steppers and the
// same glossary as everything else, and `step()` already holds at both ends rather than wrapping — which
// matters more here than anywhere, because a wrapping ladder means one press past BURNING drops you to
// FRIGID and tanks a zone you had just maxed.
//
// THE COURT DIAGRAM IS A PREVIEW, NOT A LAYOUT. The spec asks for "directional navigation over the court
// diagram", and the honest place for that is the preview pane the editor already accepts as a slot: the
// list edits the state, the diagram shows where the zone is and lights the focused one. A bespoke grid
// inside the editor screen would have been the special case this section exists to avoid.
//
// FIVE STATES, not three. The spec offers both and the five-rung ladder is the better one: three states
// makes every zone a binary with a shrug in the middle, and the two extra rungs are where a build gets a
// personality — a corner specialist who is BURNING from one corner and FRIGID from the other.

import type { SlotRow, SectionTable } from './types';

/** Coldest to hottest. Order is the ladder — `step()` walks this array. */
export const ZONE_STATES = ['FRIGID', 'COLD', 'NEUTRAL', 'HOT', 'BURNING'] as const;
export type ZoneState = (typeof ZONE_STATES)[number];
export const ZONE_DEFAULT: ZoneState = 'NEUTRAL';

/** Shot-quality multiplier per state, and the AI's willingness to take one from there. */
export const ZONE_SHOT_MULT: Record<ZoneState, number> = {
  FRIGID: 0.88, COLD: 0.94, NEUTRAL: 1, HOT: 1.06, BURNING: 1.12,
};

/**
 * Zones above NEUTRAL cost budget; below it REFUNDS.
 *
 * The spec asks for a cap "so every build can't be hot everywhere", and a cap alone would just be a
 * ceiling. Making cold zones give budget back is what turns the section into a decision: a shooter who
 * admits he cannot score from the left baseline can afford to be burning from the right corner. A build
 * that is neutral everywhere spends nothing and gets nothing, which is the correct outcome for a build
 * that refused to choose.
 */
export const ZONE_COST: Record<ZoneState, number> = {
  FRIGID: -2, COLD: -1, NEUTRAL: 0, HOT: 2, BURNING: 4,
};
export const ZONE_POINT_CAP = 6;

/** x/y are fractions of the half-court for the preview diagram: 0,0 is the baseline centre under the rim. */
export interface ZonePlacement { x: number; y: number }
export const ZONE_PLACEMENT: Record<string, ZonePlacement> = {
  restrictedArea: { x: 0, y: 0.06 },
  paint: { x: 0, y: 0.2 },
  shortCornerL: { x: -0.62, y: 0.08 }, shortCornerR: { x: 0.62, y: 0.08 },
  midBaselineL: { x: -0.78, y: 0.16 }, midBaselineR: { x: 0.78, y: 0.16 },
  midElbowL: { x: -0.34, y: 0.42 }, midElbowR: { x: 0.34, y: 0.42 },
  midCenter: { x: 0, y: 0.46 },
  cornerThreeL: { x: -0.93, y: 0.07 }, cornerThreeR: { x: 0.93, y: 0.07 },
  wingThreeL: { x: -0.7, y: 0.5 }, wingThreeR: { x: 0.7, y: 0.5 },
  topOfKeyThree: { x: 0, y: 0.66 },
  deepThree: { x: 0, y: 0.86 },
};

const z = (id: string, label: string, glossary: string): SlotRow => ({
  kind: 'slot', id, label, section: 'hotZones', tab: 'Court',
  options: ZONE_STATES, allowNone: false, requires: null, glossary,
});

export const HOT_ZONES: SectionTable<SlotRow> = {
  section: 'hotZones',
  title: 'Hot Zones',
  rows: [
    z('restrictedArea', 'Restricted Area', 'Right at the rim, inside the arc on the floor.'),
    z('paint', 'Paint', 'Inside the key but outside the restricted area.'),
    z('shortCornerL', 'Short Corner Left', 'The pocket between the paint and the left baseline.'),
    z('shortCornerR', 'Short Corner Right', 'The pocket between the paint and the right baseline.'),
    z('midBaselineL', 'Mid Baseline Left', 'Two-point range along the left baseline.'),
    z('midBaselineR', 'Mid Baseline Right', 'Two-point range along the right baseline.'),
    z('midElbowL', 'Mid Elbow Left', 'The left elbow, top of the key corner.'),
    z('midElbowR', 'Mid Elbow Right', 'The right elbow.'),
    z('midCenter', 'Mid Center', 'Straight on, inside the arc.'),
    z('cornerThreeL', 'Corner Three Left', 'The shortest three on the floor, left side.'),
    z('cornerThreeR', 'Corner Three Right', 'The shortest three on the floor, right side.'),
    z('wingThreeL', 'Wing Three Left', 'Three-point range off the left wing.'),
    z('wingThreeR', 'Wing Three Right', 'Three-point range off the right wing.'),
    z('topOfKeyThree', 'Top of Key Three', 'Straight-on three.'),
    z('deepThree', 'Deep Three', 'Well behind the line.'),
  ],
};

/** Shot multiplier for a zone state, defaulting to neutral for anything unrecognised. */
export function zoneMultiplier(state: string | null | undefined): number {
  return ZONE_SHOT_MULT[(state ?? ZONE_DEFAULT) as ZoneState] ?? 1;
}

/** What a whole zone map costs. Cold zones refund — see ZONE_COST. */
export function zonePointsSpent(zones: Record<string, string | null | undefined>): number {
  let n = 0;
  for (const row of HOT_ZONES.rows) n += ZONE_COST[(zones[row.id] ?? ZONE_DEFAULT) as ZoneState] ?? 0;
  return n;
}
