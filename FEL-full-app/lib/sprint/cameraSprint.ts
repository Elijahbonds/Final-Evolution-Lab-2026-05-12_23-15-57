// cameraSprint — the camera as a timing source combine day can call instead of the hand stopwatch (SPRINT-SPEED,
// 2026-10-25).
//
// Combine day (PR #453, merged into lane/finish-release while this lane ran) times its sprint and agility stations by
// hand: components/combine/hand-timer.tsx's <HandTimer kind onTime={(seconds) => …} />. Wired (docs/SPRINT-SPEED.md §8):
//
//   1. the station keeps `method: 'hand'` in lib/combine/catalogue.ts, and the coach picks per station: hand or camera
//      (`timingChoices(kind, variant)` says which the station offers; StationConfig.timing = 'camera' is the pick);
//   2. where the coach picks camera, <CameraSprintTimer kind variant onTime /> (components/sprint/camera-sprint-timer.tsx)
//      stands in for <HandTimer>: same `onTime(seconds)`, plus a second argument the combine can keep — `method:
//      'camera'` and the ±. Combine's report marks those times "camera" (`TIMING_TAG.camera`);
//   3. ONLY for an athlete whose access says `camera` (a verified adult: lib/combine/types.ts AthleteAccess.camera).
//      Everyone else stays hand-timed. The camera picture is SelfView's only; nothing but the seconds leaves the timer.
//
// Pure.

/**
 * OWNER CALL (flagged): may a camera-timed combine attempt be kept on the server? false = kept on the coach's phone only
 * (combine's `keptOnDevice`). The movement-save opt-in's pinned sentence says "jump numbers" (lib/privacy/scanSaveConsent.ts),
 * so a sprint time is not covered by its words; /train/speed keeps its runs on the phone for the same reason. Turning
 * this on keeps them exactly as combine's camera stations are kept (a verified adult with the live opt-in, row 1m).
 */
export const CAMERA_TIMES_SAVED = false as boolean;

/** 1 yard in metres. */
export const YD = 0.9144;

export type TimingMethod = 'hand' | 'camera';

/** A camera sprint or 5-10-5 station, in the coach's words (combine setup and run). */
export const CAMERA_STATION_HOW = 'Timed by the phone\'s camera for verified adults (an estimate, with its ±); everyone else is hand-timed. Camera and hand times are not directly comparable: hand timing reads ≈ 0.2 s fast over 40 yd.';

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

/** How a station's taken attempts were timed: 'camera', 'hand-timed', 'camera + hand', or null when none is taken. */
export function timedBy(slots: readonly ({ value: number | null; method?: 'camera' } | null)[]): string | null {
  const taken = slots.filter((s): s is { value: number | null; method?: 'camera' } => !!s && s.value !== null);
  if (!taken.length) return null;
  const cam = taken.filter((s) => s.method === 'camera').length;
  return cam === taken.length ? TIMING_TAG.camera : cam === 0 ? TIMING_TAG.hand : `${TIMING_TAG.camera} + hand`;
}

/** The tag for the attempt that is the best value (the report's best column), or null. */
export function bestTimedBy(slots: readonly ({ value: number | null; method?: 'camera' } | null)[], best: number | null): string | null {
  if (best === null) return null;
  const s = slots.find((x) => x && x.value === best);
  return s ? (s.method === 'camera' ? TIMING_TAG.camera : TIMING_TAG.hand) : null;
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
