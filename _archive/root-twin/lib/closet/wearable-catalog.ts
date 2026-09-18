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
