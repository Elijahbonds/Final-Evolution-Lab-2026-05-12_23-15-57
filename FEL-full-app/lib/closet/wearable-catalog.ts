/**
 * lib/closet/wearable-catalog.ts
 * ==============================
 * PURE catalog for The Closet. Inclusive face-option ranges are a hard product
 * requirement. Wearables are cosmetic only (no pay-to-win) and bought with
 * COINS. Creator-card skins are applied here but never *bought* here.
 */

export interface FaceConfig {
  skinTone: string;      // hex
  faceShape: string;
  hairStyle: string;
  hairColor: string;     // hex
  eyeShape: string;
  eyeColor: string;      // hex
  brows: string;
  mouth: string;
  nose: string;
  /** Phase 3 fine-tune: forge morph weights 0..1 keyed by morph name
   *  (faceLong, faceRound, faceSquare, faceHeart, faceDiamond, jawOpen,
   *  browRaise). Optional — a preset-only face is still a full face. */
  sliders?: Partial<Record<string, number>>;
}

// 12+ skin swatches spanning the full inclusive range (hard acceptance item).
export const SKIN_TONES: string[] = [
  '#FBE7D3', '#F3D2B3', '#E7B98F', '#D9A066', '#C68642', '#A9713C',
  '#8D5524', '#6F4321', '#5A351A', '#432818', '#33200F', '#241509',
];

export const FACE_SHAPES = ['Oval', 'Round', 'Square', 'Heart', 'Diamond', 'Long'];
// Textured / protective / cultural styles included by design.
export const HAIR_STYLES = [
  'Afro', 'Box Braids', 'Locs', 'Cornrows', 'Fade', 'Waves', 'Curly',
  'Straight', 'Wavy', 'Buzz', 'Cropped', 'Bun', 'Ponytail', 'Bald', 'Hijab',
];
export const HAIR_COLORS = ['#0B0B0B', '#2B1B0E', '#5A351A', '#8D5524', '#C68642', '#E4C590', '#B0B0B0', '#00E5FF', '#A855F7', '#FF3366'];
export const EYE_SHAPES = ['Almond', 'Round', 'Monolid', 'Hooded', 'Upturned', 'Downturned', 'Wide'];
export const EYE_COLORS = ['#3B2A1A', '#5A3B1A', '#7A5230', '#4A6B4A', '#3A5A7A', '#6B6B6B', '#00E5FF'];
export const BROWS = ['Natural', 'Arched', 'Straight', 'Thick', 'Thin', 'Bold'];
export const MOUTHS = ['Neutral', 'Full', 'Wide', 'Soft', 'Defined'];
export const NOSES = ['Straight', 'Rounded', 'Wide', 'Narrow', 'Button', 'Aquiline'];

/** Forge morph names the sliders may carry — anything else is dropped. */
export const FACE_SLIDER_KEYS = ['faceLong', 'faceRound', 'faceSquare', 'faceHeart', 'faceDiamond', 'jawOpen', 'browRaise'] as const;

/** Clamp every slider to 0..1 and drop unknown keys / non-numbers. Returns
 *  undefined when nothing survives so a preset-only face stays compact. */
export function sanitizeFaceSliders(input: unknown): Partial<Record<string, number>> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: Partial<Record<string, number>> = {};
  for (const k of FACE_SLIDER_KEYS) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const c = Math.max(0, Math.min(1, v));
    if (c > 0) out[k] = Math.round(c * 1000) / 1000;
  }
  return Object.keys(out).length ? out : undefined;
}

export function defaultFace(): FaceConfig {
  return {
    skinTone: SKIN_TONES[4], faceShape: 'Oval', hairStyle: 'Fade', hairColor: HAIR_COLORS[0],
    eyeShape: 'Almond', eyeColor: EYE_COLORS[0], brows: 'Natural', mouth: 'Neutral', nose: 'Straight',
  };
}

export type WearableSlot = 'headwear' | 'tops' | 'shorts' | 'shoes' | 'accessory';
export interface Wearable { itemId: string; slot: WearableSlot; name: string; coinPrice: number; accent: string }

// TUNE(elijah) — cosmetic catalog + coin pricing.
export const WEARABLES: Wearable[] = [
  { itemId: 'cap_nexus', slot: 'headwear', name: 'Nexus Visor', coinPrice: 300, accent: '#00E5FF' },
  { itemId: 'band_flow', slot: 'headwear', name: 'Flow Headband', coinPrice: 150, accent: '#00FF9D' },
  { itemId: 'top_lab', slot: 'tops', name: 'Lab Compression Tee', coinPrice: 400, accent: '#A855F7' },
  { itemId: 'top_bonds', slot: 'tops', name: 'Bonds Signature Jersey', coinPrice: 700, accent: '#FFD700' },
  // owner 2026-09-05: the first Meshy garment skinned to the rig (kit pack public/models/kits/top_baseball.glb) — the baseball default
  { itemId: 'top_baseball', slot: 'tops', name: 'Diamond Club Jersey', coinPrice: 650, accent: '#1E3A8A' },
  { itemId: 'shorts_court', slot: 'shorts', name: 'Court Shorts', coinPrice: 350, accent: '#00E5FF' },
  { itemId: 'shorts_glitch', slot: 'shorts', name: 'Glitch Shorts', coinPrice: 500, accent: '#FF3366' },
  { itemId: 'shoes_evo', slot: 'shoes', name: 'Evolution Hi-Tops', coinPrice: 800, accent: '#00E5FF' },
  { itemId: 'shoes_flight', slot: 'shoes', name: 'Flight Trainers', coinPrice: 600, accent: '#A855F7' },
  { itemId: 'acc_chain', slot: 'accessory', name: 'Shard Chain', coinPrice: 450, accent: '#C79BFF' },
  { itemId: 'acc_sleeve', slot: 'accessory', name: 'Power Sleeve', coinPrice: 200, accent: '#FF3366' },
];

export const SLOTS: WearableSlot[] = ['headwear', 'tops', 'shorts', 'shoes', 'accessory'];

export function getWearable(itemId: string): Wearable | null {
  return WEARABLES.find((w) => w.itemId === itemId) ?? null;
}
export function wearablesForSlot(slot: WearableSlot): Wearable[] {
  return WEARABLES.filter((w) => w.slot === slot);
}
export function defaultEquipped(): Record<WearableSlot, string | null> {
  return { headwear: null, tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight', accessory: null };
}

/** Jersey ID — the number + name plate rendered on the hero's back in-game. */
export interface JerseyConfig { number: number; name: string }

export function defaultJersey(): JerseyConfig {
  return { number: 0, name: '' };
}

/** Server + client share this: clamp the number to 0–99, name to 12
 *  A–Z/0–9/space/hyphen characters, uppercased. Never throws. */
export function sanitizeJersey(input: unknown): JerseyConfig {
  const raw = (input ?? {}) as Partial<Record<keyof JerseyConfig, unknown>>;
  const n = Number(raw.number);
  const number = Number.isFinite(n) ? Math.min(99, Math.max(0, Math.round(n))) : 0;
  const name = String(raw.name ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 \-]/g, '')
    .slice(0, 12)
    .trim();
  return { number, name };
}
