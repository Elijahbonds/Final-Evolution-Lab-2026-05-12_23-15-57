// The PLAYER's accessories: what they equipped, not a seeded deal (IMPROVE (2026-10-06), research item 2).
//
// NPCs and rivals keep CharacterLibrary's seeded `lookFor` deal. The player's set is applied by the identity pipe
// (applyIdentity), so every caller that dresses the player — the library's own spawn, CharacterPipeline.spawnPlayer and
// both editor previews — shows the same thing, and a live editor can change it.
//
// One set per body: re-applying the same set is a no-op, a different set disposes the old one first, and the body's
// root disposing takes the set (and its materials) with it. A spawn that opted out of accessories (`accessories: false`,
// e.g. Brain Brawl's contestants) stays bare.

import { Color3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { attachAccessories, type AccessoryId, type Side } from './accessories';

const optedOut = new WeakSet<TransformNode>();
const worn = new WeakMap<TransformNode, { sig: string; dispose(): void }>();
const hooked = new WeakSet<TransformNode>();

/**
 * True when CharacterLibrary must NOT deal this spawn the seeded NPC set, because the identity pipe hangs the player's
 * own. That is a player body (not a roster pick) with no look, name, tint or skin tone of its own: exactly the spawns
 * applyIdentity dresses (the library's own identity step, CharacterPipeline.spawnPlayer and both editor previews, which
 * pass `identity: false` and apply it themselves). Every other spawn keeps the deal.
 */
export function playerWearsOwnAccessories(
  role: 'player' | 'opponent',
  rosterPicked: boolean,
  opts: { look?: unknown; name?: unknown; tint?: unknown; skinTone?: unknown },
): boolean {
  return role === 'player' && !rosterPicked && opts.look == null && opts.name == null && opts.tint == null && opts.skinTone == null;
}

/** Called by CharacterLibrary for `accessories: false`: the identity pipe will not hang the player's set either. */
export function optOutAccessories(root: TransformNode): void { optedOut.add(root); }

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Hang `items` on this body (replacing any set the identity pipe hung before). Returns how many items were asked for. */
export function wearPlayerAccessories(
  spawn: { root: TransformNode; skeleton: Skeleton },
  items: readonly AccessoryId[],
  accentHex: string,
  side: Side = 'Right',
): number {
  const root = spawn.root;
  if (optedOut.has(root) || root.isDisposed()) return 0;
  const accent = HEX.test(accentHex) ? accentHex.toUpperCase() : '#FFD700';
  const sig = `${items.join(',')}|${accent}|${side}`;
  const prev = worn.get(root);
  if (prev?.sig === sig) return items.length;
  prev?.dispose();
  worn.delete(root);
  if (!items.length) return 0;
  const dispose = attachAccessories(root.getScene(), spawn.skeleton, root, { items, accent: Color3.FromHexString(accent), side }, `acc_player_${root.uniqueId}`);
  if (!hooked.has(root)) { hooked.add(root); root.onDisposeObservable.addOnce(() => { worn.get(root)?.dispose(); worn.delete(root); }); }
  worn.set(root, { sig, dispose });
  return items.length;
}
