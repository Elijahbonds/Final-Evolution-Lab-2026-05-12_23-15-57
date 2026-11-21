// lane/online-play: the body mirror on a real (headless) Babylon scene — the running page's cast as drawn, sent and written back
// onto another page's copies: roots, the skeleton's pose, the ball; the roots again after the physics step.
import { describe, it, expect } from 'vitest';
import { NullEngine, Scene, TransformNode, MeshBuilder, Skeleton, Bone, Matrix, Quaternion, Vector3, Observable } from '@babylonjs/core';
import { BodyMirror } from '../../lib/net/mirror';
import type { WorldMsg } from '../../lib/net/protocol';

function body(scene: Scene, name: string) {
  const root = new TransformNode(`${name}-root`, scene);
  const mesh = MeshBuilder.CreateBox(`${name}-mesh`, { size: 1 }, scene);
  mesh.parent = root;
  const sk = new Skeleton(`${name}-sk`, `${name}-sk`, scene);
  const nodes: TransformNode[] = [];
  let parent: Bone | null = null;
  for (let i = 0; i < 3; i++) {
    const b: Bone = new Bone(`${name}-b${i}`, sk, parent, Matrix.Identity());
    const n = new TransformNode(`${name}-n${i}`, scene);
    n.rotationQuaternion = Quaternion.Identity();
    b.linkTransformNode(n);
    nodes.push(n); parent = b;
  }
  mesh.skeleton = sk;
  return { root, nodes };
}

describe('BodyMirror', () => {
  const engine = new NullEngine();
  it('the sender\'s roots, poses and ball land on the drawing page\'s copies (quantised to mm / 1e-4)', () => {
    const a = new Scene(engine), b = new Scene(engine);
    const A = [body(a, 'me'), body(a, 'foe')], B = [body(b, 'me'), body(b, 'foe')];
    const ballA = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, a), ballB = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, b);
    A[0].root.position.set(1.2345, 0, 6.5); A[0].root.rotation.y = 2.5;
    A[1].root.position.set(-0.5, 0, 2); A[1].root.rotation.y = -1;
    A[1].nodes[1].rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), 0.7);
    A[1].nodes[0].position.set(0, 0.95, 0.01);
    ballA.position.set(0.3, 1.1, 5); ballA.computeWorldMatrix(true);   // (the running page samples after its render: matrices are current)
    const send = new BodyMirror(a, { bodies: A.map((x) => x.root), loose: [ballA] });
    const w = send.sample(true);
    expect(w.bodies[0].p).toEqual([1235, 0, 6500]);
    expect(w.bodies[0].pose).toHaveLength(3 * 4 + 3);
    const msg: WorldMsg = { t: 'world', from: 'h1', tick: 1, sent: 0, bodies: w.bodies, loose: w.loose, seats: { h1: 0, foe: 1 }, teams: [0, 1] };
    // the physics component makes this observable when a scene enables physics (the hoops modes do, for their capsules)
    (b as unknown as { onAfterPhysicsObservable: Observable<Scene> }).onAfterPhysicsObservable = new Observable<Scene>();
    const draw = new BodyMirror(b, { bodies: B.map((x) => x.root), loose: [ballB] });
    draw.hold();
    // the guest's page: its "me" is the sender's foe, its rival the sender's me
    draw.apply([1, 0], { a: msg, b: msg, k: 0 }, { a: msg, b: msg, k: 0 });
    expect(B[0].root.position.x).toBeCloseTo(-0.5, 3); expect(B[0].root.rotation.y).toBeCloseTo(-1, 3);
    expect(B[1].root.position.z).toBeCloseTo(6.5, 3);
    b.onAfterAnimationsObservable.notifyObservers(b);   // the pose and the ball are written after this page's animations
    const q = B[0].nodes[1].rotationQuaternion!, want = A[1].nodes[1].rotationQuaternion!;
    expect(Math.abs(Quaternion.Dot(q, want))).toBeGreaterThan(0.9999);
    expect(B[0].nodes[0].position.y).toBeCloseTo(0.95, 3);
    ballB.computeWorldMatrix(true);
    expect(ballB.getAbsolutePosition().z).toBeCloseTo(5, 3);
    // and again after the physics step (Havok writes the roots back from its capsules)
    B[0].root.position.set(9, 9, 9);
    b.onAfterPhysicsObservable.notifyObservers(b);
    expect(B[0].root.position.x).toBeCloseTo(-0.5, 3);
    // released: the page simulates again, nothing more is written
    draw.release();
    B[0].root.position.set(9, 9, 9);
    b.onAfterPhysicsObservable.notifyObservers(b);
    expect(B[0].root.position.x).toBe(9);
    send.dispose(); draw.dispose(); a.dispose(); b.dispose();
  });
  it('between two worlds the roots interpolate, the yaw the short way round', () => {
    const s = new Scene(engine);
    const X = [body(s, 'me')];
    const m = new BodyMirror(s, { bodies: X.map((x) => x.root), loose: [] });
    const W = (x: number, y: number): WorldMsg => ({ t: 'world', from: 'h', tick: 0, sent: 0, bodies: [{ p: [x, 0, 0], y }], loose: [], seats: {}, teams: [0] });
    m.apply([0], { a: W(0, 3100), b: W(1000, -3100), k: 0.5 }, null);
    expect(X[0].root.position.x).toBeCloseTo(0.5, 3);
    expect(Math.abs(Math.abs(X[0].root.rotation.y) - Math.PI)).toBeLessThan(0.01);
    m.dispose(); s.dispose();
  });
});
