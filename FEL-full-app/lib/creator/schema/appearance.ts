// APPEARANCE — nine presets and seven morphs, none of them authored here (2026-09-14). Spec §1.
//
// EVERY OPTION LIST ON THIS SCREEN IS THE CLOSET'S OWN. `lib/closet/wearable-catalog.ts` already ships
// `SKIN_TONES`, `FACE_SHAPES`, `HAIR_STYLES`, `HAIR_COLORS`, `EYE_SHAPES`, `EYE_COLORS`, `BROWS`, `MOUTHS`
// and `NOSES`, and `playerIdentity` applies exactly that `FaceConfig` to the hero in every mode. So the
// rows below reference those arrays by identity rather than restating them, and a test asserts it.
//
// Restating them would have been three lines shorter and wrong in the way this codebase keeps getting
// bitten: two lists of hairstyles drift, and the one that drifts is always the one the renderer does not
// read. A hairstyle the creator offers and `applyHairStyle` has never heard of is a bald player and a
// support ticket.
//
// THE INCLUSIVE RANGES ARE A PRODUCT REQUIREMENT, not a default. The catalog's header says so — twelve
// skin swatches spanning the full range, and textured, protective and cultural hair styles included by
// design. Pointing at the catalog is what keeps that requirement true in the creator for free.
//
// THE SLIDERS ARE 0–100 HERE AND 0–1 THERE. `FaceConfig.sliders` are morph weights, and morph weights are
// fractions; a stepper that walks 0.01 at a time would take a hundred presses to cross one morph. The rows
// are percent, the binding divides by 100, and `sanitizeFaceSliders` clamps whatever arrives anyway.
//
// COLOUR ROWS SHOW THEIR HEX. It is the value that goes into `FaceConfig`, the preview shows the actual
// colour beside it, and a row that displayed "Warm Brown" would need a second table mapping names back to
// hex — one more pair of lists to drift.

import type { RatedRow, SlotRow, SectionTable, AnyRow } from './types';
import {
  SKIN_TONES, FACE_SHAPES, HAIR_STYLES, HAIR_COLORS, EYE_SHAPES, EYE_COLORS,
  BROWS, MOUTHS, NOSES, FACE_SLIDER_KEYS, defaultFace,
} from '../../closet/wearable-catalog';

/**
 * The face an untouched creator shows, read off the catalog's own `defaultFace()`.
 *
 * NOT the head of each list, and the difference is visible: the default skin tone is the fifth swatch and
 * the default hair is Fade. A creator that opened on "the first option" would be quietly handing every new
 * player a different face from the one the Closet gives them for the same account.
 */
const FACE_DEFAULT = defaultFace() as unknown as Record<string, string>;

const face = (id: string, label: string, options: readonly string[], glossary: string): SlotRow => ({
  kind: 'slot', id, label, section: 'appearance', tab: 'Face',
  options, allowNone: false, defaultOption: FACE_DEFAULT[id], requires: null, glossary,
});

/** Human labels for the morph keys. The KEY is what the renderer reads; this is only what a person sees. */
export const SLIDER_LABEL: Record<string, string> = {
  faceLong: 'Face Length', faceRound: 'Face Roundness', faceSquare: 'Jaw Squareness',
  faceHeart: 'Heart Shape', faceDiamond: 'Diamond Shape', jawOpen: 'Jaw Set', browRaise: 'Brow Lift',
};

const slider = (key: string): RatedRow => ({
  kind: 'rated', id: key, label: SLIDER_LABEL[key] ?? key, section: 'appearance', tab: 'Fine Tune',
  min: 0, max: 100, prqAxis: null, suffix: '%',
  glossary: `Blends the ${SLIDER_LABEL[key] ?? key} morph in. 0 is the preset face untouched; 100 is the morph at full weight.`,
});

export const APPEARANCE: SectionTable<AnyRow> = {
  section: 'appearance',
  title: 'Appearance',
  rows: [
    face('skinTone', 'Skin Tone', SKIN_TONES, 'Twelve swatches spanning the full range. Applied through the tint system, so garments and ink sit on top of it correctly.'),
    face('faceShape', 'Face Shape', FACE_SHAPES, 'The base skull shape the fine-tune morphs blend on top of.'),
    face('hairStyle', 'Hair', HAIR_STYLES, 'Textured, protective and cultural styles are first-class here, not an afterthought list.'),
    face('hairColor', 'Hair Colour', HAIR_COLORS, 'Natural shades plus the three the Nexus palette uses.'),
    face('eyeShape', 'Eye Shape', EYE_SHAPES, 'Sets the lid and corner geometry. Visible in every close-up and replay cut.'),
    face('eyeColor', 'Eye Colour', EYE_COLORS, 'Iris colour. The cyan one is a Nexus look rather than a natural one.'),
    face('brows', 'Brows', BROWS, 'Brow weight and arch. Carries most of the face in a reaction shot.'),
    face('mouth', 'Mouth', MOUTHS, 'Lip shape and fullness.'),
    face('nose', 'Nose', NOSES, 'Bridge and tip shape.'),
    ...FACE_SLIDER_KEYS.map(slider),
  ],
};
