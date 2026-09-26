// HOOPS MOTION phase 3 — the hoops carry (ballCarry `hoops: true`): the right hand as drawn, the pushed bounce, the crossing path,
// the gather, the chest hold, the wrists, and the stride lock. On a two-armed, two-legged rig mirrored the way the runtime hoops rigs
// are (the rig's LEFT arm on the root's +x: the athlete's right).
import { describe, expect, it } from 'vitest';
import { Bone, FreeCamera, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { mountBallCarry, dribbleWristDeg, crossLateral, crossHeight, HELD_STEP_M, HELD_MPS, type BallCarry } from './ballCarry';
import { attachBallToHand, releaseBall, ballGathering } from './ballRig';
import { HOOPS_DRIBBLE, PUSHED_FLOOR_PHASE, PUSHED_PEAK_RATE, dribbleAtPushed, pushedBounce01, strideLockHz, STRIDE_LOCK_HZ_MAX } from './Dribble';

function rig(scene: Scene) {
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);   // facing the rim (−z)
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q = Quaternion.Identity()) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q; nodes[name] = n; return n;
  };
  const hips = add('Hips', root, [0, 0.95, 0]);
  const spine = add('Spine2', hips, [0, 0.4, 0]);
  // mirrored: the rig's Left* bones on +x (the athlete's right, as drawn)
  for (const [sd, x] of [['Left', 0.18], ['Right', -0.18]] as const) {
    const sh = add(`${sd}Arm`, spine, [x, 0.1, 0], Quaternion.RotationAxis(new Vector3(0, 0, 1), x > 0 ? 0.2 : -0.2));
    const el = add(`${sd}ForeArm`, sh, [0.02 * Math.sign(x), -0.28, 0], Quaternion.RotationAxis(Vector3.Right(), 0.4));
    add(`${sd}Hand`, el, [0, -0.26, 0]);
    const up = add(`${sd}UpLeg`, hips, [x * 0.55, -0.05, 0]);
    const kn = add(`${sd}Leg`, up, [0, -0.42, 0]);
    add(`${sd}Foot`, kn, [0, -0.4, 0]);
  }
  let parentBone: Record<string, Bone | null> = {};
  for (const n of Object.values(nodes)) {
    const pb = parentBone[(n.parent as TransformNode).name] ?? null;
    const b = new Bone(n.name, sk, pb, Matrix.Identity()); b.linkTransformNode(n); parentBone = { ...parentBone, [n.name]: b };
  }
  for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  (ball.metadata ??= {}).felPalmMirrorLeft = true;
  return { root, sk, ball, nodes };
}
const localX = (root: TransformNode, p: Vector3): number => {
  root.computeWorldMatrix(true);
  return p.subtract(root.getAbsolutePosition()).applyRotationQuaternion(Quaternion.Inverse(root.rotationQuaternion!)).x;
};
function driver(scene: Scene, carry: BallCarry, ball: import('@babylonjs/core').AbstractMesh) {
  const path: number[] = [];
  let last: Vector3 | null = null;
  /** a frame: the mode's update, the after-animations pass, then (`afterPhysics`) whatever moves the root before the camera draws —
   *  a Havok step — then the camera's before-render and the after-render (the recorder's slot) */
  const frame = (dt: number, speed: number, active: boolean, move?: () => void, afterPhysics?: () => void) => {
    move?.();
    carry.update(dt, speed, active);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    afterPhysics?.();
    scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    scene.onAfterRenderObservable.notifyObservers(scene);
    ball.computeWorldMatrix(true);
    const p = ball.getAbsolutePosition().clone();
    if (last) path.push(Vector3.Distance(p, last));
    last = p;
    return p;
  };
  return { frame, path, reset: () => { path.length = 0; last = null; } };
}

describe('the pushed bounce (Dribble.dribbleAtPushed)', () => {
  it('leaves the palm, meets the floor at PUSHED_FLOOR_PHASE, comes back to the palm — continuous, each leg monotonic', () => {
    expect(pushedBounce01(0)).toBeCloseTo(1, 9);
    expect(pushedBounce01(PUSHED_FLOOR_PHASE)).toBeCloseTo(0, 9);
    expect(pushedBounce01(0.999999)).toBeCloseTo(1, 4);
    let prev = 1;
    for (let ph = 0.005; ph <= PUSHED_FLOOR_PHASE; ph += 0.005) { const y = pushedBounce01(ph); expect(y).toBeLessThanOrEqual(prev + 1e-9); prev = y; }
    prev = 0;   // the floor
    for (let ph = PUSHED_FLOOR_PHASE + 0.005; ph < 1; ph += 0.005) { const y = pushedBounce01(ph); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); prev = y; }
  });
  it('is fastest at the floor (not in the hand): the peak rate is PUSHED_PEAK_RATE there, the catch at the top is slower', () => {
    const d = 1e-4;
    const rate = (ph: number) => Math.abs(pushedBounce01(ph + d) - pushedBounce01(ph - d)) / (2 * d);
    expect(rate(PUSHED_FLOOR_PHASE - 2 * d)).toBeCloseTo(PUSHED_PEAK_RATE, 1);
    expect(rate(0.98)).toBeLessThan(0.5 * PUSHED_PEAK_RATE);
    for (let ph = 0.01; ph < 1; ph += 0.01) expect(rate(ph)).toBeLessThanOrEqual(PUSHED_PEAK_RATE + 0.05);
  });
  it('at the hoops pace the ball moves ≤ 0.15 m a frame on its own (the old parabola peaked ~0.15 in the palm at 2.6 Hz)', () => {
    const drop = HOOPS_DRIBBLE.palmY - HOOPS_DRIBBLE.ballR;
    expect(PUSHED_PEAK_RATE * drop * HOOPS_DRIBBLE.hzFast / 60).toBeLessThan(0.11);
  });
  it('the hand rides the ball down, waits, and is ON the ball at the top', () => {
    const top = dribbleAtPushed(0, HOOPS_DRIBBLE);
    expect(top.handWeight).toBe(1);
    expect(top.hand.y - top.ball.y).toBeCloseTo(HOOPS_DRIBBLE.ballR, 9);
    const floor = dribbleAtPushed(PUSHED_FLOOR_PHASE, HOOPS_DRIBBLE);
    expect(floor.ball.y).toBeCloseTo(HOOPS_DRIBBLE.ballR, 9);
    expect(floor.handWeight).toBeLessThan(1);
  });
  it('the stride lock pulls the bounce onto the stride, one bounce a stride, never faster than its ceiling', () => {
    const P = 0.6;
    expect(strideLockHz(0.92, 0, P, 0.92)).toBeCloseTo(1 / P, 6);                // on the beat: exactly a stride's rate
    expect(strideLockHz(0.8, 0, P, 0.92)).toBeGreaterThan(1 / P);                  // behind: catches up
    expect(strideLockHz(0.1, 0, P, 0.92)).toBeLessThan(1 / P);                     // ahead: waits
    expect(strideLockHz(0.5, 0, 0.3, 0.92)).toBeLessThanOrEqual(STRIDE_LOCK_HZ_MAX);
  });
  it('a crossing is a straight line in plan and goes low; the dribbling wrist pushes at the top and cocks for the catch', () => {
    expect(crossLateral(-0.26, 0.26, 0.5)).toBeCloseTo(0, 9);
    expect(crossHeight(0)).toBe(1); expect(crossHeight(1)).toBeCloseTo(1, 9); expect(crossHeight(0.5)).toBeLessThan(0.8);
    expect(dribbleWristDeg(0.12)).toBeGreaterThan(20);
    expect(dribbleWristDeg(0.96)).toBeLessThan(-10);
    expect(dribbleWristDeg(0)).toBeCloseTo(dribbleWristDeg(1), 6);
  });
});

describe('the hoops carry', () => {
  it('starts in the hand drawn on the athlete\'s RIGHT (rig LeftHand on the mirrored rig), and the ball dribbles on his right', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    expect(carry.side).toBe('Left'); expect(carry.handBone).toBe('LeftHand'); expect(carry.hand).toBe('Right');
    const d = driver(scene, carry, r.ball);
    for (let i = 0; i < 40; i++) d.frame(1 / 60, 0.3, true);
    const x = localX(r.root, r.ball.getAbsolutePosition());
    expect(x).toBeGreaterThan(0.15);   // root +x = the athlete's right
    carry.dispose();
  });
  it('a dribble at a 6.4 m/s sprint keeps the ball inside 0.15 m a frame (the pushed bounce at the hoops rate)', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    for (let i = 0; i < 20; i++) d.frame(1 / 60, 1, true, () => { r.root.position.z -= 6.4 / 60; });
    d.reset();
    for (let i = 0; i < 120; i++) d.frame(1 / 60, 1, true, () => { r.root.position.z -= 6.4 / 60; });
    expect(Math.max(...d.path)).toBeLessThanOrEqual(0.15);
    carry.dispose();
  });
  it('switchHand is a PATH: the ball crosses in front, low, into the other hand — never a jump (it moved 0.52 m in a frame)', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    // dribble until just after a push (the ball on its way down)
    let n = 0, wrapped = false, last = -1;
    while (n++ < 400 && !(wrapped && carry.phase > 0.05 && carry.phase < 0.3)) { d.frame(1 / 60, 0.2, true); if (last >= 0 && carry.phase < last) wrapped = true; last = carry.phase; }
    expect(carry.phase).toBeLessThan(PUSHED_FLOOR_PHASE);
    d.reset();
    carry.switchHand();
    expect(carry.side).toBe('Right'); expect(carry.hand).toBe('Left'); expect(carry.crossing).toBe(true);
    const xs: number[] = [];
    for (let i = 0; i < 60; i++) { const p = d.frame(1 / 60, 0.2, true); xs.push(localX(r.root, p)); }
    expect(Math.max(...d.path)).toBeLessThan(0.15);
    const steps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
    expect(Math.max(...steps)).toBeLessThan(0.06);            // across in steps, not in one
    expect(xs[xs.length - 1]).toBeLessThan(-0.15);            // ends on the athlete's left
    expect(carry.crossing).toBe(false);
    carry.dispose();
  });
  it('asked on the way UP, the old hand takes it at the top and the next push crosses', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    let n = 0; while (carry.phase < 0.6 && n++ < 200) d.frame(1 / 60, 0.2, true);
    carry.switchHand();
    expect(carry.side).toBe('Left');       // still his until the top…
    expect(carry.hand).toBe('Left');       // …but on its way to the left hand
    n = 0; while (carry.side === 'Left' && n++ < 200) d.frame(1 / 60, 0.2, true);
    expect(carry.side).toBe('Right');
    expect(Math.max(...d.path)).toBeLessThan(0.15);
    carry.dispose();
  });
  it('toSide is a no-op on the side it is already on, a crossing otherwise; reset() puts a new possession back in the right hand', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    d.frame(1 / 60, 0.2, true);
    carry.toSide('right'); expect(carry.crossing).toBe(false);
    carry.toSide('left'); expect(carry.hand).toBe('Left');
    for (let i = 0; i < 60; i++) d.frame(1 / 60, 0.2, true);
    d.frame(1 / 60, 0, false);
    carry.reset();
    expect(carry.side).toBe('Left'); expect(carry.hand).toBe('Right'); expect(carry.crossing).toBe(false);
    carry.dispose();
  });
  it('the pick-up is a GATHER: the ball is the hand\'s at once, eases into the palm, never warps', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    let n = 0; while (Math.abs(carry.phase - PUSHED_FLOOR_PHASE) > 0.03 && n++ < 400) d.frame(1 / 240, 0.2, true);   // the ball near the floor
    d.frame(1 / 240, 0.2, true);
    d.reset();
    d.frame(1 / 60, 0, false);   // the shot: stop dribbling
    expect(r.ball.parent).toBe(r.nodes.LeftHand);
    expect(ballGathering(r.ball)).toBe(true);
    for (let i = 0; i < 40; i++) d.frame(1 / 60, 0, false);
    expect(ballGathering(r.ball)).toBe(false);
    expect(Math.max(...d.path)).toBeLessThanOrEqual(0.136);
    expect(Vector3.Distance(r.ball.position, new Vector3(-0.12, -0.04, -0.08))).toBeLessThan(1e-6);   // the mirrored left palm
    carry.dispose();
  });
  it('a steal or a release on the deactivation frame is left alone (no gather)', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    for (let i = 0; i < 10; i++) d.frame(1 / 60, 0.2, true);
    releaseBall(r.ball);
    d.frame(1 / 60, 0, false);
    expect(r.ball.parent).toBeNull(); expect(ballGathering(r.ball)).toBe(false);
    carry.dispose();
  });
  it('the dribble starts from where the palm had the ball (no jump to the stroke\'s top on the first frame)', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    d.frame(1 / 60, 0, false);
    d.reset();
    for (let i = 0; i < 30; i++) d.frame(1 / 60, 0.2, true);
    expect(Math.max(...d.path)).toBeLessThan(0.15);
    carry.dispose();
  });
  it('the wrists move while this body has the ball — both hands dribbling, the ball hand cocked under a held ball', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    const q0 = { L: r.nodes.LeftHand.rotationQuaternion!.clone(), R: r.nodes.RightHand.rotationQuaternion!.clone() };
    const range = { L: 0, R: 0 };
    for (let i = 0; i < 90; i++) {
      d.frame(1 / 60, 0.3, true);
      for (const sd of ['L', 'R'] as const) { const q = (sd === 'L' ? r.nodes.LeftHand : r.nodes.RightHand).rotationQuaternion!; range[sd] = Math.max(range[sd], 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(q, q0[sd])))) * 180 / Math.PI); }
    }
    expect(range.L).toBeGreaterThan(12);   // the dribbling hand: the push and the catch
    expect(range.R).toBeGreaterThan(3);    // the off hand keeps time with the bounce
    // held: the ball hand cocks back under it as it rises (the carry is off, the ball in the palm)
    d.frame(1 / 60, 0, false);
    for (let i = 0; i < 30; i++) d.frame(1 / 60, 0, false);
    const heldQ = r.nodes.LeftHand.rotationQuaternion!.clone();
    const up = Quaternion.RotationAxis(new Vector3(0, 0, 1), 2.6), fore = r.nodes.LeftForeArm.rotationQuaternion!.clone();
    // the arm goes up (a shot's set) — the "clip" re-poses it every frame, as the animation pass does
    for (let i = 0; i < 30; i++) d.frame(1 / 60, 0, false, () => { r.nodes.LeftArm.rotationQuaternion = up.clone(); r.nodes.LeftForeArm.rotationQuaternion = fore.clone(); });
    const moved = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(heldQ, r.nodes.LeftHand.rotationQuaternion!)))) * 180 / Math.PI;
    expect(moved).toBeGreaterThan(5);
    carry.dispose();
  });
  it('a HELD ball moves at most 0.14 m a frame: a clip that whips the ball arm is eased from where it was drawn, and catches up — measured through a real render loop (the cap runs after physics)', () => {
    const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('cam', new Vector3(0, 1, 5), scene);
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const armQ = r.nodes.LeftArm.rotationQuaternion!.clone(), foreQ = r.nodes.LeftForeArm.rotationQuaternion!.clone();
    let f = 0; const steps: number[] = []; let prev: Vector3 | null = null; let clipTop = 0;
    // the "clip": the arm lifts 26° a frame to overhead and holds (the ball ~0.25 m a frame); the root is driven after the animations
    scene.onBeforeAnimationsObservable.add(() => {
      const a = f < 5 ? 0 : Math.min(2.4, (f - 5) * 0.45);
      r.nodes.LeftArm.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), -a).multiply(armQ);
      r.nodes.LeftForeArm.rotationQuaternion = foreQ.clone();
    });
    scene.onAfterRenderObservable.add(() => { r.ball.computeWorldMatrix(true); const p = r.ball.getAbsolutePosition().clone(); if (prev) steps.push(Vector3.Distance(p, prev)); prev = p; });
    for (f = 0; f < 40; f++) { carry.update(1 / 60, 0, false); scene.render(); if (f === 39) clipTop = r.ball.getAbsolutePosition().y; }
    expect(Math.max(...steps)).toBeLessThanOrEqual(HELD_STEP_M + 2e-3);
    expect(clipTop).toBeGreaterThan(1.7);            // it got there: the arm caught up with the clip
    expect(steps.slice(-5).every((s) => s < 0.01)).toBe(true);   // and then holds, no hunting
    carry.dispose();
  });
  it('the chest hold puts both palms either side of the ball in front of the chest', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    carry.setHold(1);
    for (let i = 0; i < 60; i++) d.frame(1 / 60, 0, false);
    const l = r.nodes.LeftHand.getAbsolutePosition(), rr = r.nodes.RightHand.getAbsolutePosition();
    expect(Vector3.Distance(l, rr)).toBeLessThan(0.45);            // hands together on the ball, not at the hips
    expect(Math.min(l.y, rr.y)).toBeGreaterThan(1.0);              // up at the chest
    carry.dispose();
  });
  it('the stride lock reads this body\'s own feet: the foot opposite the ball hand striking sets one bounce a stride', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    const P = 0.62;   // a stride: each foot strikes once per P seconds, half a stride apart
    let t = 0; const phases: number[] = [];
    const foot = (name: string, off: number) => { const u = ((t + off) % P) / P; r.nodes[name].position.y = -0.4 + (u < 0.5 ? 0.14 * Math.sin(u * 2 * Math.PI) : 0); };
    for (let i = 0; i < 300; i++) {
      t += 1 / 60; foot('LeftFoot', 0); foot('RightFoot', P / 2);
      d.frame(1 / 60, 0.8, true, () => { r.root.position.z -= 4.5 / 60; });
      phases.push(carry.phase);
    }
    // over the last two seconds: one wrap per stride
    const wraps = phases.slice(-120).filter((p, i, a) => i > 0 && p < a[i - 1]).length;
    expect(wraps).toBeGreaterThanOrEqual(Math.floor(2 / P) - 1);
    expect(wraps).toBeLessThanOrEqual(Math.ceil(2 / P) + 1);
    carry.dispose();
  });
});

describe('the hoops dribble is a ball, not a bone', () => {
  it('bounces on the FLOOR: a hop mid-dribble (the step-back) does not lift the bouncing ball with the body', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    for (let i = 0; i < 30; i++) d.frame(1 / 60, 0.2, true);
    let lowest = Infinity;
    for (let i = 0; i < 60; i++) { d.frame(1 / 60, 0.2, true, () => { r.root.position.y = 0.3 * Math.sin(Math.min(1, i / 30) * Math.PI); }); lowest = Math.min(lowest, r.ball.getAbsolutePosition().y); }
    expect(lowest).toBeLessThan(0.14);   // it still meets the floor (radius 0.12) while the root is up in the air
    carry.dispose();
  });
  it('the ball in the air does not whip round with a body that snaps its facing: its frame turns at most BALL_YAW_RATE', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    for (let i = 0; i < 30; i++) d.frame(1 / 60, 0.5, true);
    d.reset();
    // the body snaps 50° in one frame (an AI facing its new objective), then holds
    d.frame(1 / 60, 0.5, true, () => { r.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI + 0.87); });
    for (let i = 0; i < 30; i++) d.frame(1 / 60, 0.5, true);
    expect(Math.max(...d.path)).toBeLessThan(0.15);
    const x = localX(r.root, r.ball.getAbsolutePosition());
    expect(x).toBeGreaterThan(0.15);   // and it has come round to his right in his new facing
    carry.dispose();
  });
});

describe('the dribble restarts from what was drawn', () => {
  it('a restart whose pose already moved the hand under the ball (a crossfade restarting its capture) starts from the last DRAWN ball, and a ball picked up low comes up first', () => {
    const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('cam', new Vector3(0, 1, 5), scene);
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const steps: number[] = []; let prev: Vector3 | null = null; let lowest = Infinity;
    scene.onAfterRenderObservable.add(() => { r.ball.computeWorldMatrix(true); const p = r.ball.getAbsolutePosition().clone(); if (prev) steps.push(Vector3.Distance(p, prev)); prev = p; });
    const armQ = r.nodes.LeftArm.rotationQuaternion!.clone();
    for (let i = 0; i < 20; i++) { carry.update(1 / 60, 0, false); scene.render(); }   // held
    steps.length = 0;
    // the frame the dribble restarts, the "clip" throws the ball arm 90° back (the pose the pass will read)
    scene.onBeforeAnimationsObservable.addOnce(() => { r.nodes.LeftArm.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), 1.6).multiply(armQ); });
    for (let i = 0; i < 40; i++) { carry.update(1 / 60, 0.2, true); scene.render(); lowest = Math.min(lowest, r.ball.getAbsolutePosition().y); }
    expect(steps[0]).toBeLessThan(0.02);                      // the first dribble frame is where the ball was drawn
    expect(Math.max(...steps)).toBeLessThan(0.15);
    expect(lowest).toBeLessThan(0.2);                         // and it is a dribble: it reaches the floor
    carry.dispose();
  });
});

describe('the legacy carry (the dunk runway) is unchanged', () => {
  it('without `hoops` the default hand is still rig Right and switchHand still starts the new hand at its palm', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk });
    expect(carry.side).toBe('Right');
    carry.update(1 / 60, 0.5, true); scene.onAfterAnimationsObservable.notifyObservers(scene);
    carry.switchHand();
    expect(carry.phase).toBe(0); expect(carry.side).toBe('Left');
    carry.dispose();
  });
});

describe('review of 3a: the carry after physics, and its caps as speeds', () => {
  it('a moving dribble is drawn with the root\'s LAST move: a root moved after the after-animations pass (Havok, a before-render drive) leaves the ball where a root moved before it would', () => {
    const run = (after: boolean) => {
      const scene = new Scene(new NullEngine());
      const r = rig(scene);
      attachBallToHand(r.ball, r.sk, 'LeftHand');
      const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
      const d = driver(scene, carry, r.ball);
      const rel: { x: number; z: number }[] = [];
      const step = () => { r.root.position.z -= 5 / 60; r.root.computeWorldMatrix(true); };   // 5 m/s toward the rim
      for (let i = 0; i < 120; i++) {
        const p = after ? d.frame(1 / 60, 0.8, true, undefined, step) : d.frame(1 / 60, 0.8, true, step);
        const rp = r.root.getAbsolutePosition();
        rel.push({ x: p.x - rp.x, z: p.z - rp.z });
      }
      carry.dispose();
      return rel;
    };
    const before = run(false), after = run(true);
    let worst = 0;
    for (let i = 20; i < before.length; i++) worst = Math.max(worst, Math.hypot(before[i].x - after[i].x, before[i].z - after[i].z));
    expect(worst).toBeLessThan(0.005);   // (without the follow: one frame of travel, 0.083 m, on every frame)
  });
  it('the root\'s turn after the pass is carried too, and a reset (> 0.5 m) is not', () => {
    const scene = new Scene(new NullEngine());
    const r = rig(scene);
    attachBallToHand(r.ball, r.sk, 'LeftHand');
    const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
    const d = driver(scene, carry, r.ball);
    for (let i = 0; i < 30; i++) d.frame(1 / 60, 0.3, true);
    const x0 = localX(r.root, r.ball.getAbsolutePosition());
    d.frame(1 / 60, 0.3, true, undefined, () => { r.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI + 0.3); r.root.computeWorldMatrix(true); });
    expect(Math.abs(localX(r.root, r.ball.getAbsolutePosition()) - x0)).toBeLessThan(0.03);   // still on his right in his new facing
    const was = r.ball.getAbsolutePosition().clone();
    d.frame(1 / 60, 0.3, true, undefined, () => { r.root.position.x += 3; r.root.computeWorldMatrix(true); });
    expect(Math.abs(r.ball.getAbsolutePosition().x - was.x)).toBeLessThan(0.3);                // a teleport is not travel
    carry.dispose();
  });
  for (const fps of [30, 60, 120]) {
    it(`a held ball's cap is a speed (${fps} fps): the ball never outruns ${HELD_MPS} m/s, and a clip the hand can follow is not held back`, () => {
      const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('cam', new Vector3(0, 1, 5), scene);
      const r = rig(scene);
      attachBallToHand(r.ball, r.sk, 'LeftHand');
      const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
      const armQ = r.nodes.LeftArm.rotationQuaternion!.clone(), foreQ = r.nodes.LeftForeArm.rotationQuaternion!.clone();
      const dt = 1 / fps; let t = 0; const speeds: number[] = []; let prev: Vector3 | null = null;
      const lift = (tt: number) => Math.min(2.4, Math.max(0, (tt - 0.2) * 9.6));   // 2.4 rad in 0.25 s (≈ 5 m/s at the palm), from t 0.2
      scene.onBeforeAnimationsObservable.add(() => {
        r.nodes.LeftArm.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), -lift(t)).multiply(armQ);
        r.nodes.LeftForeArm.rotationQuaternion = foreQ.clone();
      });
      const track: { t: number; p: Vector3 }[] = [];
      scene.onAfterRenderObservable.add(() => { r.ball.computeWorldMatrix(true); const p = r.ball.getAbsolutePosition().clone(); if (prev) speeds.push(Vector3.Distance(p, prev) / dt); prev = p; track.push({ t, p }); });
      for (let i = 0; i < Math.round(0.9 * fps); i++) { t = i * dt; carry.update(dt, 0, false); scene.render(); }
      // where the ball settles with the arm up (the wrist's own cock eases in over it), and the first frame it is there
      const top = track[track.length - 1].p;
      const arrived = track.find((x) => Vector3.Distance(x.p, top) < 0.05)?.t ?? -1;
      if (process.env.HM_DEBUG) console.log(fps, 'arrived', arrived, 'maxSpeed', Math.max(...speeds).toFixed(2), 'top y', top.y.toFixed(2));
      expect(Math.max(...speeds)).toBeLessThanOrEqual(HELD_MPS + 0.2);
      expect(arrived).toBeGreaterThan(0);
      expect(arrived).toBeLessThanOrEqual(0.45 + dt + 1e-9);   // the clip gets there at 0.45 s; the cap costs at most a frame
      carry.dispose();
    });
  }
  for (const fps of [30, 120]) {
    it(`a whip faster than a hand (${fps} fps) is held to ${HELD_MPS} m/s and catches up`, () => {
      const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('cam', new Vector3(0, 1, 5), scene);
      const r = rig(scene);
      attachBallToHand(r.ball, r.sk, 'LeftHand');
      const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
      const armQ = r.nodes.LeftArm.rotationQuaternion!.clone(), foreQ = r.nodes.LeftForeArm.rotationQuaternion!.clone();
      const dt = 1 / fps; let t = 0; const speeds: number[] = []; let prev: Vector3 | null = null; let last = new Vector3();
      scene.onBeforeAnimationsObservable.add(() => {
        r.nodes.LeftArm.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), -Math.min(2.4, Math.max(0, (t - 0.2) * 30))).multiply(armQ);   // 2.4 rad in 0.08 s
        r.nodes.LeftForeArm.rotationQuaternion = foreQ.clone();
      });
      scene.onAfterRenderObservable.add(() => { r.ball.computeWorldMatrix(true); const p = r.ball.getAbsolutePosition().clone(); if (prev) speeds.push(Vector3.Distance(p, prev) / dt); prev = p; last = p; });
      for (let i = 0; i < Math.round(1.2 * fps); i++) { t = i * dt; carry.update(dt, 0, false); scene.render(); }
      expect(Math.max(...speeds)).toBeLessThanOrEqual(HELD_MPS + 0.2);
      expect(Math.max(...speeds)).toBeGreaterThan(HELD_MPS - 0.5);   // it did bind
      expect(last.y).toBeGreaterThan(1.7);                             // and got there
      carry.dispose();
    });
  }
  it('HELD_STEP_M is the 60 fps step of HELD_MPS', () => { expect(HELD_STEP_M).toBeCloseTo(HELD_MPS / 60, 12); });
});
