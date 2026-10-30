// PERF-834-LCP (b) (2026-10-29): NO LATE-ASSET WORK BETWEEN TAKEOFF AND THE SLAM.
//
// The contest set (DunkMode.startContestSet) already starts after dunk 1's slam, but nothing bounded WHEN its downloads ran:
// AM's DIAG Q2 (box Chrome, MEASURED) saw the rival body at +0 s and the bus, the tent and 13 voice banks (~3.8 MB) at ~+3.4 s,
// then 1,281 ms and 2,672 ms long tasks — over the NEXT attempt's approach and flight. A flight gate is the one question every
// late step asks before it starts (a request) or attaches (a parked prop): "is a dunk in the air?" — if so it waits for the slam.
// Pure (no Babylon): the mode hands in its own phase predicate and its own liveness.

/** The default re-check interval while a flight is up (ms). TUNE: a flight is ~1–2 s, so 50 ms costs nothing. */
export const FLIGHT_GATE_POLL_MS = 50;

/** The late assets, in the order the contest set asks for them (spec: his body, the voices, the tent, the bus, the songs).
 *  None of them may be in DUNK1_PRELOAD — dunk 1 loads only the court, the ball, the hoop and one player (FIRST-DUNK-BUDGET). */
export const LATE_ASSETS = [
  '/models/rivals/jinx.glb', 'audio/voice/v1/', '/models/props/racing/tent.glb', '/models/meshy/hoopbus.glb', 'soundtrack preview',
] as const;
/** What dunk 1 waits for before TAP TO START (FIRST-DUNK-BUDGET, PM 2026-10-17): the court, the ball, the hoop and one player,
 *  plus the shader pre-warm (core/ModeHarness.ts). Written down so a deferred asset cannot drift into it (dunkPreloadGate.test). */
export const DUNK1_PRELOAD = ['venue: venice court', 'ball', 'hoop', 'player body', 'shader pre-warm'] as const;

export interface FlightGate {
  /** Resolves at once when no dunk is in the air; otherwise on the first check after the slam (or when the mode is gone). */
  clear(): Promise<void>;
  /** A dunk is in the air right now. */
  readonly inFlight: boolean;
}

export function createFlightGate(
  inFlight: () => boolean,
  alive: () => boolean = () => true,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  pollMs = FLIGHT_GATE_POLL_MS,
): FlightGate {
  return {
    get inFlight() { return inFlight(); },
    async clear() {
      while (alive() && inFlight()) await wait(pollMs);
    },
  };
}
