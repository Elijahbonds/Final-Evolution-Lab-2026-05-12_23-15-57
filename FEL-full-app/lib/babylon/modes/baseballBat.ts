// baseballBat — BASEBALL-FEEL (2026-10-23): the Meshy bat (public/models/meshy/bat.glb) drawn over Derby's placed bat.
//
// Derby's two-hand placement (precisionModes.ts, ANIM-SURGICAL / ANIM-RESIDUAL) is unchanged: every frame the cylinder's
// handle runs through BOTH fists and its barrel along the swing's authored line. It is NOT parented to RightHand. The
// cylinder stays the carrier of that computed transform (the streak's tip rides it); this wrapper node — handle at its
// origin, barrel along +Y — copies the carrier's position and rotation each frame. If the GLB does not load, the
// cylinder stays visible.
//
// mountTwoHandBat (below) gives the three-innings batter the same bat: Derby's two-hand placement, ported here so
// baseball's clip closure does not pull in precisionModes. It reads the hand bones to DRAW the bat only; the swing's grade
// is baseballGame.gradeSwing (the press's timing against the pitch), which reads no bone (reachFreeze B4, draw-only).

import { MeshBuilder, Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import { spawnMeshyProp } from '../visual/meshyProps';
import { VenueKit } from '../visual/VenueKit';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { boneNode } from '../anim/boneLookup';
import { batLineAt, batRightSign } from '../anim/authored/baseball';

/** The bat's length (Derby's BAT_LEN, precisionModes.ts). */
export const BAT_LEN = 0.86, BAT_KNOB_M = 0.08, BAT_PALM_M = 0.07;
/** Fists closer than this are one grip; further apart, they set the handle's line (Derby). */
export const BAT_SPLIT_M = 0.05;
/** At most this share of the barrel's line comes from the fists (Derby: 2.9 cm median grip, none past 8 cm). */
export const BAT_HANDS_PULL = 0.7;

/** bat.glb as measured (2026-10-23): the bat lies diagonally in its XY plane, handle ≈ (−0.40, −0.17, 0), barrel
 *  ≈ (+0.40, +0.17, 0), centred on the origin, ≈ 0.87 m long. */
export const BAT_GLB_HANDLE = [-0.40, -0.17, 0] as const;
export const BAT_GLB_BARREL = [0.40, 0.17, 0] as const;

/** The fit that turns the GLB's handle→barrel onto +Y with the handle at the origin, scaled to BAT_LEN. Pure. */
export function batGlbFit(handle: readonly number[] = BAT_GLB_HANDLE, barrel: readonly number[] = BAT_GLB_BARREL, len = BAT_LEN): { rotZ: number; scale: number; offsetY: number } {
  const dx = barrel[0] - handle[0], dy = barrel[1] - handle[1];
  const glbLen = Math.hypot(dx, dy);
  const rotZ = Math.PI / 2 - Math.atan2(dy, dx);   // the handle→barrel angle (≈ 23° off +X) turned onto +Y
  const scale = len / glbLen;
  // the GLB is centred on its origin, so after the turn and the scale the handle sits at −len/2 on Y: lift it to the origin
  return { rotZ, scale, offsetY: len / 2 };
}

/** Swap a bat-carrier cylinder's look for bat.glb: the wrapper copies the carrier's computed transform every frame. */
export function dressBatGlb(scene: Scene, carrier: AbstractMesh, len = BAT_LEN): { dispose(): void } {
  let outer: TransformNode | null = new TransformNode(`${carrier.name}_glb`, scene);
  outer.rotationQuaternion = new Quaternion();
  outer.setEnabled(false);
  const up = new Vector3(), knob = new Vector3();
  const obs: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    if (!outer || carrier.isDisposed()) return;
    carrier.computeWorldMatrix(true);
    // the carrier is centred; the wrapper's origin is the handle's end: half a bat back along the carrier's +Y
    up.set(0, 1, 0).rotateByQuaternionToRef(carrier.rotationQuaternion ?? Quaternion.Identity(), up);
    outer.position.copyFrom(carrier.position.subtractToRef(up.scaleToRef(len / 2, knob), knob));
    outer.rotationQuaternion!.copyFrom(carrier.rotationQuaternion ?? Quaternion.Identity());
  });
  void spawnMeshyProp(scene, 'bat', null, `${carrier.name}_meshy`).then((model) => {
    if (!model || !outer || carrier.isDisposed()) { model?.dispose(); return; }
    const fit = batGlbFit(BAT_GLB_HANDLE, BAT_GLB_BARREL, len);
    model.rotation.set(0, 0, fit.rotZ);
    model.scaling.setAll(fit.scale);
    model.position.set(0, fit.offsetY, 0);
    model.parent = outer;
    outer.setEnabled(true);
    carrier.isVisible = false;   // the cylinder keeps computing the line; the Meshy bat is what is seen
  });
  return {
    dispose() {
      if (obs) scene.onBeforeRenderObservable.remove(obs);
      outer?.dispose(false, true); outer = null;
    },
  };
}

export interface BatHandle { carrier: AbstractMesh; tip: TransformNode; dispose(): void }

/** Derby's two-hand bat on `body`, the barrel on the swing clock `swingSec()` (null = the load). Not a RightHand child. */
export function mountTwoHandBat(scene: Scene, body: SpawnedCharacter, swingSec: () => number | null, name = 'baseball_bat'): BatHandle | null {
  const lh = boneNode(body.skeleton, 'LeftHand'), rh = boneNode(body.skeleton, 'RightHand');
  const lf = boneNode(body.skeleton, 'LeftForeArm'), rf = boneNode(body.skeleton, 'RightForeArm');
  const lsh = boneNode(body.skeleton, 'LeftArm'), rsh = boneNode(body.skeleton, 'RightArm');
  if (!lh || !rh) return null;
  const bat = MeshBuilder.CreateCylinder(name, { height: BAT_LEN, diameterTop: 0.065, diameterBottom: 0.03, tessellation: 12 }, scene);
  bat.material = VenueKit.paint(scene, `${name}_m`, '#c9a06a', 0.05, 0.6);
  bat.isPickable = false;
  bat.rotationQuaternion = new Quaternion();
  const tip = new TransformNode(`${name}_tip`, scene); tip.parent = bat; tip.position.set(0, BAT_LEN / 2, 0);
  const glb = dressBatGlb(scene, bat);
  let rightSign = 0;
  const UP = Vector3.Up();
  const sL = new Vector3(), sR = new Vector3(), sAlong = new Vector3(), sGrip = new Vector3(), sDir = new Vector3(), sSpan = new Vector3(), sEuler = new Vector3();
  const fist = (hand: typeof lh, fore: typeof lf, out: Vector3): Vector3 => {
    hand.computeWorldMatrix(true);
    out.copyFrom(hand.getAbsolutePosition());
    if (!fore) return out;
    fore.computeWorldMatrix(true);
    const along = out.subtractToRef(fore.getAbsolutePosition(), sAlong);
    return along.lengthSquared() > 1e-8 ? out.addInPlace(along.normalize().scaleInPlace(BAT_PALM_M)) : out;
  };
  const obs = scene.onBeforeRenderObservable.add(() => {
    if (bat.isDisposed()) return;
    const sec = swingSec();
    const fL = fist(lh, lf, sL), fR = fist(rh, rf, sR);
    const grip = fL.addToRef(fR, sGrip).scaleInPlace(0.5);
    const d = batLineAt(sec);
    const yaw = body.root.rotationQuaternion ? body.root.rotationQuaternion.toEulerAnglesToRef(sEuler).y : body.root.rotation.y;
    if (rightSign === 0 && lsh && rsh && sec == null) {
      const across = rsh.getAbsolutePosition().subtract(lsh.getAbsolutePosition());
      rightSign = batRightSign(across.x, across.z, yaw);
    }
    const dx = d[0] * (rightSign || 1);
    const dir = sDir.set(dx * Math.cos(yaw) + d[2] * Math.sin(yaw), d[1], -dx * Math.sin(yaw) + d[2] * Math.cos(yaw));
    const span = fR.subtractToRef(fL, sSpan); const sep = span.length();
    if (sep > BAT_SPLIT_M) {
      span.scaleInPlace((Vector3.Dot(span, dir) < 0 ? -1 : 1) / sep);
      const k = BAT_HANDS_PULL * Math.min(1, (sep - BAT_SPLIT_M) / 0.08);
      dir.scaleInPlace(1 - k).addInPlace(span.scaleInPlace(k)).normalize();
    }
    Quaternion.FromUnitVectorsToRef(UP, dir, bat.rotationQuaternion!);
    bat.position.copyFrom(grip.addInPlace(dir.scaleInPlace(BAT_LEN / 2 - BAT_KNOB_M)));
  });
  return {
    carrier: bat, tip,
    dispose() { scene.onBeforeRenderObservable.remove(obs); glb.dispose(); tip.dispose(); bat.dispose(false, true); },
  };
}
