// The Dive (Phase4 notes, spec 4:05 PM PT). The DR_Dive clip only folds the wings — DR_Seat stays at 1.95 and DR_Root has no
// translation — so the code moves the dragon root: from the current Glide altitude, down DIVE_DEPTH_M with an ease-in to the
// bottom over DIVE_SEC (the clip time-scaled to match), then a pull-up over LaunchOff's 0.667 s (pitch back to level, altitude
// held). The bottom never goes under the ground / water plus the Dive's measured flight floor (FLIGHT_MIN_SEAT.dive).
import { DIVE_CLIP_SEC, DIVE_DEPTH_M, DIVE_PITCH_DEG, DIVE_PULLUP_SEC, DIVE_SEC, FLIGHT_MIN_SEAT } from './dragonRideConsts';

export interface DivePlan { startSeatY: number; bottomSeatY: number; depth: number; diveSec: number; pullUpSec: number; clipRate: number; clamped: boolean }

/** `startSeatY`: the seat height when the dive starts (Glide altitude); `groundY`: terrain or water surface under the dive. */
export function planDive(startSeatY: number, groundY: number, o: { depth?: number; diveSec?: number } = {}): DivePlan {
  const depth0 = o.depth ?? DIVE_DEPTH_M;
  const diveSec = o.diveSec ?? DIVE_SEC;
  const floor = groundY + FLIGHT_MIN_SEAT.dive;
  const want = startSeatY - depth0;
  const bottomSeatY = Math.max(want, Math.min(startSeatY, floor));
  return { startSeatY, bottomSeatY, depth: startSeatY - bottomSeatY, diveSec, pullUpSec: DIVE_PULLUP_SEC, clipRate: DIVE_CLIP_SEC / diveSec, clamped: bottomSeatY > want };
}

/** Seat height, nose pitch (deg, + = down) and the Dive clip's own time at `t` seconds since the dive started. */
export function diveAt(p: DivePlan, t: number): { seatY: number; pitchDeg: number; clipT: number; phase: 'dive' | 'pullUp' | 'done' } {
  if (t <= p.diveSec) {
    const u = Math.max(0, t) / p.diveSec;
    const e = u * u;   // ease-in to the bottom
    return { seatY: p.startSeatY - p.depth * e, pitchDeg: DIVE_PITCH_DEG * Math.min(1, u * 4), clipT: Math.max(0, t) * p.clipRate, phase: 'dive' };
  }
  const v = Math.min(1, (t - p.diveSec) / p.pullUpSec);
  const ease = 1 - (1 - v) * (1 - v);
  return { seatY: p.bottomSeatY, pitchDeg: DIVE_PITCH_DEG * (1 - ease), clipT: DIVE_CLIP_SEC, phase: v >= 1 ? 'done' : 'pullUp' };
}
