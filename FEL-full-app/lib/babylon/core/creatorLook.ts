// THE CREATOR HOOK — the one place a CreatorDoc's parts and paint reach a body (IMPROVE (2026-10-06), CREATOR-PLAN).
//
// applyIdentity calls `applyCreatorLayers(spawn, doc, worn)` once per apply, after the kit is tinted. Phase 1 rendered nothing
// here (the doc's COLOURS are already in the palette applyIdentity tinted with, and its face values in the morph
// weights); it owns the per-body bookkeeping the later phases fill in:
//
//   phase 2 (parts): DONE (2026-10-06) — lib/babylon/creator/parts/renderParts.syncParts, merged per (bone, material),
//                    never pickable, never colliding, synced in place rather than released (see applyCreatorLayers).
//   phase 3 (paint): DONE (2026-10-06) — lib/babylon/creator/paint/renderPaint.syncPaint: the layer stack composited
//                    into one texture per body over the skin's own albedo (and one per painted garment), suit mode
//                    hiding the garments. Synced on EVERY apply (see applyCreatorLayers), released with the body.
//   phase 4b (shape): DONE (2026-10-06) — lib/babylon/creator/shape/renderShape.syncShape: head / neck / hands / feet
//                    (reach-safe, every mode), legs / torso / shoulders (the play clamp; 1.0 in STANDARD_FRAME_MODES and
//                    ranked), never the arms (REACH-FREEZE), and per-segment bulk as one summed morph per mesh. Synced on
//                    EVERY apply, after the parts (a part on a hand is scaled with the hand). The Studio-only presentation
//                    size is NOT here: avatar-preview applies it from its own scene (shape/presentation.ts).
//
// Contract every phase keeps: idempotent per body (a re-apply with the same doc is cheap; a changed doc replaces, never
// stacks), everything made is disposed when the body's root disposes, and nothing here changes a hitbox, a reach or a
// gameplay number. `root.metadata.felCreator` records what was applied, for probes.

import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import type { CreatorDoc, CreatorPart } from '../../creator/look/doc';
import { syncParts } from '../creator/parts/renderParts';
import { syncPaint } from '../creator/paint/renderPaint';
import { bulkPushFor, syncShape } from '../creator/shape/renderShape';

export interface CreatorLayers {
  /** JSON of the doc last applied (cheap change test for a live editor) */
  sig: string;
  /** disposers for everything the layers made on this body */
  dispose: (() => void)[];
}

const applied = new WeakMap<TransformNode, CreatorLayers>();
const hooked = new WeakSet<TransformNode>();

function release(root: TransformNode): void {
  const l = applied.get(root);
  if (!l) return;
  for (const d of l.dispose.splice(0)) { try { d(); } catch { /* already gone with the scene */ } }
  applied.delete(root);
}

/**
 * Apply (or clear, with null) the doc's layers on one body. Returns what this body now carries.
 *
 * PARTS (phase 2, 2026-10-06) are not in `layers.dispose`: they are SYNCED in place (renderParts.syncParts), so a doc
 * edit rebuilds only the (bone, material) groups it touched instead of the whole set — an editor slider drag stays
 * instant. They own their disposal (with the body's root, or synced to none when the doc clears). `worn` are store items
 * that render as parts (wearableAccessories.wornPartsForEquipped: the Nexus Visor), outside the player's 64.
 *
 * PAINT (phase 3, 2026-10-06) is synced on EVERY call, before the unchanged-doc early return: applyIdentity has just
 * re-set the skin's and the garments' albedo (applySkinTone, the garment tints, applyKit's visibility), so the painted
 * texture is re-bound and suit mode re-applied each time. That costs a signature compare when nothing changed; only the
 * tiles an edit touches are redrawn (renderPaint.ts). It owns its disposal like parts.
 */
export function applyCreatorLayers(
  spawn: { root: TransformNode; skeleton?: Skeleton | null; meshes?: readonly AbstractMesh[] },
  doc: CreatorDoc | null,
  worn: readonly CreatorPart[] = [],
): { parts: number; paint: number } {
  const root = spawn.root;
  const sig = doc || worn.length ? JSON.stringify([doc, worn]) : '';
  const prev = applied.get(root);
  const summary = { parts: doc?.parts.length ?? 0, paint: doc?.paint.length ?? 0 };
  syncPaint(spawn, doc);
  if (!(prev && prev.sig === sig)) layersChanged(spawn, root, doc, worn, sig, summary);
  // SHAPE (phase 4b, 2026-10-06) on every call too, after the parts: the place decides the values (a standard-frame mode
  // plays the frame keys at 1.0), applyIdentity may have just re-set the root, and a part on a hand is scaled with it
  syncShape(spawn, doc);
  return summary;
}

function layersChanged(
  spawn: { root: TransformNode; skeleton?: Skeleton | null; meshes?: readonly AbstractMesh[] }, root: TransformNode, doc: CreatorDoc | null,
  worn: readonly CreatorPart[], sig: string, summary: { parts: number; paint: number },
): void {
  // phase 4c: parts marked `follow` ride out on the bulk of their segment (renderShape.bulkPushFor)
  if (spawn.skeleton) syncParts({ root, skeleton: spawn.skeleton }, doc?.parts ?? [], worn, { bulk: bulkPushFor(spawn, doc) });
  release(root);
  if (!doc && !worn.length) { stamp(root, null); return; }
  const layers: CreatorLayers = { sig, dispose: [] };
  applied.set(root, layers);
  if (!hooked.has(root)) { hooked.add(root); root.onDisposeObservable.addOnce(() => release(root)); }
  stamp(root, doc ? { v: doc.v, ...summary, suit: doc.flags.suit } : null);
}

function stamp(root: TransformNode, v: { v: number; parts: number; paint: number; suit: boolean } | null): void {
  root.metadata = { ...(root.metadata ?? {}), felCreator: v };
}
