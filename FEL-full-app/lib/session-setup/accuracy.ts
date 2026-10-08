// Honest error band for a flight-time vertical (DUNK-TIMING-HONEST). Pure: no DOM, no network.
//
// Height is h = g·t²/8, so dh = g·t/4 · dt. The timing error of a sub-frame-interpolated crossing is about
// 0.41 × the frame interval (research model, Tip 4), so a slower camera means a wider band.

import { G } from '../babylon/core/IRLCore';

export const TIMING_ERROR_FRAMES = 0.41;
/** Used when the jump height is unknown: a representative ~90 cm jump (flight ≈ 0.857 s). */
export const REPRESENTATIVE_VERTICAL_CM = 90;
/** Below this the measured rate is noise; assume a plain 30 fps camera. */
export const FALLBACK_FPS = 30;

const CM_PER_INCH = 2.54;

function usableFps(fps: number): number {
  return Number.isFinite(fps) && fps >= 5 ? Math.min(fps, 240) : FALLBACK_FPS;
}

/** Flight time (s) of a jump of this height, inverting h = g·t²/8. */
function flightSecondsFor(verticalCm: number): number {
  const cm = Number.isFinite(verticalCm) && verticalCm > 0 ? verticalCm : REPRESENTATIVE_VERTICAL_CM;
  return Math.sqrt((8 * cm) / 100 / G);
}

/** ± centimetres on a flight-time vertical filmed at `fps`. */
export function errorBandCm(fps: number, verticalCm: number = REPRESENTATIVE_VERTICAL_CM): number {
  const dt = (TIMING_ERROR_FRAMES / usableFps(fps));
  return ((G * flightSecondsFor(verticalCm)) / 4) * dt * 100;
}

/** ± whole inches, never less than 1: a band that claims better than an inch would overstate the camera. */
export function errorBandInches(fps: number, verticalCm: number = REPRESENTATIVE_VERTICAL_CM): number {
  return Math.max(1, Math.round(errorBandCm(fps, verticalCm) / CM_PER_INCH));
}

/** "34 ±1 in" */
export function formatWithBand(inches: number, bandInches: number): string {
  return `${inches} ±${bandInches} in`;
}

/** Rolling frame-rate estimate from camera frame timestamps (ms). Keeps the last `max` stamps. */
export class FpsMeter {
  private stamps: number[] = [];
  constructor(private readonly max = 30) {}
  push(timestampMs: number): void {
    const last = this.stamps[this.stamps.length - 1];
    if (last !== undefined && timestampMs <= last) return;
    this.stamps.push(timestampMs);
    if (this.stamps.length > this.max) this.stamps.shift();
  }
  /** 0 until at least 5 frames have been seen. */
  get fps(): number {
    const n = this.stamps.length;
    if (n < 5) return 0;
    const span = this.stamps[n - 1] - this.stamps[0];
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }
}
