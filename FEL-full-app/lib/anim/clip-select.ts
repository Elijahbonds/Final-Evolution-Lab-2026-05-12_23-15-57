/**
 * lib/anim/clip-select.ts — Phase 1 deliverable C support: PURE decision logic
 * for CharacterAnimator (no THREE, no DOM — unit-testable headless).
 *
 * These functions encode the "never bind pose" contract:
 *   - a requested clip that does not exist resolves to the idle clip and flags a
 *     fallback (the caller logs an error)
 *   - crossfade blend time is clamped to a minimum floor so we never hard-cut
 */

export const MIN_BLEND_SECONDS = 0.15;

export interface ClipChoice {
  clip: string;
  didFallback: boolean;
  reason: 'requested' | 'idle-fallback' | 'idle-missing';
}

/**
 * Resolve which clip to actually play.
 *  - requested present               -> play it
 *  - requested absent, idle present  -> play idle, didFallback=true
 *  - requested absent, idle absent   -> play first available, flagged (last
 *    resort so the rig is never left in bind pose)
 */
export function chooseClip(
  requested: string,
  available: string[],
  idle: string,
): ClipChoice {
  const set = new Set(available);
  if (set.has(requested)) return { clip: requested, didFallback: false, reason: 'requested' };
  if (set.has(idle)) return { clip: idle, didFallback: true, reason: 'idle-fallback' };
  // Idle itself is missing — never bind pose; use first available clip.
  return {
    clip: available[0] ?? requested,
    didFallback: true,
    reason: 'idle-missing',
  };
}

/** Clamp requested blend time to the no-hard-cut floor. */
export function resolveBlendSeconds(requested: number | undefined): number {
  if (requested === undefined || Number.isNaN(requested)) return MIN_BLEND_SECONDS;
  return Math.max(MIN_BLEND_SECONDS, requested);
}

/** Clamp playback speed to a sane positive range. */
export function resolveSpeed(requested: number | undefined): number {
  if (requested === undefined || Number.isNaN(requested) || requested <= 0) return 1;
  return Math.min(4, requested);
}
