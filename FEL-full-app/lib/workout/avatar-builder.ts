/**
 * lib/workout/avatar-builder.ts — RETIRED (REACH-FREEZE, 2026-09-29; Gameplay Systems' spec, Decision 4)
 * ======================================================================================================
 * This mapped a movement scan onto the body: jump height → heightScale, squat depth → buildScale, running cadence →
 * reachScale. So jumping higher made the avatar taller, and resolveIdentity played that height in every mode. Owner rule:
 * body shape is cosmetic, and scans and fitness data never write body scales.
 *
 * What is left is a shim, because components/workout-view.tsx still imports it and that file is held by another lane
 * (mirror-coach). `buildAvatarSpec` ignores the metrics: every scan is the standard frame, with the palette overrides
 * still honoured. /api/v1/workout/scan stores and returns that neutral spec; old rows keep what they were saved with and
 * nothing reads them for a body. DELETE this file when workout-view.tsx imports standardAvatarSpec instead
 * (~/Claude/outbox/reach-freeze-routed.md R1, then R7).
 */

import type { MovementMetrics } from './movement-screen';
import { standardAvatarSpec, type AvatarSpec } from '../babylon/core/avatarSpec';

export type { AvatarSpec } from '../babylon/core/avatarSpec';

/** @deprecated The metrics are ignored — a scan never sets a body's size. Use standardAvatarSpec. */
export function buildAvatarSpec(
  m: MovementMetrics,
  opts?: { skin?: string; primary?: string; accent?: string }
): AvatarSpec {
  void m;
  return standardAvatarSpec(opts);
}
