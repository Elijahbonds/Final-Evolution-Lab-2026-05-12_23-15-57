// FEL NETPLAY — the body mirror (lane/online-play, 2026-11-21).
//
// The simulating page reads its cast AS DRAWN (each root, each skeleton bone after every animation writer, the loose ball)
// and the other pages write it back onto their own copies of the same bodies, after their animations, so the picture is the
// simulating page's whatever the drawing page's own clips are doing. It is the broadcast replay's recorder
// (scene/ReplayDirector.ts: the same pose nodes, the same "after the animations" moment) pointed at a socket instead of a
// ring buffer.
//
// Quantised for the wire (lib/net/protocol.ts WireBody): positions in mm, rotations ×10 000. A 22-bone body is ~0.4 KB, the
// six of a 3v3 ~2.5 KB a posed tick; poses go at NET_POSE_HZ, roots and the ball every tick.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, TransformNode } from '@babylonjs/core';
import { poseNodesOf } from '../babylon/scene/ReplayDirector';
import type { WireBody, WorldMsg } from './protocol';

export interface Cast { bodies: TransformNode[]; loose: AbstractMesh[] }

const MM = 1000, QS = 10000;
const mm = (v: number) => Math.round(v * MM);
const qs = (v: number) => Math.round(v * QS);

export function sampleBody(root: TransformNode, nodes: TransformNode[], withPose: boolean): WireBody {
  const out: WireBody = { p: [mm(root.position.x), mm(root.position.y), mm(root.position.z)] };
  const rq = root.rotationQuaternion;
  if (rq) out.q = [qs(rq.x), qs(rq.y), qs(rq.z), qs(rq.w)];
  else out.y = Math.round(root.rotation.y * 1000);
  if (withPose && nodes.length) {
    const pose: number[] = new Array(nodes.length * 4 + 3);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const q = n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation);
      pose[i * 4] = qs(q.x); pose[i * 4 + 1] = qs(q.y); pose[i * 4 + 2] = qs(q.z); pose[i * 4 + 3] = qs(q.w);
    }
    const h = nodes[0].position;
    pose[nodes.length * 4] = mm(h.x); pose[nodes.length * 4 + 1] = mm(h.y); pose[nodes.length * 4 + 2] = mm(h.z);
    out.pose = pose;
  }
  return out;
}

const arc = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class BodyMirror {
  private nodes: TransformNode[][];
  private obs: Observer<Scene> | null = null;
  private physObs: Observer<Scene> | null = null;
  private pending: (() => void) | null = null;
  /** This frame's root writes, kept so they can be written again after the physics step (below). */
  private roots: (() => void) | null = null;
  private readonly qa = new Quaternion(); private readonly qb = new Quaternion();
  private readonly va = new Vector3();

  constructor(private scene: Scene, private cast: Cast) {
    this.nodes = cast.bodies.map((b) => poseNodesOf(b));
    // the pose is the frame's LAST word: after the clips and every layer on the animations' observable
    this.obs = scene.onAfterAnimationsObservable.add(() => { const f = this.pending; this.pending = null; f?.(); });
    // HAVOK OWNS A HOOPS ROOT (core/ContactSystem: a dynamic capsule, the node pushed into the body before each step and the body
    // written back after it). The physics step runs after the animations, so the roots are written again once it has: the
    // picture is the sender's, and the capsules follow it (pushed from the node next step, their speed zeroed).
    this.physObs = scene.onAfterPhysicsObservable?.add(() => this.roots?.()) ?? null;
  }

  get bodyCount(): number { return this.cast.bodies.length; }

  /** The cast as drawn now (call after the animations: the session publishes from onAfterAnimations). */
  sample(withPose: boolean): { bodies: WireBody[]; loose: [number, number, number][] } {
    return {
      bodies: this.cast.bodies.map((b, i) => sampleBody(b, this.nodes[i], withPose)),
      loose: this.cast.loose.map((m) => { const p = m.getAbsolutePosition(); return [mm(p.x), mm(p.y), mm(p.z)]; }),
    };
  }

  /**
   * Draw the sender's world on this page's cast. `order[i]` = the sender's body this page's body i draws. Roots now; poses
   * and the ball after this frame's animations.
   */
  apply(order: number[], roots: { a: WorldMsg; b: WorldMsg; k: number }, posed: { a: WorldMsg; b: WorldMsg; k: number } | null): void {
    const n = Math.min(order.length, this.cast.bodies.length);
    this.roots = () => this.writeRoots(order, roots, n);
    this.roots();
    const la = roots.a.loose, lb = roots.b.loose, lk = roots.k;
    this.pending = () => {
      if (posed) for (let i = 0; i < n; i++) {
        const src = order[i];
        const pa = posed.a.bodies[src]?.pose, pb = posed.b.bodies[src]?.pose ?? pa;
        if (pa && pb) this.writePose(i, pa, pb, posed.k);
      }
      this.cast.loose.forEach((m, j) => {
        const a = la[j], b = lb[j] ?? a;
        if (!a) return;
        this.va.set((a[0] + (b[0] - a[0]) * lk) / MM, (a[1] + (b[1] - a[1]) * lk) / MM, (a[2] + (b[2] - a[2]) * lk) / MM);
        m.setAbsolutePosition(this.va);
      });
    };
  }

  private writeRoots(order: number[], roots: { a: WorldMsg; b: WorldMsg; k: number }, n: number): void {
    for (let i = 0; i < n; i++) {
      const src = order[i];
      const A = roots.a.bodies[src], B = roots.b.bodies[src] ?? A;
      if (!A) continue;
      const body = this.cast.bodies[i], k = roots.k;
      body.position.set((A.p[0] + (B.p[0] - A.p[0]) * k) / MM, (A.p[1] + (B.p[1] - A.p[1]) * k) / MM, (A.p[2] + (B.p[2] - A.p[2]) * k) / MM);
      if (A.q && B.q) {
        this.qa.set(A.q[0] / QS, A.q[1] / QS, A.q[2] / QS, A.q[3] / QS); this.qb.set(B.q[0] / QS, B.q[1] / QS, B.q[2] / QS, B.q[3] / QS);
        (body.rotationQuaternion ??= new Quaternion()); Quaternion.SlerpToRef(this.qa, this.qb, k, body.rotationQuaternion);
      } else if (A.y !== undefined) {
        body.rotationQuaternion = null;
        const ya = A.y / 1000, yb = (B.y ?? A.y) / 1000;
        body.rotation.y = ya + arc(ya, yb) * k;
      }
      const pb = (body as unknown as { physicsBody?: { setLinearVelocity(v: Vector3): void } | null }).physicsBody;
      if (pb) pb.setLinearVelocity(Vector3.ZeroReadOnly as Vector3);
    }
  }

  private writePose(i: number, a: number[], b: number[], k: number): void {
    const nodes = this.nodes[i];
    const count = Math.min(nodes.length, Math.floor((a.length - 3) / 4), Math.floor((b.length - 3) / 4));
    for (let j = 0; j < count; j++) {
      const o = j * 4;
      this.qa.set(a[o] / QS, a[o + 1] / QS, a[o + 2] / QS, a[o + 3] / QS); this.qb.set(b[o] / QS, b[o + 1] / QS, b[o + 2] / QS, b[o + 3] / QS);
      const n = nodes[j];
      (n.rotationQuaternion ??= new Quaternion()); Quaternion.SlerpToRef(this.qa, this.qb, k, n.rotationQuaternion);
    }
    if (count === nodes.length && nodes.length) {
      const o = nodes.length * 4;
      nodes[0].position.set((a[o] + (b[o] - a[o]) * k) / MM, (a[o + 1] + (b[o + 1] - a[o + 1]) * k) / MM, (a[o + 2] + (b[o + 2] - a[o + 2]) * k) / MM);
    }
  }

  private parents: (TransformNode | null)[] | null = null;
  /** Start drawing the sender's world: the loose meshes come off any hand they ride on this page (the sender says where the
   *  ball is, in the world; a parent bone's world matrix is a frame stale when the pose has just been written). */
  hold(): void {
    if (this.parents) return;
    this.parents = this.cast.loose.map((m) => (m.parent as TransformNode | null) ?? null);
    for (const m of this.cast.loose) if (m.parent) m.setParent(null);
  }
  /** Stop drawing the sender's world (this page simulates again): the ball goes back where this page's game had it. */
  release(): void {
    this.pending = null; this.roots = null;
    const ps = this.parents; this.parents = null;
    if (ps) this.cast.loose.forEach((m, i) => { const p = ps[i]; if (p && !p.isDisposed()) m.setParent(p); });
  }

  dispose(): void {
    if (this.obs) this.scene.onAfterAnimationsObservable.remove(this.obs);
    if (this.physObs) this.scene.onAfterPhysicsObservable?.remove(this.physObs);
    this.obs = null; this.physObs = null; this.pending = null; this.roots = null;
  }
}
