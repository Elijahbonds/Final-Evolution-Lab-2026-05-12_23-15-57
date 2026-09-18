// VITALS — the body's dimensions, and the one section PRQ deliberately does NOT touch (2026-09-14). Spec §1.
//
// WHAT IS ACTUALLY UNDER THIS SECTION. `AvatarSpec` — the thing `playerIdentity` applies to every hero in
// every mode — carries exactly three dimensions: `heightScale`, `buildScale`, `reachScale`. Those ARE
// height, weight and wingspan as far as this engine is concerned, so the rows are those three rather than
// a centimetre field that nothing would read. A vitals screen whose numbers do not reach the rig is a form.
//
// THEY ARE PERCENTAGES OF A STANDARD FRAME, 100 = standard, because that is the unit the scales are in and
// converting to centimetres here would mean inventing a reference height to convert against.
//
// NOTHING HERE IS CAPPED BY PRQ, and that is a decision rather than an oversight.
//
//   A body scan measures how you MOVE. It does not measure how tall you are, and a creator that let a
//   measured axis cap your height would be telling a shorter athlete they are a worse one. PRQ caps
//   speed, strength, vertical — capacities you train. Dimensions are not capacities.
//
// The jersey number lives here because it is identity rather than look, and its range is not chosen here:
// `sanitizeJersey` in the closet catalog clamps to 0–99 on both the client and the server, and the test
// asserts this row agrees with it. A creator that offers 100 and a server that refuses it is a bug
// reported by a player instead of by a test.
//
// THE NAME PLATE IS NOT A ROW. It is free text, and the three row kinds are a number, a tier ladder and a
// named option list. Adding a fourth kind for one field would put a special case in the editor screen that
// §10 step 2 exists to prevent, so the plate is a field on the shell's identity header and the schema
// stays three kinds wide.

import type { RatedRow, SectionTable } from './types';

/** Percent-of-standard bounds, wide enough to contain every body a movement scan can produce. */
export const VITAL_RANGE = {
  height: [88, 114] as const,
  build: [88, 118] as const,
  reach: [92, 112] as const,
};

/** 100 is the standard frame — what an untouched creator and a guest both are. */
export const VITAL_DEFAULT = 100;

// The default is 100 and NOT the row's floor, which is the whole reason `defaultValue` exists: an
// untouched Vitals screen opening on 88% would hand the shortest frame in the game to every player who
// never visited the section.
const dim = (id: string, label: string, range: readonly [number, number], glossary: string): RatedRow => ({
  kind: 'rated', id, label, section: 'vitals', tab: 'Frame',
  min: range[0], max: range[1], prqAxis: null, suffix: '%', defaultValue: VITAL_DEFAULT, glossary,
});

export const VITALS: SectionTable<RatedRow> = {
  section: 'vitals',
  title: 'Vitals',
  rows: [
    dim('heightScale', 'Height', VITAL_RANGE.height,
      'Overall frame height, as a percent of standard. Taller reaches the rim sooner and turns slower; shorter sits lower and changes direction quicker.'),
    dim('buildScale', 'Build', VITAL_RANGE.build,
      'Torso and limb thickness. A heavier build holds ground through contact and carries more of itself up the floor.'),
    dim('reachScale', 'Reach', VITAL_RANGE.reach,
      'Arm length. Longer arms release higher, contest further and gather the ball earlier on a drive.'),
    {
      kind: 'rated', id: 'jerseyNumber', label: 'Jersey Number', section: 'vitals', tab: 'Identity',
      min: 0, max: 99, prqAxis: null,
      glossary: 'The number on the back of the jersey, 0 to 99. It is rendered on the plate in every mode that shows one.',
    },
  ],
};
