// reachBench — the standing reach and the touch height on the ground-truth bench (JUMP-PRO 2, 2026-10-25).
//
//   reach   lib/jump/approachTake.ts buildReach (facing the lens, stand, one arm straight up, hold) filmed through
//           lib/pose/synth.ts; lib/jump/reach.ts readReach's reachOverLeg against the truth (the index point over the
//           floor ÷ the body's leg, LEG_PATH_M)
//   ruler   every approach take's legPathM (the leg in metres from the jump's own free fall) against LEG_PATH_M
//   touch   reach (one read per seed) × that jump's legPathM + its vertical, against the truth's reach + v0 height —
//           and, for the record, against the highest index point the body reached in flight (what a camera "sees")
// Run it: `npx tsx scripts/jump-accuracy.ts --reach`.
//
// Pure, deterministic.
import { filmTake } from './ballistic';
import { buildReach, APPROACH_CAMERA, LEG_PATH_M, type ApproachTruth } from './approachTake';
import { approachConditions, approachTakes, type ApproachCondition } from './approachBench';
import { readApproach } from './approach';
import { readReach, touchHeight } from './reach';
import { jr } from './PROPOSED-jump';

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v: number[]) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ReachCondition { name: string; fps: number; distance: number; shrug?: number; elbowDeg?: number; holdS?: number; seeds?: number }
export interface ReachRow { name: string; fps: number; n: number; refused: number; why: Record<string, number>; biasCm: number; sdCm: number; claimedSdCm: number }

/** The reach conditions: each at each frame rate. */
export function reachConditions(seeds = 6): ReachCondition[] {
  const out: ReachCondition[] = [];
  for (const fps of [30, 60, 120, 240]) {
    out.push({ name: 'arm straight up, 3 m', fps, distance: 3, seeds });
    out.push({ name: 'arm straight up, 4.5 m', fps, distance: APPROACH_CAMERA.distance, seeds });
    out.push({ name: 'shrugging into it (+3 cm)', fps, distance: 3, shrug: 0.03, seeds });
    out.push({ name: 'arm flicked up, no hold (refuse)', fps, distance: 3, holdS: 0.05, seeds });
    // the elbow bent TOWARD the lens: facing it, the camera sees a straight arm a little lower (the honest limit)
    out.push({ name: 'elbow bent 25° toward the lens (unseen)', fps, distance: 3, elbowDeg: 25, seeds });
  }
  return out;
}

/** One reach take, read: the error of the reach (cm at the bench body's leg) and the read's own SD. */
export function readReachTake(c: ReachCondition, seed: number) {
  const r = buildReach({ ...(c.shrug ? { shrug: c.shrug } : {}), ...(c.elbowDeg ? { elbowDeg: c.elbowDeg } : {}), ...(c.holdS ? { holdS: c.holdS } : {}) });
  const { frames } = filmTake({ clip: r.clip, truth: [], decoys: 0 }, { fps: c.fps, seed, distance: c.distance });
  const read = readReach(frames, 4 / 3);
  const truthShare = r.truth.reachCm / 100 / LEG_PATH_M;
  return { read, truthShare, truthCm: r.truth.reachCm };
}

export function runReach(c: ReachCondition): ReachRow {
  const err: number[] = [], claimed: number[] = [];
  const why: Record<string, number> = {};
  let refused = 0;
  for (let seed = 1; seed <= (c.seeds ?? 6); seed++) {
    const { read, truthShare } = readReachTake(c, seed);
    if (!read.ok) { refused++; why[read.why] = (why[read.why] ?? 0) + 1; continue; }
    err.push((read.reachOverLeg - truthShare) * LEG_PATH_M * 100);
    claimed.push(read.reachOverLegSd * LEG_PATH_M * 100);
  }
  return { name: c.name, fps: c.fps, n: err.length, refused, why, biasCm: r2(mean(err)), sdCm: r2(sd(err)), claimedSdCm: r2(mean(claimed)) };
}

export interface TouchRow {
  name: string; fps: number; n: number;
  /** The leg in metres from free fall: bias and SD (%). */
  legBiasPct: number; legSdPct: number;
  /** The touch (reach + vertical) against the truth's reach + v0: bias / SD (cm), and the share inside the claimed 95 % range. */
  touchBiasCm: number; touchSdCm: number; within95: number;
  /** Against the highest index point the body reached in flight (+ the fingertip share): a definition gap, not an error. */
  vsFlightIndexCm: number;
}

/** The touch height over an approach condition: each seed's standing reach (60 fps, 3 m) with each of its jumps. */
export function runTouch(c: ApproachCondition): TouchRow {
  const leg: number[] = [], touch: number[] = [], vsIndex: number[] = [];
  let inside = 0;
  const takes = approachTakes(c);
  const per = takes.length / (c.seeds ?? 4);
  takes.forEach((tk, i) => {
    const seed = Math.floor(i / per) + 1;
    const { read, truthCm } = readReachTake({ name: 'reach', fps: 60, distance: 3 }, seed);
    if (!read.ok) return;
    const tr = tk.truth[0] as ApproachTruth;
    const j = readApproach(tk.frames, { aspect: 4 / 3, poseHz: c.fps }).jumps.find((x) => x.valid && Math.abs(x.takeoffT - tr.takeoffT) < 150);
    if (!j || !j.legPathM) return;
    leg.push((j.legPathM / LEG_PATH_M - 1) * 100);
    const t = touchHeight(j, read);
    if (!t) return;
    const fingertip = jr('jump.fingertipOverLeg') * LEG_PATH_M * 100;
    const truth = truthCm + fingertip + tr.heightV0Cm;
    touch.push(t.touchCm - truth);
    if (Math.abs(t.touchCm - truth) <= t.plusMinusCm) inside++;
    vsIndex.push(t.touchCm - (tr.touchCm + fingertip));
  });
  return {
    name: c.name, fps: c.fps, n: touch.length, legBiasPct: r2(mean(leg)), legSdPct: r2(sd(leg)),
    touchBiasCm: r2(mean(touch)), touchSdCm: r2(sd(touch)), within95: touch.length ? r2(inside / touch.length) : NaN, vsFlightIndexCm: r2(mean(vsIndex)),
  };
}

export const touchConditions = (seeds = 4) => approachConditions(seeds).filter((c) => !c.name.includes('blur'));

const f = (x: number) => (Number.isFinite(x) ? (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2)) : '–');
export function reachTable(rs: readonly ReachRow[]): string {
  return ['| reach condition | fps | read | refused | bias (cm) | SD (cm) | claimed SD (cm) |', '|---|---|---|---|---|---|---|',
    ...rs.map((r) => `| ${r.name} | ${r.fps} | ${r.n} | ${r.refused} | ${f(r.biasCm)} | ${r.sdCm.toFixed(2)} | ${r.claimedSdCm.toFixed(2)} |`)].join('\n');
}
export function touchTable(rs: readonly TouchRow[]): string {
  return ['| approach condition | fps | n | leg ruler bias (%) | SD (%) | touch bias (cm) | SD (cm) | inside its ±95 % | vs highest index point in flight (cm) |', '|---|---|---|---|---|---|---|---|---|',
    ...rs.map((r) => `| ${r.name} | ${r.fps} | ${r.n} | ${f(r.legBiasPct)} | ${r.legSdPct.toFixed(2)} | ${f(r.touchBiasCm)} | ${r.touchSdCm.toFixed(2)} | ${Math.round(r.within95 * 100)}% | ${f(r.vsFlightIndexCm)} |`)].join('\n');
}
