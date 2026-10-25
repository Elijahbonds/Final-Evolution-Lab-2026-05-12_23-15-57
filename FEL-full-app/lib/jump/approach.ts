// approach — the max approach vertical, read side-on from a run-up (JUMP-PRO 2, 2026-10-24; owner: "an approach jump
// shows BOTH the vertical in inches and the touch height").
//
// WHY NOT THE JUMP CHECK'S FINDER. lib/assess/graders/t5-cmj.ts detectFlights reads each take-off against the planted
// run the feet stood on before it — a stand. A run-up has none: the last contact is a ~0.2 s plant that rolls heel to
// toe while the body moves over it. On the one recorded run-up (lib/pose/__fixtures__/jump_one_foot_runup.json) the
// finder put the take-off 110 ms early and the refiner, fed that floor, 46 ms early (44.7 cm vs 37.0). And its flight
// needs a front view, hands on hips: an approach swings both arms and is filmed from the side.
//
// HOW.
//   find      a flight is a stretch with both feet off the floor for at least t5.flightMinMs whose centre of mass rises
//             (a running stride floats ~0.1 s and does not); the floor is the feet's own low envelope nearby, so no
//             stand is needed and no settle is asked for
//   plant     the foot (or feet) on the floor in the last frames before it: the take-off foot
//   re-time   lib/jump/refine.ts with the approach's options: the CENTRE OF MASS flies the parabola (the arms swing up and
//             a knee drives, so the hips do not fall freely), the take-off floor is a line through the plant foot's own
//             stance read at the toe-off, and a move along the lens axis is seen in the legs' segment lengths
//   height    the take-off-velocity height (v0²/2g of the centre of mass), the landing drop taken out — the force
//             plate's definition, as the jump check's; its own ± from the fits
// The body's size comes from its own legs (no calibration, no stand): bodyHeight = the straight leg's image length over
// LEG_SHARE. Free fall is the ruler for every metre.
//
// WHAT ONE SIDE-ON CAMERA CANNOT SEE (measured on lib/jump/approachBench.ts; docs/JUMP-PRO.md §9): motion along the
// lens axis is only the body growing or shrinking; a run angled toward or away from the lens changes the picture's
// scale through the flight, which the landing-drop correction cannot separate from the body landing lower.
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '@/lib/assess/calibration';
import { footLowY, worldHeight } from '@/lib/assess/geometry';
import { th } from '@/lib/assess/thresholds';
import { poseHz } from '@/lib/assess/scoring';
import { comOf } from './com';
import { legPathOf } from './reach';
import { REFINE, refineFlight, type RefinedFlight } from './refine';
import { CI95_Z, sessionStats, trialQuality, type JumpSession, type TrialQuality } from './session';

/** The approach finder's numbers (new, JUMP-PRO 2; measured on lib/jump/approachBench.ts). */
export const APPROACH = {
  /** Hip-joint-to-ankle over nose-to-floor, standing (the synth body 0.515; adult anthropometry ≈ 0.52). */
  legShare: 0.52,
  /** The floor is the feet's low envelope within this long either side (ms). */
  envMs: 500,
  /** …its 90th percentile (one jittered frame is not the floor). */
  envPct: 0.9,
  /** The centre of mass must rise this far (body heights) from the take-off to the apex. */
  minRiseBh: 0.06,
  /** Both feet on the floor within this long of the take-off: a two-foot take-off. */
  bothMs: 60,
  /** A flight counts when it falls like a body: rise ÷ fall within this of 1, the parabola within this RMS (cm), and
   *  the free-fall ruler within this log-distance of the body's size (e^0.7 ≈ 2×). */
  fall: { riseFall: 0.5, rmsCm: 2.5, logRuler: 0.7 },
  /** The re-timing starts this many half frames from the finder's take-off; the median take-off is kept. */
  starts: [-3, -2, -1, 0, 1],
} as const;

export interface ApproachJump {
  index: number;
  valid: boolean;
  invalidWhy?: string;
  takeoffT: number;
  landT: number;
  flightMs: number;
  /** The take-off-velocity height (cm) and its ±1 SD; the flight-time height g·T²/8. */
  heightCm: number;
  heightSdCm: number | null;
  heightFlightCm: number;
  landDropCm: number | null;
  method: 'refined' | 'frames';
  takeoffFoot: 'left' | 'right' | 'both' | null;
  /** Horizontal speed across the picture in the air (m/s), from the centre of mass and the free-fall ruler. */
  speedMps: number | null;
  /** The jump's 95 % range (cm): approachPlusMinusCm. */
  plusMinusCm: number;
  /**
   * The athlete's leg (hip → knee → ankle) in metres, measured by this jump's own free fall: the picture's leg × the
   * gravity ruler. It scales the stored standing reach into the touch height (lib/jump/reach.ts touchHeight).
   */
  legPathM: number | null;
  /** Its ±1 SD as a share; null = the bench's (jump.legRulerSdPct). */
  legPathSdShare: number | null;
  quality: TrialQuality;
}

export interface ApproachRead {
  jumps: ApproachJump[];
  bestIndex: number | null;
  bestHeightCm: number | null;
  poseFps: number;
  session: JumpSession;
}

const median = (v: number[]) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (v: number[], p: number) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const FEET = [27, 28, 29, 30, 31, 32];

/**
 * The body's size from its own legs, as the calibration the refiner reads (bodyHeight, worldHeight); the floor lines
 * are the feet's low envelope. Null when the legs were never seen.
 */
export function legCalibration(frames: readonly PoseFrame[], aspect: number): FrontCalibration | null {
  const vis = th('gate.visibility');
  const legs: number[] = [], worlds: number[] = [], lows: number[] = [];
  for (const f of frames) {
    if (!f.present || f.image.length < 33) continue;
    for (const [h, a] of [[23, 27], [24, 28]] as const) {
      if (f.image[h].v >= vis && f.image[a].v >= vis) legs.push(Math.hypot((f.image[h].x - f.image[a].x) * aspect, f.image[h].y - f.image[a].y));
    }
    const w = worldHeight(f.world);
    if (w !== null) worlds.push(w);
    if (FEET.every((k) => f.image[k].v >= vis)) lows.push(Math.max(footLowY(f.image, 'left'), footLowY(f.image, 'right')));
  }
  if (legs.length < 5) return null;
  const bodyHeight = pct(legs, 0.9) / APPROACH.legShare;
  const floorY = pct(lows, 0.9);
  const hip = floorY - bodyHeight * APPROACH.legShare;
  return {
    footFloorY: { left: floorY, right: floorY }, heelFloorY: { left: floorY, right: floorY }, floorY, bodyHeight, hipY: hip,
    legY: { left: bodyHeight * APPROACH.legShare, right: bodyHeight * APPROACH.legShare }, hipWidth: 0, fppa: { left: 0, right: 0 },
    pelvicTilt: { left: 0, right: 0 }, shift: 0,
    // the world skeleton's tallest reads (a running body is rarely upright): the ruler check's nominal size
    worldHeight: worlds.length >= legs.length / 4 ? pct(worlds, 0.9) : null,
    frames: legs.length,
  };
}

/** Every approach jump in a side-on clip. `aspect` is the picture's width ÷ height. */
export function readApproach(raw: readonly PoseFrame[], o: { aspect?: number; poseHz?: number } = {}): ApproachRead {
  const aspect = o.aspect ?? 4 / 3;
  const hz = o.poseHz ?? poseHz(raw);
  const empty: ApproachRead = { jumps: [], bestIndex: null, bestHeightCm: null, poseFps: hz, session: sessionStats([]) };
  const front = legCalibration(raw, aspect);
  if (!front) return empty;
  const vis = th('gate.visibility'), bh = front.bodyHeight, air = th('t5.airLine'), contact = th('t5.contactLine');
  // a fast foot comes back unsure (motion blur, a run's feet at 4–8 m/s): it still counts for finding the flight, as the
  // refiner counts it (REFINE.unsureVis), so a blurred run-up is not a run-up with no feet
  const fr = raw.filter((f) => f.present && f.image.length >= 33 && f.image[23].v >= vis && f.image[24].v >= vis && FEET.every((k) => f.image[k].v >= REFINE.unsureVis));
  if (fr.length < 10) return empty;
  const lowL = fr.map((f) => footLowY(f.image, 'left')), lowR = fr.map((f) => footLowY(f.image, 'right'));
  const lowest = fr.map((_, i) => Math.max(lowL[i], lowR[i]));
  // the floor near each frame: the feet's low envelope
  const env = fr.map((f) => pct(fr.flatMap((g, j) => (Math.abs(g.t - f.t) <= APPROACH.envMs ? [lowest[j]] : [])), APPROACH.envPct));
  const inAir = fr.map((_, i) => (env[i] - lowest[i]) / bh > air);
  const comY = fr.map((f) => comOf(f.image).y);
  type Cand = { a: number; b: number };
  const cands: Cand[] = [];
  for (let i = 1; i < fr.length; i++) {
    if (!inAir[i] || inAir[i - 1]) continue;
    let j = i;
    while (j < fr.length && inAir[j]) j++;
    if (j >= fr.length) break;
    const a = i - 1, b = j;
    const top = Math.min(...comY.slice(i, j));
    if (fr[b].t - fr[a].t >= th('t5.flightMinMs') && (comY[a] - top) / bh >= APPROACH.minRiseBh) cands.push({ a, b });
    i = j;
  }
  const jumps: ApproachJump[] = [];
  cands.forEach((c, k) => {
    const g = fr[c.a];
    const onFloor = (low: number[], q: number) => (env[q] - low[q]) / bh <= contact * 2;
    const footAt = (low: number[]) => { let q = c.a; while (q > 0 && fr[c.a].t - fr[q].t <= APPROACH.bothMs) { if (onFloor(low, q)) return true; q--; } return false; };
    const l = footAt(lowL), r = footAt(lowR);
    const takeoffFoot: ApproachJump['takeoffFoot'] = l && r ? 'both' : l ? 'left' : r ? 'right' : (lowL[c.a] > lowR[c.a] ? 'left' : 'right');
    const to0 = (g.t + fr[c.a + 1].t) / 2, td0 = (fr[c.b - 1].t + fr[c.b].t) / 2;
    // the re-timed take-off depends a little on where the search starts (the toe leaves slowly, so the leg line beside
    // the edge is shallow): start it from each half frame around the finder's edge and keep the median take-off's read
    const near = { prevLandT: k > 0 ? fr[cands[k - 1].b].t : undefined, nextTakeoffT: cands[k + 1] ? fr[cands[k + 1].a].t : undefined };
    const step = 500 / hz;
    const reads = APPROACH.starts.map((s) => refineFlight(raw, front, to0 + s * step, td0, near, { point: 'com', plantFloor: true, depthCue: 'legs', aspect, shrinkDrop: false, rescale: true })).filter((x): x is RefinedFlight => x !== null).sort((a, b) => a.takeoffT - b.takeoffT);
    const rf: RefinedFlight | null = reads.length ? reads[(reads.length - 1) >> 1] : null;
    const flightMs = rf ? rf.flightMs : td0 - to0;
    const hFlight = ((9.81 * (flightMs / 1000) ** 2) / 8) * 100;
    const heightCm = rf ? rf.heightTovCm : hFlight;
    let invalidWhy: string | undefined;
    const nominal = (front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight;
    if (!rf) invalidWhy = 'the camera could not time it from your whole body';
    else if (flightMs > th('t5.flightMaxMs') || heightCm > th('t5.maxHeightCm')) invalidWhy = `it read over ${th('t5.maxHeightCm')} cm, so the camera lost your feet`;
    // a flight that did not fall like a body: its apex far from mid-flight, a loose parabola, or a ruler nothing like the
    // body's size (measured: every bench approach and recorded jump 0.75–1.15, 0.2–1.9 cm, 0.8–1.45; the false reads
    // after a landing 40, 5.0 — APPROACH.fall)
    else if (!(Math.abs(rf.riseFall - 1) <= APPROACH.fall.riseFall && rf.rmsCm <= APPROACH.fall.rmsCm && Math.abs(Math.log(rf.ruler / nominal)) <= APPROACH.fall.logRuler)) invalidWhy = 'it did not fall like a jump, so the camera lost you';
    // an approach always lands lower than it left (the take-off is the whole body at full stretch on one toe): a landing
    // that reads HIGHER means the take-off was put on a bent leg of the plant, a blurred foot's misread — the flight is
    // too long to trust (bench: every such read was 30–85 ms early and 9–25 cm high)
    else if (rf.dropSkipped === 'rose' || rf.dropSkipped === 'ruler') invalidWhy = 'the camera could not see your take-off foot clearly';
    // the speed across the picture: the centre of mass's x in the air, a line, through the ruler
    let speedMps: number | null = null;
    if (rf) {
      const pts = raw.filter((f) => f.present && f.image.length >= 33 && f.t > rf.takeoffT + 25 && f.t < rf.landT - 25).map((f) => ({ t: f.t, x: comOf(f.image).x * aspect }));
      if (pts.length >= 3) {
        const mt = pts.reduce((a, p) => a + p.t, 0) / pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const sl = pts.reduce((a, p) => a + (p.t - mt) * (p.x - mx), 0) / pts.reduce((a, p) => a + (p.t - mt) ** 2, 0);
        speedMps = Math.round(Math.abs(sl * 1000 * rf.ruler) * 10) / 10;
      }
    }
    // the leg in metres: its picture length around the flight (the parabola's own scale) × the free-fall ruler
    let legPathM: number | null = null;
    if (rf) {
      const legs = raw.filter((f) => f.t >= rf.takeoffT - 200 && f.t <= rf.landT + 200).map((f) => legPathOf(f, aspect)).filter((x): x is number => x !== null);
      if (legs.length >= 5) legPathM = Math.round(median(legs) * rf.ruler * 1000) / 1000;
    }
    const pm = approachPlusMinusCm({ heightSdCm: rf ? rf.heightTovSdCm : null, flightMs }, hz);
    jumps.push({
      index: k + 1, valid: !invalidWhy, ...(invalidWhy ? { invalidWhy } : {}),
      takeoffT: Math.round(rf ? rf.takeoffT : to0), landT: Math.round(rf ? rf.landT : td0), flightMs: Math.round(flightMs),
      heightCm: Math.round(heightCm * 10) / 10, heightSdCm: rf ? Math.round(rf.heightTovSdCm * 10) / 10 : null,
      heightFlightCm: Math.round((rf ? rf.heightFlightCm : hFlight) * 10) / 10,
      landDropCm: rf && rf.landDropCm !== null ? Math.round(rf.landDropCm * 10) / 10 : null,
      method: rf ? 'refined' : 'frames', takeoffFoot, speedMps, plusMinusCm: pm, legPathM, legPathSdShare: null,
      quality: trialQuality({ refined: rf, poseHz: hz, valid: !invalidWhy }),
    });
  });
  const valid = jumps.filter((j) => j.valid);
  const best = valid.reduce<ApproachJump | null>((a, j) => (!a || j.heightCm > a.heightCm ? j : a), null);
  return { jumps, bestIndex: best?.index ?? null, bestHeightCm: best?.heightCm ?? null, poseFps: hz, session: sessionStats(valid) };
}

/** A jump's 95 % range (cm), never narrower than one frame's worth of flight time. */
export function approachPlusMinusCm(j: Pick<ApproachJump, 'heightSdCm' | 'flightMs'>, hz: number): number {
  const frame = hz > 0 ? (9.81 * (j.flightMs / 1000) * (1 / hz)) / 4 * 100 : 0;
  return Math.round(Math.max(frame, CI95_Z * (j.heightSdCm ?? 0)) * 10) / 10;
}
