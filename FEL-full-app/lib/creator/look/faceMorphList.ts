// THE FACE MORPH LIST, DATA-DRIVEN (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c; moved from 4b).
//
// WHY. The Closet's face sliders were a hard-coded table of the forge's seven morphs (faceLong … browRaise), and every
// sanitiser kept exactly those seven names. Phase 5 bakes 40–60 more on the owner's Mac (nose, eyes, mouth, brows, cheeks,
// chin, ears; then body-shape macros) — with a fixed list each one would need a code change before a player could touch
// it, and a saved value for it would be dropped on the next save. Now the sliders are built from the morph targets the
// LOADED body actually carries (faceMorphs.morphNamesOf), the sanitisers keep any name that passes the rule below, and the
// identity layer pushes a weight onto every target by its name. A new morph baked into the GLB appears without code.
//
// THE NAME RULE (`isFaceMorphName`): a camelCase identifier, 2–24 characters, starting lower-case ([a-z][A-Za-z0-9]*).
// Never:
//   - a name starting `fel` — the Creator's OWN morph targets (shape/renderShape's 'felShape', the summed bulk) are not
//     face sliders, and a slider must never be able to zero them;
//   - a name a save route would refuse as a picture (lookPrivacy.payloadHasImage's key rule: image, photo, png, texture …);
//   - a property every object already has (`constructor`, `toString` …), so `sliders[name]` is always the player's value.
// At most MAX_FACE_MORPHS names are kept per face (the size caps budget them); the seven known names always come first.
//
// SAVED VALUES KEEP WORKING. The seven known names pass the rule unchanged, keep their order and their labels, so every
// face saved before this sanitises to exactly what it was. A value for a morph the current body does not carry (a scan
// body has none) is kept, not dropped: it applies again on a body that has the morph.
//
// Pure (no Babylon): the sanitisers, the Closet and the identity layer all ask this one file.

/** The forge's seven, in the order (and with the labels) the Closet always showed them. */
export const KNOWN_FACE_MORPHS = ['faceLong', 'faceRound', 'faceSquare', 'faceHeart', 'faceDiamond', 'jawOpen', 'browRaise'] as const;

/** Friendly labels for names we know. Phase 5's expected names (CREATOR-PLAN A2: nose, eyes, mouth, brows, cheeks, chin,
 *  ears) get a readable label from `labelFor` without being listed; add one here only when the default reads badly. */
export const FACE_MORPH_LABELS: Record<string, string> = {
  faceLong: 'Length', faceRound: 'Roundness', faceSquare: 'Jaw', faceHeart: 'Heart', faceDiamond: 'Cheekbones',
  jawOpen: 'Jaw open', browRaise: 'Brow',
};

/** The most face morph values one face (or one doc) keeps. 7 today; phase 5 plans 40–60, plus a few body macros. */
export const MAX_FACE_MORPHS = 64;
/** The longest morph name kept. */
export const MAX_FACE_MORPH_NAME = 24;

const NAME_RE = /^[a-z][A-Za-z0-9]{1,23}$/;
/** lookPrivacy.ts IMAGE_KEY — a key a save route refuses (kept in step by faceMorphList.test.ts). */
const IMAGE_KEY = /(image|photo|png|jpe?g|webp|bitmap|pixels|texture)/i;

/** True when `name` may be a face morph slider (the rule above). */
export function isFaceMorphName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= MAX_FACE_MORPH_NAME && NAME_RE.test(name)
    && !name.startsWith('fel') && !IMAGE_KEY.test(name) && !(name in Object.prototype);
}

/** A readable label: the known one, else the camelCase name spelt out ("noseWidth" → "Nose width"). */
export function labelFor(name: string): string {
  const known = FACE_MORPH_LABELS[name];
  if (known) return known;
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Za-z])([0-9])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Valid names, unique, the known seven first (in their order), then the rest in the order given; at most `max`. */
export function orderMorphNames(names: Iterable<unknown>, max = MAX_FACE_MORPHS): string[] {
  const seen = new Set<string>();
  for (const n of names) if (isFaceMorphName(n)) seen.add(n);
  const known = KNOWN_FACE_MORPHS.filter((k) => seen.has(k));
  const rest = [...seen].filter((n) => !(KNOWN_FACE_MORPHS as readonly string[]).includes(n));
  return [...known, ...rest].slice(0, max);
}

export interface FaceMorphSlider { key: string; label: string }

/** The Closet's face sliders for a body that carries `names` (faceMorphs.morphNamesOf on the loaded body). */
export function faceMorphList(names: Iterable<unknown>): FaceMorphSlider[] {
  return orderMorphNames(names).map((key) => ({ key, label: labelFor(key) }));
}

/**
 * Morph weights, sanitised: finite numbers clamped to 0..1 and rounded to 3 decimals, under valid names only, in the
 * canonical order, at most MAX_FACE_MORPHS. `keepZero` keeps an explicit 0 (the doc's face values may pin a morph to 0
 * over a preset; the Closet's sliders drop zeros to stay compact).
 */
export function sanitizeMorphWeights(input: unknown, keepZero: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const src = input as Record<string, unknown>;
  const names = orderMorphNames(Object.keys(src).filter((k) => typeof src[k] === 'number' && Number.isFinite(src[k] as number)));
  for (const k of names) {
    const c = Math.max(0, Math.min(1, src[k] as number));
    const r = Math.round(c * 1000) / 1000;
    // `c > 0`, not `r > 0`: exactly the old sliders rule (a value under 0.0005 is kept, as 0), so an old face round-trips
    if (c > 0 || keepZero) out[k] = r === 0 ? 0 : r;
  }
  return out;
}
