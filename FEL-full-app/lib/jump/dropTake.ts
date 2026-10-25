// dropTake — ground-truth DROP jumps for the bench (JUMP-PRO 2, 2026-10-25): step off a box, land, rebound as high and
// as fast off the floor as you can.
//
// The side-on body of lib/jump/approachTake.ts (same segments, same foot), built every millisecond:
//
//   stand     on the box top (`boxM` over the floor), toes at its edge, hands on the hips, still
//   step off  the lead foot (the right) reaches forward over the edge; the hips move forward and drop; the trailing
//             foot rolls onto its toes and leaves the box last — the step-off
//   drop      the centre of mass falls freely from the step-off's own velocity; both legs reach down, toes pointed
//   contact   touch-down solved by bisection (the lowest foot point reaches the floor); both feet planted where they
//             touched, toes then heels; the hips absorb and drive back up over `contactMs`, leaving at v0 = √(2gh)
//             of the CENTRE OF MASS (the rebound's force-plate height), on the toes
//   rebound   the centre of mass ballistic; the legs come through to the landing posture
//   landing   touch-down by bisection, absorb, stand, stand still
//
// TRUTH, from the joints: the rebound's take-off and touch-down, heightV0Cm (v0²/2g), heightFlightCm (g·T²/8), the
// drop's touch-down (the start of the contact), contactMs and RSI = h ÷ contact, the box's height, and how far the
// centre of mass fell from the step-off to the floor.
//
// Pure, deterministic.
import { bodyPoints, type JointClip, type Joints } from '@/lib/pose/synth';
import { comOfV3 } from './com';
import { G, SOURCE_HZ, type TrialTruth } from './ballistic';
import { SIDE_BODY, outOfReachCount, resetOutOfReach, type SideArm as Arm, type SideBody as Body, type SideFoot as Foot } from './approachTake';

const { footRel, stance, joints, placer, mapJ, swingFoot, relOf, hipOf, reachPitch, P_FLAT, LEG_MAX, HIP_DROP, herm, ease, lerp, clamp01, rad } = SIDE_BODY;

type YZ = [number, number];

/** At the rebound's take-off the hips are this far ahead of the toes (m), moving forward this fast (m/s): the knees
 *  straightening swing the legs back, so the hips must move forward for the body to go straight up (vz ≈ 0). */
const DROP_HIPS_OVER_TOE = 0.1, DROP_HIPS_VZ = 1.2;
/** The world spot (X, m) of the box's front edge. */
export const BOX_EDGE_X = -1.0;

export interface DropSpec {
  /** The box's height (m). */
  boxM: number;
  /** Truth: the rebound's centre-of-mass take-off-velocity height (m). */
  heightM: number;
  /** Ground contact, touch-down to take-off (ms). */
  contactMs: number;
  /** Knee bend at the rebound's touch-down (0 = lands extended). */
  landKnee?: number;
  /** Stand on the box this long first (s, default 1.2). */
  standS?: number;
}

export interface DropTruth extends TrialTruth {
  /** The drop's touch-down: the start of the contact (ms). */
  dropLandT: number;
  /** The step-off: the trailing toe leaving the box (ms). */
  stepOffT: number;
  contactMs: number;
  /** RSI = rebound height (m, v0²/2g) ÷ contact (s). */
  rsi: number;
  boxCm: number;
  /** The centre of mass's fall from the step-off to the drop's touch-down (cm). */
  dropFallCm: number;
}

export interface DropTake { clip: JointClip; truth: DropTruth[]; outOfReach: number }

/** One drop jump: stand on the box, step off, land, rebound, land, stand. */
export function buildDrop(s: DropSpec): DropTake {
  resetOutOfReach();
  const box = s.boxM, Tc = s.contactMs / 1000, standS = s.standS ?? 1.2;
  const handsOnHips: Arm = { flex: rad(-15), elbow: rad(105) };
  // ── 1. standing on the box: the toes at its edge (body z = 0 is the edge), the ankles under the hips
  const zTip0 = -0.02;
  const fStand = stance(zTip0, P_FLAT);
  const onBox = (f: Foot): Foot => ({ a: [f.a[0] + box, f.a[1]], pitch: f.pitch });
  const pzStand = fStand.a[1];
  const pyStand = box + HIP_DROP + fStand.a[0] + Math.sqrt((LEG_MAX * 0.999) ** 2 - 0);
  const standBody = (): Body => ({ py: pyStand, pz: pzStand, lean: 0, L: onBox(fStand), R: onBox(fStand), armL: handsOnHips, armR: handsOnHips });
  // ── 2. the step off: the hips go forward and a little down, the lead (right) foot swings out over the edge, the trailing
  // (left) foot stays on the box and rolls onto its toes (kept in reach), leaving at the end with the body falling
  const STEP = 0.4, tStep = standS, tOff = standS + STEP;
  const vzOff = 0.9, vyOff = -0.35;
  const stepPelvis = (x: number) => {
    const u = clamp01((x - tStep) / STEP);
    return { py: herm(pyStand, 0, pyStand - 0.07, vyOff * STEP, u), pz: herm(pzStand, 0, pzStand + 0.2, vzOff * STEP, u) };
  };
  const leadOut: YZ = [-0.72, 0.32];
  const stepBody = (x: number): Body => {
    const u = clamp01((x - tStep) / STEP), pv = stepPelvis(x);
    // the trailing foot: on the box, its heel lifting as the hips pass over and forward of it
    const trail = onBox(stance(zTip0, reachPitch([pv.py - box - HIP_DROP, pv.pz], zTip0, lerp(P_FLAT, rad(30), ease((u - 0.3) / 0.7)))));
    // the lead foot: lifted off the box, forward over the edge, reaching down
    const r0 = relOf(standBody(), onBox(fStand));
    const rel: YZ = [lerp(r0[0], leadOut[0], ease(u)) + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.4)), lerp(r0[1], leadOut[1], ease(u))];
    const lead = swingFoot(pv, rel, lerp(P_FLAT, rad(25), ease(u)));
    return { ...pv, lean: lerp(0, rad(8), ease(u)), L: trail, R: lead, armL: handsOnHips, armR: handsOnHips };
  };
  const comOf = (b: Body) => comOfV3(bodyPoints(joints(b)));
  // ── 3. the drop: the centre of mass ballistic from the step-off's own velocity; the legs reach down, toes pointed
  const bOff = stepBody(tOff);
  const cOff = comOf(bOff);
  const cPrev = comOf(stepBody(tOff - 0.002));
  const vy0 = (cOff[1] - cPrev[1]) / 0.002, vz0 = (cOff[2] - cPrev[2]) / 0.002;
  const relOff = { L: relOf(bOff, bOff.L), R: relOf(bOff, bOff.R) };
  const reachDown: YZ = [-0.85, 0.1];
  const dropPosture = (tau: number): Body => {
    const u = clamp01(tau / 0.22);
    const leg = (start: YZ, p0: number): Foot => swingFoot({ py: 0, pz: 0 }, [lerp(start[0], reachDown[0], ease(u)), lerp(start[1], reachDown[1], ease(u))], lerp(p0, rad(28), ease(u)));
    return { py: 0, pz: 0, lean: lerp(rad(8), rad(4), ease(u)), L: leg(relOff.L, bOff.L.pitch), R: leg(relOff.R, bOff.R.pitch), armL: handsOnHips, armR: handsOnHips };
  };
  const ballistic = (posture: (tau: number) => Body, c0: number[], vy: number, vz: number) => (tau: number): Body => {
    const pst = posture(tau);
    const c = comOf(pst);
    const cy = c0[1] + vy * tau - (G * tau * tau) / 2, cz = c0[2] + vz * tau;
    const dy = cy - c[1], dz = cz - c[2];
    const sh = (f: Foot): Foot => ({ a: [f.a[0] + dy, f.a[1] + dz], pitch: f.pitch });
    return { ...pst, py: dy, pz: dz, L: sh(pst.L), R: sh(pst.R) };
  };
  const dropBody = ballistic(dropPosture, cOff, vy0, vz0);
  const lowFoot = (b: Body) => { const p = bodyPoints(joints(b)); return Math.min(...[27, 28, 29, 30, 31, 32].map((i) => p[i][1])); };
  let lo = 0.02, hi = 1.0;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (lowFoot(dropBody(m)) > 0) lo = m; else hi = m; }
  const Tdrop = (lo + hi) / 2, tDropTd = tOff + Tdrop;
  const bDropTd = dropBody(Tdrop);
  // ── 4. the contact: both feet planted where they touched; the hips absorb, then drive up to leave at v0 (CoM)
  const tipZ = (f: Foot) => f.a[1] + footRel(f.pitch).tip[1];
  const tipY = (f: Foot) => f.a[0] + footRel(f.pitch).tip[0];
  const plant = { L: tipZ(bDropTd.L), R: tipZ(bDropTd.R) };
  const lowAt = { L: tipY(bDropTd.L), R: tipY(bDropTd.R) };
  const tTo = tDropTd + Tc;
  const vPyTd = (bDropTd.py - dropBody(Tdrop - 0.002).py) / 0.002, vPzTd = (bDropTd.pz - dropBody(Tdrop - 0.002).pz) / 0.002;
  const v0 = Math.sqrt(2 * G * s.heightM);
  // take-off: the hips over the toes, on the toes (as the approach's plant leaves), the legs all but straight
  const P_TO = rad(34);
  const midTip = (plant.L + plant.R) / 2;
  const pzTo = (plant.L + plant.R) / 2 + DROP_HIPS_OVER_TOE;
  const toAnkle = stance(midTip, P_TO).a;
  const pyTo = toAnkle[0] + Math.sqrt(Math.max(0, (LEG_MAX * 0.99) ** 2 - (pzTo - toAnkle[1]) ** 2)) + HIP_DROP;
  const contactPitch = (u: number) => (u < 0.2 ? lerp(rad(28), P_FLAT, ease(u / 0.2)) : u < 0.6 ? P_FLAT : lerp(P_FLAT, P_TO, ease((u - 0.6) / 0.4)));
  const contactBody = (x: number, vEnd: number): Body => {
    const u = clamp01((x - tDropTd) / Tc);
    // the hips: from the touch-down's height and speed down to the absorb's bottom and up to the take-off at vEnd
    const py = herm(bDropTd.py, vPyTd * Tc, pyTo, vEnd * Tc, u);
    const pz = herm(bDropTd.pz, vPzTd * Tc, pzTo, DROP_HIPS_VZ * Tc, u);
    const pv = { py, pz };
    const foot = (side: 'L' | 'R'): Foot => {
      const st = stance(plant[side], reachPitch(hipOf(pv), plant[side], contactPitch(u)));
      // the second foot comes down in the first 20 ms
      if (u * Tc < 0.02 && lowAt[side] > 0) return { a: [st.a[0] + lowAt[side] * (1 - (u * Tc) / 0.02), st.a[1]], pitch: st.pitch };
      return st;
    };
    return { ...pv, lean: lerp(bDropTd.lean, rad(6), ease(u)), L: foot('L'), R: foot('R'), armL: handsOnHips, armR: handsOnHips };
  };
  const comVy = (vEnd: number) => (comOf(contactBody(tTo, vEnd))[1] - comOf(contactBody(tTo - 0.002, vEnd))[1]) / 0.002;
  let a = v0 * 0.6, fa = comVy(a) - v0, b2 = v0 * 1.2, fb = comVy(b2) - v0;
  for (let k = 0; k < 14 && Math.abs(fb) > 1e-4; k++) { const c = b2 - (fb * (b2 - a)) / (fb - fa); a = b2; fa = fb; b2 = c; fb = comVy(b2) - v0; }
  const vHip = b2;
  // ── 5. the rebound flight: the centre of mass ballistic; the toes trail, the legs come through to the landing
  const bTo = contactBody(tTo, vHip);
  const cTo = comOf(bTo);
  const vyR = comVy(vHip), vzR = (cTo[2] - comOf(contactBody(tTo - 0.002, vHip))[2]) / 0.002;
  const relTo = { L: relOf(bTo, bTo.L), R: relOf(bTo, bTo.R) };
  const lk = s.landKnee ?? 0;
  const landRel: YZ = [-0.84 + 0.3 * lk, 0.06 + 0.12 * lk];
  const P_LAND = rad(22) - rad(15) * lk;
  const Tn = (2 * vyR) / G;
  const flightPosture = (tau: number): Body => {
    const sN = clamp01(tau / Tn);
    const leg = (start: YZ, p0: number): Foot => {
      const pitch = sN < 0.4 ? lerp(p0 + rad(10) * ease(clamp01(tau / 0.06)), rad(25), ease(sN / 0.4)) : lerp(rad(25), P_LAND, ease((sN - 0.5) / 0.5));
      const mid: YZ = [-0.8, 0.0];
      const r: YZ = sN < 0.4 ? [lerp(start[0], mid[0], ease(sN / 0.4)), lerp(start[1], mid[1], ease(sN / 0.4))] : [lerp(mid[0], landRel[0], ease((sN - 0.4) / 0.6)), lerp(mid[1], landRel[1], ease((sN - 0.4) / 0.6))];
      return swingFoot({ py: 0, pz: 0 }, r, pitch);
    };
    return { py: 0, pz: 0, lean: rad(5), L: leg(relTo.L, bTo.L.pitch), R: leg(relTo.R, bTo.R.pitch), armL: handsOnHips, armR: handsOnHips };
  };
  const flightBody = ballistic(flightPosture, cTo, vyR, vzR);
  lo = Tn * 0.5; hi = Tn * 1.8;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (lowFoot(flightBody(m)) > 0) lo = m; else hi = m; }
  const T = (lo + hi) / 2, tTd = tTo + T;
  // ── 6. the landing: planted, absorb, stand up, stand still
  const bTd = flightBody(T);
  const vPy = (bTd.py - flightBody(T - 0.002).py) / 0.002, vPz = (bTd.pz - flightBody(T - 0.002).pz) / 0.002;
  const landTip = { L: tipZ(bTd.L), R: tipZ(bTd.R) };
  const lowL = tipY(bTd.L), lowR = tipY(bTd.R);
  const ABS = 0.3, UP = 0.55, STILL = 1.2, absorb = 0.14 + 0.1 * lk;
  const yStand = HIP_DROP + stance(0, P_FLAT).a[0] + LEG_MAX * 0.999;
  const landBody = (x: number): Body => {
    const u = x - tTd;
    const py = u < ABS ? herm(bTd.py, vPy * ABS, bTd.py - absorb, 0, u / ABS) : u < ABS + UP ? lerp(bTd.py - absorb, yStand, ease((u - ABS) / UP)) : yStand;
    const pz = u < ABS ? herm(bTd.pz, vPz * ABS, bTd.pz + (vPz * ABS) / 2, 0, u / ABS) : bTd.pz + (vPz * ABS) / 2;
    const pv = { py, pz };
    const foot = (f: Foot, zt: number, low: number): Foot => {
      const st = stance(zt, reachPitch(hipOf(pv), zt, u < 0.06 ? lerp(f.pitch, P_FLAT, ease(u / 0.06)) : P_FLAT));
      if (u < 0.03 && low > 0) return { a: [st.a[0] + low * (1 - u / 0.03), st.a[1]], pitch: st.pitch };
      return st;
    };
    return { ...pv, lean: u < ABS ? lerp(bTd.lean, rad(12), ease(u / ABS)) : lerp(rad(12), 0, ease((u - ABS) / UP)), L: foot(bTd.L, landTip.L, lowL), R: foot(bTd.R, landTip.R, lowR), armL: handsOnHips, armR: handsOnHips };
  };
  // ── sample at 1 kHz, place in the world (the run of the step crosses the picture, +X)
  const segs: { to: number; at: (x: number) => Body }[] = [
    { to: tStep, at: () => standBody() },
    { to: tOff, at: stepBody },
    { to: tDropTd, at: (x) => dropBody(x - tOff) },
    { to: tTo, at: (x) => contactBody(x, vHip) },
    { to: tTd, at: (x) => flightBody(x - tTo) },
    { to: tTd + ABS + UP + STILL, at: landBody },
  ];
  const end = segs[segs.length - 1].to;
  const place = placer(0, [BOX_EDGE_X, 0, 0]);
  const n = Math.floor(end * SOURCE_HZ) + 1;
  const frames: Joints[] = new Array(n);
  let si = 0;
  for (let k = 0; k < n; k++) {
    const x = k / SOURCE_HZ;
    while (si < segs.length - 1 && x >= segs[si].to) si++;
    frames[k] = mapJ(joints(segs[si].at(Math.min(x, segs[si].to))), place);
  }
  const comTd = comOf(bTd)[1];
  const h = (vyR * vyR) / (2 * G);
  const truth: DropTruth = {
    takeoffT: tTo * 1000, landT: tTd * 1000, flightMs: T * 1000,
    heightV0Cm: h * 100, heightFlightCm: ((G * T * T) / 8) * 100, landDropCm: (comTd - cTo[1]) * 100,
    dropLandT: tDropTd * 1000, stepOffT: tOff * 1000, contactMs: Tc * 1000, rsi: h / Tc,
    boxCm: box * 100, dropFallCm: (cOff[1] - comOf(bDropTd)[1]) * 100,
  };
  return { clip: { fps: SOURCE_HZ, frames }, truth: [truth], outOfReach: outOfReachCount() };
}
