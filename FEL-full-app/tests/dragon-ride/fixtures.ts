// Test-only fixtures for the values the dragon modules take from their caller because no source sets them yet (RE-SPEC: TUNE).
// These are NOT shipped values; they only exercise the code paths. Replace in step with PM's picks.
import type { LodRanges } from '../../lib/babylon/dragon/dragonLod';

/** SlamLatch.open's hold for SwoopDunk / JumpOffDunk in tests (slamPress has no default). */
export const TEST_SLAM_HOLD_SEC = 0.15;
/** LOD switch distances and the grounded hero range in tests. */
export const TEST_LOD: LodRanges = { lodDistM: [20, 45], heroGroundedRangeM: 60 };
