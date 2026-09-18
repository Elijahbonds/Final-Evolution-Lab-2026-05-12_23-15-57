// WHAT THE PLAYER IS LOOKING AT, BUILT FROM WHAT THEY HAVE CHOSEN (2026-09-14). Spec §10 step 6.
//
// "Live preview binding: the preview is a CONSUMER of the resolved build, never a source of truth."
//
// So this is a pure function from the editor's value maps to the exact shape `applyIdentity` takes — the
// same `PlayerIdentity` the Closet preview passes and the same one every mode spawns with. No Babylon, no
// React, no canvas: the mapping is the part that can be wrong, and a mapping that needs a GPU to test is a
// mapping nobody tests.
//
// THE ONE RULE IT ENFORCES. Every field comes from a row, and a row that has not been touched contributes
// its DEFAULT rather than nothing — `defaultValueFor`, which is the same value the screen is showing. A
// player who never opened Appearance still has a face, and it is the face they can see.
//
// IT DELIBERATELY DOES NOT INVENT A FALLBACK. Where a row exists, the row decides; where no row exists
// (the name plate, which is a text field on the shell) the caller passes it in. The temptation is a pile of
// `?? '#00E5FF'` defaults in here, and every one of them would be a second opinion about what the default
// is — which is exactly the drift the schema tables exist to stop.

import type { FaceConfig, JerseyConfig } from '../../closet/wearable-catalog';
import { sanitizeFaceSliders, sanitizeJersey, defaultFace } from '../../closet/wearable-catalog';
import type { AvatarSpec } from '../../workout/avatar-builder';
import { APPEARANCE } from '../schema/appearance';
import { BODY } from '../schema/body';
import { VITALS } from '../schema/vitals';
import { GEAR, ACCESSORIES, wearableIdFor } from '../schema/gear';
import { defaultValueFor, type RowValue } from './rowState';
import { bodyTypeOf, type BodyType } from '../../babylon/core/heroBody';

export type ValueMap = Record<string, RowValue> | undefined;

/** Exactly what `AvatarPreview` and `applyIdentity` want. `proportions` is null only if nothing set them. */
export interface PreviewBinding {
  face: FaceConfig;
  palette: { jersey: string; shorts: string; shoes: string; accent: string };
  jersey: JerseyConfig;
  wardrobe: Record<string, string | null>;
  proportions: AvatarSpec;
  /** The kit body the draft wears (Body → Body Type). The preview respawns when it changes. */
  bodyType: BodyType;
}

/** A row's value, or the default the screen is already showing for it. */
function valueOf(table: { rows: readonly { id: string }[] }, values: ValueMap, id: string): RowValue {
  const row = table.rows.find((r) => r.id === id) as never;
  if (!row) return null;
  const v = values?.[id];
  return v === undefined || v === null ? defaultValueFor(row) : v;
}

const str = (v: RowValue, fallback: string): string => (typeof v === 'string' && v ? v : fallback);
const num = (v: RowValue, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The face, including the fine-tune morphs — which are percent on the row and fractions in the config. */
export function bindFace(appearance: ValueMap): FaceConfig {
  const base = defaultFace();
  const face: FaceConfig = { ...base };
  const sliders: Record<string, number> = {};
  for (const row of APPEARANCE.rows) {
    const v = valueOf(APPEARANCE, appearance, row.id);
    if (row.kind === 'rated') {
      // 0–100 on screen because a stepper walking 0.01 at a time would take a hundred presses to cross one
      // morph; `sanitizeFaceSliders` clamps and drops whatever it does not recognise.
      const pct = num(v, row.defaultValue ?? row.min);
      if (pct > 0) sliders[row.id] = pct / 100;
      continue;
    }
    (face as unknown as Record<string, string>)[row.id] = str(v, (base as unknown as Record<string, string>)[row.id] ?? '');
  }
  const clean = sanitizeFaceSliders(sliders);
  if (clean) face.sliders = clean;
  return face;
}

/** The four tints `applyIdentity` paints by mesh-slot name. */
export function bindPalette(gear: ValueMap): PreviewBinding['palette'] {
  const pick = (id: string) => str(valueOf(GEAR, gear, id), '#FFFFFF');
  return {
    jersey: pick('paletteJersey'), shorts: pick('paletteShorts'),
    shoes: pick('paletteShoes'), accent: pick('paletteAccent'),
  };
}

/** Equipped garment IDS, resolved back from the display names the rows carry. */
export function bindWardrobe(gear: ValueMap, accessories: ValueMap): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const row of GEAR.rows) {
    if (row.tab !== 'Kit') continue;
    out[row.id] = wearableIdFor(str(valueOf(GEAR, gear, row.id), ''));
  }
  for (const row of ACCESSORIES.rows) {
    out[row.id] = wearableIdFor(str(valueOf(ACCESSORIES, accessories, row.id), ''));
  }
  return out;
}

/**
 * The three scales, as the scan's own shape.
 *
 * `applyIdentity` multiplies the root by `heightScale` and the torso and arm bones by the other two, so a
 * Vitals row moving is a body changing on screen — which is the only way a player can tell that these
 * numbers are real.
 */
export function bindProportions(vitals: ValueMap, body: ValueMap, face: FaceConfig, palette: PreviewBinding['palette']): AvatarSpec {
  const pct = (id: string) => num(valueOf(VITALS, vitals, id), 100) / 100;
  const stance = str(valueOf(BODY, body, 'stance'), 'athletic') as AvatarSpec['stance'];
  return {
    heightScale: pct('heightScale'), buildScale: pct('buildScale'), reachScale: pct('reachScale'),
    palette: { skin: face.skinTone, primary: palette.jersey, accent: palette.accent },
    stance,
  };
}

/** Everything the preview needs, from the editor's value maps. `plate` is the shell's text field. */
export function bindPreview(values: Record<string, ValueMap>, plate = ''): PreviewBinding {
  const face = bindFace(values.appearance);
  const palette = bindPalette(values.gear);
  return {
    face,
    palette,
    // The number comes from a Vitals row and goes through the SAME sanitiser the server uses, so the
    // preview can never show a plate the save would reject.
    jersey: sanitizeJersey({ number: num(valueOf(VITALS, values.vitals, 'jerseyNumber'), 0), name: plate }),
    wardrobe: bindWardrobe(values.gear, values.accessories),
    proportions: bindProportions(values.vitals, values.body, face, palette),
    bodyType: bodyTypeOf(valueOf(BODY, values.body, 'bodyType')),
  };
}
