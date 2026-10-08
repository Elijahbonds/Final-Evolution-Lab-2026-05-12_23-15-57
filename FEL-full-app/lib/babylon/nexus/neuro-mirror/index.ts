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

// ── Lessons → the Mirror ─────────────────────────────────────────────────────
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5: the EDUCATION-PILLAR-HOOK stub that lived here is replaced by
// the real lesson→movement map, lib/education/lessonMovement.ts (pure data: which Playbook lessons teach which Mirror
// movement). A lesson id is course.ts lessonId, `<chapter>:<lessonKey>` (e.g. "8:the-hip-hinge").
//
// loadLessonConfig answers the OVERLAY config — the zone-highlight pattern this module renders. Only one exists, the
// split-stance press/row, and no Playbook lesson teaches it, so a lesson resolves to null: the Mirror opens on the
// lesson's movement tab instead (`/play/mirror?pattern=<movement>`, cameraHref). It never fabricates a config: the
// press/row's own id still resolves to its config, and anything else is null rather than the press/row in disguise.
import { movementForLesson, lessonsForMovement, cameraHref } from '@/lib/education/lessonMovement';
export { movementForLesson, lessonsForMovement, cameraHref };
export type { MirrorMovementId } from '@/lib/education/lessonMovement';

export async function loadLessonConfig(lessonId: string): Promise<PatternConfig | null> {
  return lessonId === SPLIT_STANCE_PRESS_ROW.id ? SPLIT_STANCE_PRESS_ROW : null;
}

/**
 * Public service handle. `session()` mounts the live overlay and returns a
 * runtime whose `summary()` is the sessionSummary() integration point below.
 */
export const NeuroMirror = {
  loadLessonConfig,
  /** The Mirror movement a Playbook lesson teaches, or null (lib/education/lessonMovement.ts). */
  movementForLesson,
  /** The Playbook lessons that teach a movement, for "learn this" links out of a session. */
  lessonsForMovement,

  /** Start a coaching session over a live camera <video> + overlay canvas. */
  async session(opts: MirrorMountOpts): Promise<MirrorRuntime> {
    return mountMirrorOverlay(opts);
  },

  // The REAL per-session stats (time-in-stable per zone + fault counts), exactly what the runtime accumulated — never
  // a fabricated number. Consumed: mirror-harness.tsx endZoneSession shows it and saves it (adults who opted in,
  // /api/mirror/sessions). EDU-LINKS (2026-10-07): the EDUCATION-PILLAR-HOOK note that sat here is resolved — the
  // lessons for a session's movement are lessonsForMovement (above), not a field on the summary.
  sessionSummary(runtime: MirrorRuntime): SessionSummary {
    return runtime.summary();
  },
};

export default NeuroMirror;
