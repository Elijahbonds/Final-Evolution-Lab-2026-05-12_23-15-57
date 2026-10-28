// lane/hoops-round2 HOP-04 — GATE 0 and the contact poses on the REAL rigs (NullEngine).
// GATE 0 (docs/AGENT-OPERATING-RULES.md: verify the rig's naming and rest state before animation work): the hero and a roster athlete
// pass gateContainerRig (the 22-bone unprefixed FEL spec) and carry every bone the layer drives. Then two heroes at the bodies' hard gap:
// the defender's hand reaches the handler's hip, his chest leans in, the handler's free arm comes across — and the layer puts every
// rotation back after the frame is drawn.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FreeCamera, LoadAssetContainerAsync, NullEngine, Quaternion, Scene, Vector3 } from '@babylonjs/core';
import type { AssetContainer, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { gateContainerRig } from '../anim/rigNormalize';
import { findBone } from '../anim/boneLookup';
import { bodyFrontWorld } from '../anim/HandIK';
import { BODY_STANDOFF } from '../core/BasketballCore';
import { CONTACT_BONES, HIP_OUT_M, mountContactPoses, poseContact, type ContactBody } from './contactPoses';

const MODELS = join(__dirname, '..', '..', '..', 'public', 'models');
const load = async (scene: Scene, rel: string): Promise<AssetContainer> =>
  LoadAssetContainerAsync('data:model/gltf-binary;base64,' + readFileSync(join(MODELS, rel)).toString('base64'), scene, { pluginExtension: '.glb', pluginOptions: { gltf: { skipMaterials: true } } });

let scene: Scene; let D: ContactBody; let H: ContactBody;
const pos = (n: TransformNode) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
const node = (sk: Skeleton, name: string) => findBone(sk, name)!.getTransformNode()!;
const rots = (sk: Skeleton) => sk.bones.map((b) => (b.getTransformNode()?.rotationQuaternion ?? Quaternion.Identity()).clone());

beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1.5, -4), scene);
  const make = async (): Promise<ContactBody> => {
    const c = await load(scene, 'fel-hero.glb');
    expect(gateContainerRig(c, 'fel-hero.glb')).toBe(true);
    c.addAllToScene(); for (const g of c.animationGroups) g.stop();
    const root = c.rootNodes[0] as TransformNode;
    return { skeleton: c.skeletons[0], root };
  };
  D = await make(); H = await make();
  // face each other at the hard gap: the handler on the defender's front, turned round
  scene.render();
  const front = bodyFrontWorld(D.skeleton, D.root);
  H.root.position.copyFrom(D.root.position.add(front.scale(BODY_STANDOFF)));
  H.root.rotationQuaternion = D.root.rotationQuaternion!.multiply(Quaternion.RotationAxis(Vector3.Up(), Math.PI));
  scene.render();
  expect(Vector3.Dot(bodyFrontWorld(H.skeleton, H.root), front)).toBeLessThan(-0.99);   // facing each other
}, 180000);

describe('GATE 0 — the rigs the layer drives', () => {
  it('the hero and a roster athlete pass the import gate and carry every contact bone, unprefixed', async () => {
    for (const rel of ['fel-hero.glb', 'athletes/amir.glb']) {
      const s = new Scene(new NullEngine());
      const c = await load(s, rel);
      expect(gateContainerRig(c, rel)).toBe(true);
      const sk = c.skeletons[0];
      for (const b of CONTACT_BONES) expect(findBone(sk, b), `${rel} ${b}`).toBeTruthy();
      expect(sk.bones.some((b) => /mixamorig/i.test(b.name))).toBe(false);
      s.dispose();
    }
  }, 180000);
});

describe('the contact poses at the hard gap', () => {
  it('k = 0 writes nothing', () => {
    const before = [...rots(D.skeleton), ...rots(H.skeleton)];
    const wrote = poseContact({ defender: D, handler: H, k: 0, ballRig: 'Right' });
    expect(wrote.length).toBe(0);
    const after = [...rots(D.skeleton), ...rots(H.skeleton)];
    after.forEach((q, i) => expect(q.equalsWithEpsilon(before[i], 1e-9)).toBe(true));
  });
  it('forearm on hip, chest to chest, arm bar — at full contact', () => {
    scene.render();
    const toH = pos(H.root).subtract(pos(D.root)); toH.y = 0; toH.normalize();
    const chest0 = pos(node(D.skeleton, 'Spine2'));
    const hips = pos(node(H.skeleton, 'Hips'));
    const ballSh = pos(node(H.skeleton, 'RightArm')), offSh = pos(node(H.skeleton, 'LeftArm'));
    const side = ballSh.subtract(offSh); side.y = 0; side.normalize();
    const hipT = hips.add(side.scale(HIP_OUT_M)).subtract(toH.scale(0.06));
    const handsD0 = ['LeftHand', 'RightHand'].map((n) => Vector3.Distance(pos(node(D.skeleton, n)), hipT));
    const offHand0 = pos(node(H.skeleton, 'LeftHand'));
    const wrote = poseContact({ defender: D, handler: H, k: 1, ballRig: 'Right' }, [], 7);
    expect(wrote.length).toBeGreaterThanOrEqual(5);
    // the hand-check: one of the defender's hands reaches toward the hip as far as his arm goes (the hip is past an arm's length at
    // the rules' gap: the measured shoulder → hip distance is the evidence for the owner call), the elbow soft
    const handsD = ['LeftHand', 'RightHand'].map((n) => Vector3.Distance(pos(node(D.skeleton, n)), hipT));
    const best = handsD.indexOf(Math.min(...handsD)); const arm = best === 0 ? 'Left' : 'Right';
    const sh = pos(node(D.skeleton, `${arm}Arm`)), el = pos(node(D.skeleton, `${arm}ForeArm`)), wr = pos(node(D.skeleton, `${arm}Hand`));
    const armLen = Vector3.Distance(sh, el) + Vector3.Distance(el, wr);
    const shToHip = Vector3.Distance(sh, hipT);
    expect(shToHip).toBeGreaterThan(armLen);   // GATE evidence: no touch is possible at BODY_STANDOFF
    expect(Math.min(...handsD)).toBeLessThan(Math.min(...handsD0) - 0.25);
    expect(Math.min(...handsD)).toBeLessThan(shToHip - armLen * 0.85);
    // aimed at the hip: the wrist lies on the shoulder → hip line (within 8 cm)
    const dirHip = hipT.subtract(sh).normalize(); const w = wr.subtract(sh);
    expect(w.subtract(dirHip.scale(Vector3.Dot(w, dirHip))).length()).toBeLessThan(0.08);
    // chest to chest: the defender's chest moved toward the handler
    const lean = Vector3.Dot(pos(node(D.skeleton, 'Spine2')).subtract(chest0), toH);
    expect(lean).toBeGreaterThan(0.012);
    // the arm bar: the handler's free (rig Left) hand came forward toward the defender, in front of his chest
    const offHand = pos(node(H.skeleton, 'LeftHand'));
    expect(Vector3.Dot(offHand.subtract(offHand0), toH.scale(-1))).toBeGreaterThan(0.08);
    // the ball hand (rig Right) was never touched
    expect(wrote.some((n) => n === node(H.skeleton, 'RightArm') || n === node(H.skeleton, 'RightForeArm'))).toBe(false);
  });
  it('the mounted layer puts every rotation back after the frame is drawn', () => {
    // reset the arms the previous test wrote
    D.skeleton.returnToRest(); H.skeleton.returnToRest(); scene.render();
    const before = [...rots(D.skeleton), ...rots(H.skeleton)];
    let drawnHand = Infinity;
    const layer = mountContactPoses(scene, () => [{ defender: D, handler: H, k: 1, ballRig: 'Right' }]);
    const hp0 = pos(node(H.skeleton, 'Hips'));
    const restHand = Math.min(...['LeftHand', 'RightHand'].map((n) => Vector3.Distance(pos(node(D.skeleton, n)), hp0)));
    const probe = scene.onBeforeRenderObservable.add(() => { const hp = pos(node(H.skeleton, 'Hips')); drawnHand = Math.min(...['LeftHand', 'RightHand'].map((n) => Vector3.Distance(pos(node(D.skeleton, n)), hp))); });
    scene.render();
    scene.onBeforeRenderObservable.remove(probe); layer.dispose();
    expect(drawnHand).toBeLessThan(restHand - 0.25);   // the pose was there when the frame was drawn
    const after = [...rots(D.skeleton), ...rots(H.skeleton)];
    after.forEach((q, i) => expect(q.equalsWithEpsilon(before[i], 1e-6)).toBe(true));
  });
});
