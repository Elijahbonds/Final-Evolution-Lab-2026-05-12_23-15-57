// cameraSprint — the camera as a timing source combine day can call instead of the hand stopwatch (SPRINT-SPEED,
// 2026-10-25).
//
// Combine day (lane/combine-day, PR #453, NOT merged into lane/finish-release when this was written) times its sprint
// and agility stations by hand: components/combine/hand-timer.tsx's <HandTimer kind onTime={(seconds) => …} />. This is
// the documented adapter for the day it lands (docs/SPRINT-SPEED.md §8):
//
//   1. the station keeps `method: 'hand'` in lib/combine/catalogue.ts, and the coach picks per station: hand or camera
//      (`timingChoices(kind, variant)` says which the station offers);
//   2. where the coach picks camera, <CameraSprintTimer kind variant onTime /> (components/sprint/camera-sprint-timer.tsx)
//      stands in for <HandTimer>: same `onTime(seconds)`, plus a second argument the combine can keep — `method:
//      'camera'` and the ±. Combine's report marks those times "camera" (`TIMING_TAG.camera`);
//   3. ONLY for an athlete whose access says `camera` (a verified adult: lib/combine/types.ts AthleteAccess.camera).
//      Everyone else stays hand-timed. The camera picture is SelfView's only; nothing but the seconds leaves the timer.
//
// Pure.

/** 1 yard in metres. */
export const YD = 0.9144;

export type TimingMethod = 'hand' | 'camera';

/** What each method is called next to a time. */
export const TIMING_TAG: Record<TimingMethod, string> = { hand: 'hand-timed', camera: 'camera' };

/** The second argument a camera time comes with. */
export interface CameraTimeMeta {
  method: 'camera';
  /** ±1 SD of the time (s): this read's own spread, not a validated accuracy. */
  sdS: number;
  startKind: 'go' | 'movement' | 'phone';
  reactionIncluded: boolean;
}

/** A combine station's sprint variant in metres (combine's ids: 10yd, 20yd, 40yd, 10m, 20m, 30m), or null. */
export function variantMetres(variant: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(yd|m)$/.exec(variant);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'yd' ? Math.round(n * YD * 1000) / 1000 : n;
}

/** The ways a station can be timed. The camera times a straight sprint and the 5-10-5; the other agility drills stay hand. */
export function timingChoices(kind: 'sprint' | 'agility', variant: string): TimingMethod[] {
  if (kind === 'sprint') return variantMetres(variant) !== null ? ['hand', 'camera'] : ['hand'];
  return variant === 'pro-agility' ? ['hand', 'camera'] : ['hand'];
}

/** A camera time as the combine records it: seconds to the hundredth (combine's own rounding), with its meta. */
export function cameraAttempt(r: { timeS: number; sdS: number; startKind: CameraTimeMeta['startKind']; reactionIncluded: boolean }): { seconds: number; meta: CameraTimeMeta } {
  return { seconds: Math.round(r.timeS * 100) / 100, meta: { method: 'camera', sdS: r.sdS, startKind: r.startKind, reactionIncluded: r.reactionIncluded } };
}

/** The timing source as a value combine can hold. */
export const cameraSprint = {
  id: 'camera' as const,
  label: 'Camera (estimate)',
  tag: TIMING_TAG.camera,
  supports: (kind: 'sprint' | 'agility', variant: string) => timingChoices(kind, variant).includes('camera'),
  distanceM: variantMetres,
  attempt: cameraAttempt,
};
