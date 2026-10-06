// CODE-BUILT CLOTHES — the pure half (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e; owner: "You should be able to change
// their clothing too."). No Babylon: the Clothing tab and the renderer (lib/babylon/creator/clothes) both read it, so the
// editor can never offer a piece the renderer would then drop, and every number a cut is made at lives here, testable.
//
// WHAT A PIECE IS (doc.ts CreatorCloth): a kind (top, bottom, gloves, feet), a style (a set of defaults), a colour, and
// options — sleeve, hem, neckline, hood, an open front, leg length, rise, waistband, flare, cuff, shaft height, fit, and a
// second colour with where it goes. The renderer builds it from the kit body's own triangles (lib/babylon/creator/clothes
// /build.ts), so the numbers below are measured against the body: fractions of the arm, the torso and the leg, read off
// the body itself, never absolute heights (the female kit's skeleton is not the male's).
//
// SHIP TOOLS, NOT CHARACTERS: these are generic garments (a tee, a hoodie, a skirt). No preset, logo or named outfit.
// FREE: every piece, colour and paint here costs nothing; the coin store keeps its special items (lib/closet).

import {
  CLOTH_KINDS, CLOTH_KIT_SLOT, CLOTH_STYLES, CLOTH_STYLE_DEFAULTS, MAX_CLOTHES, MAX_CLOTHES_PER_KIND,
  type ClothCuff, type ClothHem, type ClothHood, type ClothKind, type ClothLeg, type ClothNeck, type ClothRise, type ClothShaft,
  type ClothSleeve, type ClothStyle, type ClothTone, type CreatorCloth,
} from './doc';
import { sanitizeCloth, sanitizeClothes } from './sanitize';

// ── a piece with every default filled in ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedCloth {
  id: string; kind: ClothKind; style: ClothStyle; colour: string; fit: number;
  sleeve: ClothSleeve; hem: ClothHem; neck: ClothNeck; hood: ClothHood; open: number;
  leg: ClothLeg; rise: ClothRise; waistband: boolean; flare: number;
  cuff: ClothCuff; shaft: ClothShaft;
  colour2: string | null; tone: ClothTone;
}

/** A piece with its style's defaults filled in (what the renderer builds from). */
export function resolveCloth(c: CreatorCloth): ResolvedCloth {
  const d = CLOTH_STYLE_DEFAULTS[c.style];
  return {
    id: c.id, kind: c.kind, style: c.style, colour: c.colour, fit: c.fit ?? d.fit,
    sleeve: c.sleeve ?? d.sleeve ?? 'none', hem: c.hem ?? d.hem ?? 'hip', neck: c.neck ?? d.neck ?? 'crew', hood: c.hood ?? d.hood ?? 'none',
    open: c.open ?? d.open ?? 0, leg: c.leg ?? d.leg ?? 'ankle', rise: c.rise ?? d.rise ?? 'mid', waistband: c.waistband ?? d.waistband ?? false,
    flare: c.flare ?? d.flare ?? 0, cuff: c.cuff ?? d.cuff ?? 'wrist', shaft: c.shaft ?? d.shaft ?? 'low',
    colour2: c.colour2 ?? null, tone: c.tone ?? d.tone,
  };
}

/** The kit slots a doc's clothes replace (a built top hides the kit top, and so on; gloves replace nothing). */
export function clothKitSlots(clothes: readonly Pick<CreatorCloth, 'kind'>[] | null | undefined): Set<'tops' | 'shorts' | 'shoes'> {
  const out = new Set<'tops' | 'shorts' | 'shoes'>();
  for (const c of clothes ?? []) { const s = CLOTH_KIT_SLOT[c.kind]; if (s) out.add(s); }
  return out;
}

/** A top whose hood is up (the renderer hides the hair under it). */
export const hoodUp = (clothes: readonly CreatorCloth[] | null | undefined): boolean =>
  (clothes ?? []).some((c) => c.kind === 'top' && resolveCloth(c).hood === 'up');

// ── where each cut is made, against the body's own measurements ─────────────────────────────────────────────────────

/** How far down the arm (metres from the shoulder joint, along the arm towards the hand) a sleeve reaches: a fraction of
 *  the arm (shoulder joint → wrist joint) plus a fraction of the hand (wrist → fingertip). `none` cuts just inside the
 *  shoulder joint (an armhole). TUNED (phase 4e, first guesses): cap 12 %, short 30 % (above the middle of the upper
 *  arm), elbow 55 %, three-quarter 78 %, long to the wrist and 4 % of the hand over it, knuckles 40 % of the hand. */
export const SLEEVE_REACH: Record<ClothSleeve, { arm: number; hand: number }> = {
  none: { arm: -0.06, hand: 0 }, cap: { arm: 0.12, hand: 0 }, short: { arm: 0.3, hand: 0 }, elbow: { arm: 0.55, hand: 0 },
  threeQuarter: { arm: 0.78, hand: 0 }, long: { arm: 1, hand: 0.04 }, knuckles: { arm: 1, hand: 0.4 },
};
export function sleeveReach(sleeve: ClothSleeve, armLength: number, handLength: number): number {
  const r = SLEEVE_REACH[sleeve];
  return r.arm * armLength + r.hand * handLength;
}

/** The body's heights a cut is measured against (metres along the body's up, skeleton space at rest). */
export interface BodyHeights {
  /** the bottom of the torso between the legs */
  crotch: number;
  /** the top of the torso (the base of the neck at the back) */
  torsoTop: number;
  /** the knee (the top of the shin) */
  knee: number;
  /** the ankle joint */
  ankle: number;
}

/** A top's hem as a fraction of the torso above the crotch. TUNED (phase 4e): crop 60 % (above the navel), waist 42 %,
 *  hip 12 % (over the hips, just above the crotch). Below the hip the coat hangs as one tube (hemDrop). */
export const HEM_FRACTION: Record<'crop' | 'waist' | 'hip', number> = { crop: 0.6, waist: 0.42, hip: 0.12 };
/** Where a top's torso part ends, and — for a long coat — how far below it the coat's tube hangs. */
export function hemHeights(hem: ClothHem, h: BodyHeights): { torso: number; tube: number | null } {
  const span = h.torsoTop - h.crotch;
  if (hem === 'crop' || hem === 'waist' || hem === 'hip') return { torso: h.crotch + HEM_FRACTION[hem] * span, tube: null };
  // a long coat: the torso part over the hips, then a tube to mid-thigh or just below the knee
  const tube = hem === 'thigh' ? h.crotch - 0.5 * (h.crotch - h.knee) : h.knee - 0.02;
  return { torso: h.crotch + HEM_FRACTION.hip * span, tube };
}

/** A bottom's leg length, as a fraction of the crotch → ankle drop. TUNED (phase 4e): brief 10 %, short 30 %, knee 50 %
 *  (just below the knee), capri 75 % (mid-calf, lower), ankle 100 %. */
export const LEG_FRACTION: Record<ClothLeg, number> = { brief: 0.1, short: 0.3, knee: 0.5, capri: 0.75, ankle: 1 };
export function legCutHeight(leg: ClothLeg, h: BodyHeights): number {
  return h.crotch - LEG_FRACTION[leg] * (h.crotch - h.ankle) + (leg === 'ankle' ? 0.012 : 0);
}

/** Where a bottom's waist sits, as a fraction of the torso above the crotch. TUNED (phase 4e): low 18 %, mid 30 %, high 45 %. */
export const RISE_FRACTION: Record<ClothRise, number> = { low: 0.18, mid: 0.3, high: 0.45 };
export function riseHeight(rise: ClothRise, h: BodyHeights): number {
  return h.crotch + RISE_FRACTION[rise] * (h.torsoTop - h.crotch);
}

/** Footwear's top edge. TUNED (phase 4e): a low shoe just under the ankle joint, ankle 5 cm above it, mid-calf half way
 *  to the knee, a knee boot 3 cm under the knee. */
export function shaftHeight(shaft: ClothShaft, h: BodyHeights): number {
  switch (shaft) {
    case 'low': return h.ankle - 0.004;
    case 'ankle': return h.ankle + 0.05;
    case 'mid': return h.ankle + 0.5 * (h.knee - h.ankle);
    default: return h.knee - 0.03;
  }
}

/** A glove's cuff starts this far back from the wrist joint (metres along the arm): just past the wrist, or a gauntlet up
 *  the forearm. A fingerless glove ends at the knuckles (FINGERLESS_HAND of the hand past the wrist). */
export const CUFF_BACK: Record<ClothCuff, number> = { wrist: 0.03, gauntlet: 0.14 };
export const FINGERLESS_HAND = 0.42;

// ── how far out a piece sits ─────────────────────────────────────────────────────────────────────────────────────────

/** Fit 0 → 1 maps to this distance off the skin (metres), per kind. TUNED (phase 4e): 3 mm (skin-tight) to 3 cm (loose)
 *  for tops and bottoms; gloves 2–9 mm; footwear 5–16 mm. A jacket sits 4 mm further ("a little thicker"). */
export const FIT_OFFSET: Record<ClothKind, [number, number]> = { top: [0.003, 0.03], bottom: [0.003, 0.03], gloves: [0.002, 0.009], feet: [0.005, 0.016] };
export const JACKET_EXTRA = 0.004;
/** Each layer sits at least this much further out than the layer under it wherever they overlap, so nothing z-fights. */
export const LAYER_GAP = 0.006;
export function fitOffset(c: Pick<ResolvedCloth, 'kind' | 'style' | 'fit'>): number {
  const [lo, hi] = FIT_OFFSET[c.kind];
  return lo + Math.min(1, Math.max(0, c.fit)) * (hi - lo) + (c.style === 'jacket' ? JACKET_EXTRA : 0);
}
/** A layer's offset where it lies over another: its own, or the one under it plus the gap, whichever is further out. */
export const layerOffset = (own: number, under: number): number => Math.max(own, under > 0 ? under + LAYER_GAP : 0);

// ── the editor's operations ──────────────────────────────────────────────────────────────────────────────────────────

/** True when one more piece of this kind fits the budgets. */
export function canAddCloth(list: readonly CreatorCloth[], kind: ClothKind): boolean {
  return list.length < MAX_CLOTHES && list.filter((c) => c.kind === kind).length < MAX_CLOTHES_PER_KIND[kind];
}

function freeId(list: readonly { id: string }[]): string {
  const used = new Set(list.map((c) => c.id));
  for (let n = 1; ; n++) if (!used.has(`c${n}`)) return `c${n}`;
}

/** A new piece of `style`, placed where it is usually worn: a bottom and gloves go under the first top (a top is worn
 *  over the waistband, untucked, and a sleeve over a glove's cuff), anything else on the outside (footwear over a trouser
 *  leg; reorder for the other way). Null when the budget is full. Returns the new list and the piece. */
export function addCloth(list: readonly CreatorCloth[], style: ClothStyle, colour: string, extra: Partial<CreatorCloth> = {}): { list: CreatorCloth[]; piece: CreatorCloth } | null {
  const kind = CLOTH_KINDS.find((k) => (CLOTH_STYLES[k] as readonly string[]).includes(style));
  if (!kind || !canAddCloth(list, kind)) return null;
  const piece = sanitizeCloth({ ...extra, id: freeId(list), kind, style, colour });
  if (!piece) return null;
  const next = [...list];
  const firstTop = next.findIndex((c) => c.kind === 'top');
  if ((kind === 'bottom' || kind === 'gloves') && firstTop >= 0) next.splice(firstTop, 0, piece); else next.push(piece);
  return { list: next, piece };
}

/** Change a piece (re-sanitised, so a style change takes the new style's defaults for every option left untouched). */
export function updateCloth(list: readonly CreatorCloth[], id: string, patch: Partial<Omit<CreatorCloth, 'id' | 'kind'>>): CreatorCloth[] {
  return list.map((c) => {
    if (c.id !== id) return c;
    const next = sanitizeCloth({ ...c, ...patch, id: c.id, kind: c.kind });
    return next ?? c;
  });
}

export const removeCloth = (list: readonly CreatorCloth[], id: string): CreatorCloth[] => list.filter((c) => c.id !== id);

/** Move a piece one layer in (−1) or out (+1). */
export function moveCloth(list: readonly CreatorCloth[], id: string, dir: -1 | 1): CreatorCloth[] {
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ── names a player reads ─────────────────────────────────────────────────────────────────────────────────────────────

export const CLOTH_KIND_LABELS: Record<ClothKind, string> = { top: 'Tops', bottom: 'Bottoms', gloves: 'Gloves', feet: 'Footwear' };
export const CLOTH_STYLE_LABELS: Record<ClothStyle, string> = {
  tank: 'Tank', tee: 'Tee', longsleeve: 'Long sleeve', hoodie: 'Hoodie', jacket: 'Jacket', highneck: 'High neck',
  shorts: 'Shorts', capris: 'Capris', pants: 'Pants', leggings: 'Leggings', skirt: 'Skirt',
  gloves: 'Gloves', fingerless: 'Fingerless', shoes: 'Shoes', boots: 'Boots',
};
export const SLEEVE_LABELS: Record<ClothSleeve, string> = { none: 'None', cap: 'Cap', short: 'Short', elbow: 'Elbow', threeQuarter: '¾', long: 'Long', knuckles: 'Knuckles' };
export const HEM_LABELS: Record<ClothHem, string> = { crop: 'Crop', waist: 'Waist', hip: 'Hip', thigh: 'Thigh coat', knee: 'Knee coat' };
export const NECK_LABELS: Record<ClothNeck, string> = { crew: 'Crew', scoop: 'Scoop', v: 'V', high: 'High', collar: 'Collar' };
export const HOOD_LABELS: Record<ClothHood, string> = { none: 'No hood', down: 'Hood down', up: 'Hood up' };
export const LEG_LABELS: Record<ClothLeg, string> = { brief: 'Brief', short: 'Short', knee: 'Knee', capri: 'Capri', ankle: 'Ankle' };
export const RISE_LABELS: Record<ClothRise, string> = { low: 'Low', mid: 'Mid', high: 'High' };
export const CUFF_LABELS: Record<ClothCuff, string> = { wrist: 'Wrist', gauntlet: 'Gauntlet' };
export const SHAFT_LABELS: Record<ClothShaft, string> = { low: 'Low', ankle: 'Ankle', mid: 'Mid-calf', knee: 'Knee' };
export const CLOTH_TONE_LABELS: Record<ClothTone, string> = { trim: 'Trim', sleeves: 'Sleeves', split: 'Half', yoke: 'Shoulders', stripe: 'Side stripe', sole: 'Sole' };

/** A piece as a player reads it ("Hoodie", "Pants", "Boots · knee"). */
export function clothLabel(c: CreatorCloth): string {
  const r = resolveCloth(c);
  if (c.kind === 'top' && (r.hem === 'thigh' || r.hem === 'knee')) return `${CLOTH_STYLE_LABELS[c.style]} · ${HEM_LABELS[r.hem].toLowerCase()}`;
  if (c.kind === 'feet' && c.shaft) return `${CLOTH_STYLE_LABELS[c.style]} · ${SHAFT_LABELS[r.shaft].toLowerCase()}`;
  return CLOTH_STYLE_LABELS[c.style];
}

// ── randomise, with a lock per kind ──────────────────────────────────────────────────────────────────────────────────

const pickFrom = <T>(list: readonly T[], rnd: () => number): T => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
function hsvHex(h: number, s: number, v: number): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  const to = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`.toUpperCase();
}

/** Roll the clothes of every UNLOCKED kind (a locked kind keeps exactly what it had, in place): each kind gets nothing or
 *  one piece of a random style and options, in colours from one hue family (a loud piece, a quiet one, a neutral), the
 *  same idea as randomise.ts' kit colourways. Pure: `rnd` is the random source. */
export function randomiseClothes(list: readonly CreatorCloth[], locks: readonly ClothKind[], rnd: () => number): CreatorCloth[] {
  const hue = rnd() * 360;
  const loud = hsvHex(hue, 0.55 + rnd() * 0.35, 0.55 + rnd() * 0.4);
  const quiet = hsvHex((hue + 180 + (rnd() - 0.5) * 60) % 360, 0.25 + rnd() * 0.3, 0.18 + rnd() * 0.3);
  const neutral = pickFrom(['#F2EEE6', '#1A1A1A', '#3A3A38', '#C8CDD6'], rnd);
  let out = list.filter((c) => locks.includes(c.kind));
  const roll = (kind: ClothKind, chance: number, colour: string, extra: (style: ClothStyle) => Partial<CreatorCloth>) => {
    if (locks.includes(kind) || rnd() > chance) return;
    const style = pickFrom(CLOTH_STYLES[kind], rnd) as ClothStyle;
    const r = addCloth(out, style, colour, { fit: Math.round(rnd() * 100) / 100, ...extra(style) });
    if (r) out = r.list;
  };
  roll('bottom', 0.9, quiet, () => (rnd() < 0.3 ? { colour2: loud, tone: 'stripe' } : {}));
  roll('top', 0.95, loud, () => ({
    sleeve: pickFrom(['none', 'short', 'elbow', 'long', 'long'] as const, rnd),
    hem: pickFrom(['crop', 'waist', 'hip', 'hip', 'hip', 'thigh'] as const, rnd),
    ...(rnd() < 0.35 ? { colour2: neutral, tone: pickFrom(['trim', 'sleeves', 'yoke'] as const, rnd) } : {}),
  }));
  roll('feet', 0.85, neutral === '#F2EEE6' ? '#1A1A1A' : neutral, () => ({ colour2: '#F2EEE6', shaft: pickFrom(['low', 'ankle', 'mid', 'knee'] as const, rnd) }));
  roll('gloves', 0.2, quiet, () => ({}));
  return sanitizeClothes(out);
}
