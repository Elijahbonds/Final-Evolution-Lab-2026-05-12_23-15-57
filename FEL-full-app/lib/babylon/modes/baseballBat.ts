// baseballBat — BASEBALL-FEEL (2026-10-23): the ONE two-hand bat, shared by Derby (precisionModes.ts) and the three-innings
// batter (BaseballInningsMode.ts). Spec §4: "NOT a hand-bone child … the Innings mode must import this rather than fork it".
//
// placeTwoHandBat is Derby's ANIM-SURGICAL / ANIM-RESIDUAL placement, moved here verbatim: every frame, after the clips and
// the posture layer, the handle runs through BOTH fists (a palm past each wrist along the forearm) and the barrel along the
// swing's authored line (anim/authored/baseball BAT_LINE) in the batter's root frame, pulled toward the line between the
// fists by BAT_HANDS_PULL (Derby measured 2.9 cm median grip, no swing frame past 8 cm). The side is latched from the
// shoulders on the stance. The cylinder is centred on its origin: the knob just past the fists, the barrel along +Y.
//
// The look: BAT_LOOK 'glb' draws public/models/meshy/bat.glb over the placed cylinder (a wrapper node, handle at its origin
// and barrel along +Y, copies the cylinder's computed transform each frame); 'cylinder' keeps the procedural cylinder.
// One constant, both modes (Elijah's call on the GLB is pending, spec §5 item 6).
//
// It reads the hand bones to DRAW the bat only; neither mode's grade reads the bat or a hand (reachFreeze B4, draw-only).

import { MeshBuilder, Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Material, Observer, Scene } from '@babylonjs/core';
import { spawnMeshyProp } from '../visual/meshyProps';
import { VenueKit } from '../visual/VenueKit';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { boneNode } from '../anim/boneLookup';
import { batLineAt, batRightSign } from '../anim/authored/baseball';

/** The bat: length, the knob's overhang past the fists, and wrist → fist along the forearm (ANIM-SURGICAL). */
export const BAT_LEN = 0.86, BAT_KNOB_M = 0.08, BAT_PALM_M = 0.07;
/** Fists closer than this are one grip (the line between them is noise); further apart, they set the handle's line. */
export const BAT_SPLIT_M = 0.05;
/** At most this share of the barrel's line comes from the fists; the rest is the swing's authored line. */
export const BAT_HANDS_PULL = 0.7;
/** The cylinder's diameters (barrel end, knob end). */
export const BAT_DIAM = { top: 0.065, bottom: 0.03 } as const;

/** Which bat is drawn: the Meshy GLB or the procedural cylinder. Switch here; both modes follow. */
export type BatLook = 'glb' | 'cylinder';
export const BAT_LOOK: BatLook = 'glb';

/** bat.glb as measured (2026-10-23): the bat lies diagonally in its XY plane, handle ≈ (−0.40, −0.17, 0), barrel
 *  ≈ (+0.40, +0.17, 0), centred on the origin, ≈ 0.87 m long. */
export const BAT_GLB_HANDLE = [-0.40, -0.17, 0] as const;
export const BAT_GLB_BARREL = [0.40, 0.17, 0] as const;

/** The fit that turns the GLB's handle→barrel onto +Y with the handle at the origin, scaled to BAT_LEN. Pure. */
export function batGlbFit(handle: readonly number[] = BAT_GLB_HANDLE, barrel: readonly number[] = BAT_GLB_BARREL, len = BAT_LEN): { rotZ: number; scale: number; offsetY: number } {
  const dx = barrel[0] - handle[0], dy = barrel[1] - handle[1];
  const rotZ = Math.PI / 2 - Math.atan2(dy, dx);   // the handle→barrel angle (≈ 23° off +X) turned onto +Y
  const scale = len / Math.hypot(dx, dy);
  // the GLB is centred on its origin, so after the turn and the scale the handle sits at −len/2 on Y: lift it to the origin
  return { rotZ, scale, offsetY: len / 2 };
}

export interface BatLookHandle { setVisible(on: boolean): void; dispose(): void }

/** Draw bat.glb over a placed bat cylinder (BAT_LOOK 'glb'), or leave the cylinder as the look ('cylinder'). */
export function dressBatGlb(scene: Scene, carrier: AbstractMesh, len = BAT_LEN, look: BatLook = BAT_LOOK): BatLookHandle {
  let shown = true;
  if (look === 'cylinder') {
    return { setVisible(on) { shown = on; carrier.isVisible = on; }, dispose() {} };
  }
  let outer: TransformNode | null = new TransformNode(`${carrier.name}_glb`, scene);
  let loaded = false;
  outer.rotationQuaternion = new Quaternion();
  outer.setEnabled(false);
  const up = new Vector3(), knob = new Vector3();
  const obs: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    if (!outer || carrier.isDisposed()) return;
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
    loaded = true;
    outer.setEnabled(shown);
    carrier.isVisible = false;   // the cylinder keeps computing the line; the Meshy bat is what is seen
  });
  return {
    setVisible(on) {
      shown = on;
      if (loaded) outer?.setEnabled(on); else carrier.isVisible = on;
    },
    dispose() {
      if (obs) scene.onBeforeRenderObservable.remove(obs);
      outer?.dispose(false, true); outer = null;
    },
  };
}

type Bone = NonNullable<ReturnType<typeof boneNode>>;
export interface BatBones { lh: Bone; rh: Bone; lf: Bone | null; rf: Bone | null; lsh: Bone | null; rsh: Bone | null }

/** The batter's hand, forearm and shoulder bones, or null when either hand is missing. */
export function batBones(body: SpawnedCharacter): BatBones | null {
  const lh = boneNode(body.skeleton, 'LeftHand'), rh = boneNode(body.skeleton, 'RightHand');
  if (!lh || !rh) return null;
  return {
    lh, rh,
    lf: boneNode(body.skeleton, 'LeftForeArm'), rf: boneNode(body.skeleton, 'RightForeArm'),
    lsh: boneNode(body.skeleton, 'LeftArm'), rsh: boneNode(body.skeleton, 'RightArm'),
  };
}

/** Place `bat` (a BAT_LEN cylinder with a rotationQuaternion) through both fists every frame, the barrel on the swing clock
 *  `swingSec()` (null = the load). `onSide` hears the latched side once. Returns the frame observer (remove it to stop). */
export function placeTwoHandBat(
  scene: Scene, root: TransformNode, b: BatBones, bat: AbstractMesh, swingSec: () => number | null, onSide?: (rightSign: -1 | 1) => void,
): Observer<Scene> | null {
  const { lh, rh, lf, rf, lsh, rsh } = b;
  /** ANIM-RESIDUAL (2026-09-14): which way the batter's RIGHT really lies along the root's +x — +1 or −1, latched from
   *  the shoulders on the stance before any swing turns them; 0 until it reads. */
  let rightSign = 0;
  const UP = Vector3.Up();
  // IMPROVE (2026-10-06, Derby #13): the placement runs every frame, so it writes into these (no allocation a frame).
  const sL = new Vector3(), sR = new Vector3(), sAlong = new Vector3(), sGrip = new Vector3(), sDir = new Vector3(), sSpan = new Vector3(), sEuler = new Vector3();
  /** The fist, not the wrist: a hand bone's origin is the wrist, the handle sits a palm further along the forearm line. */
  const fist = (hand: Bone, fore: Bone | null, out: Vector3): Vector3 => {
    hand.computeWorldMatrix(true);
    out.copyFrom(hand.getAbsolutePosition());
    if (!fore) return out;
    fore.computeWorldMatrix(true);
    const along = out.subtractToRef(fore.getAbsolutePosition(), sAlong);
    return along.lengthSquared() > 1e-8 ? out.addInPlace(along.normalize().scaleInPlace(BAT_PALM_M)) : out;
  };
  return scene.onBeforeRenderObservable.add(() => {
    if (bat.isDisposed()) return;
    const sec = swingSec();
    const fL = fist(lh, lf, sL), fR = fist(rh, rf, sR);
    const grip = fL.addToRef(fR, sGrip).scaleInPlace(0.5);
    const d = batLineAt(sec);
    const yaw = root.rotationQuaternion ? root.rotationQuaternion.toEulerAnglesToRef(sEuler).y : root.rotation.y;
    // root → world: +x = (cos, 0, -sin), +z forward = (sin, 0, cos) — the axes the hand targets are authored in.
    // ANIM-RESIDUAL: +x is NOT the batter's right on the runtime rig (measured on dev :3061, /dev/mode/derby, kit body:
    // the barrel laid off toward +x crossed the face). The side is read off the body, not assumed.
    if (rightSign === 0 && lsh && rsh && sec == null) {
      const across = rsh.getAbsolutePosition().subtract(lsh.getAbsolutePosition());
      rightSign = batRightSign(across.x, across.z, yaw);
      if (rightSign !== 0) onSide?.(rightSign as -1 | 1);
    }
    const dx = d[0] * (rightSign || 1);
    const dir = sDir.set(dx * Math.cos(yaw) + d[2] * Math.sin(yaw), d[1], -dx * Math.sin(yaw) + d[2] * Math.cos(yaw));
    // Hands that come apart through the swing lie ON the handle, so the line between the fists pulls the handle onto it
    // (signed along the authored line). At 0.7 the fists stay on the handle (2.9 cm median, none past 8 cm) and the barrel
    // only dips ≤ 27° at the launch and through the zone, the way a real swing's does.
    const span = fR.subtractToRef(fL, sSpan); const sep = span.length();
    if (sep > BAT_SPLIT_M) {
      span.scaleInPlace((Vector3.Dot(span, dir) < 0 ? -1 : 1) / sep);
      const k = BAT_HANDS_PULL * Math.min(1, (sep - BAT_SPLIT_M) / 0.08);
      dir.scaleInPlace(1 - k).addInPlace(span.scaleInPlace(k)).normalize();
    }
    Quaternion.FromUnitVectorsToRef(UP, dir, bat.rotationQuaternion!);
    // the cylinder is centred on its origin: the knob just past the fists, the barrel out along the line
    bat.position.copyFrom(grip.addInPlace(dir.scaleInPlace(BAT_LEN / 2 - BAT_KNOB_M)));
  });
}

export interface BatHandle { carrier: AbstractMesh; tip: TransformNode; setVisible(on: boolean): void; dispose(): void }

/** The innings batter's bat: a cylinder placed by placeTwoHandBat, drawn by BAT_LOOK. Not a RightHand child. */
export function mountTwoHandBat(scene: Scene, body: SpawnedCharacter, swingSec: () => number | null, name = 'baseball_bat', material?: Material): BatHandle | null {
  const bones = batBones(body);
  if (!bones) return null;
  const bat = MeshBuilder.CreateCylinder(name, { height: BAT_LEN, diameterTop: BAT_DIAM.top, diameterBottom: BAT_DIAM.bottom, tessellation: 12 }, scene);
  bat.material = material ?? VenueKit.paint(scene, `${name}_m`, '#c9a06a', 0.05, 0.6);
  bat.isPickable = false;
  bat.rotationQuaternion = new Quaternion();
  const tip = new TransformNode(`${name}_tip`, scene); tip.parent = bat; tip.position.set(0, BAT_LEN / 2, 0);
  const look = dressBatGlb(scene, bat);
  const obs = placeTwoHandBat(scene, body.root, bones, bat, swingSec);
  return {
    carrier: bat, tip,
    setVisible(on) { look.setVisible(on); },
    dispose() { if (obs) scene.onBeforeRenderObservable.remove(obs); look.dispose(); tip.dispose(); bat.dispose(false, true); },
  };
}
