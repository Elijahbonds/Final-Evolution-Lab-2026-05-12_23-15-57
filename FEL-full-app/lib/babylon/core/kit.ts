// kit — the fitted garment library on a forged body (ship pass 3, rung 3).
//
// A body built by scripts/avatar/mpfb/dress-kit.py carries EVERY garment the
// Closet sells for a slot, each as its own skinned mesh named
// `Kit_<slot>_<itemId>` with its material named `<jersey|shorts|shoes>.<itemId>`,
// so the tint slots (playerIdentity.tintSlot) keep matching by prefix. Like the
// hair styles: show the equipped one per slot, hide the rest. A body without
// kit meshes (the forge hero, roster athletes) is a harmless no-op.
import type { AbstractMesh } from '@babylonjs/core';

export type KitSlot = 'tops' | 'shorts' | 'shoes';
export const KIT_SLOTS: readonly KitSlot[] = ['tops', 'shorts', 'shoes'];
export type Wardrobe = Partial<Record<KitSlot, string | null>>;

const KIT_RE = /^Kit_(tops|shorts|shoes)_([A-Za-z0-9_-]+)/;

/** Parse a kit mesh name; null for anything else. */
export function kitOf(meshName: string): { slot: KitSlot; itemId: string } | null {
  const m = KIT_RE.exec(meshName); return m ? { slot: m[1] as KitSlot, itemId: m[2] } : null;
}

/**
 * Show the equipped garment per slot and hide the others. A slot with no
 * equipped item (or an item the body does not carry) shows the slot's first
 * garment so nobody plays naked. Returns kit meshes found (0 = no kit).
 */
export function applyKit(meshes: AbstractMesh[], wardrobe: Wardrobe | null | undefined): number {
  const bySlot = new Map<KitSlot, AbstractMesh[]>();
  for (const m of meshes) { const k = kitOf(m.name); if (!k) continue; (bySlot.get(k.slot) ?? bySlot.set(k.slot, []).get(k.slot)!).push(m); }
  let found = 0;
  for (const [slot, list] of bySlot) {
    const want = wardrobe?.[slot] ?? null;
    const has = want ? list.find((m) => kitOf(m.name)!.itemId === want) : undefined;
    const show = has ?? list[0];
    for (const m of list) { m.isVisible = m === show; found++; }
  }
  return found;
}
