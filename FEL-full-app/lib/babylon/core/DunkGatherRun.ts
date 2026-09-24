// DunkGatherRun — push 1-2 at the runner's own speed (DUNK MOTION phase 8, 2026-09-23).
//
// Owner, mid-pass: "make the off the dribble approach look fluid, look at examples of elite dunkers". Elite off-the-dribble
// approaches (Morant, McClung, LaVine; the coaching reads agree) run at speed into a long, low penultimate, then a stiff plant,
// "hit the ground hard and leave it fast". The owner's own book (The Art of Dunking) asks for "a fast staccato rhythm
// between penultimate and final contacts so the spring stays loaded".
//
// What the recording showed instead (p8a, the plain one-foot dunk): the gather eased the run from 7.1 m/s to the flight's
// 2 m/s carry the moment it started, so push 1-2 played at a crawl — 2.0–2.3 m/s for the last 0.4 s, and the penultimate foot
// on the floor for 470 ms. This is the gather's speed and pace instead:
//
//   · the body keeps its run through PUSH, into the penultimate's strike (clip 0.12);
//   · it brakes across the penultimate and the swing into the plant (a smoothstep to the plant's own speed, the drift the
//     plant already rolls at), so the speed is continuous into the plant and the flight;
//   · the clip plays at the rate that makes the penultimate's contact match the ground the body covers (the clip slides that
//     foot 0.66 m back through its 0.2 s contact) — ~0.12 s on the floor at a sprint, the staccato;
//   · the root follows the profile scaled to land the plant ON the line at the clip's end, whatever distance it started at.

/** The gather clips' length (dunkTakeoff GATHER_SEC) and their beats, in clip seconds. */
export const GATHER_CLIP_SEC = 0.5;
/** The penultimate's heel strike: the run is kept until here. */
export const GATHER_BRAKE_FROM = 0.12;
/** The penultimate's contact in the clip (0.12 → 0.32) and how far the planted foot slides back through it (body frame). */
export const PENULT_CLIP_SEC = 0.2, PENULT_SLIDE_M = 0.66;
/** The clip's pace, bounded: slower than 0.6 the steps float, faster than 2 they blur. */
export const GATHER_RATE_MIN = 0.6, GATHER_RATE_MAX = 2;

const smooth = (x: number): number => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
/** ∫₀ˣ smoothstep. */
const smoothInt = (x: number): number => { const u = Math.min(1, Math.max(0, x)); return u * u * u - (u * u * u * u) / 2; };
const BRAKE = GATHER_CLIP_SEC - GATHER_BRAKE_FROM;

/** The profile's speed at clip time τ (m/s at rate 1 — scaled by the plan's own factor). */
export function gatherSpeedAt(tau: number, v0: number, vEnd: number): number {
  return tau <= GATHER_BRAKE_FROM ? v0 : v0 + (vEnd - v0) * smooth((tau - GATHER_BRAKE_FROM) / BRAKE);
}
/** ∫₀^τ of the profile, in metres per unit rate (the distance at rate 1). */
export function gatherDistAt(tau: number, v0: number, vEnd: number): number {
  const t = Math.min(GATHER_CLIP_SEC, Math.max(0, tau));
  if (t <= GATHER_BRAKE_FROM) return v0 * t;
  return v0 * t + (vEnd - v0) * BRAKE * smoothInt((t - GATHER_BRAKE_FROM) / BRAKE);
}
/** Fraction of the gather's ground covered by clip time τ (0 → 1). */
export function gatherProgress(tau: number, v0: number, vEnd: number): number {
  const all = gatherDistAt(GATHER_CLIP_SEC, v0, vEnd);
  return all > 1e-6 ? gatherDistAt(tau, v0, vEnd) / all : Math.min(1, Math.max(0, tau / GATHER_CLIP_SEC));
}

export interface GatherPlan { rate: number; dist: number; sec: number }
/** The NATURAL gather for a runner at v0: the rate that matches the penultimate's contact to the ground covered, and the
 *  distance and time that pace takes. */
export function planGather(v0: number, vEnd: number): GatherPlan {
  const v = Math.max(0.5, v0);
  const meanPenult = (gatherDistAt(GATHER_BRAKE_FROM + PENULT_CLIP_SEC, v, vEnd) - gatherDistAt(GATHER_BRAKE_FROM, v, vEnd)) / PENULT_CLIP_SEC;
  const rate = Math.min(GATHER_RATE_MAX, Math.max(GATHER_RATE_MIN, (PENULT_CLIP_SEC * meanPenult) / PENULT_SLIDE_M));
  const dist = gatherDistAt(GATHER_CLIP_SEC, v, vEnd) / rate;
  return { rate, dist, sec: GATHER_CLIP_SEC / rate };
}
/** A gather that starts `distNow` from the line: the rate that lands the plant ON the line at the clip's end. */
export function fitGather(distNow: number, v0: number, vEnd: number): GatherPlan {
  const v = Math.max(0.5, v0), d = Math.max(0.05, distNow);
  const rate = Math.min(GATHER_RATE_MAX, Math.max(GATHER_RATE_MIN, gatherDistAt(GATHER_CLIP_SEC, v, vEnd) / d));
  return { rate, dist: d, sec: GATHER_CLIP_SEC / rate };
}
