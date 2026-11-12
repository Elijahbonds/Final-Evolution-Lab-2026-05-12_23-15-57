// protocolBench — ground-truth takes for each jump test (JUMP-TESTS, 2026-10-25), built by lib/jump/ballistic.ts and
// filmed through the app's own virtual camera, as the jump check's bench is. Each protocol has its honest take and the
// takes it must refuse (a squat jump with a dip, a hands-on-hips jump with an arm swing, a single-leg jump that lands on
// both feet, a 10-5 with slow contacts). Used by tests/jump-tests, the phone probe and scripts/jump-tests-bench.ts.
//
// Pure, deterministic for a seed.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { buildTake, filmTake, type TakeStyle, type TrialSpec, type TrialTruth } from './ballistic';
import type { ProtocolId } from './protocols';

/** The stand at the start of every take (s): the calibration and the clock read there. */
export const PROTOCOL_LEAD_S = 3.2;

export type TakeKind =
  | 'honest'          // the test done as its steps say
  | 'cheat';          // the thing it must refuse: sj → a dip after the hold; cmjHips → an arm swing; cmjArms → hands on
                      // hips; single → both feet; rj105 → contacts of 320 ms

export interface ProtocolTakeOpts { fps: number; seed?: number; kind?: TakeKind; heightsM?: number[]; contactMs?: number; noise?: number }

/** The trials and the style a protocol's take is built from. */
export function protocolBeats(id: ProtocolId, o: Pick<ProtocolTakeOpts, 'kind' | 'heightsM' | 'contactMs'> = {}): { trials: TrialSpec[]; style?: TakeStyle } {
  const cheat = o.kind === 'cheat';
  const hs = (d: number[]) => o.heightsM ?? d;
  switch (id) {
    case 'sj': return { trials: hs([0.34, 0.36, 0.35]).map((h) => ({ heightM: h, squatHoldMs: 2000, ...(cheat ? { preDip: 0.18 } : {}) })) };
    case 'cmjHips': return { trials: hs([0.4, 0.42, 0.41]).map((h) => ({ heightM: h })), ...(cheat ? { style: { armSwing: true } } : {}) };
    case 'cmjArms': return { trials: hs([0.46, 0.48, 0.47]).map((h) => ({ heightM: h })), ...(cheat ? {} : { style: { armSwing: true } }) };
    case 'singleLeft': case 'singleRight': {
      const trials = hs([0.2, 0.22, 0.21]).map((h) => ({ heightM: h }));
      // jumping off the LEFT leg holds the RIGHT foot up
      return cheat ? { trials } : { trials, style: { liftLeg: id === 'singleLeft' ? 'Right' : 'Left' } };
    }
    case 'rj105': {
      const c = o.contactMs ?? (cheat ? 320 : 180);
      return { trials: hs(Array.from({ length: 10 }, () => 0.3)).map((h, i, a) => ({ heightM: h, ...(i < a.length - 1 ? { reboundMs: c } : {}) })) };
    }
  }
}

/** A protocol's take, filmed: frames on the real clock (as a 1× video decodes) and the truth of each jump. */
export function protocolTake(id: ProtocolId, o: ProtocolTakeOpts): { frames: PoseFrame[]; truth: TrialTruth[] } {
  const { trials, style } = protocolBeats(id, o);
  const take = buildTake(trials.map((trial) => ({ trial })), { leadS: PROTOCOL_LEAD_S, ...(style ? { style } : {}) });
  return filmTake(take, { fps: o.fps, seed: o.seed ?? 1, ...(o.noise !== undefined ? { noise: o.noise } : {}) });
}

/** The same frames as a phone's stretched slow-mo export: every time × k (the file plays k× slower). */
export const stretched = (frames: readonly PoseFrame[], k: number): PoseFrame[] =>
  frames.map((f) => ({ ...f, t: f.t * k, ...(f.arrive !== undefined ? { arrive: f.arrive * k } : {}) }));
