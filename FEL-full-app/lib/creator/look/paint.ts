// Paint layers: the budget, the editor's operations and the readable names (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md
// phase 3). Pure (no Babylon): the Closet's Paint tab uses it, and every layer it makes goes through the doc's own
// sanitiser (sanitizePaintLayer), so the editor can never build what the server or the renderer would drop.
//
// THE STACK. Layers draw bottom to top in doc order (the first layer is the bottom one); the tab lists them top first,
// the way a paint program does. 24 layers (MAX_PAINT_LAYERS). A hidden layer stays in the stack and counts, it just
// draws nothing.
//
// WHERE A LAYER SITS (lib/babylon/creator/paint/bodyChart.ts): x runs across its region left to right as you look at
// it, y up it, both 0..1; scale 1 is a 12 cm stamp, 6 cm text, a 6 cm pattern repeat.

import {
  MAX_PAINT_LAYERS, PAINT_PATTERNS, PAINT_REGIONS, PAINT_STAMPS,
  type PaintLayer, type PaintPattern, type PaintRegion, type PaintStamp, type PaintSurface, type PaintType,
} from './doc';
import { sanitizePaintLayer } from './sanitize';

export const PAINT_BUDGET = MAX_PAINT_LAYERS;
export const fitsPaintBudget = (layers: readonly unknown[], extra = 1): boolean => layers.length + extra <= PAINT_BUDGET;

// ── names a player reads ─────────────────────────────────────────────────────────────────────────────────────────────

export const TYPE_LABELS: Record<PaintType, string> = { fill: 'Fill', pattern: 'Pattern', stamp: 'Stamp', text: 'Text' };

export const REGION_LABELS: Record<PaintRegion, string> = {
  all: 'Whole body', body: 'Body (below the head)', head: 'Head', face: 'Face', neck: 'Neck',
  torsoFront: 'Chest & belly', torsoBack: 'Back',
  armLeft: 'L arm', armRight: 'R arm', upperArmLeft: 'L upper arm', upperArmRight: 'R upper arm',
  forearmLeft: 'L forearm', forearmRight: 'R forearm', handLeft: 'L hand', handRight: 'R hand',
  legLeft: 'L leg', legRight: 'R leg', thighLeft: 'L thigh', thighRight: 'R thigh', shinLeft: 'L shin', shinRight: 'R shin',
  footLeft: 'L foot', footRight: 'R foot',
};

/** The region picker, grouped the way a body reads. */
export const REGION_GROUPS: readonly { label: string; regions: readonly PaintRegion[] }[] = [
  { label: 'Whole', regions: ['all', 'body'] },
  { label: 'Head', regions: ['head', 'face', 'neck'] },
  { label: 'Torso', regions: ['torsoFront', 'torsoBack'] },
  { label: 'Left arm', regions: ['armLeft', 'upperArmLeft', 'forearmLeft', 'handLeft'] },
  { label: 'Right arm', regions: ['armRight', 'upperArmRight', 'forearmRight', 'handRight'] },
  { label: 'Left leg', regions: ['legLeft', 'thighLeft', 'shinLeft', 'footLeft'] },
  { label: 'Right leg', regions: ['legRight', 'thighRight', 'shinRight', 'footRight'] },
];

export const PATTERN_LABELS: Record<PaintPattern, string> = {
  web: 'Web', radial: 'Radial lines', stripes: 'Stripes', chevrons: 'Chevrons', gradient: 'Gradient', camo: 'Camo', dots: 'Dots',
  scales: 'Scales', checks: 'Checks', carbon: 'Carbon', lines: 'Pinstripes', waves: 'Waves', hexes: 'Honeycomb',
};

export const STAMP_LABELS: Record<PaintStamp, string> = {
  circle: 'Circle', ring: 'Ring', star: 'Star', bolt: 'Bolt', triangle: 'Triangle', diamond: 'Diamond', heart: 'Heart',
  cross: 'Cross', eye: 'Eye', eyeSharp: 'Lens eye', flame: 'Flame', wing: 'Wing', tribalCurve: 'Tribal curve',
  tribalSpike: 'Tribal spike', chevron: 'Chevron', drop: 'Drop', plus: 'Plus', square: 'Square', hexagon: 'Hexagon',
  crescent: 'Crescent', arrow: 'Arrow', slash: 'Claw marks',
};

export const SURFACE_LABELS: Record<PaintSurface, string> = { skin: 'Skin', garments: 'Clothes', both: 'Skin & clothes' };

/** What each layer's one shape knob (`weight`) does, per type and pattern. */
export function weightLabel(l: Pick<PaintLayer, 'type' | 'pattern'>): string | null {
  if (l.type === 'fill') return null;
  if (l.type === 'stamp' || l.type === 'text') return 'Outline (with a 2nd colour)';
  switch (l.pattern) {
    case 'stripes': case 'chevrons': case 'waves': case 'radial': return 'Stripe width';
    case 'dots': return 'Dot size';
    case 'camo': return 'Coverage';
    case 'gradient': return 'Midpoint';
    case 'checks': return null;
    default: return 'Line weight';
  }
}

/** A one-line name for a layer in the list. */
export function layerName(l: PaintLayer): string {
  const what = l.type === 'pattern' ? PATTERN_LABELS[l.pattern!] : l.type === 'stamp' ? STAMP_LABELS[l.stamp!] : l.type === 'text' ? `“${l.text}”` : 'Fill';
  return `${what} · ${REGION_LABELS[l.region]}`;
}

// ── operations ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The first free id in `l1, l2, …`. */
export function nextLayerId(layers: readonly Pick<PaintLayer, 'id'>[]): string {
  const taken = new Set(layers.map((l) => l.id));
  for (let i = 1; ; i++) { const id = `l${i}`; if (!taken.has(id)) return id; }
}

/** Where a new layer of each type starts: something that already reads on the body. */
const START: Record<PaintType, Partial<PaintLayer>> = {
  fill: { region: 'torsoFront' },
  pattern: { region: 'torsoFront', pattern: 'stripes' },
  stamp: { region: 'torsoFront', stamp: 'star', at: { x: 0.5, y: 0.72, rot: 0, scale: 1, stretch: 1 } },
  text: { region: 'torsoBack', text: 'TEAM', at: { x: 0.5, y: 0.72, rot: 0, scale: 1, stretch: 1 } },
};

/** A new layer on top of the stack, or null at the budget. */
export function newLayer(layers: readonly PaintLayer[], type: PaintType, colours: string[], over: Partial<PaintLayer> = {}): PaintLayer | null {
  if (!fitsPaintBudget(layers)) return null;
  const raw = {
    id: nextLayerId(layers), type, surface: 'both', at: { x: 0.5, y: 0.5, rot: 0, scale: 1, stretch: 1 }, opacity: 1, mirror: false,
    ...START[type], colours, ...over,
  };
  return sanitizePaintLayer(raw);
}

/** Change layer `id` through the sanitiser (clamped, allow-listed). A change the sanitiser refuses leaves it as it was. */
export function updateLayer(layers: readonly PaintLayer[], id: string, patch: Partial<Omit<PaintLayer, 'id'>>): PaintLayer[] {
  return layers.map((l) => {
    if (l.id !== id) return l;
    const merged: Record<string, unknown> = { ...l, ...patch, at: { ...l.at, ...(patch.at ?? {}) } };
    // switching type brings the id that type needs
    if (merged.type === 'pattern' && !merged.pattern) merged.pattern = 'stripes';
    if (merged.type === 'stamp' && !merged.stamp) merged.stamp = 'star';
    if (merged.type === 'text' && !merged.text) merged.text = 'TEAM';
    if (merged.type !== 'pattern') delete merged.pattern;
    if (merged.type !== 'stamp') delete merged.stamp;
    if (merged.type !== 'text') delete merged.text;
    return sanitizePaintLayer(merged) ?? l;
  });
}

/** A copy of layer `id` just above it (shifted a little when it is placed, so it shows), or null at the budget. */
export function duplicateLayer(layers: readonly PaintLayer[], id: string): PaintLayer[] | null {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0 || !fitsPaintBudget(layers)) return null;
  const src = layers[i];
  const placed = src.type === 'stamp' || src.type === 'text';
  const copy = sanitizePaintLayer({ ...src, id: nextLayerId(layers), at: { ...src.at, x: placed ? Math.min(1, src.at.x + 0.08) : src.at.x } });
  if (!copy) return null;
  return [...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)];
}

export function removeLayer(layers: readonly PaintLayer[], id: string): PaintLayer[] {
  return layers.filter((l) => l.id !== id);
}

/** Move layer `id` up (+1, towards the top of the stack) or down (−1). */
export function moveLayer(layers: readonly PaintLayer[], id: string, dir: 1 | -1): PaintLayer[] {
  const i = layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= layers.length) return [...layers];
  const out = [...layers];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function toggleHidden(layers: readonly PaintLayer[], id: string): PaintLayer[] {
  return layers.map((l) => {
    if (l.id !== id) return l;
    const { hidden, ...rest } = l;
    return hidden ? rest : { ...rest, hidden: true };
  });
}

/**
 * Suit mode on: when nothing yet covers the body, a base fill of the body (everything below the head) goes in at the
 * bottom of the stack, so turning the suit on shows a suit and not bare skin. Returns the layers unchanged otherwise.
 */
export function suitBase(layers: readonly PaintLayer[], colour: string): PaintLayer[] {
  const covered = layers.some((l) => !l.hidden && l.type === 'fill' && (l.region === 'body' || l.region === 'all') && l.opacity >= 0.99);
  if (covered || !fitsPaintBudget(layers)) return [...layers];
  const base = sanitizePaintLayer({ id: nextLayerId(layers), type: 'fill', region: 'body', surface: 'skin', at: {}, colours: [colour], opacity: 1 });
  return base ? [base, ...layers] : [...layers];
}

/** Lists for the pickers, in the order they show. */
export const PATTERN_ORDER: readonly PaintPattern[] = PAINT_PATTERNS;
export const STAMP_ORDER: readonly PaintStamp[] = [
  'circle', 'ring', 'square', 'diamond', 'triangle', 'hexagon', 'star', 'heart', 'plus', 'cross', 'crescent', 'drop',
  'bolt', 'flame', 'wing', 'eye', 'eyeSharp', 'chevron', 'arrow', 'tribalCurve', 'tribalSpike', 'slash',
];
export const REGION_ORDER: readonly PaintRegion[] = PAINT_REGIONS;
