// hoopsStreams — synthetic hoops bodies for the hoops-by-body gates (Mirror & coaching Phase 7, 2026-10-07).
//
// The recorded takes (lib/pose/__fixtures__) carry two real jump shots (jumpshot, jumpshot_dribble), a jog in place, a
// sideways shuffle and a punch take — but no crossover, no set shot, no one-handed release at a chosen instant, no
// swipe-down steal and no defender's sit-down. These are those, scripted on synth.ts's rest body (the same way
// streamKit's adversarial streams are) and filmed through synthesize(): their truth is the script's own instants, so a
// gate can say "released 120 ms before the apex" and check the reader and the grade against it. SYNTHESIZED, not
// recorded: what they prove is the chain (reader → shot read → meter), not that a living room reads the same — that is
// the real-device test's.
//
// Used by lib/move/hoopsBody.test.ts, lib/move/bodyControlSource.test.ts and the live probe
// scripts/probes/_hoops-body-live.mts. Pure: no DOM, no fs, deterministic.
import { restPose, type Joints, type V3 } from '@/lib/pose/synth';
import { crouch, scriptedJump, armsUp, type Beat } from '@/lib/pose/streamKit';

export const REST: Joints = restPose();
type Side = 'Left' | 'Right';

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: number, b: number, u: number): number => a + (b - a) * Math.max(0, Math.min(1, u));
const ease = (u: number): number => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };

/** One arm swung about its shoulder in the body's forward plane (streamKit.armsSwing, one side): 0 hanging, 1 overhead. */
export function armSwingSide(j: Joints, side: Side, u: number): Joints {
  const a = u * Math.PI, c = Math.cos(a), s = Math.sin(a), out = { ...j };
  const S = j[`${side}Arm`];
  const rot = (p: V3): V3 => { const d = sub(p, S); return [S[0] + d[0], S[1] + d[1] * c - d[2] * s, S[2] + d[1] * s + d[2] * c]; };
  out[`${side}ForeArm`] = rot(j[`${side}ForeArm`]); out[`${side}Hand`] = rot(j[`${side}Hand`]);
  return out;
}

/**
 * The shooting arm, by where its joints sit off its own shoulder (m: x toward the body's middle, y up, z toward the camera):
 * the SET POINT holds the ball just over the forehead (the wrist ~6 cm over the crown line, the elbow up and forward), the
 * RELEASE is the elbow straightened (the wrist 25 cm higher). The guide hand rises beside the ball to the set and stays.
 */
const SET = { fore: [0.06, 0.16, 0.2] as V3, hand: [0.1, 0.33, 0.14] as V3 };
const RELEASE = { fore: [0.06, 0.3, 0.12] as V3, hand: [0.1, 0.58, 0.08] as V3 };
const GUIDE = { fore: [0.1, 0.12, 0.2] as V3, hand: [0.2, 0.28, 0.16] as V3 };
const lerp3 = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
/** One arm placed at offsets off its shoulder, blended from where the body has it by `w` (0 = the body's own arm). */
function placeArm(j: Joints, side: Side, at: { fore: V3; hand: V3 }, w: number): Joints {
  const S = j[`${side}Arm`], inward = side === 'Left' ? -1 : 1, out = { ...j };
  const off = (v: V3): V3 => add(S, [v[0] * inward, v[1], v[2]]);
  out[`${side}ForeArm`] = lerp3(j[`${side}ForeArm`], off(at.fore), w);
  out[`${side}Hand`] = lerp3(j[`${side}Hand`], off(at.hand), w);
  return out;
}
const blendArm = (a: { fore: V3; hand: V3 }, b: { fore: V3; hand: V3 }, u: number) => ({ fore: lerp3(a.fore, b.fore, u), hand: lerp3(a.hand, b.hand, u) });

export interface ShotScript {
  /** Launch speed (m/s): 2.6 ≈ a 34 cm hip rise, the recorded jump shot's. */
  v0?: number;
  /** The release (the push's middle) against the apex (s, − = before). */
  releaseVsApexSec: number;
  /** Which hand shoots ('both': a two-hand push). */
  hand?: Side | 'both';
  dip?: number;
}

/** The push from the set point: an elbow straightening over this long (s). */
export const PUSH_SEC = 0.12;
const LIFT_SEC = 0.3, LOWER_SEC = 0.4;

/** The arms of a shot at `t`, released at `tRel`, lowered from `tDown`. */
function shotArms(body: Joints, t: number, tRel: number, tDown: number, hand: Side | 'both'): Joints {
  const push = Math.max(0, Math.min(1, (t - (tRel - PUSH_SEC / 2)) / PUSH_SEC));
  const shooting = blendArm(SET, RELEASE, push);
  const w = t < LIFT_SEC ? ease(t / LIFT_SEC) : t < tDown ? 1 : 1 - ease((t - tDown) / LOWER_SEC);
  if (hand === 'both') return placeArm(placeArm(body, 'Left', shooting, w), 'Right', shooting, w);
  const guide: Side = hand === 'Left' ? 'Right' : 'Left';
  return placeArm(placeArm(body, hand, shooting, w), guide, GUIDE, w);
}

/**
 * A jump shot: the ball lifted to the set point, the dip, the jump, the push from the set point around the release
 * instant, held up through the landing, then lowered. Returns the beat and its truth (seconds into the beat).
 */
export function shotBeat(o: ShotScript): { beat: Beat; tOff: number; tApex: number; tRelease: number; tLand: number } {
  const hand = o.hand ?? 'Right';
  const J = scriptedJump(REST, o.v0 ?? 2.6, o.dip ?? 0.2, 0.1, false);
  const tApex = J.tOff + (J.tLand - J.tOff) / 2;
  const tRel = tApex + o.releaseVsApexSec;
  const tDown = Math.max(J.tLand, tRel + PUSH_SEC) + 0.1;
  return { beat: [tDown + LOWER_SEC + 0.3, (t) => shotArms(J.pose(t), t, tRel, tDown, hand)], tOff: J.tOff, tApex, tRelease: tRel, tLand: J.tLand };
}

/** A set shot: the same set point and push, feet on the floor throughout. */
export function setShotBeat(hand: Side | 'both' = 'Right'): { beat: Beat; tRelease: number } {
  const tRel = 0.9, tDown = tRel + 0.5;
  return { beat: [tDown + LOWER_SEC + 0.3, (t) => shotArms(REST, t, tRel, tDown, hand)], tRelease: tRel };
}

/**
 * A crossover dribble in place: the ball hand low at the hip, carried across in front of the body to the other side
 * (`crossSec`), the other hand takes it there; `n` swaps, `restSec` of dribbling between them. The wrists stay at
 * dribble height (well below the shoulders) the whole time.
 */
export function crossoverBeat(n: number, crossSec = 0.25, restSec = 0.6): { beat: Beat; swaps: number[] } {
  const low = crouch(REST, 0.08);
  const swaps: number[] = [];
  const period = crossSec + restSec;
  for (let k = 0; k < n; k++) swaps.push(restSec + k * period + crossSec / 2);
  const hand = (j: Joints, side: Side, dx: number, dz: number): Joints => {
    const out = { ...j };
    const H = j[`${side}Hand`], F = j[`${side}ForeArm`];
    out[`${side}Hand`] = add(H, [dx, 0.05, dz]);
    out[`${side}ForeArm`] = add(F, [dx * 0.5, 0.02, dz * 0.5]);
    return out;
  };
  // the ball side's wrist sits 0.08 m outside its hip; a carry moves it to the other hip's outside (≈ 0.6 m)
  const pose = (t: number): Joints => {
    let j = low;
    const k = Math.min(n - 1, Math.max(0, Math.floor((t - restSec) / period)));
    const into = t - (restSec + k * period);
    const fromRight = k % 2 === 0;   // the first carry goes right → left
    const u = t < restSec ? 0 : into <= crossSec ? ease(into / crossSec) : 1;
    const travel = 0.62;
    // the carrying hand goes across (its own side's x sign: Right is −x on the rest body)
    if (fromRight) j = hand(j, 'Right', travel * u, 0.18 * Math.sin(Math.PI * u));
    else j = hand(j, 'Left', -travel * u, 0.18 * Math.sin(Math.PI * u));
    return j;
  };
  return { beat: [restSec + n * period + 0.4, pose], swaps };
}

/** Both arms overhead, feet down, held: the grounded hand-up contest. */
export const handsUpBeat = (sec: number): Beat => [sec, () => armsUp(REST)];
/** One hand up (the other down), feet down: the contest a defender actually shows. */
export const handUpBeat = (sec: number, side: Side = 'Right'): Beat => [sec, (t) => armSwingSide(REST, side, ease(Math.min(1, t / 0.3)))];

/** A defender sitting down: a crouch of `depth` m eased in, held, then stood out of. */
export const sitBeat = (depth: number, sec: number): Beat => [sec, (t) => {
  const inU = ease(t / 0.35), outU = ease((sec - t) / 0.35);
  return crouch(REST, depth * Math.min(inU, outU));
}];

/** A swipe down at the ball from overhead, feet planted: the arm raised, then brought down fast. */
export function swipeBeat(side: Side = 'Right'): { beat: Beat; tSwipe: number } {
  const up = 0.45, hold = 0.25, down = 0.16;
  const tSwipe = up + hold + down / 2;
  return {
    beat: [up + hold + down + 0.6, (t) => {
      const u = t < up ? ease(t / up) : t < up + hold ? 1 : t < up + hold + down ? 1 - (t - up - hold) / down : 0;
      return armSwingSide(REST, side, u);
    }],
    tSwipe,
  };
}
