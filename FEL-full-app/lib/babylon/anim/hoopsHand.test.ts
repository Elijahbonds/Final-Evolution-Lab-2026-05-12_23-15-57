// HOOPS MOTION phase 3 — right-handed on screen: the bball_* family mirrored on every hoops body (idempotent, dunks and everything
// else untouched), the gather that replaced every pick-up warp, and mirrorKey carrying every sided field of a pose key.
import { describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { rightHandHoops, rightHandBall, hoopsHand, ballToAthleteHand, HOOPS_MIRROR } from './hoopsHand';
import { attachBallToHand, gatherBallToHand, releaseBall, ballGathering, stepBallGather, GATHER_MAX_M, GATHER_STEP_M, GATHER_MPS, GATHER_OVER_MPS } from './ballRig';
import { mirrorKey } from './authored/basketball';

function body(scene: Scene) {
  const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
  const sk = new Skeleton('sk', 'sk', scene);
  const hips = new TransformNode('Hips', scene); hips.parent = root; hips.position.set(0, 1, 0); hips.rotationQuaternion = Quaternion.Identity();
  const hb = new Bone('Hips', sk, null, Matrix.Identity()); hb.linkTransformNode(hips);
  const n: Record<string, TransformNode> = { Hips: hips };
  // mirrored like the runtime rig: the rig's LEFT side on +x
  for (const [sd, x] of [['Left', 0.2], ['Right', -0.2]] as const) {
    for (const [name, pos] of [[`${sd}Arm`, [x, 0.45, 0]], [`${sd}Hand`, [x * 1.5, 0.1, 0.25]], [`${sd}UpLeg`, [x * 0.5, -0.05, 0]]] as const) {
      const t = new TransformNode(name, scene); t.parent = hips; t.position.set(pos[0], pos[1], pos[2]); t.rotationQuaternion = Quaternion.Identity();
      new Bone(name, sk, hb, Matrix.Identity()).linkTransformNode(t); n[name] = t;
    }
  }
  for (const t of [root, ...Object.values(n)]) t.computeWorldMatrix(true);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  return { root, sk, n, ball };
}
function group(scene: Scene, name: string, target: TransformNode): AnimationGroup {
  const g = new AnimationGroup(name, scene);
  const a = new Animation(`${name}_rot`, 'rotationQuaternion', 30, Animation.ANIMATIONTYPE_QUATERNION);
  a.setKeys([{ frame: 0, value: Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.3) }, { frame: 30, value: Quaternion.Identity() }]);
  g.addTargetedAnimation(a, target);
  return g;
}

describe('right-handed hoops (rightHandHoops)', () => {
  it('mirrors every bball_* group onto the other side of the body, once, and leaves the dunks and the rest to their owners', () => {
    const scene = new Scene(new NullEngine()); const b = body(scene);
    const groups = new Map<string, AnimationGroup>([
      ['bball_layup_gather', group(scene, 'bball_layup_gather', b.n.RightArm)],
      ['bball_mc_jumpshot', group(scene, 'bball_mc_jumpshot', b.n.RightArm)],
      ['dunk_windmill', group(scene, 'dunk_windmill', b.n.RightArm)],
      ['idle_stand', group(scene, 'idle_stand', b.n.RightArm)],
    ]);
    const animator = { groups };
    expect(rightHandHoops(animator, b.sk)).toBe(2);
    expect(groups.get('bball_layup_gather')!.targetedAnimations[0].target).toBe(b.n.LeftArm);   // the rig's right-arm key now drives the left
    expect(groups.get('bball_mc_jumpshot')!.targetedAnimations[0].target).toBe(b.n.LeftArm);
    expect(groups.get('dunk_windmill')!.targetedAnimations[0].target).toBe(b.n.RightArm);       // dunkHand's family
    expect(groups.get('idle_stand')!.targetedAnimations[0].target).toBe(b.n.RightArm);
    expect(rightHandHoops(animator, b.sk)).toBe(0);                                             // idempotent (felMirrored)
    expect(groups.get('bball_layup_gather')!.targetedAnimations[0].target).toBe(b.n.LeftArm);
    expect(HOOPS_MIRROR.test('bball_x') && !HOOPS_MIRROR.test('dunk_x')).toBe(true);
    expect(rightHandHoops({}, b.sk)).toBe(0);
  });
  it('the ball rides the hand drawn on the athlete\'s right, in the mirrored left palm', () => {
    const scene = new Scene(new NullEngine()); const b = body(scene);
    rightHandBall(b.ball);
    expect(hoopsHand({ skeleton: b.sk, root: b.root })).toBe('LeftHand');
    expect(hoopsHand({ skeleton: b.sk, root: b.root }, 'left')).toBe('RightHand');
    ballToAthleteHand(b.ball, { skeleton: b.sk, root: b.root }, 'right', false);
    expect(b.ball.parent).toBe(b.n.LeftHand);
    expect(b.ball.position.x).toBeCloseTo(-0.12, 9);   // PALM_OFFSET mirrored across x for the left hand
  });
});

describe('the gather (ballRig.gatherBallToHand)', () => {
  it('parents the ball at once with its world position kept, then eases it into the palm inside the per-frame cap', () => {
    const scene = new Scene(new NullEngine()); const b = body(scene);
    rightHandBall(b.ball);
    const hand = b.n.LeftHand.getAbsolutePosition();
    b.ball.position.set(hand.x + 0.1, 0.15, hand.z + 0.3);   // on the floor beside him, mid-bounce
    b.ball.computeWorldMatrix(true);
    const start = b.ball.getAbsolutePosition().clone();
    expect(gatherBallToHand(b.ball, b.sk, 'LeftHand')).toBe(true);
    b.ball.computeWorldMatrix(true);
    expect(b.ball.parent).toBe(b.n.LeftHand);
    expect(Vector3.Distance(b.ball.getAbsolutePosition(), start)).toBeLessThan(1e-6);
    let prev = start, steps = 0, maxStep = 0;
    while (ballGathering(b.ball) && steps++ < 120) {
      stepBallGather(b.ball, 1 / 60);
      b.ball.computeWorldMatrix(true);
      const p = b.ball.getAbsolutePosition().clone(); maxStep = Math.max(maxStep, Vector3.Distance(p, prev)); prev = p;
    }
    expect(ballGathering(b.ball)).toBe(false);
    expect(maxStep).toBeLessThanOrEqual(GATHER_STEP_M + 1e-6);
    expect(b.ball.position.x).toBeCloseTo(-0.12, 6);
  });
  it('the cap is in the WORLD: a hand that whips while it gathers (a hook\'s first frames) does not throw the ball with it', () => {
    const scene = new Scene(new NullEngine()); const b = body(scene);
    rightHandBall(b.ball);
    b.ball.position.copyFrom(b.n.LeftHand.getAbsolutePosition().add(new Vector3(0.1, -0.5, 0.3)));
    b.ball.computeWorldMatrix(true);
    let prev = b.ball.getAbsolutePosition().clone(), maxStep = 0;
    gatherBallToHand(b.ball, b.sk, 'LeftHand');
    for (let i = 0; i < 60 && ballGathering(b.ball); i++) {
      // the hand swings round the hips 0.4 m a frame for the first six frames, then holds
      if (i < 6) { b.n.Hips.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), (i + 1) * 0.6); b.n.Hips.computeWorldMatrix(true); b.n.LeftHand.computeWorldMatrix(true); }
      stepBallGather(b.ball, 1 / 60);
      b.ball.computeWorldMatrix(true);
      const p = b.ball.getAbsolutePosition().clone(); maxStep = Math.max(maxStep, Vector3.Distance(p, prev)); prev = p;
    }
    expect(maxStep).toBeLessThanOrEqual(GATHER_STEP_M + 1e-6);
    expect(ballGathering(b.ball)).toBe(false);
  });
  it('a ball further than GATHER_MAX_M from the palm (a reset) goes straight in; a snap or a release ends a gather', () => {
    const scene = new Scene(new NullEngine()); const b = body(scene);
    b.ball.position.set(5, 0.12, 5);
    expect(Vector3.Distance(b.ball.position, b.n.LeftHand.getAbsolutePosition())).toBeGreaterThan(GATHER_MAX_M);
    gatherBallToHand(b.ball, b.sk, 'LeftHand');
    expect(ballGathering(b.ball)).toBe(false); expect(b.ball.parent).toBe(b.n.LeftHand);
    releaseBall(b.ball);
    b.ball.position.copyFrom(b.n.RightHand.getAbsolutePosition().add(new Vector3(0, -0.5, 0)));
    gatherBallToHand(b.ball, b.sk, 'RightHand'); expect(ballGathering(b.ball)).toBe(true);
    attachBallToHand(b.ball, b.sk, 'LeftHand'); expect(ballGathering(b.ball)).toBe(false);
    b.ball.setParent(null); b.ball.position.copyFrom(b.n.RightHand.getAbsolutePosition().add(new Vector3(0, -0.5, 0)));
    gatherBallToHand(b.ball, b.sk, 'RightHand'); releaseBall(b.ball); expect(ballGathering(b.ball)).toBe(false);
  });
  it('the scene drives it just before the camera draws (after physics)', () => {
    const scene = new Scene(new NullEngine()); const b = body(scene);
    b.ball.position.copyFrom(b.n.LeftHand.getAbsolutePosition().add(new Vector3(0, -0.6, 0.2)));
    gatherBallToHand(b.ball, b.sk, 'LeftHand');
    for (let i = 0; i < 40; i++) scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    expect(ballGathering(b.ball)).toBe(false);
  });
});

describe('the gather\'s cap is a speed, and the body\'s own run is not a whip (review of 3a)', () => {
  for (const [fps, mps] of [[30, 6.4], [30, 5], [60, 9], [60, 6.4], [120, 6.4], [120, 0]] as const) {
    it(`gathering on the run at ${mps} m/s, ${fps} fps: the ball closes on the palm and never moves faster than the body plus the margin (or the cap)`, () => {
      const scene = new Scene(new NullEngine()); const b = body(scene);
      rightHandBall(b.ball);
      b.ball.position.copyFrom(b.n.LeftHand.getAbsolutePosition().add(new Vector3(0.05, -0.35, 0.15)));   // mid-bounce beside him
      b.ball.computeWorldMatrix(true);
      const dt = 1 / fps; let prev = b.ball.getAbsolutePosition().clone(), worstSpeed = 0, worstGap = 0, t = 0;
      gatherBallToHand(b.ball, b.sk, 'LeftHand');
      while (ballGathering(b.ball) && t < 1.5) {
        b.root.position.z += mps * dt; b.root.computeWorldMatrix(true);
        for (const n of Object.values(b.n)) n.computeWorldMatrix(true);
        stepBallGather(b.ball, dt); t += dt;
        b.ball.computeWorldMatrix(true);
        const p = b.ball.getAbsolutePosition().clone();
        worstSpeed = Math.max(worstSpeed, Vector3.Distance(p, prev) / dt); prev = p;
        const palm = b.n.LeftHand.getAbsolutePosition();
        worstGap = Math.max(worstGap, Vector3.Distance(p, palm));
      }
      expect(ballGathering(b.ball)).toBe(false);
      expect(t).toBeLessThan(0.36);                                      // seated inside the gather's time plus a frame or two
      expect(worstGap).toBeLessThan(0.45);                               // never left behind (was 1.67 m at 6.4 m/s, 30 fps)
      expect(worstSpeed).toBeLessThanOrEqual(Math.max(GATHER_MPS, mps + GATHER_OVER_MPS) + 1e-6);
    });
  }
  it('GATHER_STEP_M is the 60 fps step of GATHER_MPS', () => { expect(GATHER_STEP_M).toBeCloseTo(GATHER_MPS / 60, 12); });
});

describe('mirrorKey carries every sided field (HOOPS MOTION phase 3)', () => {
  it('hands, handsRel, poles, feet and kneePoles swap sides with x negated; bones swap and their yaw / roll flip; hold and hipsY stay', () => {
    const k = mirrorKey({
      t: 0.12, hipsY: 0.02, hold: true,
      bones: { Hips: [0, 120, 5], LeftUpLeg: [-52, 3, 8] },
      hands: { Right: [0.2, 2.0, 0.18] },
      handsRel: { Right: [0.09, -0.08, 0.41], Left: [-0.09, -0.08, 0.41] },
      poles: { Right: [0.9, 0.1, -0.3] },
      feet: { Left: [-0.2, 0.1, 0.3] },
      kneePoles: { Left: [-0.8, 0, 0.2] },
    });
    expect(k.t).toBe(0.12); expect(k.hipsY).toBe(0.02); expect(k.hold).toBe(true);
    expect(k.bones!.Hips).toEqual([0, -120, -5]); expect(k.bones!.RightUpLeg).toEqual([-52, -3, -8]);
    expect(k.hands).toEqual({ Left: [-0.2, 2.0, 0.18] });
    expect(k.handsRel).toEqual({ Left: [-0.09, -0.08, 0.41], Right: [0.09, -0.08, 0.41] });   // the left spin layup's two-hand tuck survives
    expect(k.poles).toEqual({ Left: [-0.9, 0.1, -0.3] });
    expect(k.feet).toEqual({ Right: [0.2, 0.1, 0.3] });
    expect(k.kneePoles).toEqual({ Right: [0.8, 0, 0.2] });
    const plain = mirrorKey({ t: 0, hands: { Right: [0.25, 0.95, 0.3] } });
    expect(plain.handsRel).toBeUndefined(); expect(plain.feet).toBeUndefined(); expect(plain.hold).toBeUndefined();
  });
});
