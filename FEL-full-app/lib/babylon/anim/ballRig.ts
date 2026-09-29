// ballRig (Babylon) — the ball lives in the hands. Ends the floor-ball and
// invisible-flight bugs. Eastbay path is keyed to timing.ts timestamps.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import { EASTBAY_TIMING as T } from './authored/timing';
import { boneNode, findBone } from './boneLookup';

// A+ P8 H4 (2026-09-07): the ball's centre in the ball hand's node frame. Measured on the live hero rig (probe: the forearm sits at
// (-0.197, 0.059, -0.116) in RightHand space, so the fingers run along (0.835, -0.25, 0.49) and the palm faces (0.47, -0.14, -0.87)).
// Before: (0, -0.07, 0.10) — 6.6 cm toward the fingers but 8 cm toward the BACK of the hand: the ball rode over the wrist, off
// the palm. After: 7.5 cm along the fingers + 13 cm out of the palm face (ball radius 0.12 + the hand's half thickness) —
// the ball sits in the palm with the fingers around it (closeups: scratchpad palm-*.png, six candidates, two angles).
const PALM_OFFSET = new Vector3(0.12, -0.04, -0.08);
/** The palm offset for callers that settle a caught ball into the hand (read-only: copy it). */
export const PALM_OFFSET_READONLY: Readonly<Vector3> = PALM_OFFSET;
// DUNK-BALL-ARMS-RIM (2026-09-14): PALM_OFFSET was measured on the RIGHT hand. The live rig's LeftHand frame is the right's
// mirror across its local x (forearm at (+0.215, 0.049, −0.083) in LeftHand space vs (−0.197, 0.059, −0.116) in RightHand
// space), so the same offset put a left-hand ball 13 cm BACK toward the forearm — its centre 4.5–7.7 cm from the wrist line,
// the ball through the wrist for the whole eastbay carry (45–49 frames measured). A ball opts in with `metadata.felPalmMirrorLeft`
// (the dunk's does); other modes keep their tuned left-hand carries until they are re-eyed.
const PALM_OFFSET_LEFT = new Vector3(-PALM_OFFSET.x, PALM_OFFSET.y, PALM_OFFSET.z);
/** The ball's centre in `hand`'s frame for this ball (the mirrored left palm when the ball opted in). */
export function palmOffsetOf(ball: AbstractMesh, hand: 'LeftHand' | 'RightHand' | string): Readonly<Vector3> {
  return ball.metadata?.felPalmMirrorLeft && /Left/.test(hand) ? PALM_OFFSET_LEFT : PALM_OFFSET;
}

function handNode(skeleton: Skeleton, hand: 'LeftHand' | 'RightHand'): TransformNode | null {
  return boneNode(skeleton, hand);
}

/** Parent the ball to a hand. Call on possession change. */
export function attachBallToHand(
  ball: AbstractMesh, skeleton: Skeleton, hand: 'LeftHand' | 'RightHand',
): boolean {
  const node = handNode(skeleton, hand);
  if (!node) { console.warn(`[FEL-BALL] no ${hand} bone`); return false; }
  endBallGather(ball);   // a snap supersedes any gather still easing the ball in
  ball.setParent(node);
  (ball.metadata ??= {}).felReleased = false;
  ball.position.copyFrom(palmOffsetOf(ball, hand));
  ball.rotationQuaternion = null;
  return true;
}

/** Detach into world space keeping the world transform (flight/physics). */
export function releaseBall(ball: AbstractMesh): void {
  endBallGather(ball);
  (ball.metadata ??= {}).felReleased = true;   // ballCarry: not ours to hand back
  ball.setParent(null);   // Babylon setParent(null) preserves world transform
}

// ── HOOPS MOTION phase 3 (2026-09-25): THE GATHER ────────────────────────────────────────────────────────────────────────
// Every pick-up was a warp. A mode that stops the dribble (a shot, a finish, a pass, a possession) re-parented the ball to a palm
// on that frame, wherever the bounce had it: up to 0.86 m in one frame (phase 1, S5; base2's ball path 0.64–1.32 m on the hoops
// finishes). The gather parents the ball to the hand with its WORLD position kept, then eases it into the palm over GATHER_SEC —
// never more than GATHER_STEP_M a drawn frame in the world — so the hand is seen taking the ball. The ball is the hand's from the
// first frame (every possession test that reads `ball.parent` holds), and a release mid-gather flies from where it is.
/** How long a gather takes to seat the ball in the palm (s). */
export const GATHER_SEC = 0.2;
/** Further than this from the palm, the hand-off is a reset (a check, a new rack) and the ball is put straight in the hand. */
export const GATHER_MAX_M = 1.3;
/** The fastest a gathered ball may move in the world (m/s) — a SPEED, so the motion is the same at 30 fps and 144 (review of 3a: a
 *  per-frame cap let a 30 fps body outrun the ball it had just taken, 1.67 m from the palm on a 6.4 m/s finish). At 60 fps it is the
 *  gate's 0.15 m a frame with a margin (GATHER_STEP_M). */
export const GATHER_MPS = 8.1;
/** The 60 fps step of GATHER_MPS (m). */
export const GATHER_STEP_M = GATHER_MPS / 60;
/** On top of the body's own travel a gathered ball may move this much faster (m/s): a body running 9 m/s into a dunk carries the
 *  ball it gathers at its own pace, and the ease still closes on the palm. */
export const GATHER_OVER_MPS = 1.8;
interface BallGatherState { node: TransformNode; hand: 'LeftHand' | 'RightHand'; from: Vector3; t: number; dur: number; prevWorld: Vector3; obs: unknown; scene: import('@babylonjs/core').Scene; body: TransformNode; prevBody: Vector3 }
/** The body a hand belongs to: its topmost ancestor (a spawn's root node) — whose travel a gathered ball is allowed to share. */
function bodyOf(n: TransformNode): TransformNode { let b = n; while (b.parent) b = b.parent as TransformNode; return b; }
const gatherOf = (ball: AbstractMesh): BallGatherState | undefined => (ball.metadata as { felGather?: BallGatherState } | null)?.felGather;
function endBallGather(ball: AbstractMesh): void {
  const g = gatherOf(ball); if (!g) return;
  g.scene.onBeforeCameraRenderObservable.remove(g.obs as never);
  (ball.metadata as { felGather?: BallGatherState }).felGather = undefined;
}
/** Keep this ball's last DRAWN position (after each render) — a gather started mid-frame, after the dribble already placed the ball
 *  for the frame, measures its first step from what was drawn (a 3v3 tell's gather read 0.175 m: the dribble's step plus the cap).
 *  Idempotent. */
export function trackDrawnBall(ball: AbstractMesh): void {
  const md = (ball.metadata ??= {}) as { felDrawn?: { p: Vector3; obs: unknown } };
  if (md.felDrawn) return;
  const p = new Vector3(Number.NaN, 0, 0);
  const scene = ball.getScene();
  const obs = scene.onAfterRenderObservable.add(() => { if (ball.isDisposed()) { scene.onAfterRenderObservable.remove(obs); return; } ball.computeWorldMatrix(true); p.copyFrom(ball.getAbsolutePosition()); });
  md.felDrawn = { p, obs };
}
/** Is a gather still easing this ball into a palm? */
export function ballGathering(ball: AbstractMesh): boolean { return !!gatherOf(ball); }

/**
 * The ball into a hand as a GATHER (see above). A ball already in that hand stays; one further than GATHER_MAX_M from the palm (or
 * hidden) is put straight in (a reset). The ease runs just before the camera draws, after the arms are posed and physics has run.
 */
export function gatherBallToHand(ball: AbstractMesh, skeleton: Skeleton, hand: 'LeftHand' | 'RightHand', sec = GATHER_SEC): boolean {
  const node = handNode(skeleton, hand);
  if (!node) { console.warn(`[FEL-BALL] no ${hand} bone`); return false; }
  if (ball.parent === node && !gatherOf(ball)) { (ball.metadata ??= {}).felReleased = false; return true; }
  const scene = ball.getScene();
  ball.computeWorldMatrix(true);
  const at = ball.getAbsolutePosition().clone();
  const palm = palmWorld(node, palmOffsetOf(ball, hand), new Vector3());
  if (!(sec > 0) || !ball.isEnabled() || Vector3.Distance(at, palm) > GATHER_MAX_M) return attachBallToHand(ball, skeleton, hand);
  endBallGather(ball);
  ball.setParent(node);   // the world transform kept: the ball has not moved yet
  const md = (ball.metadata ??= {}) as { felReleased?: boolean; felGather?: BallGatherState; felDrawn?: { p: Vector3 } };
  md.felReleased = false;
  const drawn = md.felDrawn?.p;
  const prev = drawn && Number.isFinite(drawn.x) && Vector3.Distance(drawn, at) < 0.5 ? drawn.clone() : at;
  trackDrawnBall(ball);
  const body = bodyOf(node); body.computeWorldMatrix(true);
  const g: BallGatherState = { node, hand, from: ball.position.clone(), t: 0, dur: sec, prevWorld: prev, obs: null, scene, body, prevBody: body.getAbsolutePosition().clone() };
  let last = typeof performance !== 'undefined' ? performance.now() : 0;
  // the step runs just before the camera draws — after the arms are posed AND after the physics step, which moves a Havok-driven root
  // after the animations (a cap read before it let the root's own travel through on top); once per drawn frame
  let lastFrame = -1;
  g.obs = scene.onBeforeCameraRenderObservable.add(() => {
    const fid = scene.getFrameId(); if (fid === lastFrame && fid !== 0) return; lastFrame = fid;
    const now = typeof performance !== 'undefined' ? performance.now() : last + 1000 / 60;
    const raw = (now - last) / 1000; last = now;
    const dt = raw >= 0.001 && raw <= 0.1 ? raw : 1 / 60;   // (a stalled or instant frame steps one 60 Hz frame)
    stepBallGather(ball, dt);
  });
  md.felGather = g;
  return true;
}

const _gw1 = new Vector3(), _gl = new Vector3(), _gInv = Matrix.Identity();
/**
 * One drawn frame of a gather (the scene calls it after the arms are posed; exported for tests). The ease is in the hand's frame
 * (from where the ball was taken to the palm); the CAP is in the world: the ball is drawn at most GATHER_MPS × dt from where it was
 * drawn last frame — whatever the hand did this frame (a ball held 0.5 m off a turning wrist would otherwise swing with it: measured,
 * 0.84 m in a frame on a hook's first frames) — or, when the BODY itself travels further than that in the frame, its travel plus
 * GATHER_OVER_MPS × dt (a body's own run is not a whip: capped at a whip's pace, a 30 fps finish on the run left the ball behind).
 * `stepCap` overrides the speed cap (m this frame). Returns true while the ball is still on its way.
 */
export function stepBallGather(ball: AbstractMesh, dt: number, stepCap?: number): boolean {
  const g = gatherOf(ball); if (!g) return false;
  if (ball.parent !== g.node) { endBallGather(ball); return false; }   // released, stolen or re-attached since
  g.t += dt;
  g.body.computeWorldMatrix(true);
  const bp = g.body.getAbsolutePosition();
  const bodyStep = Vector3.Distance(bp, g.prevBody); g.prevBody.copyFrom(bp);
  const speedCap = Math.max(stepCap ?? GATHER_MPS * dt, bodyStep < 0.5 ? bodyStep + GATHER_OVER_MPS * dt : 0);   // (a reset is not travel)
  const k0 = Math.min(1, g.t / g.dur), k = k0 * k0 * (3 - 2 * k0);
  const target = palmOffsetOf(ball, g.hand);
  Vector3.LerpToRef(g.from, target, k, _gl);
  g.node.computeWorldMatrix(true);
  const m = g.node.getWorldMatrix();
  Vector3.TransformCoordinatesToRef(_gl, m, _gw1);                     // where the eased ball would be drawn this frame
  const late = g.t > g.dur + 0.3;                                      // (half a second over: seat it, capped at twice the step)
  const cap = late ? 2 * speedCap : speedCap;
  const dx = _gw1.x - g.prevWorld.x, dy = _gw1.y - g.prevWorld.y, dz = _gw1.z - g.prevWorld.z, dl = Math.hypot(dx, dy, dz);
  const f = dl > cap ? cap / dl : 1;
  g.prevWorld.set(g.prevWorld.x + dx * f, g.prevWorld.y + dy * f, g.prevWorld.z + dz * f);
  m.invertToRef(_gInv);
  Vector3.TransformCoordinatesToRef(g.prevWorld, _gInv, ball.position);   // the drawn point, in the hand's frame
  if (k0 >= 1 && f === 1) { ball.position.copyFrom(target); endBallGather(ball); return false; }
  return true;
}

/** A hand-to-hand transfer keyed to a clip: which hand gives, which takes, on which clip second. */
export interface HandOffSpec { at: number; from: 'LeftHand' | 'RightHand'; to: 'LeftHand' | 'RightHand'; blend?: number }
/** The clip seconds either side of the transfer over which the ball travels palm to palm. */
export const HAND_OFF_BLEND = 0.08;

/** How far along the transfer the ball is: 0 in the giving hand, 1 in the receiving hand, smooth across the blend. The
 *  mode's wrist reach (HandIK) crossfades between the arms on the same curve — an arm swap on one frame moved both
 *  hands 0.66 m (measured) and threw the ball with them. */
export function handOffK(t: number, spec: HandOffSpec): number {
  const b = spec.blend ?? HAND_OFF_BLEND;
  const k0 = Math.min(1, Math.max(0, (t - (spec.at - b)) / (2 * b)));
  return k0 * k0 * (3 - 2 * k0);
}

const _palmA = new Vector3(), _palmB = new Vector3(), _inv = Matrix.Identity();
/** Where a hand's palm is in world space this frame. */
function palmWorld(node: TransformNode, offset: Readonly<Vector3>, out: Vector3): Vector3 {
  node.computeWorldMatrix(true);
  return Vector3.TransformCoordinatesToRef(offset, node.getWorldMatrix(), out);
}

/** A hand-off, per frame with clip-local time (DUNK-CONTROL-JUICE, 2026-09-08). The ball used to re-parent on the
 *  transfer frame with no travel: whatever gap the clip left between the palms on that frame was a POP (measured 0.3 m on
 *  the eastbay's under-the-leg pass). Now the ball is parented to the RECEIVING hand from `at − blend` and its local
 *  position is solved so its WORLD position eases from the giving palm to the receiving palm across the blend — the
 *  transfer reads on camera as a palm-to-palm pass, and the ball never floats: outside the blend it sits in a palm.
 *  Returns true on the frame the parent swaps (the mode marks it). */
export function runHandOffPath(
  ball: AbstractMesh, skeleton: Skeleton, t: number, spec: HandOffSpec, state: { inLeftHand: boolean },
): boolean {
  const blend = spec.blend ?? HAND_OFF_BLEND;
  const toLeft = spec.to === 'LeftHand';
  const giveNode = handNode(skeleton, spec.from), takeNode = handNode(skeleton, spec.to);
  if (!giveNode || !takeNode) return false;
  let swapped = false;
  if (t < spec.at - blend) {
    if (state.inLeftHand !== (spec.from === 'LeftHand') || ball.parent !== giveNode) { attachBallToHand(ball, skeleton, spec.from); state.inLeftHand = spec.from === 'LeftHand'; }
    return false;
  }
  if (state.inLeftHand !== toLeft || ball.parent !== takeNode) { attachBallToHand(ball, skeleton, spec.to); state.inLeftHand = toLeft; swapped = true; }
  if (t >= spec.at + blend) { ball.position.copyFrom(palmOffsetOf(ball, spec.to)); return swapped; }
  // inside the blend: world ease from the giving palm to the receiving palm, expressed in the receiving hand's frame
  const k0 = (t - (spec.at - blend)) / (2 * blend), k = k0 * k0 * (3 - 2 * k0);
  palmWorld(giveNode, palmOffsetOf(ball, spec.from), _palmA); palmWorld(takeNode, palmOffsetOf(ball, spec.to), _palmB);
  Vector3.LerpToRef(_palmA, _palmB, k, _palmA);
  takeNode.getWorldMatrix().invertToRef(_inv);
  Vector3.TransformCoordinatesToRef(_palmA, _inv, ball.position);
  return swapped;
}

/**
 * THE EASTBAY'S TWO PASSES (DUNK MOTION phase 10b). Rider's dunk goes under the leg FROM the off hand TO the dunking hand ("transfers
 * the ball under their left leg from left to right hand, and finishes the dunk with their right hand" — Haugen's definitions). Ours
 * went the other way: the right hand gave it away under the thigh and the weak hand dunked, the mirror image of the dunk. So the off
 * hand takes it up the front first (T.swap), and the pass under the thigh hands it back (T.handOff) for the right hand to finish.
 */
export const EASTBAY_PASSES: readonly HandOffSpec[] = [
  { at: T.swap, from: 'RightHand', to: 'LeftHand' },
  { at: T.handOff, from: 'LeftHand', to: 'RightHand' },
];
/** Of a trick's passes (in its own clip seconds), the one still ahead or under way at `t`. */
export function handOffSpecAt(specs: readonly HandOffSpec[], t: number): HandOffSpec {
  return specs.find((sp) => t < sp.at + (sp.blend ?? HAND_OFF_BLEND)) ?? specs[specs.length - 1];
}
/** Eastbay hand-to-hand — call each frame with clip-local time (sec): up the front into the off hand, under the thigh back to the
 *  dunking hand (the palm-to-palm blends are runHandOffPath's). */
export function runEastbayPath(
  ball: AbstractMesh, skeleton: Skeleton, t: number, state: { inLeftHand: boolean },
): boolean {
  return runHandOffPath(ball, skeleton, t, handOffSpecAt(EASTBAY_PASSES, t), state);
}

/** Flush through the rim on a make. Call per frame; true when finished. */
export function flushThroughRim(
  ball: AbstractMesh, rimCenter: Vector3, releasePos: Vector3, sinceReleaseSec: number,
): boolean {
  const DUR = 0.22;
  const k = Math.min(1, sinceReleaseSec / DUR);
  const ease = 1 - (1 - k) * (1 - k);
  Vector3.LerpToRef(releasePos, rimCenter, ease, ball.position);
  if (k >= 1) {
    ball.position.y = rimCenter.y - (sinceReleaseSec - DUR) * 2.4;  // through the net
    return sinceReleaseSec > DUR + 0.25;
  }
  return false;
}

/** Miss: visible clank off the rim — never a silent disappear. */
export function clankOffRim(ball: AbstractMesh, rimCenter: Vector3): Vector3 {
  const away = ball.position.subtract(rimCenter); away.y = 0; away.normalize();
  return new Vector3(away.x * 3.2, 2.6, away.z * 3.2);  // caller integrates gravity
}
