// hairStyles — the Closet's HAIR_STYLES → the forge's Hair_<key> nodes.
//
// Phase 3 (ship pass 2026-09-02). The forge bakes every style into the hero
// as its own skinned node (scripts/avatar/forge.mts): Hair_cap, Hair_afro,
// Hair_buzz, Hair_bun, Hair_ponytail, Hair_braids, Hair_hijab. Exactly one is
// shown; the rest are hidden. Bald shows none. The brows are NOT a hair node
// and are never touched here. Pure mapping + a mesh visibility pass.

import type { AbstractMesh } from '@babylonjs/core';

export type HairNodeKey = 'cap' | 'afro' | 'buzz' | 'bun' | 'ponytail' | 'braids' | 'hijab';
export const HAIR_NODE_KEYS: readonly HairNodeKey[] = ['cap', 'afro', 'buzz', 'bun', 'ponytail', 'braids', 'hijab'];
export const DEFAULT_HAIR_STYLE = 'Straight';

/** Catalog style (lib/closet/wearable-catalog.ts HAIR_STYLES) → node key. */
export const HAIR_STYLE_NODE: Record<string, HairNodeKey | null> = {
  'Afro': 'afro',
  'Box Braids': 'braids', 'Locs': 'braids', 'Cornrows': 'braids',
  'Fade': 'buzz', 'Buzz': 'buzz', 'Cropped': 'buzz', 'Waves': 'buzz',
  'Curly': 'cap', 'Straight': 'cap', 'Wavy': 'cap',
  'Bun': 'bun', 'Ponytail': 'ponytail',
  'Hijab': 'hijab',
  'Bald': null,
  // 2026-10-07 (the hair expansion): every style is code-built on a kit body (lib/babylon/creator/hair/renderHair hides
  // these nodes wherever it fits the head). On a body it cannot fit, a new style shows its nearest baked node, never none.
  'Twists': 'braids', 'Bantu Knots': 'bun', 'Afro Puffs': 'afro', 'Durag': 'buzz', 'Headwrap': 'bun',
  'High-Top Fade': 'afro', 'Taper': 'buzz', 'Drop Fade': 'buzz', 'Mohawk': 'buzz', 'Frohawk': 'buzz',
  'Long Layered': 'cap', 'Bob': 'cap', 'Top Knot': 'bun', 'Space Buns': 'bun', 'Pigtails': 'ponytail', 'Braided Ponytail': 'braids',
  'Spiky': 'buzz', 'Swept': 'cap', 'Mullet': 'cap', 'Streaks': 'cap',
};

/** Node key → a representative catalog style (for roster athletes baked with a node key). */
export const HAIR_KEY_TO_STYLE: Record<string, string> = {
  cap: 'Straight', afro: 'Afro', buzz: 'Buzz', bun: 'Bun', ponytail: 'Ponytail', braids: 'Box Braids', hijab: 'Hijab',
};

/** Resolve a style name to a node key; unknown names fall back to the cap. */
export function hairNodeFor(style: string | undefined | null): HairNodeKey | null {
  if (style == null) return 'cap';
  return style in HAIR_STYLE_NODE ? HAIR_STYLE_NODE[style] : 'cap';
}

const HAIR_RE = /^Hair_([a-z]+)/;

/**
 * IMPROVE (2026-10-06), research item 3 / BACKLOG B19: a style whose node a body does not carry falls back to a
 * covering node instead of showing NO hair. `Hair_hijab` is missing from fel-kit-male/female.glb and fel-hero.glb (read
 * 2026-10-06: Hair_afro/braids/bun/buzz/cap/ponytail only), so "Hijab" rendered bald, the opposite of a covering. The
 * cap covers the crown until a hijab mesh is baked; it then wins by name with no code change.
 */
export const HAIR_NODE_FALLBACK: Partial<Record<HairNodeKey, readonly HairNodeKey[]>> = { hijab: ['cap'] };

/**
 * Show one hair node, hide the others. Returns the number of hair nodes
 * found (0 on the procedural body or an older GLB — a harmless no-op).
 */
export function applyHairStyle(meshes: AbstractMesh[], style: string | undefined | null): number {
  let want = hairNodeFor(style);
  const present = new Set<string>();
  for (const m of meshes) { const match = HAIR_RE.exec(m.name); if (match) present.add(match[1]); }
  if (want && present.size && !present.has(want)) want = HAIR_NODE_FALLBACK[want]?.find((k) => present.has(k)) ?? want;
  let found = 0;
  for (const m of meshes) {
    const match = HAIR_RE.exec(m.name);
    if (!match) continue;
    found++;
    m.isVisible = match[1] === want;
  }
  return found;
}
