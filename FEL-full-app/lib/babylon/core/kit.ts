// kit — the fitted garment library on a forged body (ship pass 3, rung 3).
//
// A body built by scripts/avatar/mpfb/dress-kit.py carries EVERY garment the
// Closet sells for a slot, each as its own skinned mesh named
// `Kit_<slot>_<itemId>` with its material named `<jersey|shorts|shoes>.<itemId>`,
// so the tint slots (playerIdentity.tintSlot) keep matching by prefix. Like the
// hair styles: show the equipped one per slot, hide the rest. A body without
// kit meshes (the forge hero, roster athletes) is a harmless no-op.
import type { AbstractMesh } from '@babylonjs/core';
import { sportKitDefault } from './sportKitDefaults';
import { fixGarment, syncGarmentVisibility } from './garmentFixes';

export type KitSlot = 'tops' | 'shorts' | 'shoes';
export const KIT_SLOTS: readonly KitSlot[] = ['tops', 'shorts', 'shoes'];
export type Wardrobe = Partial<Record<KitSlot, string | null>>;

// A garment mesh is `Kit_<slot>_<itemId>`; the identity layer's per-mesh clones append `_c<n>` (PACK THE FIVE #1/#4,
// 2026-09-04: with the suffix unparsed every slot fell back to its FIRST garment — top_bonds and shoes_evo showed,
// tinted in the starters' colours, while top_lab and shoes_flight stayed hidden). The suffix is optional here.
const KIT_RE = /^Kit_(tops|shorts|shoes)_([A-Za-z0-9_-]+)/;
const CLONE_SUFFIX = /_c\d+(?![A-Za-z0-9])/;   // `Kit_tops_top_lab_c31` → `Kit_tops_top_lab`

/** Parse a kit mesh name; null for anything else. */
export function kitOf(meshName: string): { slot: KitSlot; itemId: string } | null {
  const m = KIT_RE.exec(meshName.replace(CLONE_SUFFIX, '')); return m ? { slot: m[1] as KitSlot, itemId: m[2] } : null;
}

/** The mode the harness stamped on the scene these meshes live in (ModeHarness: `scene.metadata.felModeId`). */
function sceneModeId(meshes: AbstractMesh[]): string | undefined {
  for (const m of meshes) {
    const scene = typeof m.getScene === 'function' ? m.getScene() : null;
    if (scene) return (scene.metadata as { felModeId?: string } | undefined)?.felModeId;
  }
  return undefined;
}

/**
 * Show the equipped garment per slot and hide the others. Owner decision 2026-09-05 ("Per-sport defaults"): a Closet
 * pick always wins; a slot the Closet left empty (or every slot when no Closet answered — guests, the dev harness,
 * rivals on the kit body) takes the SPORT's default (sportKitDefaults.ts, by the scene's mode); an item the body does
 * not carry falls to the sport default too, then to the slot's first garment so nobody plays naked. The shown garment
 * gets its runtime read fixes (garmentFixes.ts). Returns kit meshes found (0 = no kit).
 */
export function applyKit(meshes: AbstractMesh[], wardrobe: Wardrobe | null | undefined, modeId: string | null = null): number {
  const bySlot = new Map<KitSlot, AbstractMesh[]>();
  for (const m of meshes) { const k = kitOf(m.name); if (!k) continue; (bySlot.get(k.slot) ?? bySlot.set(k.slot, []).get(k.slot)!).push(m); }
  if (!bySlot.size) return 0;
  const sport = sportKitDefault(modeId ?? sceneModeId(meshes));
  let found = 0;
  for (const [slot, list] of bySlot) {
    const byId = (id: string | null | undefined) => (id ? list.find((m) => kitOf(m.name)!.itemId === id) : undefined);
    const show = byId(wardrobe?.[slot]) ?? byId(sport[slot]) ?? list[0];
    for (const m of list) { m.isVisible = m === show; found++; syncGarmentVisibility(m); }
    fixGarment(show, slot, kitOf(show.name)!.itemId);
  }
  return found;
}
