// The CreatorDoc sanitiser (IMPROVE (2026-10-06), CREATOR-PLAN phase 1). Server-side truth: the closet and athlete
// routes run every doc through this before it touches a row, the share-code decoder runs every pasted code through
// it, and resolveIdentity runs the stored doc through it again (cheap) before anything renders it.
//
// THE RULES, all enforced here and nowhere else:
//   - ids are allow-listed (doc.ts lists); an unknown shape, bone, pattern, stamp, region or finish drops the item;
//   - numbers must be finite and are clamped to RANGES and rounded (3 decimals; degrees to 0.1), so the stored size is
//     bounded by the budgets;
//   - colours must be #RGB or #RRGGBB and are stored as upper-case #RRGGBB;
//   - text goes through the jersey plate's sanitiser (sanitizeJersey's name rule);
//   - budgets: the first MAX_PARTS parts and MAX_PAINT_LAYERS layers, MAX_SLOTS slots; duplicate ids are dropped;
//   - unknown fields are dropped at every level, and a doc over MAX_DOC_CHARS is refused (null).
// Never throws: anything that is not a plain object comes back as null (or the empty doc where a doc is required).

import {
  CREATOR_DOC_VERSION, MAX_PARTS, MAX_PAINT_LAYERS, MAX_SLOTS, MAX_DOC_CHARS, MAX_SLOT_CHARS,
  PART_SHAPES, PART_BONES, FINISHES, PAINT_TYPES, PAINT_REGIONS, PAINT_SURFACES, PAINT_PATTERNS, PAINT_STAMPS, PAINT_BLENDS,
  COLOUR_SLOTS, PROPORTION_RANGES, PROPORTION_KEYS, RANGES, HIDE_KEYS, PUPIL_SHAPES, EYE_RANGES, EYE_DEFAULTS,
  SLOT_BODIES, GIRTH_KEYS, GIRTH_RANGE, PRESENTATION_RANGE, PART_TONES, TONE_AXES, isSwingShape,
  type CreatorDoc, type CreatorPart, type PaintLayer, type Vec3, type ColourSlot, type CreatorEyes, type CreatorFlags,
  type CreatorSlotV2, type SlotBody, type SlotFrame, type SlotPresentation,
} from './doc';
import {
  sanitizeJersey, sanitizeFaceSliders, getWearable, SLOTS as WEARABLE_SLOTS,
  FACE_SHAPES, HAIR_STYLES, EYE_SHAPES, BROWS, MOUTHS, NOSES, type FaceConfig,
} from '../../closet/wearable-catalog';
import { clampCosmetic } from '../../babylon/core/playFrame';
import { sanitizeMorphWeights } from './faceMorphList';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** `#abc` / `#AABBCC` → `#AABBCC`; anything else → null. */
export function sanitizeHex(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 7) return null;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toUpperCase()}`;
}

/** Finite number clamped to [lo, hi] and rounded to `dp` decimals; `fallback` for anything else. */
export function clampNum(v: unknown, lo: number, hi: number, fallback: number, dp = 3): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const c = Math.min(hi, Math.max(lo, v));
  const k = 10 ** dp;
  const r = Math.round(c * k) / k;
  return r === 0 ? 0 : r;   // never -0: JSON (a save, a share code) has no -0, so a doc would not round-trip it (phase 4a)
}

function pick<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

const ID_RE = /^[a-z0-9]{1,8}$/;
function sanitizeId(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 8 && ID_RE.test(v) ? v : null;
}

function vec3(v: unknown, [lo, hi]: readonly [number, number], fallback: number, dp = 3): Vec3 {
  const a = Array.isArray(v) ? v : [];
  return [clampNum(a[0], lo, hi, fallback, dp), clampNum(a[1], lo, hi, fallback, dp), clampNum(a[2], lo, hi, fallback, dp)];
}

export function sanitizePart(raw: unknown): CreatorPart | null {
  if (!isObj(raw)) return null;
  const id = sanitizeId(raw.id);
  const shape = pick(raw.shape, PART_SHAPES);
  const bone = pick(raw.bone, PART_BONES);
  const colour = sanitizeHex(raw.colour);
  if (!id || !shape || !bone || !colour) return null;
  const part: CreatorPart = {
    id, shape, bone,
    pos: vec3(raw.pos, RANGES.partPos, 0),
    rot: vec3(raw.rot, RANGES.partRot, 0, 1),
    scale: vec3(raw.scale, RANGES.partScale, 1),
    colour,
    finish: pick(raw.finish, FINISHES) ?? 'matte',
    mirror: raw.mirror === true,
  };
  // phase 4c's optional fields, stored only when not the default (a phase 1–4b doc sanitises to exactly what it was)
  const colour2 = sanitizeHex(raw.colour2);
  if (colour2) {
    part.colour2 = colour2;
    const tone = pick(raw.tone, PART_TONES) ?? 'split';
    if (tone !== 'split') part.tone = tone;
    const axis = pick(raw.toneAxis, TONE_AXES) ?? 'y';
    if (axis !== 'y') part.toneAxis = axis;
    const at = clampNum(raw.toneAt, RANGES.toneAt[0], RANGES.toneAt[1], 0.5);
    if (at !== 0.5) part.toneAt = at;
    if (tone === 'band') { const w = clampNum(raw.toneWidth, RANGES.toneWidth[0], RANGES.toneWidth[1], 0.2); if (w !== 0.2) part.toneWidth = w; }
  }
  if (isSwingShape(shape)) { const sw = clampNum(raw.swing, RANGES.swing[0], RANGES.swing[1], 0, 2); if (sw > 0) part.swing = sw; }
  if (raw.follow === true) part.follow = true;
  return part;
}

/** Text for a text stamp: the jersey plate's own rule (A–Z, 0–9, space, hyphen; 12 characters, upper-cased). */
export function sanitizeStampText(v: unknown): string {
  return typeof v === 'string' ? sanitizeJersey({ number: 0, name: v.slice(0, 64) }).name : '';
}

export function sanitizePaintLayer(raw: unknown): PaintLayer | null {
  if (!isObj(raw)) return null;
  const id = sanitizeId(raw.id);
  const type = pick(raw.type, PAINT_TYPES);
  const region = pick(raw.region, PAINT_REGIONS);
  if (!id || !type || !region) return null;
  const colours = (Array.isArray(raw.colours) ? raw.colours.slice(0, 3) : []).map(sanitizeHex).filter((c): c is string => !!c);
  if (!colours.length) return null;
  const at = isObj(raw.at) ? raw.at : {};
  const layer: PaintLayer = {
    id, type, region,
    surface: pick(raw.surface, PAINT_SURFACES) ?? 'both',
    at: {
      x: clampNum(at.x, RANGES.paintXY[0], RANGES.paintXY[1], 0.5),
      y: clampNum(at.y, RANGES.paintXY[0], RANGES.paintXY[1], 0.5),
      rot: clampNum(at.rot, RANGES.paintRot[0], RANGES.paintRot[1], 0, 1),
      scale: clampNum(at.scale, RANGES.paintScale[0], RANGES.paintScale[1], 1),
      stretch: clampNum(at.stretch, RANGES.paintStretch[0], RANGES.paintStretch[1], 1),
    },
    colours,
    opacity: clampNum(raw.opacity, RANGES.opacity[0], RANGES.opacity[1], 1),
    mirror: raw.mirror === true,
  };
  // phase 3's optional fields, stored only when not the default (a phase 1–2 doc sanitises to exactly what it was)
  const blend = pick(raw.blend, PAINT_BLENDS);
  if (blend && blend !== 'normal') layer.blend = blend;   // 'multiply' (phase 3), 'glow' (phase 4c)
  if (raw.hidden === true) layer.hidden = true;
  const weight = clampNum(raw.weight, RANGES.paintWeight[0], RANGES.paintWeight[1], 0.5);
  if (weight !== 0.5) layer.weight = weight;
  // each type carries exactly the one id it needs; a type missing it is not a layer
  if (type === 'pattern') { const p = pick(raw.pattern, PAINT_PATTERNS); if (!p) return null; layer.pattern = p; }
  if (type === 'stamp') { const s = pick(raw.stamp, PAINT_STAMPS); if (!s) return null; layer.stamp = s; }
  if (type === 'text') { const t = sanitizeStampText(raw.text); if (!t) return null; layer.text = t; }
  return layer;
}

/** First `max` valid items with unique ids. Only the first `max * 4` raw entries are looked at, which bounds the work. */
function budgeted<T extends { id: string }>(raw: unknown, max: number, one: (r: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, max * 4)) {
    if (out.length >= max) break;
    const s = one(r);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id); out.push(s);
  }
  return out;
}

/**
 * The one sanitiser. Returns a fresh doc with only known fields, or null for something that is not a v1 doc (wrong or
 * missing version, not an object) or a doc whose sanitised JSON is over `maxChars` (MAX_DOC_CHARS; a parameter so the
 * refusal itself is testable, since a doc within the budgets never reaches the real cap).
 */
export function sanitizeCreatorDoc(raw: unknown, maxChars: number = MAX_DOC_CHARS): CreatorDoc | null {
  if (!isObj(raw) || raw.v !== CREATOR_DOC_VERSION) return null;
  const colours: Partial<Record<ColourSlot, string>> = {};
  if (isObj(raw.colours)) for (const k of COLOUR_SLOTS) { const c = sanitizeHex(raw.colours[k]); if (c) colours[k] = c; }
  const shapeRaw = isObj(raw.shape) ? raw.shape : {};
  // phase 4c: data-driven — any face morph name the rule lets through (faceMorphList), the known seven first; an explicit
  // 0 is kept (a doc value pins a morph over a preset)
  const face: CreatorDoc['shape']['face'] = sanitizeMorphWeights(shapeRaw.face, true);
  const body: CreatorDoc['shape']['body'] = {};
  if (isObj(shapeRaw.body)) for (const k of PROPORTION_KEYS) {
    const v = shapeRaw.body[k];
    const [lo, hi] = PROPORTION_RANGES[k];
    if (typeof v === 'number' && Number.isFinite(v)) body[k] = clampNum(v, lo, hi, 1);
  }
  // phase 4b: bulk per segment (stored only when something is set, so a phase 1–4a doc sanitises to what it was)
  const girth: NonNullable<CreatorDoc['shape']['girth']> = {};
  if (isObj(shapeRaw.girth)) for (const k of GIRTH_KEYS) {
    const v = shapeRaw.girth[k];
    if (typeof v === 'number' && Number.isFinite(v)) girth[k] = clampNum(v, GIRTH_RANGE[0], GIRTH_RANGE[1], 1);
  }
  const flags: CreatorFlags = { suit: isObj(raw.flags) && raw.flags.suit === true };
  // phase 4a: what the doc hides (only `true` counts; stored only when something is hidden)
  const hideRaw = isObj(raw.flags) && isObj(raw.flags.hide) ? raw.flags.hide : null;
  if (hideRaw) {
    const hide: NonNullable<CreatorFlags['hide']> = {};
    for (const k of HIDE_KEYS) if (hideRaw[k] === true) hide[k] = true;
    if (Object.keys(hide).length) flags.hide = hide;
  }
  const doc: CreatorDoc = {
    v: CREATOR_DOC_VERSION,
    parts: budgeted(raw.parts, MAX_PARTS, sanitizePart),
    paint: budgeted(raw.paint, MAX_PAINT_LAYERS, sanitizePaintLayer),
    colours,
    shape: Object.keys(girth).length ? { face, body, girth } : { face, body },
    flags,
  };
  const eyes = sanitizeEyes(raw.eyes);
  if (eyes) doc.eyes = eyes;
  return JSON.stringify(doc).length > maxChars ? null : doc;
}

/** Phase 4a: the procedural eyes block. Every field is optional and kept only when it differs from EYE_DEFAULTS, so an
 *  untouched look carries nothing (and a phase 1–3 doc sanitises to exactly what it was). */
export function sanitizeEyes(raw: unknown): CreatorEyes | undefined {
  if (!isObj(raw)) return undefined;
  const out: CreatorEyes = {};
  const sclera = sanitizeHex(raw.sclera);
  if (sclera && sclera !== EYE_DEFAULTS.sclera) out.sclera = sclera;
  const size = clampNum(raw.size, EYE_RANGES.size[0], EYE_RANGES.size[1], EYE_DEFAULTS.size, 2);
  if (size !== EYE_DEFAULTS.size) out.size = size;
  const pupil = pick(raw.pupil, PUPIL_SHAPES);
  if (pupil && pupil !== EYE_DEFAULTS.pupil) out.pupil = pupil;
  const pupilSize = clampNum(raw.pupilSize, EYE_RANGES.pupilSize[0], EYE_RANGES.pupilSize[1], EYE_DEFAULTS.pupilSize, 2);
  if (pupilSize !== EYE_DEFAULTS.pupilSize) out.pupilSize = pupilSize;
  const glow = clampNum(raw.glow, EYE_RANGES.glow[0], EYE_RANGES.glow[1], 0, 2);
  if (glow > 0) out.glow = glow;
  return Object.keys(out).length ? out : undefined;
}

// ── slots (phase 4a: a slot is a whole character) ───────────────────────────────────────────────────────────────────

/** What a v1 slot ({ label, doc }, phase 1) is missing comes from here: the top-level face it was saved beside, and the
 *  body the account plays (the server's kit default when nobody says). */
export interface SlotFallback { face?: unknown; body?: SlotBody }

/** Worn items per wearable slot: a known item for that slot, or null. Ownership is NOT decided here (the route filters
 *  with lib/closet/ownership.filterEquipped, the server's own inventory); this only drops what is not an item at all. */
export function sanitizeSlotEquipped(raw: unknown): CreatorSlotV2['equipped'] | undefined {
  if (!isObj(raw)) return undefined;
  const out: NonNullable<CreatorSlotV2['equipped']> = {};
  for (const k of WEARABLE_SLOTS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (v === null) { out[k] = null; continue; }
    if (typeof v !== 'string' || v.length > 64) continue;
    const w = getWearable(v);
    if (w && w.slot === k) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Height and build multipliers, clamped to the cosmetic range (playFrame.COSMETIC_CLAMP); null when not numbers. */
export function sanitizeSlotFrame(raw: unknown): SlotFrame | undefined {
  if (!isObj(raw)) return undefined;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (!ok(raw.heightScale) && !ok(raw.buildScale)) return undefined;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { heightScale: r3(clampCosmetic(raw.heightScale, 'height')), buildScale: r3(clampCosmetic(raw.buildScale, 'build')) };
}

/** Phase 4b: the Studio / photo size, clamped to PRESENTATION_RANGE; undefined when not a number or exactly 1 (the
 *  default is not stored). Never read by a mode (lib/babylon/creator/shape/presentation.ts). */
export function sanitizeSlotPresentation(raw: unknown): SlotPresentation | undefined {
  if (!isObj(raw) || typeof raw.scale !== 'number' || !Number.isFinite(raw.scale) || raw.scale <= 0) return undefined;
  const scale = clampNum(raw.scale, PRESENTATION_RANGE[0], PRESENTATION_RANGE[1], 1);
  return scale === 1 ? undefined : { scale };
}

/** One slot, v2 or v1. Null when its doc does not sanitise, or it is over MAX_SLOT_CHARS. A v1 slot (no `base`) takes
 *  its base and sliders from the fallback face; a slot without an id gets none here (sanitizeCreatorSlots assigns one). */
export function sanitizeCreatorSlot(raw: unknown, fallback: SlotFallback = {}): (Omit<CreatorSlotV2, 'id'> & { id: string | null }) | null {
  if (!isObj(raw)) return null;
  const doc = sanitizeCreatorDoc(raw.doc);
  if (!doc) return null;
  const v1 = !isObj(raw.base);
  const fb = isObj(fallback.face) ? fallback.face : {};
  const slot: Omit<CreatorSlotV2, 'id'> & { id: string | null } = {
    id: sanitizeId(raw.id),
    label: sanitizeStampText(raw.label),
    body: pick(raw.body, SLOT_BODIES) ?? fallback.body ?? 'male',
    base: sanitizeLookBase(v1 ? fb : raw.base),
    doc,
  };
  const sliders = sanitizeFaceSliders(v1 && raw.sliders === undefined ? fb.sliders : raw.sliders);
  if (sliders) slot.sliders = sliders;
  const frame = sanitizeSlotFrame(raw.frame);
  if (frame) slot.frame = frame;
  const presentation = sanitizeSlotPresentation(raw.presentation);
  if (presentation) slot.presentation = presentation;
  const equipped = sanitizeSlotEquipped(raw.equipped);
  if (equipped) slot.equipped = equipped;
  return JSON.stringify(slot).length > MAX_SLOT_CHARS ? null : slot;
}

/** Up to MAX_SLOTS saved characters, every one a v2 slot with a unique id (a v1 slot or a duplicate id is given the
 *  first free `s1`…`s9`); a slot whose doc does not sanitise is dropped. */
export function sanitizeCreatorSlots(raw: unknown, fallback: SlotFallback = {}): CreatorSlotV2[] {
  if (!Array.isArray(raw)) return [];
  const kept: (Omit<CreatorSlotV2, 'id'> & { id: string | null })[] = [];
  for (const r of raw.slice(0, MAX_SLOTS * 2)) {
    if (kept.length >= MAX_SLOTS) break;
    const s = sanitizeCreatorSlot(r, fallback);
    if (s) kept.push(s);
  }
  const used = new Set<string>();
  const out: CreatorSlotV2[] = [];
  for (const s of kept) {
    let id = s.id && !used.has(s.id) ? s.id : null;
    for (let n = 1; !id; n++) if (!used.has(`s${n}`) && !kept.some((k) => k.id === `s${n}`)) id = `s${n}`;
    used.add(id);
    out.push({ ...s, id });
  }
  return out;
}

/** The look's categorical presets, for a share code: catalog names only, hexes validated. Never the sliders (a face
 *  scan writes those) and never anything else. Unknown or invalid fields are dropped. */
export type LookBase = Partial<Omit<FaceConfig, 'sliders'>>;
export function sanitizeLookBase(raw: unknown): LookBase {
  if (!isObj(raw)) return {};
  const out: LookBase = {};
  const hexes = ['skinTone', 'hairColor', 'eyeColor'] as const;
  for (const k of hexes) { const c = sanitizeHex(raw[k]); if (c) out[k] = c; }
  const named: [keyof LookBase, readonly string[]][] = [
    ['faceShape', FACE_SHAPES], ['hairStyle', HAIR_STYLES], ['eyeShape', EYE_SHAPES], ['brows', BROWS], ['mouth', MOUTHS], ['nose', NOSES],
  ];
  for (const [k, list] of named) { const v = pick(raw[k], list); if (v) out[k] = v; }
  return out;
}
