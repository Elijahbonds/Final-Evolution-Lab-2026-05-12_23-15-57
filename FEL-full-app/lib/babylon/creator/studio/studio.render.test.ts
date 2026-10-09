// The Studio on the REAL kit body (fel-kit-male.glb in a NullEngine) — CREATOR-PLAN phase 4d (2026-10-06): a tap lands on
// the region under it, a sticker dragged there lands where the compositor will draw it, a part dropped there snaps to
// the bone that owns the skin and renders where it was dropped (posed or not), the parts can be tapped on screen, the
// stage frames and turns the body, lights it with four lights and two plinth meshes, and draws only on demand.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../../anim/boneLookup';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { BodyPicker, partAt, partsOnScreen, snapPlacement, turnFromScreen } from './bodyPick';
import { Matrix } from '@babylonjs/core';
import { partMatrix } from '../parts/placement';
import { sweptAngle } from '../../../creator/look/studio/handles';
import { stampAt, stickerTarget, tapRegion } from './pickMath';
import { FRONT_ALPHA, StudioStage, STUDIO_LIGHT, lightFor } from './stageRig';
import { chartCoords, regionAnchor } from '../paint/bodyChart';
import { compileLayer } from '../paint/composite';
import { rigFrames } from '../parts/rigFrames';
import { syncParts } from '../parts/renderParts';
import { newLayer } from '../../../creator/look/paint';
import { newPart } from '../../../creator/look/parts';
import { frameShot } from '../../../creator/look/studio/framing';
import { IDLE_GRACE } from '../../../creator/look/studio/renderGate';
import { MOODS } from '../../scene/moods';

let scene: Scene; let kit: AssetContainer; let camera: ArcRotateCamera;
beforeAll(async () => {
  scene = new Scene(new NullEngine({ renderWidth: 400, renderHeight: 800, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 }));
  camera = new ArcRotateCamera('c', -Math.PI / 2, 1.33, 3.15, new Vector3(0, 0.94, 0), scene);
  scene.activeCamera = camera;
  scene.metadata = { felTier: 'mobile' };
  kit = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
}, 90_000);

let n = 0;
function body(): SpawnedCharacter {
  const inst = kit.instantiateModelsToScene((x) => `${x}_s${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  // as CharacterLibrary.spawn leaves it: a plain yaw (the glTF root's quaternion goes) and unit scale
  root.rotation = new Vector3(0, 0, 0);
  root.scaling.setAll(1);
  const s = { id: `s${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
  settle(s);
  return s;
}
function settle(s: SpawnedCharacter): void {
  s.root.computeWorldMatrix(true);
  for (const c of s.root.getDescendants(false)) (c as TransformNode).computeWorldMatrix?.(true);
  s.skeleton!.prepare();
}
const joint = (s: SpawnedCharacter, b: string) => boneNode(s.skeleton!, b)!.getAbsolutePosition().clone();
/** The body's forward in world space (rigFrames measures it off the feet). */
function fwdOf(s: SpawnedCharacter): Vector3 {
  const f = rigFrames(s.skeleton!, s.root)!.axes.fwd;
  return Vector3.TransformNormal(f, s.root.computeWorldMatrix(true)).normalize();
}
/** A ray at a joint's height from 1.5 m in front (or behind) of it, aimed back through the body's axis. */
function rayAtJoint(s: SpawnedCharacter, b: string, from: 'front' | 'back', side = 0): { origin: Vector3; dir: Vector3 } {
  const f = fwdOf(s).scale(from === 'front' ? 1 : -1);
  const right = Vector3.Cross(Vector3.Up(), f).normalize();
  const j = joint(s, b).add(right.scale(side));
  return { origin: j.add(f.scale(1.5)), dir: f.scale(-1) };
}

describe('tap the body: the region under the pointer', () => {
  it('chest from the front, the back from behind, the face, the left forearm', () => {
    const s = body();
    const pk = new BodyPicker(s);
    const hit = (b: string, from: 'front' | 'back') => { const r = rayAtJoint(s, b, from); return pk.pick(r.origin, r.dir); };
    const chest = hit('Spine2', 'front')!;
    expect(chest.atom).toBe('torsoFront');
    expect(tapRegion(chest.atom!, null)).toBe('torsoFront');
    expect(['Spine2', 'Spine1', 'Spine']).toContain(chest.bone);
    expect(hit('Spine1', 'back')!.atom).toBe('torsoBack');
    const face = hit('Head', 'front')!;
    expect(face.atom).toBe('face');
    // the left forearm: aim at its joint along its own line (straight down from in front of it)
    const fa = joint(s, 'LeftForeArm').add(joint(s, 'LeftHand')).scale(0.5);
    const f = fwdOf(s);
    const arm = pk.pick(fa.add(f.scale(1.2)), f.scale(-1))!;
    expect(arm.atom).toBe('forearmL');
    expect(arm.bone).toBe('LeftForeArm');
    // the hit is on the visible surface: in front of the joint, a few cm out
    const out = Vector3.Dot(chest.point.subtract(joint(s, 'Spine2')), f);
    expect(out).toBeGreaterThan(0.03); expect(out).toBeLessThan(0.3);
    expect(Vector3.Dot(chest.normal, f)).toBeGreaterThan(0.3);
    s.root.dispose();
  });
  it('at yaw 0 the body faces the Studio camera (it stands at −z)', () => {
    const s = body();
    const f = fwdOf(s);
    const cam = new Vector3(0, 1, 0).add(new Vector3(Math.cos(FRONT_ALPHA), 0, Math.sin(FRONT_ALPHA)).scale(3));
    expect(Vector3.Dot(f, cam.subtract(joint(s, 'Hips')).normalize())).toBeGreaterThan(0.95);
    // and facingFor's left turn (−π/4) brings the left hand to the camera
    s.root.rotation.y = -Math.PI / 4; settle(s);
    expect(Vector3.Distance(joint(s, 'LeftHand'), cam)).toBeLessThan(Vector3.Distance(joint(s, 'RightHand'), cam) - 0.5);
    s.root.dispose();
  });
  it('a ray past the silhouette misses', () => {
    const s = body();
    const r = rayAtJoint(s, 'Spine2', 'front', 1.5);
    expect(new BodyPicker(s).pick(r.origin, r.dir)).toBeNull();
    s.root.dispose();
  });
});

describe('drag a sticker: it lands where the compositor draws it', () => {
  it('stampAt is the inverse of compileLayer on the chest and the back', () => {
    const s = body();
    const pk = new BodyPicker(s);
    const chart = pk.bodyChart!;
    const info = { radius: chart.groups.map((g) => g.radius), extent: chart.extent };
    for (const [b, from, region] of [['Spine2', 'front', 'torsoFront'], ['Spine1', 'back', 'torsoBack']] as const) {
      const r = rayAtJoint(s, b, from, 0.05);
      const h = pk.pick(r.origin, r.dir)!;
      const xy = stampAt(chart, region, h.rest)!;
      expect(xy.x).toBeGreaterThan(0.05); expect(xy.x).toBeLessThan(0.95);
      const layer = { ...newLayer([], 'stamp', ['#FF0000'])!, region, at: { x: xy.x, y: xy.y, rot: 0, scale: 1, stretch: 1 } };
      const L = compileLayer(layer, info, 0.002);
      const g = regionAnchor(region).group;
      const k = chartCoords(chart, g, h.rest);
      const ang = region === 'torsoBack' ? k.ang - Math.PI * Math.sign(k.ang || 1) : k.ang;
      expect(Math.abs(L.inst[0].s0 - ang * chart.groups[g].radius)).toBeLessThan(0.002);
      expect(Math.abs(L.inst[0].t0 - k.t)).toBeLessThan(0.002);
    }
    s.root.dispose();
  });
  it('dragging a chest stamp onto the arm carries it to the arm', () => {
    const s = body();
    const pk = new BodyPicker(s);
    const fa = joint(s, 'LeftForeArm').add(joint(s, 'LeftHand')).scale(0.5);
    const f = fwdOf(s);
    const h = pk.pick(fa.add(f.scale(1.2)), f.scale(-1))!;
    const t = stickerTarget(pk.bodyChart!, 'torsoFront', h.atom!, h.rest)!;
    expect(t.region).toBe('forearmLeft');
    const r = rayAtJoint(s, 'Spine2', 'front');
    const c = pk.pick(r.origin, r.dir)!;
    expect(stickerTarget(pk.bodyChart!, 'torsoFront', c.atom!, c.rest)!.region).toBe('torsoFront');
    s.root.dispose();
  });
});

describe('drag a part: it snaps to the bone and renders where it was dropped', () => {
  for (const posed of [false, true]) {
    it(`on the forearm and the chest${posed ? ', with the arm bent (a posed body)' : ''}`, () => {
      const s = body();
      if (posed) {
        const fore = boneNode(s.skeleton!, 'LeftForeArm')!;
        fore.rotationQuaternion = (fore.rotationQuaternion ?? Quaternion.Identity()).multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.6));
        settle(s);
      }
      const pk = new BodyPicker(s);
      const f = fwdOf(s);
      const fa = joint(s, 'LeftForeArm').add(joint(s, 'LeftHand')).scale(0.5);
      const r1 = { origin: fa.add(f.scale(1.2)), dir: f.scale(-1) };
      const r2 = rayAtJoint(s, 'Spine2', 'front');
      let parts = [] as ReturnType<typeof newPart>[];
      for (const [r, want] of [[r1, ['LeftForeArm']], [r2, ['Spine2', 'Spine1', 'Spine']]] as const) {
        const h = pk.pick(r.origin, r.dir)!;
        const snap = snapPlacement(s, h)!;
        expect(want).toContain(snap.bone);
        const p = { ...newPart(parts as never, 'disc', '#00FF00')!, ...snap, mirror: false };
        parts = [...parts, p];
        syncParts(s, parts as never);
        settle(s);
        const on = partsOnScreen(s, parts as never, scene, camera, 400, 800).find((x) => x.id === p.id)!;
        const want3 = h.point.add(h.normal.scale(0.01));
        expect(Vector3.Distance(on.world, want3)).toBeLessThan(0.004);
      }
      s.root.dispose();
    });
  }
  it('off the skin it falls back to the nearest bone', () => {
    const s = body();
    const p = joint(s, 'Head').add(new Vector3(0, 0.3, 0));
    expect(snapPlacement(s, { point: p, bone: null })!.bone).toBe('Head');
    s.root.dispose();
  });
});

describe('the rotate knob', () => {
  it('a clockwise sweep on screen turns the part clockwise on screen, by the same angle, about its own centre', () => {
    const s = body();
    const cam = new ArcRotateCamera('k', FRONT_ALPHA, 1.4, 2, joint(s, 'Spine2'), scene);
    cam.getViewMatrix(true);
    const frames = rigFrames(s.skeleton!, s.root)!;
    const part = { ...newPart([], 'blade', '#FFFFFF')!, bone: 'Spine2' as const, pos: [0, 0.05, 0.14] as [number, number, number], rot: [0, 0, 0] as [number, number, number], mirror: false };
    const vp = cam.viewport.toGlobal(400, 800);
    const vpm = cam.getViewMatrix(true).multiply(cam.getProjectionMatrix(true));
    const screen = (p: typeof part, local: Vector3) => {
      const w = Vector3.TransformCoordinates(local, partMatrix(p).multiply(frames.frame.get(p.bone)!).multiply(s.root.computeWorldMatrix(true)));
      const q = Vector3.Project(w, Matrix.Identity(), vpm, vp);
      return { x: q.x, y: q.y };
    };
    for (const sweep of [30, -45]) {
      const c0 = screen(part, Vector3.Zero()), t0 = screen(part, new Vector3(0, 0.1, 0));
      const turned = { ...part, ...turnFromScreen(s, part, cam, sweep)! };
      const c1 = screen(turned, Vector3.Zero()), t1 = screen(turned, new Vector3(0, 0.1, 0));
      expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeLessThan(0.5);    // about its own centre
      expect(sweptAngle(c0, t0, t1)).toBeCloseTo(sweep, 0);               // the way the pointer went, as far
    }
    cam.dispose(); s.root.dispose();
  });
});

describe('tap a part on screen', () => {
  it('its projected centre selects it; empty space selects nothing', () => {
    const s = body();
    const parts = [newPart([], 'horn', '#FF0000')!];
    syncParts(s, parts);
    settle(s);
    scene.render();
    const on = partsOnScreen(s, parts, scene, camera, 400, 800);
    expect(on.length).toBe(2);   // the horn and its mirror copy
    for (const o of on) { expect(o.x).toBeGreaterThan(0); expect(o.x).toBeLessThan(400); expect(o.y).toBeGreaterThan(0); expect(o.y).toBeLessThan(800); }
    expect(partAt(on, on[0].x + 2, on[0].y - 2)!.id).toBe(parts[0].id);
    expect(partAt(on, 5, 790)).toBeNull();
    s.root.dispose();
  });
});

describe('the stage', () => {
  it('four lights, two plinth meshes never pickable, a transparent clear, the venue light from its mood', () => {
    const st = new StudioStage(scene, camera, { tier: 'mobile', env: false });
    expect(scene.clearColor.a).toBe(0);
    expect(Object.keys(st.lights)).toHaveLength(4);
    expect(st.plinth).toHaveLength(2);
    for (const m of st.plinth) { expect(m.isPickable).toBe(false); expect(m.checkCollisions).toBe(false); }
    expect(st.lights.back.diffuse.toHexString()).toBe(STUDIO_LIGHT.back.toUpperCase());
    st.setVenue('nightGame');
    expect(st.lights.key.diffuse.toHexString()).toBe(MOODS.nightGame.sun.toUpperCase());
    expect(lightFor('dojoWarm').env).toBe('dojoWarm');
    st.dispose();
    expect(scene.lights.filter((l) => l.name.startsWith('studio'))).toHaveLength(0);
  });
  it('moves the camera to the shot and turns the body to face the camera with its left side', () => {
    let t = 0;
    const st = new StudioStage(scene, camera, { tier: 'desktop', env: false, now: () => t });
    const s = body();
    st.setBody(s);
    st.frame({ shot: 'face', facing: -Math.PI / 4 });
    for (let i = 0; i < 180; i++) { t += 16; st.update(1 / 60); }
    expect(camera.radius).toBeCloseTo(frameShot('face').radius, 3);
    expect(camera.target.y).toBeCloseTo(frameShot('face').targetY, 3);
    expect(s.root.rotation.y).toBeCloseTo(-Math.PI / 4, 3);
    settle(s);
    camera.getViewMatrix(true);
    const cam = camera.position.clone();
    expect(Vector3.Distance(joint(s, 'LeftHand'), cam)).toBeLessThan(Vector3.Distance(joint(s, 'RightHand'), cam));
    expect(st.gate.holding('camera')).toBe(false);   // settled: the camera no longer keeps the Studio drawing
    st.dispose(); s.root.dispose();
  });
  it('draws on demand: the turntable keeps it drawing; stopped and idle, the frame holds', () => {
    let t = 0;
    const st = new StudioStage(scene, camera, { tier: 'mobile', env: false, now: () => t });
    const s = body();
    st.setBody(s);
    st.update(1 / 60);
    t += IDLE_GRACE * 3;
    expect(st.gate.due()).toBe(true);           // the auto spin is on
    st.setAutoSpin(false);
    st.update(1 / 60);
    t += IDLE_GRACE * 3;
    st.update(1 / 60);
    expect(st.gate.due()).toBe(false);          // nothing moves: hold the frame
    const y0 = s.root.rotation.y;
    st.spinBy(100);
    expect(s.root.rotation.y).not.toBe(y0);
    expect(st.gate.due()).toBe(true);           // a drag draws
    st.dispose(); s.root.dispose();
  });
});
