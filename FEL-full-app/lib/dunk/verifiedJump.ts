// lib/dunk/verifiedJump — the athlete's VERIFIED best countermovement jump (hands on hips), for the dunk's real-jump mapping
// (dunk-flagship Phase 5: "only verified adult jumps can personalise it").
//
// WHAT COUNTS. Only a jump lib/jump/seam.ts calls `verified` (the owner's verified rule), read from the athlete's own saved
// Quick Screen rows (WorkoutScan kind 'mirror_assessment', its T5 block). Those rows are only ever written for a verified 18+
// account that opted in (TEEN-WRITE-BLOCK, lib/privacy/scanSaveGate.ts); the route re-checks that gate at READ time too, so a
// row saved under an older rule never personalises anything. A device-only vertical (lane vertical-easy, PR #480) is not read.
//
// FAIRNESS (owner rule, lib/jump/seam.ts): a real rep never sells an advantage in ranked, staked or paid play. This module only
// describes the jump; the dunk reads it through a feel knob (off by default), and lib/feel-panel refuses knobs in those sessions.
//
// Pure: no database, no session.
import type { T5Extra } from '@/lib/assess/scoring';
import { jumpRecords } from '@/lib/jump/seam';

/** The best verified CMJ height (cm) across saved assessment metrics, newest first; null when none verifies. */
export function bestVerifiedJumpCm(metricsRows: readonly unknown[]): number | null {
  let best: number | null = null;
  for (const metrics of metricsRows) {
    const tests = (metrics as { tests?: unknown } | null)?.tests;
    if (!Array.isArray(tests)) continue;
    for (const t of tests) {
      const t5 = t && typeof t === 'object' ? (t as { id?: unknown; t5?: unknown }).t5 : null;
      if (!t5 || typeof t5 !== 'object' || !Array.isArray((t5 as T5Extra).jumps)) continue;
      for (const r of jumpRecords(t5 as T5Extra, { source: 'live' })) {
        if (r.type !== 'cmj' || !r.verified || !Number.isFinite(r.heightCm) || r.heightCm <= 0) continue;
        if (best === null || r.heightCm > best) best = r.heightCm;
      }
    }
  }
  return best;
}
