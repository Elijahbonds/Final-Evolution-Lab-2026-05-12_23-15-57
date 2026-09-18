// WHERE EACH PART OF A BUILD IS STORED, AND WHY IT IS NOT ALL IN ONE ROW (2026-09-14). Spec §10, step 7.
//
// THE CREATOR IS NOT ALLOWED TO INVENT A SECOND FACE. `AvatarLook` already exists and is already the one
// canonical home for a player's look: `face` is a FaceConfig, `equipped` is the wearable map, `jersey` is
// the plate. The Closet writes it, `resolveIdentity` reads it, every mode spawns from it. A creator that
// stored its own copy of all three would be the exact failure the platform rule names — "one canonical
// record. No mode may persist its own parallel profile" — and the copy that drifts is always the one the
// renderer does not read.
//
// So the save SPLITS:
//
//   look   → AvatarLook, through the same shape the Closet uses (and the same ownership filter).
//   build  → the new AthleteBuild row: attributes, tendencies, traits, hot zones, mechanics, and the
//            parts of Vitals/Body/Gear that have nowhere else to live — the three frame scales, the
//            archetype, the stance, and the palette overrides.
//
// PALETTE IS IN THE BUILD AND NOT IN AvatarLook ON PURPOSE. The Closet has no palette column; it DERIVES
// the four tints from each equipped garment's accent. The creator lets a player override them, which is a
// new capability and therefore new storage — putting it in AvatarLook would mean a schema change to a
// table four other surfaces already read, for a field only this screen writes.
//
// Pure: no Prisma, no fetch, no React. The route is thin on top of this because a route cannot be tested
// without a database and this is where the decisions are.

import type { RowValue } from '../editor/rowState';
import { defaultValueFor } from '../editor/rowState';
import { APPEARANCE } from './appearance';
import { GEAR, ACCESSORIES, wearableIdFor } from './gear';
import { VITALS } from './vitals';
import { BODY } from './body';
import { resolve, type CreatorBuild, type Issue, LOOK_SECTIONS } from './resolve';
import { sanitizeJersey, getWearable, type FaceConfig } from '../../closet/wearable-catalog';
import { bindFace } from '../editor/previewBinding';

export type Values = Record<string, Record<string, RowValue> | undefined>;

/** The wearable-slot rows, by the closet slot they map to. Both tables, because Accessories is one of them. */
const KIT_ROWS = [...GEAR.rows.filter((r) => r.tab === 'Kit'), ...ACCESSORIES.rows];
/** The colour rows — everything on the Colours tab. */
const COLOUR_ROWS = GEAR.rows.filter((r) => r.tab === 'Colours');

/** What goes to AvatarLook: exactly the Closet's three fields, nothing more. */
export interface LookPayload {
  face: FaceConfig;
  equipped: Record<string, string | null>;
  jersey: { number: number; name: string };
}

export function toLook(values: Values, plate = ''): LookPayload {
  const equipped: Record<string, string | null> = {};
  for (const row of KIT_ROWS) {
    const section = row.section === 'accessories' ? values.accessories : values.gear;
    const raw = section?.[row.id];
    const name = raw === undefined || raw === null ? (defaultValueFor(row) as string | null) : String(raw);
    equipped[row.id] = wearableIdFor(name);
  }
  const numberRow = values.vitals?.jerseyNumber;
  return {
    face: bindFace(values.appearance),
    equipped,
    jersey: sanitizeJersey({ number: typeof numberRow === 'number' ? numberRow : 0, name: plate }),
  };
}

/** What goes to AthleteBuild — everything the look tables do not already own. */
export interface BuildPayload {
  attributes: Record<string, number>;
  tendencies: Record<string, number>;
  traits: Record<string, number>;
  hotZones: Record<string, string>;
  mechanics: Record<string, string | null>;
  /** Frame scales as percent, the archetype and the stance. */
  frame: Record<string, RowValue>;
  /** The four palette overrides, by row id. */
  palette: Record<string, string>;
}

export function toBuild(values: Values): BuildPayload {
  const frame: Record<string, RowValue> = {};
  for (const row of VITALS.rows) {
    if (row.id === 'jerseyNumber') continue;                  // that one lives in AvatarLook.jersey
    const v = values.vitals?.[row.id];
    frame[row.id] = v === undefined ? defaultValueFor(row) : v;
  }
  for (const row of BODY.rows) {
    const v = values.body?.[row.id];
    frame[row.id] = v === undefined ? defaultValueFor(row) : v;
  }
  const palette: Record<string, string> = {};
  for (const row of COLOUR_ROWS) {
    const v = values.gear?.[row.id];
    palette[row.id] = String(v ?? defaultValueFor(row) ?? '');
  }
  return {
    attributes: numbers(values.attributes),
    tendencies: numbers(values.tendencies),
    traits: numbers(values.traits),
    hotZones: strings(values.hotZones),
    mechanics: nullableStrings(values.mechanics),
    frame,
    palette,
  };
}

/**
 * Put the two halves back together into the editor's value maps.
 *
 * The inverse of the split, and it has to be exact: a load that dropped a field would silently reset it
 * the next time the player saved.
 */
export function fromStorage(build: Partial<BuildPayload> | null | undefined, look: Partial<LookPayload> | null | undefined): Values {
  const values: Values = {
    attributes: { ...(build?.attributes ?? {}) },
    tendencies: { ...(build?.tendencies ?? {}) },
    traits: { ...(build?.traits ?? {}) },
    hotZones: { ...(build?.hotZones ?? {}) },
    mechanics: { ...(build?.mechanics ?? {}) },
    vitals: {},
    body: {},
    appearance: {},
    gear: {},
    accessories: {},
  };
  for (const row of VITALS.rows) {
    if (row.id === 'jerseyNumber') continue;
    const v = build?.frame?.[row.id];
    if (v !== undefined) values.vitals![row.id] = v;
  }
  if (look?.jersey) values.vitals!.jerseyNumber = look.jersey.number;
  for (const row of BODY.rows) {
    const v = build?.frame?.[row.id];
    if (v !== undefined) values.body![row.id] = v;
  }
  for (const row of COLOUR_ROWS) {
    const v = build?.palette?.[row.id];
    if (v !== undefined) values.gear![row.id] = v;
  }
  for (const row of APPEARANCE.rows) {
    const face = look?.face as unknown as Record<string, unknown> | undefined;
    if (!face) break;
    if (row.kind === 'rated') {
      const w = (face.sliders as Record<string, number> | undefined)?.[row.id];
      if (typeof w === 'number') values.appearance![row.id] = Math.round(w * 100);
      continue;
    }
    const v = face[row.id];
    if (typeof v === 'string') values.appearance![row.id] = v;
  }
  for (const row of KIT_ROWS) {
    const itemId = look?.equipped?.[row.id];
    const target = row.section === 'accessories' ? values.accessories! : values.gear!;
    if (itemId === undefined) continue;
    // Back to the DISPLAY NAME the rows carry. An id that no longer resolves becomes empty rather than a
    // guess — the same rule the wardrobe binding uses.
    target[row.id] = itemId ? getWearable(itemId)?.name ?? null : null;
  }
  return values;
}

/**
 * The server's own verdict on a build, run on the values rather than trusting the client's.
 *
 * The editor computes this too, and that is not a duplicate: the client's copy is what lets a player fix
 * a problem in place, and this one is what stops a hand-rolled POST writing a 99-everything athlete.
 */
export function validateForSave(values: Values, prq: CreatorBuild['prq']): { ok: boolean; issues: Issue[] } {
  const build: CreatorBuild = {
    attributes: numbers(values.attributes),
    tendencies: numbers(values.tendencies),
    traits: numbers(values.traits),
    hotZones: strings(values.hotZones),
    mechanics: nullableStrings(values.mechanics),
    look: Object.fromEntries(Object.keys(LOOK_SECTIONS).map((k) => [k, (values[k] ?? {}) as Record<string, string | number | null>])),
    prq,
  };
  const r = resolve(build);
  return { ok: r.valid, issues: r.issues.filter((i) => i.kind === 'violation') };
}

/** Item ids the player asked to wear, for the ownership check. Order follows KIT_ROWS. */
export function equippedIds(values: Values, plate = ''): Record<string, string | null> {
  return toLook(values, plate).equipped;
}

/** The names a slot offers — so a route can say what IS available when it refuses something. */
export function availableNamesFor(rowId: string): string[] {
  const row = KIT_ROWS.find((r) => r.id === rowId);
  return row ? [...row.options] : [];
}

const numbers = (m?: Record<string, RowValue>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
};
const strings = (m?: Record<string, RowValue>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'string') out[k] = v;
  return out;
};
const nullableStrings = (m?: Record<string, RowValue>): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'string' || v === null) out[k] = v;
  return out;
};
