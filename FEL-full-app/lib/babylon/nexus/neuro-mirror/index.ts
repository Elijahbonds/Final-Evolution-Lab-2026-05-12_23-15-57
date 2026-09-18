// Neuro-Mechanic Mirror (v1) — public module interface
//
// This is the ONE swappable entry point for the module, mirroring the existing
// Nexus generation-service wrapper style: callers depend only on this surface,
// never on MediaPipe / Babylon internals, so any piece (pose backend, rule
// engine, renderer) can be replaced behind it without touching consumers.
//
// SCOPE (brief §2 & §6): v1 supports exactly ONE movement pattern — the
// split-stance press/row — with highlight-zone rendering only. No other pattern,
// zone, or backend is exposed here. All outputs are ESTIMATED / INFERRED
// movement-quality signals, never measured muscle activation (§2.4).

import {
  mountMirrorOverlay, type MirrorMountOpts, type MirrorRuntime, type SessionSummary,
} from './render/overlay-compositor';
import {
  SPLIT_STANCE_PRESS_ROW, type PatternConfig, type ZoneId,
} from './patterns/split-stance-press-row';

export type { MirrorRuntime, MirrorMountOpts, SessionSummary, PatternConfig, ZoneId };
export { PATTERN_ZONES, ZONE_LABEL } from './patterns/split-stance-press-row';
export { ZONE_STATE_COLOR, ZONE_STATE_LABEL, type ZoneState } from './rules/config';

// ── EDUCATION-PILLAR-HOOK ────────────────────────────────────────────────────
// Content-integration seam. In a later milestone this will resolve a lessonId
// (book chapter / QR code) to the matching pattern config. For v1 it is
// hardcoded to return the split-stance press/row config — the only supported
// pattern — and does NOT fabricate configs for any other lesson.
export async function loadLessonConfig(lessonId: string): Promise<PatternConfig> {
  // EDUCATION-PILLAR-HOOK: swap this stub for a real lesson→pattern resolver.
  if (lessonId && lessonId !== SPLIT_STANCE_PRESS_ROW.id) {
    console.warn(
      `[FEL-MIRROR] loadLessonConfig("${lessonId}") — v1 supports only `
      + `"${SPLIT_STANCE_PRESS_ROW.id}"; returning that pattern.`);
  }
  return SPLIT_STANCE_PRESS_ROW;
}

/**
 * Public service handle. `session()` mounts the live overlay and returns a
 * runtime whose `summary()` is the sessionSummary() integration point below.
 */
export const NeuroMirror = {
  loadLessonConfig,

  /** Start a coaching session over a live camera <video> + overlay canvas. */
  async session(opts: MirrorMountOpts): Promise<MirrorRuntime> {
    return mountMirrorOverlay(opts);
  },

  // ── EDUCATION-PILLAR-HOOK ──────────────────────────────────────────────────
  // Returns the REAL per-session stats (time-in-stable per zone + fault counts)
  // so a later milestone can feed progression gating (Level 1→2→3) and aggregate
  // genuine usage statistics. Never returns fabricated numbers — it forwards
  // exactly what the runtime accumulated.
  sessionSummary(runtime: MirrorRuntime): SessionSummary {
    // EDUCATION-PILLAR-HOOK: wire this into progression/aggregation later.
    return runtime.summary();
  },
};

export default NeuroMirror;
