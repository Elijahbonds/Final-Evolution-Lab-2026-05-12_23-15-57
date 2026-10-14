// A synthetic HELD mode for the wave-2 look's own tests (vis-hoops-court, 2026-10-14).
//
// scene/lookPolicy.ts's WAVE2_HELD_MODES began as the hoops family and is emptied lane by lane ("Go on hoops": each mode lane deletes its
// own ids). The suites that hold the HOLD itself — a held mode gets no fixture lights, no sky, no mirror, no decals, no relief — used a
// real hoops id as their held example, so each lane that lifted its modes broke them, and the last lane to lift would have left them with
// nothing to test. They hold a made-up id instead, for the length of one test: the mechanism stays tested whatever is held in production.
import { WAVE2_HELD_MODES } from '../../lib/babylon/scene/lookPolicy';

export const HELD_PROBE_MODE = 'held_probe_mode';

/** Put the probe id in the held set; returns the way to take it out again (call it in a `finally`). */
export function holdProbeMode(): () => void {
  (WAVE2_HELD_MODES as Set<string>).add(HELD_PROBE_MODE);
  return () => { (WAVE2_HELD_MODES as Set<string>).delete(HELD_PROBE_MODE); };
}
