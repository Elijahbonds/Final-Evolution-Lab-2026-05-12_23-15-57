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
 * Show one hair node, hide the others. Returns the number of hair nodes
 * found (0 on the procedural body or an older GLB — a harmless no-op).
 */
export function applyHairStyle(meshes: AbstractMesh[], style: string | undefined | null): number {
  const want = hairNodeFor(style);
  let found = 0;
  for (const m of meshes) {
    const match = HAIR_RE.exec(m.name);
    if (!match) continue;
    found++;
    m.isVisible = match[1] === want;
  }
  return found;
}
