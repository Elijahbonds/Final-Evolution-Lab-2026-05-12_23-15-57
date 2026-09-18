// IRLCore — jump detection from device motion, for the IRL mode on the web.
//
// The iOS design assumed HealthKit. On the web there is no HealthKit, so this
// uses DeviceMotionEvent accelerometer data instead — available on mobile
// browsers after an explicit permission prompt, and on nothing else. That
// constraint is real and the mode must state it rather than silently
// producing zeros on desktop.
//
// HOW A JUMP IS DETECTED
// A vertical jump has an unmistakable accelerometer signature: a loading dip
// below 1g, a sharp spike well above it at push-off, then FREE FALL — a
// sustained window near 0g while airborne — and a landing spike. Flight time
// gives height directly:
//
//     h = g * t² / 8      (t = total time airborne)
//
// Detecting free fall rather than integrating acceleration is deliberate.
// Double-integrating noisy phone accelerometer data drifts badly within a
// second; airborne time is a robust, directly-measurable quantity.
//
// DOM-free so it can be executed as a test — the mode feeds it samples.

export const G = 9.81;

export interface MotionSample {
  /** Seconds. */
  t: number;
  /** Total acceleration magnitude in m/s² INCLUDING gravity. ~9.81 at rest. */
  magnitude: number;
}

export interface JumpEvent {
  takeoffAt: number;
  landAt: number;
  flightTime: number;
  /** Metres, from flight time. */
  height: number;
  peakG: number;
}

/** Below this (in g) counts as airborne. Not 0: a phone in a pocket rattles. */
export const FREEFALL_G = 0.35;
/** Push-off must exceed this to count as a real jump rather than a step. */
export const TAKEOFF_G = 1.6;
/** Shortest credible flight time. Below this it is a footstep or a bump. */
export const MIN_FLIGHT = 0.18;
/** Longest credible flight time. Above this the phone was dropped or thrown. */
export const MAX_FLIGHT = 1.2;

export const heightFromFlight = (flightTime: number): number => (G * flightTime * flightTime) / 8;

/**
 * Find jumps in a motion trace.
 *
 * Rejects anything outside a credible flight window in BOTH directions. The
 * upper bound matters more than it looks: a phone thrown in the air produces a
 * textbook free-fall signature and would otherwise register as a two-metre
 * vertical, which is both wrong and the obvious way to cheat a leaderboard.
 */
export function detectJumps(samples: MotionSample[]): JumpEvent[] {
  const jumps: JumpEvent[] = [];
  if (samples.length < 3) return jumps;

  let armedAt: number | null = null;   // time of a qualifying push-off spike
  let peak = 0;
  let freefallStart: number | null = null;

  for (let i = 0; i < samples.length; i++) {
    const g = samples[i].magnitude / G;
    const t = samples[i].t;

    if (g >= TAKEOFF_G) {
      // A spike either arms a jump or, if we are mid-flight, ends it.
      if (freefallStart !== null && armedAt !== null) {
        const flight = t - freefallStart;
        if (flight >= MIN_FLIGHT && flight <= MAX_FLIGHT) {
          jumps.push({
            takeoffAt: armedAt, landAt: t, flightTime: flight,
            height: heightFromFlight(flight), peakG: peak,
          });
        }
        armedAt = null; freefallStart = null; peak = 0;
        continue;
      }
      armedAt = t;
      peak = Math.max(peak, g);
      continue;
    }

    if (armedAt !== null && g <= FREEFALL_G && freefallStart === null) {
      freefallStart = t;
    }

    // Give up on an arm that never produced free fall within a plausible window.
    if (armedAt !== null && freefallStart === null && t - armedAt > 0.6) {
      armedAt = null; peak = 0;
    }
  }
  return jumps;
}

export interface IRLSession {
  jumps: JumpEvent[];
  best: number;
  total: number;
  average: number;
}

export function summarise(jumps: JumpEvent[]): IRLSession {
  if (jumps.length === 0) return { jumps, best: 0, total: 0, average: 0 };
  const heights = jumps.map((j) => j.height);
  return {
    jumps,
    best: Math.max(...heights),
    total: jumps.length,
    average: heights.reduce((a, b) => a + b, 0) / heights.length,
  };
}

/** Is device motion usable here at all? The mode must tell the player the
 *  truth on desktop rather than showing a permanently empty counter. */
export function motionAvailability(): 'ready' | 'needs-permission' | 'unsupported' {
  const w = globalThis as unknown as {
    DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
  };
  if (typeof w.DeviceMotionEvent === 'undefined') return 'unsupported';
  if (typeof w.DeviceMotionEvent.requestPermission === 'function') return 'needs-permission';
  return 'ready';
}
