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
  CREATOR_DOC_VERSION, MAX_PARTS, MAX_PAINT_LAYERS, MAX_SLOTS, MAX_DOC_CHARS,
  PART_SHAPES, PART_BONES, FINISHES, PAINT_TYPES, PAINT_REGIONS, PAINT_SURFACES, PAINT_PATTERNS, PAINT_STAMPS, PAINT_BLENDS,
  COLOUR_SLOTS, SHAPE_FACE_KEYS, PROPORTION_RANGES, PROPORTION_KEYS, RANGES,
  type CreatorDoc, type CreatorPart, type PaintLayer, type CreatorSlot, type Vec3, type ColourSlot,
} from './doc';
import {
  sanitizeJersey, FACE_SHAPES, HAIR_STYLES, EYE_SHAPES, BROWS, MOUTHS, NOSES, type FaceConfig,
} from '../../closet/wearable-catalog';

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
  return Math.round(c * k) / k;
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
  return {
    id, shape, bone,
    pos: vec3(raw.pos, RANGES.partPos, 0),
    rot: vec3(raw.rot, RANGES.partRot, 0, 1),
    scale: vec3(raw.scale, RANGES.partScale, 1),
    colour,
    finish: pick(raw.finish, FINISHES) ?? 'matte',
    mirror: raw.mirror === true,
  };
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
  if (pick(raw.blend, PAINT_BLENDS) === 'multiply') layer.blend = 'multiply';
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
  const face: CreatorDoc['shape']['face'] = {};
  if (isObj(shapeRaw.face)) for (const k of SHAPE_FACE_KEYS) {
    const v = shapeRaw.face[k];
    if (typeof v === 'number' && Number.isFinite(v)) face[k] = clampNum(v, 0, 1, 0);
  }
  const body: CreatorDoc['shape']['body'] = {};
  if (isObj(shapeRaw.body)) for (const k of PROPORTION_KEYS) {
    const v = shapeRaw.body[k];
    const [lo, hi] = PROPORTION_RANGES[k];
    if (typeof v === 'number' && Number.isFinite(v)) body[k] = clampNum(v, lo, hi, 1);
  }
  const doc: CreatorDoc = {
    v: CREATOR_DOC_VERSION,
    parts: budgeted(raw.parts, MAX_PARTS, sanitizePart),
    paint: budgeted(raw.paint, MAX_PAINT_LAYERS, sanitizePaintLayer),
    colours,
    shape: { face, body },
    flags: { suit: isObj(raw.flags) && raw.flags.suit === true },
  };
  return JSON.stringify(doc).length > maxChars ? null : doc;
}

/** Up to MAX_SLOTS saved characters; a slot whose doc does not sanitise is dropped. */
export function sanitizeCreatorSlots(raw: unknown): CreatorSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: CreatorSlot[] = [];
  for (const r of raw.slice(0, MAX_SLOTS * 2)) {
    if (out.length >= MAX_SLOTS) break;
    if (!isObj(r)) continue;
    const doc = sanitizeCreatorDoc(r.doc);
    if (!doc) continue;
    out.push({ label: sanitizeStampText(r.label), doc });
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
