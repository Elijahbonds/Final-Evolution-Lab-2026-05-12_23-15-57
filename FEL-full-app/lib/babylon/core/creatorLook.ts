// THE CREATOR HOOK — the one place a CreatorDoc's parts and paint reach a body (IMPROVE (2026-10-06), CREATOR-PLAN).
//
// applyIdentity calls `applyCreatorLayers(spawn, doc)` once per apply, after the kit is tinted. Phase 1 renders nothing
// here (the doc's COLOURS are already in the palette applyIdentity tinted with, and its face values in the morph
// weights); it owns the per-body bookkeeping the later phases fill in:
//
//   phase 2 (parts): build each part from doc.parts, parent it to its bone's node (boneNode), merge per material,
//                    never pickable, never colliding; push its disposer into `layers.dispose`.
//   phase 3 (paint): composite doc.paint into one canvas texture per body over the skin (and garments), honour
//                    doc.flags.suit (hide the garments); push its disposer the same way.
//   phase 4 (shape): doc.shape.body through counter-scaled bones, never the arms (REACH-FREEZE), 1.0 in
//                    STANDARD_FRAME_MODES and ranked (playFrame.playScales).
//
// Contract every phase keeps: idempotent per body (a re-apply with the same doc is cheap; a changed doc replaces, never
// stacks), everything made is disposed when the body's root disposes, and nothing here changes a hitbox, a reach or a
// gameplay number. `root.metadata.felCreator` records what was applied, for probes.

import type { TransformNode } from '@babylonjs/core';
import type { CreatorDoc } from '../../creator/look/doc';

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
 * Phase 1: bookkeeping and the probe stamp only.
 */
export function applyCreatorLayers(spawn: { root: TransformNode }, doc: CreatorDoc | null): { parts: number; paint: number } {
  const root = spawn.root;
  const sig = doc ? JSON.stringify(doc) : '';
  const prev = applied.get(root);
  const summary = { parts: doc?.parts.length ?? 0, paint: doc?.paint.length ?? 0 };
  if (prev && prev.sig === sig) return summary;
  release(root);
  if (!doc) { stamp(root, null); return summary; }
  const layers: CreatorLayers = { sig, dispose: [] };
  // phase 2: layers.dispose.push(renderParts(spawn, doc.parts));
  // phase 3: layers.dispose.push(renderPaint(spawn, doc.paint, doc.flags));
  applied.set(root, layers);
  if (!hooked.has(root)) { hooked.add(root); root.onDisposeObservable.addOnce(() => release(root)); }
  stamp(root, { v: doc.v, ...summary, suit: doc.flags.suit });
  return summary;
}

function stamp(root: TransformNode, v: { v: number; parts: number; paint: number; suit: boolean } | null): void {
  root.metadata = { ...(root.metadata ?? {}), felCreator: v };
}
