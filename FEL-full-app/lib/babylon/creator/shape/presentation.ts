// PRESENTATION SCALE — giant and tiny builds, in the Studio and photo mode ONLY (IMPROVE (2026-10-06), CREATOR-PLAN
// phase 4b; owner decision 2026-10-06: "giant/tiny builds show at full size only in the Studio and photo mode; every game
// mode keeps fair play size").
//
// HOW IT IS KEPT OUT OF EVERY MODE. The size is a SLOT field (CreatorSlotV2.presentation), not part of the CreatorDoc, so
// identityFrom / activeLook — the reader every mode spawns through — never carries it. The one way it reaches a body is
// the SCENE: a Studio or photo scene stamps `scene.metadata.felPresentation = { context, scale }` (the Closet preview,
// components/closet/avatar-preview.tsx; photo mode in phase 4d), and `presentationScaleOf` answers 1 for any scene that is
// a mode (ModeHarness's `felModeId`) or ranked (`felRanked`), whatever else its metadata says. presentation.test.ts pins
// both, and that no mode file imports this module.

import type { TransformNode } from '@babylonjs/core';
import { playContextOf } from '../../core/playFrame';
import { PRESENTATION_RANGE } from '../../../creator/look/doc';

/** The scenes that may show a presentation size. */
export const PRESENTATION_CONTEXTS = ['studio', 'photo'] as const;
export type PresentationContext = typeof PRESENTATION_CONTEXTS[number];

export interface PresentationStamp { context: PresentationContext; scale: number }

/** The size this scene shows a body at: the stamped scale (clamped to PRESENTATION_RANGE) in a Studio or photo scene,
 *  and exactly 1 anywhere else — a mode, a ranked session, an unstamped scene, a bad stamp. */
export function presentationScaleOf(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 1;
  const ctx = playContextOf(metadata);
  if (ctx.modeId || ctx.ranked) return 1;
  const p = (metadata as { felPresentation?: Partial<PresentationStamp> }).felPresentation;
  if (!p || !(PRESENTATION_CONTEXTS as readonly string[]).includes(p.context as string)) return 1;
  const s = p.scale;
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return 1;
  return Math.min(PRESENTATION_RANGE[1], Math.max(PRESENTATION_RANGE[0], s));
}

/** Stamp a Studio / photo scene's metadata with the size to show (null or 1: none). */
export function stampPresentation(scene: { metadata: unknown }, context: PresentationContext, scale: number | null | undefined): void {
  const md = ((scene.metadata ??= {}) as { felPresentation?: PresentationStamp });
  md.felPresentation = { context, scale: typeof scale === 'number' && Number.isFinite(scale) ? scale : 1 };
}

/**
 * Multiply the body's root scale by its scene's presentation size. Call it right after the root's scale was set
 * absolutely (applyProportions with a base), so it never compounds. Returns the factor applied (1 in any mode).
 */
export function applyPresentation(root: TransformNode): number {
  const s = presentationScaleOf(root.getScene()?.metadata);
  if (s !== 1) root.scaling.scaleInPlace(s);
  root.metadata = { ...(root.metadata ?? {}), felPresentationScale: s };
  return s;
}
