// faceMorphs — the Closet's face presets → forge morph-target weights.
//
// Phase 3 (ship pass 2026-09-02). The forge bakes seven head morphs onto the
// skin primitive (scripts/avatar/forge.mts, extras.targetNames): faceLong,
// faceRound, faceSquare, faceHeart, faceDiamond, jawOpen, browRaise. The
// Closet keeps its named presets (FACE_SHAPES etc.) AND gains sliders; both
// resolve through this one table so the preview and a mode can never
// disagree. Pure, so it is unit-tested without a GPU.

import type { AbstractMesh } from '@babylonjs/core';

export const FACE_MORPH_NAMES = ['faceLong', 'faceRound', 'faceSquare', 'faceHeart', 'faceDiamond', 'jawOpen', 'browRaise'] as const;
export type FaceMorphName = typeof FACE_MORPH_NAMES[number];
export type FaceWeights = Partial<Record<FaceMorphName, number>>;

/** Named face-shape presets (lib/closet/wearable-catalog.ts FACE_SHAPES). */
export const FACE_SHAPE_WEIGHTS: Record<string, FaceWeights> = {
  Oval:    {},
  Round:   { faceRound: 0.85 },
  Square:  { faceSquare: 0.9 },
  Heart:   { faceHeart: 0.8 },
  Diamond: { faceDiamond: 0.8 },
  Long:    { faceLong: 0.75 },
};

/** Brow presets nudge browRaise; the rest of BROWS is geometry-thickness
 *  (a later forge pass), so they map to 0 today. */
export const BROW_WEIGHTS: Record<string, FaceWeights> = {
  Arched: { browRaise: 0.35 },
};

export interface FaceMorphInput {
  faceShape?: string;
  brows?: string;
  /** Optional explicit sliders (0..1). Win over the preset for that morph. */
  sliders?: FaceWeights;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** Resolve a full weight vector in FACE_MORPH_NAMES order. */
export function resolveFaceWeights(i: FaceMorphInput): number[] {
  const w: FaceWeights = { ...(FACE_SHAPE_WEIGHTS[i.faceShape ?? ''] ?? {}), ...(BROW_WEIGHTS[i.brows ?? ''] ?? {}) };
  for (const k of FACE_MORPH_NAMES) if (i.sliders && i.sliders[k] != null) w[k] = i.sliders[k];
  return FACE_MORPH_NAMES.map((k) => clamp01(w[k] ?? 0));
}

/**
 * Push weights onto every mesh that carries the forge's morph manager.
 * Returns how many meshes took them (0 on the procedural body or an old GLB).
 */
export function applyFaceMorphs(meshes: AbstractMesh[], weights: number[]): number {
  let applied = 0;
  for (const m of meshes) {
    const mgr = (m as AbstractMesh & { morphTargetManager?: { numTargets: number; getTarget(i: number): { name: string; influence: number } } }).morphTargetManager;
    if (!mgr || mgr.numTargets === 0) continue;
    for (let t = 0; t < mgr.numTargets; t++) {
      const target = mgr.getTarget(t);
      const idx = (FACE_MORPH_NAMES as readonly string[]).indexOf(target.name);
      if (idx >= 0) target.influence = weights[idx] ?? 0;
    }
    applied++;
  }
  return applied;
}
