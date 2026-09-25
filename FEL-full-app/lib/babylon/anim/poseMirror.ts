// poseMirror — a pose clip's keys reflected across the body's midline (DUNK MOTION pass, phase 4, 2026-09-23).
//
// The dunk finishes were authored RIGHT-armed, so a dunk that ends with the ball in the LEFT hand (the eastbay after its
// pass, lost & found, behind the back, between the legs) had no finish of its own: pickAerialFinish sent it to the
// generic two-hand hang, and a one-hand dunk flushed with two. Keys are body-frame data (poseClip), so the mirror is
// exact and needs no rig: swap Left ↔ Right, negate x on every hand / foot target and elbow / knee pole, and negate the
// yaw and roll of every degree key (a pitch is the same pitch on both sides). The builder then solves the mirrored
// targets on the live skeleton like any other key.
import type { Deg3, PoseKey } from './poseClip';

type V3 = [number, number, number];
const flipX = (v: V3): V3 => [-v[0], v[1], v[2]];
const swapBone = (name: string): string => (name.startsWith('Left') ? `Right${name.slice(4)}` : name.startsWith('Right') ? `Left${name.slice(5)}` : name);
const flipDeg = (d: Deg3): Deg3 => [d[0], -d[1], -d[2]];

function sides<T>(rec: { Left?: T; Right?: T } | undefined, f: (v: T) => T): { Left?: T; Right?: T } | undefined {
  if (!rec) return undefined;
  const out: { Left?: T; Right?: T } = {};
  if (rec.Right !== undefined) out.Left = f(rec.Right);
  if (rec.Left !== undefined) out.Right = f(rec.Left);
  return out;
}

/** The same movement performed by the other side of the body. */
export function mirrorPoseKeys(keys: PoseKey[]): PoseKey[] {
  return keys.map((k) => {
    const m: PoseKey = { t: k.t };
    if (k.bones) m.bones = Object.fromEntries(Object.entries(k.bones).map(([b, d]) => [swapBone(b), flipDeg(d)]));
    const hands = sides(k.hands, flipX), handsRel = sides(k.handsRel, flipX), poles = sides(k.poles, flipX), feet = sides(k.feet, flipX);
    // HOTFIX (2026-09-24): the knee poles too (PoseKey.kneePoles, new for the Spider-Man's back leg). Built field by field, this
    // mirror dropped them, and a mirrored bent leg behind a low pelvis would point its knee at the front again — through the court.
    const kneePoles = sides(k.kneePoles, flipX);
    if (hands) m.hands = hands;
    if (handsRel) m.handsRel = handsRel;
    if (poles) m.poles = poles;
    if (feet) m.feet = feet;
    if (kneePoles) m.kneePoles = kneePoles;
    if (k.hipsY != null) m.hipsY = k.hipsY;
    if (k.hold) m.hold = true;
    return m;
  });
}
