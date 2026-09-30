// VITALS — the body's dimensions, and the one section PRQ deliberately does NOT touch (2026-09-14). Spec §1.
//
// WHAT IS ACTUALLY UNDER THIS SECTION. `AvatarSpec` — the thing `playerIdentity` applies to every hero in
// every mode — carries the body's dimensions as scales, so the rows are those scales rather than a
// centimetre field that nothing would read. A vitals screen whose numbers do not reach the rig is a form.
//
// THEY ARE COSMETIC, AND ONLY TWO (REACH-FREEZE, 2026-09-29; Gameplay Systems' spec). Owner rule: body shape
// never changes timing, hitboxes or reach in any mode. The Reach row is gone — a longer arm touched the rim
// and let go of the ball higher, because the ball rides the hand — and a save that still carries reachScale
// loads with it ignored, not reported. Height and Build stay, inside a narrow clamp (playFrame.COSMETIC_CLAMP,
// TUNE-EJ): a small difference you can see in casual play and in the previews; ranked and the standard-frame
// modes show every athlete at 100. A save made in the old wider ranges loads clamped, never rejected.
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
import { COSMETIC_CLAMP } from '../../babylon/core/playFrame';

const percent = (r: readonly [number, number]) => [Math.round(r[0] * 100), Math.round(r[1] * 100)] as const;

/** Percent-of-standard bounds: the cosmetic clamp (playFrame.COSMETIC_CLAMP, TUNE-EJ) — Height 96–104, Build 94–108. */
export const VITAL_RANGE = {
  height: percent(COSMETIC_CLAMP.height),
  build: percent(COSMETIC_CLAMP.build),
};

/** The ranges saves were made in before REACH-FREEZE (2026-09-29). A value inside them is an old save: it loads CLAMPED into
 *  VITAL_RANGE and is never reported — the player did nothing wrong. A value outside them was never offered, and the resolver
 *  still reports it. */
export const VITAL_LEGACY_RANGE: Readonly<Record<string, readonly [number, number]>> = {
  heightScale: [88, 114],
  buildScale: [88, 118],
};

/** Rows a save may still carry that the creator no longer offers: loaded as nothing, reported as nothing (spec Decision 1). */
export const RETIRED_VITALS: readonly string[] = ['reachScale'];

/** A Height or Build an old save made, which loads clamped rather than as a violation. */
export function isLegacyVital(id: string, v: unknown): boolean {
  const r = VITAL_LEGACY_RANGE[id];
  return !!r && typeof v === 'number' && Number.isFinite(v) && v >= r[0] && v <= r[1];
}

/** The Vitals values as the editor may hold them: a retired row dropped, an old save's Height and Build clamped into the rows.
 *  Everything else (the jersey number, the name plate, a key this build does not know) passes through untouched. */
export function normalizeVitals(vitals: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(vitals ?? {})) {
    if (RETIRED_VITALS.includes(id)) continue;
    const row = VITALS.rows.find((r) => r.id === id);
    out[id] = row && isLegacyVital(id, v) ? Math.min(row.max, Math.max(row.min, v as number)) : v;
  }
  return out;
}

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
      'How tall your athlete looks, as a percent of standard. Cosmetic only: it changes the look, never how they play. Some modes show every athlete at 100.'),
    dim('buildScale', 'Build', VITAL_RANGE.build,
      'How broad your athlete looks through the torso and limbs, as a percent of standard. Cosmetic only: it changes the look, never how they play.'),
    {
      kind: 'rated', id: 'jerseyNumber', label: 'Jersey Number', section: 'vitals', tab: 'Identity',
      min: 0, max: 99, prqAxis: null,
      glossary: 'The number on the back of the jersey, 0 to 99. It is rendered on the plate in every mode that shows one.',
    },
  ],
};
