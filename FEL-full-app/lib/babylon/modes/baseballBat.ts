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
import { feel } from '../../feel-panel/feel';

/** The bat: length, the knob's overhang past the fists, and wrist → fist along the forearm (ANIM-SURGICAL). */
export const BAT_LEN = 0.86, BAT_KNOB_M = 0.08, BAT_PALM_M = 0.07;
/** Fists closer than this are one grip (the line between them is noise); further apart, they set the handle's line. */
export const BAT_SPLIT_M = 0.05;
/** At most this share of the barrel's line comes from the fists; the rest is the swing's authored line. */
export const BAT_HANDS_PULL = 0.7;
/** The cylinder's diameters (barrel end, knob end). */
export const BAT_DIAM = { top: 0.065, bottom: 0.03 } as const;

/** BAT-GRIP-2 (2026-11-10): a bat is drawn only while both fists can be on it. placeTwoHandBat strings the handle
 *  between the two fists whatever the body is doing, so whenever the arms are NOT in a batting clip the bat hung in the
 *  air between two far-apart hands. Measured (scripts/probes/bat-grip-2): the innings batter coming back to the stance
 *  from another clip (after a strikeout, a run, a celebration) blends over 0.18 s with the bat already switched on, the
 *  fists 0.51–0.80 m apart on its first frames; Derby's first frames read 0.71–0.73 m. A held stance reads 0.07 m, the
 *  swing's follow-through 0.23 m, the swing → stance blend 0.35 m at its widest, and rig-grip-tests calls a hand free
 *  from 0.40 m. So the bat hides past BAT_GRIP_LOST_M and comes back under BAT_GRIP_BACK_M (the gap between the two
 *  keeps it from flickering on the edge, and keeps it drawn through the swing → stance blend).
 *  NEW numbers, flagged, behind feel knobs baseball.batGripLostM / baseball.batGripBackM (lost at its 2.0 m maximum never
 *  hides: the old behaviour exactly). Draw-only: no grade reads the bat, the grip or a hand. */
export const BAT_GRIP_LOST_M = 0.4;
export const BAT_GRIP_BACK_M = 0.3;
/** Whether the bat is held this frame, from last frame's answer and the fists' distance (m). Pure. */
export function batGripHeld(
  wasHeld: boolean, fistSep: number,
  lostM = feel('baseball.batGripLostM', BAT_GRIP_LOST_M), backM = feel('baseball.batGripBackM', BAT_GRIP_BACK_M),
): boolean {
  return wasHeld ? fistSep <= lostM : fistSep < Math.min(backM, lostM);
}
/** The carrier's metadata key placeTwoHandBat writes the grip into (the look reads it; so does the live probe). */
const GRIP_KEY = 'batGripHeld';
/** Whether placeTwoHandBat last found the bat in both fists (true before it has placed one). */
export function batHeld(carrier: AbstractMesh): boolean { return (carrier.metadata as Record<string, unknown> | null)?.[GRIP_KEY] !== false; }
/** The look's redraw for a carrier: placeTwoHandBat calls it the moment the grip changes, so the bat is hidden on the
 *  SAME frame the fists come apart whichever of the two frame observers was registered first. */
const GRIP_REDRAW = new WeakMap<AbstractMesh, () => void>();

/** Which bat is drawn: the Meshy GLB or the procedural cylinder. Switch here; both modes follow. */
export type BatLook = 'glb' | 'cylinder';
export const BAT_LOOK: BatLook = 'glb';

/** bat.glb as measured (2026-10-23) IN THE FILE (glTF's own axes): the bat lies diagonally in its XY plane, handle (its
 *  thin end) ≈ (−0.40, −0.17, 0), barrel ≈ (+0.40, +0.17, 0), centred on the origin, ≈ 0.87 m long. */
export const BAT_GLB_HANDLE = [-0.40, -0.17, 0] as const;
export const BAT_GLB_BARREL = [0.40, 0.17, 0] as const;

/** BAT-GRIP (owner, 2026-11-03: "the character holds the bat upside down"): where a FILE point sits once Babylon's glTF
 *  loader has it. The loader hangs every glTF under a __root__ node turned 180° about Y with Z scaled −1 (glTF is
 *  right-handed, Babylon left-handed), so a file point (x, y, z) loads at (−x, y, z). The fit below used the file's own
 *  numbers, turned the MIRRORED bat by the file's angle, and drew it 134° off its line: the knob up by the barrel's end,
 *  the barrel down through the fists (measured on the real rig, /dev/mode/baseball: GLB 137.8° off the placed line, its
 *  thick end 0.31 m from the fists and its thin end 0.74 m). Pure. */
export function batGlbInScene(p: readonly number[]): [number, number, number] {
  return [-p[0], p[1], p[2]];
}

/** The fit that turns the LOADED GLB's handle→barrel onto +Y with the handle at the origin, scaled to BAT_LEN. Pure.
 *  The defaults are the file's measured ends as the loader leaves them (batGlbInScene). */
export function batGlbFit(
  handle: readonly number[] = batGlbInScene(BAT_GLB_HANDLE), barrel: readonly number[] = batGlbInScene(BAT_GLB_BARREL), len = BAT_LEN,
): { rotZ: number; scale: number; offsetY: number } {
  const dx = barrel[0] - handle[0], dy = barrel[1] - handle[1];
  // Babylon's rotation.z turns +X toward +Y (x' = x cos − y sin, y' = x sin + y cos): the handle→barrel angle onto +Y
  const rotZ = Math.PI / 2 - Math.atan2(dy, dx);
  const scale = len / Math.hypot(dx, dy);
  // the GLB is centred on its origin, so after the turn and the scale the handle sits at −len/2 on Y: lift it to the origin
  return { rotZ, scale, offsetY: len / 2 };
}

/** Put a spawned bat.glb (spawnMeshyProp's root, the loader's __root__ under it) on the fit: handle at its parent's origin,
 *  barrel along its parent's +Y. What dressBatGlb runs, and what baseballBatGrip.test.ts loads the real file through. */
export function fitBatModel(model: TransformNode, len = BAT_LEN): void {
  const fit = batGlbFit(batGlbInScene(BAT_GLB_HANDLE), batGlbInScene(BAT_GLB_BARREL), len);
  model.rotation.set(0, 0, fit.rotZ);
  model.scaling.setAll(fit.scale);
  model.position.set(0, fit.offsetY, 0);
}

/** The handle's end of a placed carrier cylinder (centred on its origin, barrel along its +Y): half a bat back along +Y.
 *  The GLB wrapper's origin. Writes into `out`. */
const sUp = new Vector3();
export function batHandleEnd(carrier: AbstractMesh, len: number, out: Vector3): Vector3 {
  sUp.set(0, 1, 0).rotateByQuaternionToRef(carrier.rotationQuaternion ?? Quaternion.Identity(), sUp);   // per frame: no allocation
  return carrier.position.subtractToRef(sUp.scaleInPlace(len / 2), out);
}

export interface BatLookHandle { setVisible(on: boolean): void; dispose(): void }

/** Draw bat.glb over a placed bat cylinder (BAT_LOOK 'glb'), or leave the cylinder as the look ('cylinder'). */
export function dressBatGlb(scene: Scene, carrier: AbstractMesh, len = BAT_LEN, look: BatLook = BAT_LOOK): BatLookHandle {
  /** What the mode asked for (the innings shows it in the stance and the swings only); the grip decides the rest. */
  let shown = true;
  if (look === 'cylinder') {
    // BAT-GRIP-2: the cylinder is the look, so it hides while the fists are apart (batHeld), as the GLB does
    const draw = () => { if (!carrier.isDisposed()) carrier.isVisible = shown && batHeld(carrier); };
    GRIP_REDRAW.set(carrier, draw);
    return { setVisible(on) { shown = on; draw(); }, dispose() { GRIP_REDRAW.delete(carrier); } };
  }
  let outer: TransformNode | null = new TransformNode(`${carrier.name}_glb`, scene);
  let loaded = false;
  outer.rotationQuaternion = new Quaternion();
  outer.setEnabled(false);
  // BAT-GRIP-2: drawn when the mode shows it AND both fists hold it; before the GLB has loaded, the cylinder stands in
  const draw = (): void => {
    if (!outer || carrier.isDisposed()) return;
    const on = shown && batHeld(carrier);
    if (loaded) { if (outer.isEnabled(false) !== on) outer.setEnabled(on); } else carrier.isVisible = on;
  };
  GRIP_REDRAW.set(carrier, draw);
  const obs: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    if (!outer || carrier.isDisposed()) return;
    // the carrier is centred; the wrapper's origin is the handle's end: half a bat back along the carrier's +Y
    batHandleEnd(carrier, len, outer.position);
    outer.rotationQuaternion!.copyFrom(carrier.rotationQuaternion ?? Quaternion.Identity());
  });
  void spawnMeshyProp(scene, 'bat', null, `${carrier.name}_meshy`).then((model) => {
    if (!model || !outer || carrier.isDisposed()) { model?.dispose(); return; }
    fitBatModel(model, len);   // BAT-GRIP: the fit in the scene's axes, not the file's (the bat was drawn upside down)
    model.parent = outer;
    loaded = true;
    carrier.isVisible = false;   // the cylinder keeps computing the line; the Meshy bat is what is seen
    draw();
  });
  return {
    setVisible(on) { shown = on; draw(); },
    dispose() {
      if (obs) scene.onBeforeRenderObservable.remove(obs);
      GRIP_REDRAW.delete(carrier);
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
  /** BAT-GRIP-2: last frame's grip (batGripHeld's hysteresis), written to the carrier for the look. It starts held: a
   *  batter who spawns in the stance has the bat from the first frame, and one who does not loses it on that frame. */
  let held = true;
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
    // BAT-GRIP-2: is the bat in both fists? (the look hides it while it is not: a bat strung between two far-apart hands)
    const was = held; held = batGripHeld(held, sep);
    (bat.metadata ??= {})[GRIP_KEY] = held;
    if (held !== was) GRIP_REDRAW.get(bat)?.();
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
