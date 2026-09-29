// HOOPS MOTION phase 3c — the dunk pass's motion layers, mountable (plan §3 "The dunk pass's tooling, ported"). On the REAL forge rig in a
// NullEngine: the layers are DunkMode's construction (MotionLayers.forBody), and the hoops mount follows the layers' rules — the drag
// insert-first on the animation clock, the legs only airborne, the ball arm skipped around a release, a side lean that never leaks into
// the next frame, the hinge the last writer.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from './boneLookup';
import { LIMB_DRAG_SEC } from './LimbDrag';
import { WRIST_SNAP_SEC, WRIST_AFTER_SEC, WRIST_DEG, dribbleWristDeg } from './ballCarry';
import { ARM_DRAG_SEC, LEG_DRAG_SEC, LEG_DRAG_EASE_SEC, LEAN_MAX_DEG, MOTION_OFF, MotionLayers, RELEASE_SKIP_SEC, animDt, leanDegFor, mountMotionLayers } from './motionLayers';

let engine: NullEngine; let scene: Scene; let sk: Skeleton; let root: TransformNode; let meshes: AbstractMesh[];
const DT_MS = 1000 / 60;
const deg = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
const bind = new Map<TransformNode, Quaternion>();

beforeAll(async () => {
  engine = new NullEngine(); (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT_MS;   // a fixed 60 fps frame
  scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as TransformNode; meshes = r.meshes.filter((m) => !!m.skeleton);
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, (n.rotationQuaternion ?? Quaternion.Identity()).clone()); }
});
afterAll(() => { scene.dispose(); engine.dispose(); });
const restBind = () => { for (const [n, q] of bind) n.rotationQuaternion = q.clone(); root.position.setAll(0); };
/** A stand-in for the clips: every frame, before the after-animations observers, these bones are set to these values. */
function clip(values: () => Map<TransformNode, Quaternion>) {
  return scene.onBeforeAnimationsObservable.add(() => { for (const [n, q] of values()) n.rotationQuaternion!.copyFrom(q); });
}

describe('MotionLayers.forBody — DunkMode\'s construction, lifted', () => {
  it('the dunk\'s layers: LimbDrag on its whole table, a wrist per hand read off the hand mesh, a hinge per arm', () => {
    const L = MotionLayers.forBody(sk, { meshes: meshes as never, wrists: true });
    expect(L.wrists?.sides.sort()).toEqual(['Left', 'Right']);
    expect(L.hinges.length).toBe(2);
    expect(L.legDrag).toBeNull();
    expect(Object.keys(LIMB_DRAG_SEC)).toEqual(expect.arrayContaining([...Object.keys(ARM_DRAG_SEC), ...Object.keys(LEG_DRAG_SEC), 'LeftFoot', 'RightFoot']));
    // the hoops tables: the arms, and the legs without the feet (the posture layer pitches the feet with a memory of its own)
    expect(Object.keys(LEG_DRAG_SEC).some((n) => /Foot/.test(n))).toBe(false);
    const H = MotionLayers.forBody(sk, { dragTable: ARM_DRAG_SEC, legTable: LEG_DRAG_SEC });
    expect(H.wrists).toBeNull(); expect(H.legDrag).not.toBeNull(); expect(H.hinges.length).toBe(2);
  });
  it('?nomotion=1 is a dev-only switch (off in tests and in production)', () => { expect(MOTION_OFF).toBe(false); });
  it('a hoops body\'s wrists are its carry\'s (one writer per hand): the cock at the set, the snap for 0.18 s after the release, the follow-through held, the push on the dribble from carry.phase', () => {
    expect(WRIST_SNAP_SEC).toBe(0.18);
    expect(WRIST_AFTER_SEC).toBeGreaterThan(WRIST_SNAP_SEC);                      // the flex is held past the snap
    expect(WRIST_DEG.snap).toBeGreaterThan(WRIST_DEG.after); expect(WRIST_DEG.after).toBeGreaterThan(WRIST_DEG.relaxed);
    expect(WRIST_DEG.cockHigh).toBeLessThan(WRIST_DEG.cockLow);                   // cocked back further as the ball goes up to the set
    // the dribble's wrist, off the carry's phase: periodic, the push through the top, cocked for the catch
    expect(dribbleWristDeg(0.12)).toBeGreaterThan(20); expect(dribbleWristDeg(0.96)).toBeLessThan(-10);
    for (const ph of [0, 0.3, 0.7]) expect(dribbleWristDeg(ph)).toBeCloseTo(dribbleWristDeg(ph + 1), 9);
    // and the mount builds no second WristLayer on the hands
    const L = MotionLayers.forBody(sk, { dragTable: ARM_DRAG_SEC, legTable: LEG_DRAG_SEC });
    expect(L.wrists).toBeNull();
  });
});

describe('mountMotionLayers — the layers\' rules on a hoops body', () => {
  it('the drag registers INSERT-FIRST, the hinge LAST (and mountHinge moves it back to the end); dispose removes every observer', () => {
    restBind();
    const alive = (a: { _willBeUnregistered?: boolean }[]) => a.filter((x) => !x._willBeUnregistered).length;
    const n0 = alive(scene.onAfterAnimationsObservable.observers as never), b0 = alive(scene.onBeforeAnimationsObservable.observers as never);
    const other = scene.onAfterAnimationsObservable.add(() => {});
    const m = mountMotionLayers({ scene, skeleton: sk, root });
    const obs = scene.onAfterAnimationsObservable.observers;
    expect(alive(obs as never)).toBe(n0 + 1 + 3);        // + the drag, the lean, the hinge
    expect(obs[0]).not.toBe(other);
    expect(obs.indexOf(other)).toBeGreaterThan(0);       // the drag went in front of what was already there
    const late = scene.onAfterAnimationsObservable.add(() => {});   // an arm writer mounted after (a carry, a rim reach)…
    m.mountHinge();                                                 // …and the hinge is the last writer again
    expect(scene.onAfterAnimationsObservable.observers.at(-1)).not.toBe(late);
    expect(scene.onAfterAnimationsObservable.observers.at(-2)).toBe(late);
    m.dispose(); scene.onAfterAnimationsObservable.remove(other); scene.onAfterAnimationsObservable.remove(late);
    // (Babylon defers a removal to the next tick: count the observers not marked for it)
    const live = (a: { _willBeUnregistered?: boolean }[]) => a.filter((x) => !x._willBeUnregistered).length;
    expect(live(scene.onAfterAnimationsObservable.observers as never)).toBe(n0);
    expect(live(scene.onBeforeAnimationsObservable.observers as never)).toBe(b0);
  });

  it('the LEGS drag only in the air: planted, a step in the clip lands on the frame; airborne, the thigh trails it, eased in', () => {
    restBind();
    const ul = boneNode(sk, 'LeftUpLeg')!, arm = boneNode(sk, 'LeftArm')!;
    const a0 = bind.get(ul)!.clone(), a1 = a0.multiply(Quaternion.RotationAxis(new Vector3(1, 0, 0), 0.9));
    const r0 = bind.get(arm)!.clone(), r1 = r0.multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.9));
    let t = 0; const c = clip(() => new Map([[ul, t % 2 ? a1 : a0], [arm, t % 2 ? r1 : r0]]));
    const m = mountMotionLayers({ scene, skeleton: sk, root, lean: false, hinge: false });
    for (let i = 0; i < 20; i++) scene.render();
    t = 1; scene.render();
    expect(deg(ul.rotationQuaternion!, a1)).toBeLessThan(0.01);      // on the floor: the thigh is exactly its clip (a lag here is a slide)
    expect(deg(arm.rotationQuaternion!, r1)).toBeGreaterThan(5);     // …the arm trails its step (the successive breaking of joints)
    expect(m.airborne).toBe(false); expect(m.legW).toBe(0);
    root.position.y = 0.5;                                           // off the floor
    for (let i = 0; i < 4; i++) { t = i % 2 ? 1 : 0; scene.render(); }
    expect(m.airborne).toBe(true);
    for (let i = 0; i < Math.ceil(LEG_DRAG_EASE_SEC * 60) + 4; i++) { t = 0; scene.render(); }
    expect(m.legW).toBe(1);
    t = 1; scene.render();
    expect(deg(ul.rotationQuaternion!, a1)).toBeGreaterThan(5);      // in the air: the thigh trails its clip
    root.position.y = 0;                                             // down again: eased back out to the clip exactly
    for (let i = 0; i < Math.ceil(LEG_DRAG_EASE_SEC * 60) + 4; i++) scene.render();
    expect(m.airborne).toBe(false); expect(m.legW).toBe(0);
    t = 0; scene.render(); expect(deg(ul.rotationQuaternion!, a0)).toBeLessThan(0.01);
    m.dispose(); scene.onBeforeAnimationsObservable.remove(c);
  });

  it('the BALL ARM follows its clip exactly while the hand holds the ball and for RELEASE_SKIP_SEC after the release', () => {
    restBind();
    const m = mountMotionLayers({ scene, skeleton: sk, root, lean: false, ball: null });
    m.dispose();
    const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
    const L = MotionLayers.forBody(sk);
    const hand = L.arms.Right!.hand, sh = L.arms.Right!.shoulder;
    const q0 = bind.get(sh)!.clone(), q1 = q0.multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.8));
    let t = 0; const c = clip(() => new Map([[sh, t % 2 ? q1 : q0]]));
    const mm = mountMotionLayers({ scene, skeleton: sk, root, lean: false, hinge: false, ball });
    for (let i = 0; i < 10; i++) scene.render();
    ball.parent = hand;                                                // held
    t = 1; scene.render();
    expect(mm.skipping).toBe('Right'); expect(deg(sh.rotationQuaternion!, q1)).toBeLessThan(0.01);
    ball.parent = null; ball.metadata = { felReleased: true };         // released: still the clip's for RELEASE_SKIP_SEC
    const frames = Math.floor(RELEASE_SKIP_SEC * 60) - 2;
    for (let i = 0; i < frames; i++) { t = i % 2 ? 1 : 0; scene.render(); expect(deg(sh.rotationQuaternion!, t % 2 ? q1 : q0)).toBeLessThan(0.01); }
    for (let i = 0; i < 6; i++) { t = 0; scene.render(); }
    expect(mm.skipping).toBeNull();
    t = 1; scene.render(); expect(deg(sh.rotationQuaternion!, q1)).toBeGreaterThan(5);   // dragged again
    mm.dispose(); scene.onBeforeAnimationsObservable.remove(c); ball.dispose();
  });

  it('the drag\'s dt is the ANIMATION clock: at animationTimeScale 0.25 the follower moves a quarter as far per frame', () => {
    expect(animDt(1 / 60, 0.25)).toBeCloseTo(1 / 240, 12);
    expect(animDt(0.2, 1)).toBe(0.05);                                // a hitch is clamped
    expect(animDt(1 / 60, NaN)).toBeCloseTo(1 / 60, 12);
    restBind();
    const arm = boneNode(sk, 'LeftForeArm')!;
    const r0 = bind.get(arm)!.clone(), r1 = r0.multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.9));
    const step = (ts: number) => {
      restBind(); scene.animationTimeScale = ts;
      let t = 0; const c = clip(() => new Map([[arm, t ? r1 : r0]]));
      const m = mountMotionLayers({ scene, skeleton: sk, root, lean: false, hinge: false });
      for (let i = 0; i < 5; i++) scene.render();
      t = 1; scene.render(); const moved = deg(arm.rotationQuaternion!, r0);
      m.dispose(); scene.onBeforeAnimationsObservable.remove(c); scene.animationTimeScale = 1;
      return moved;
    };
    const full = step(1), slow = step(0.25);
    expect(slow).toBeLessThan(full * 0.5);
  });

  it('the SIDE LEAN tilts the chest into a cut (capped), and is off the spine again before the next animate', () => {
    expect(leanDegFor(0)).toBe(0);
    expect(leanDegFor(3)).toBeGreaterThan(4); expect(leanDegFor(3)).toBeLessThan(LEAN_MAX_DEG + 1e-9);
    expect(leanDegFor(40)).toBe(LEAN_MAX_DEG); expect(leanDegFor(-3)).toBe(leanDegFor(3));
    restBind();
    const spine = boneNode(sk, 'Spine')!, head = boneNode(sk, 'Head')!, hips = boneNode(sk, 'Hips')!;
    const m = mountMotionLayers({ scene, skeleton: sk, root, drag: false, hinge: false });
    // before the lean: the spine is its clip (bind here) on every frame
    for (let i = 0; i < 10; i++) scene.render();
    expect(Math.abs(m.leanDeg)).toBeLessThan(0.05);
    // a hard cut: the root accelerates along world +x while the body faces +z (its right on this rig? the readout is signed; the
    // geometry is checked: the head moves toward the acceleration relative to the hips)
    const fwd = root.getDirection(Vector3.Forward()); fwd.y = 0; fwd.normalize();
    const side = Vector3.Cross(Vector3.Up(), fwd).normalize();
    head.computeWorldMatrix(true); hips.computeWorldMatrix(true);
    const off0 = Vector3.Dot(head.getAbsolutePosition().subtract(hips.getAbsolutePosition()), side);
    let v = 0; for (let i = 0; i < 20; i++) { v = Math.min(4, v + 8 / 60); root.position.addInPlace(side.scale(v / 60)); scene.render(); }
    head.computeWorldMatrix(true); hips.computeWorldMatrix(true);
    const off1 = Vector3.Dot(head.getAbsolutePosition().subtract(hips.getAbsolutePosition()), side);
    expect(Math.abs(m.leanDeg)).toBeGreaterThan(2); expect(Math.abs(m.leanDeg)).toBeLessThanOrEqual(LEAN_MAX_DEG + 1e-6);
    expect(off1 - off0).toBeGreaterThan(0.02);                       // the chest tilts INTO the acceleration
    // taken back off before the next animate: another layer's held-pose memory sees only its own write
    const seen: Quaternion[] = [];
    const probe = scene.onBeforeAnimationsObservable.add(() => { seen.push(spine.rotationQuaternion!.clone()); });
    scene.render();
    expect(deg(seen[0], bind.get(spine)!)).toBeLessThan(1e-3);
    scene.onBeforeAnimationsObservable.remove(probe); m.dispose();
    expect(deg(spine.rotationQuaternion!, bind.get(spine)!)).toBeLessThan(1e-3);   // dispose takes it off too
  });
});
