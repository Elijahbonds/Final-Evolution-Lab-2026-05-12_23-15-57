// lib/vbt/medball.ts — VBT (2026-10-25): a med-ball throw's release speed, from the throwing wrist, as an ESTIMATE.
//
// HOW. Side-on, the wrist's 2-D speed climbs through the throw and collapses when the ball leaves the hand: the hand
// stops, the ball flies on. That collapse is the SEPARATION CUE: a peak in wrist speed over MB_MIN_SPEED counts as a
// release only if the speed then falls by RELEASE_FALL_SHARE within RELEASE_FALL_MS (a wind-up's swing back slows
// gently and is not a release). The release speed is the wrist's speed at that peak; its angle the direction of travel.
//
// WHY AN ESTIMATE. The ball leaves a little faster than the wrist (the fingers keep pushing), so the ± carries
// RELEASE_MODEL_SD on top of the ruler and the jitter. No published validity exists for a phone's wrist-based release
// speed (docs/VBT-BENCHMARK.md): the number is a training marker against yourself, not a radar gun.
//
// Pure.
import { kinematics, framePeriodMs } from './signal';
import { MB_MIN_SPEED, RELEASE_FALL_MS, RELEASE_FALL_SHARE, RELEASE_MODEL_SD } from './thresholds';
import type { Track } from './track';

export interface Throw {
  index: number;
  releaseT: number;
  /** m/s at release, and its ± (95 %). */
  speed: number;
  speedPm: number;
  /** Degrees above horizontal at release. */
  angleDeg: number;
}

/** (new) Two releases closer than this (ms) are one throw. */
export const THROW_GAP_MS = 700;

const r2 = (x: number) => Math.round(x * 100) / 100;

export function readThrows(track: Track): { throws: Throw[]; fps: number } {
  const s = track.samples;
  if (s.length < 5) return { throws: [], fps: 0 };
  const period = framePeriodMs(s.map((x) => x.t));
  const k = kinematics(s);
  const sp = k.map((x) => Math.hypot(x.vx, x.vy));
  const throws: Throw[] = [];
  for (let i = 1; i < k.length - 1; i++) {
    if (sp[i] < MB_MIN_SPEED || sp[i] < sp[i - 1] || sp[i] < sp[i + 1]) continue;
    // the separation cue: the speed collapses soon after the peak
    let fell = false;
    for (let j = i + 1; j < k.length && k[j].t - k[i].t <= RELEASE_FALL_MS; j++) if (sp[j] <= sp[i] * (1 - RELEASE_FALL_SHARE)) { fell = true; break; }
    if (!fell) continue;
    const prev = throws[throws.length - 1];
    if (prev && k[i].t - prev.releaseT < THROW_GAP_MS) {
      if (sp[i] > prev.speed) throws.pop(); else continue;
    }
    const sdV = track.posSdM * k[i].slopeGain;
    const rel = Math.hypot(track.ruler.sd, RELEASE_MODEL_SD);
    throws.push({
      index: 0, releaseT: k[i].t, speed: r2(sp[i]),
      speedPm: r2(1.96 * Math.hypot(sdV, sp[i] * rel)),
      angleDeg: Math.round((Math.atan2(k[i].vy, Math.abs(k[i].vx)) * 180) / Math.PI),
    });
  }
  throws.forEach((t, i) => { t.index = i + 1; });
  return { throws, fps: Math.round((1000 / period) * 10) / 10 };
}
