// RIG EQUIVALENCE (rig-perf, 2026-10-16). Runs the SAME seeded input through two implementations of the per-frame rig layers on
// the real hero rig and records every bone, frame by frame, so a pass that is meant to change nothing about the motion (an
// allocation pass, a refactor) can prove it bit for bit.
//
// A run is the shipping stack, in the shipping order, on public/models/fel-hero.glb under a NullEngine: the spawn's clip library
// (the GLB's own clips sanitised, the authored clips, the mocap captures, the dance clips) played by a CharacterAnimator on a
// fixed 1/60 s clock, then the after-animation layers as a mode mounts them — FootPlanting (spawn), the Posture Poses layer (the
// mode), and a two-arm reach through the TwoBoneIK chain solver last. The root walks a seeded path that turns, cuts, jumps
// (airborne: pins let go), teleports once (a reset) and lends a leg to another writer for a while (the S30 claim and handover).
//
// The record per frame: every bone node's local position and rotation quaternion and its world matrix, the root's, and each
// layer's readouts (the posture's eased angles, the planting state and pins, the reach misses). `firstDifference` compares two
// runs with Object.is per number (bit for bit, −0 ≠ 0), or within an absolute tolerance when one is given.
//
// Use: runRigScenario(implA, scenario) and runRigScenario(implB, scenario), then firstDifference(a, b). An implementation is the
// set of layer entry points (a module namespace satisfies it); tests/helpers/rigLegacy holds the frozen pre-change layers.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from '@/lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '@/lib/babylon/anim/authored';
import { installOpponentMotion } from '@/lib/babylon/anim/opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from '@/lib/babylon/anim/importSanitizer';
import { buildDanceClip } from '@/lib/babylon/anim/danceClips';
import { boneNode } from '@/lib/babylon/anim/boneLookup';
import type { PosturePose } from '@/lib/babylon/core/DunkPosture';
import type { LegPose } from '@/lib/babylon/core/DunkLegs';

const DT = 1 / 60;

/** The layer entry points a run drives. A module namespace (or a frozen reference copy) satisfies it. */
export interface RigImpl {
  name: string;
  mountPostureLayer: (scene: Scene, skeleton: Skeleton, root: TransformNode, feed: () => PostureFeedLike | null, tag?: string) => { layer: PostureReadouts; dispose(): void };
  mountFootPlanting: (scene: Scene, skinned: AbstractMesh, skeleton: Skeleton, opts: { root: TransformNode; intensity?: number }) => { dispose(): void; readonly debug: { left: ContactLike; right: ContactLike } };
  claimLeg: (skeleton: Skeleton, side: 'Left' | 'Right', pinWorld: Vector3) => void;
  releaseLeg: (skeleton: Skeleton, side: 'Left' | 'Right') => void;
  solveChainInFrame: (rootN: TransformNode, midN: TransformNode, endN: TransformNode, targetWorld: Vector3, poleWorldDir: Vector3, weight?: number) => { miss: number };
}
interface PostureFeedLike { pose: PosturePose; legs?: LegPose; aim: Vector3 | null; eyes?: Vector3 | null; spinYaw?: number; window?: string }
interface PostureReadouts { aimRad: number; headYaw: number; headPitch: number; chestYaw: number; clipHipYaw: number; pose: PosturePose; legs: LegPose; ok: boolean }
interface ContactLike { planted: boolean; pin: { x: number; y: number; z: number } }

/** One seeded run: the clips in order (each held `clipFrames`), the posture table it cycles, and how the root moves. */
export interface RigScenario {
  name: string;
  clips: string[];
  /** Clip names that must exist in the library (the coverage is real only if the clips the scenario names actually play). */
  frames: number;
  clipFrames: number;
  postures: Record<string, PosturePose>;
  legs: Record<string, LegPose>;
  /** Root path: forward speed (m/s), turn rate (rad/s) amplitude, a jump window [from, to) in frames (an arc), a spin in the air. */
  speed: number;
  turn: number;
  jump?: [number, number];
  spin?: boolean;
  /** FootPlanting intensity (1 desktop, 0.6 phone). */
  plantIntensity: number;
  seed: number;
}

export interface RigTrace {
  impl: string;
  scenario: string;
  /** Labels for each column of a frame row. */
  columns: string[];
  rows: Float64Array[];
  coverage: Record<string, number>;
  missingClips: string[];
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** Optional hook (mutation checks): called after the layers each frame, before the record — a deliberate change must be caught. */
export type RigPerturb = (frame: number, skeleton: Skeleton) => void;

export async function runRigScenario(impl: RigImpl, sc: RigScenario, perturb?: RigPerturb, glb = process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb'): Promise<RigTrace> {
  const realRandom = Math.random;
  Math.random = mulberry32(sc.seed ^ 0x5eed);   // any variant pick inside the clip library draws the same on both runs
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT * 1000;
  const scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('c', new Vector3(0, 1.5, -4), scene);
  const quietInfo = console.info; console.info = () => {};
  try {
    const b64 = readFileSync(glb).toString('base64');
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    sanitizeImportedGroups(r.animationGroups);
    const sk = r.skeletons[0];
    const root = r.meshes[0] as unknown as TransformNode;
    const skinned = (r.meshes.find((m) => m.skeleton === sk) ?? r.meshes[0]) as AbstractMesh;
    root.position = Vector3.Zero(); root.scaling.setAll(1);   // CharacterLibrary.spawn's root
    const baseRot = (root.rotationQuaternion ?? Quaternion.Identity()).clone();

    const animator = new CharacterAnimator(scene, r.animationGroups);
    registerAuthoredClips(animator, scene, sk, null);
    neverBindPose(animator, 'idle_stand');
    installOpponentMotion(animator, scene, sk, null);
    for (const id of sc.clips) if (!animator.clipNames.has(id)) { const g = buildDanceClip(scene, sk, id); if (g) animator.register(g); }
    const missingClips = sc.clips.filter((c) => !animator.clipNames.has(c));

    // the layers, in the shipping order: FootPlanting (spawn) → Posture Poses (mode) → the arms' reach (last writer)
    const plant = impl.mountFootPlanting(scene, skinned, sk, { root, intensity: sc.plantIntensity });
    const rnd = mulberry32(sc.seed);
    const windows = Object.keys(sc.postures);
    const aim = new Vector3(), eyesPt = new Vector3();
    let frame = 0;
    const feed = (): PostureFeedLike | null => {
      if (frame % 97 >= 90) return null;   // a mode that steps the layer out for a few frames
      const w = windows[Math.floor(frame / 45) % windows.length];
      const legs = sc.legs[w] ?? Object.values(sc.legs)[0];
      const a = frame * 0.031;
      aim.set(root.position.x + Math.sin(a) * 3, 1.2 + Math.sin(a * 1.7) * 1.4, root.position.z + Math.cos(a) * 3);
      eyesPt.set(root.position.x - Math.cos(a * 0.6) * 2, 2.6, root.position.z + Math.sin(a * 0.6) * 2);
      const eyesMode = Math.floor(frame / 60) % 3;   // the aim / no eyes / their own point
      const spinYaw = sc.spin && sc.jump && frame >= sc.jump[0] && frame < sc.jump[1] ? ((frame - sc.jump[0]) / (sc.jump[1] - sc.jump[0])) * Math.PI * 2 : 0;
      return { pose: sc.postures[w], legs, aim: frame % 150 < 140 ? aim : null, eyes: eyesMode === 0 ? undefined : eyesMode === 1 ? null : eyesPt, spinYaw, window: w };
    };
    const posture = impl.mountPostureLayer(scene, sk, root, feed, `EQ-${impl.name}`);
    const arms = (['Left', 'Right'] as const).map((s) => ({ shoulder: boneNode(sk, `${s}Arm`)!, elbow: boneNode(sk, `${s}ForeArm`)!, hand: boneNode(sk, `${s}Hand`)! }));
    const reachT = new Vector3(), reachPole = new Vector3();
    const misses = [0, 0];
    let reachSlerp = 0;
    const armObs = scene.onAfterAnimationsObservable.add(() => {
      const win = Math.floor(frame / 20) % 5;   // 0: no reach; 1: full; 2: 0.6; 3: 0.3; 4: full with a pole straight back
      misses[0] = misses[1] = 0;
      if (win === 0) return;
      const w = win === 2 ? 0.6 : win === 3 ? 0.3 : 1;
      if (w < 1) reachSlerp++;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1, t = frame * 0.05 + i;
        reachT.set(root.position.x + side * (0.35 + 0.25 * Math.sin(t)), 1.1 + 0.6 * Math.sin(t * 1.3), root.position.z + 0.45 + 0.2 * Math.cos(t * 0.7));
        if (win === 4) reachPole.set(0, -0.1, -1); else reachPole.set(side * 0.9, -0.2, -0.3 + 0.2 * Math.sin(t));
        misses[i] = impl.solveChainInFrame(arms[i].shoulder, arms[i].elbow, arms[i].hand, reachT, reachPole, w).miss;
      }
    });

    const nodes: TransformNode[] = sk.bones.map((b) => b.getTransformNode()).filter((n): n is TransformNode => !!n);
    const columns: string[] = [];
    for (const n of [root, ...nodes]) {
      for (const k of ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw']) columns.push(`${n.name}.${k}`);
      for (let i = 0; i < 16; i++) columns.push(`${n.name}.world${i}`);
    }
    columns.push('posture.aimRad', 'posture.headYaw', 'posture.headPitch', 'posture.chestYaw', 'posture.clipHipYaw', 'posture.weight', 'posture.legWeight',
      'plant.left.planted', 'plant.left.pin.x', 'plant.left.pin.y', 'plant.left.pin.z', 'plant.right.planted', 'plant.right.pin.x', 'plant.right.pin.y', 'plant.right.pin.z',
      'reach.left.miss', 'reach.right.miss');

    const coverage: Record<string, number> = { plantedFrames: 0, releases: 0, flyingFrames: 0, claimFrames: 0, teleports: 0, spinFrames: 0, reachSlerpFrames: 0, postureOffFrames: 0, clipsPlayed: 0, postureOk: 0, aimFrames: 0, eyesFrames: 0, hipStripFrames: 0 };
    const rows: Float64Array[] = [];
    let x = 0, z = 0, yaw = 0, prevY = 0, wasPlanted = [false, false];
    const yawAxis = Vector3.Up();
    for (frame = 0; frame < sc.frames; frame++) {
      if (frame % sc.clipFrames === 0) {
        const name = sc.clips[(frame / sc.clipFrames) % sc.clips.length];
        animator.play(name, { loop: true, fadeSec: 0.2 }); coverage.clipsPlayed++;
      }
      // the root's seeded path: a speed that breathes, a turn that wanders, a cut every so often, a jump arc, one teleport
      const sp = sc.speed * (0.55 + 0.45 * Math.sin(frame * 0.045)) * (rnd() < 0.03 ? 0 : 1);
      yaw += sc.turn * Math.sin(frame * 0.021 + rnd() * 0.3) * DT + (frame % 73 === 0 ? (rnd() - 0.5) * 1.2 : 0);
      x += Math.sin(yaw) * sp * DT; z += Math.cos(yaw) * sp * DT;
      if (frame === Math.floor(sc.frames * 0.7)) { x += 3.5; coverage.teleports++; }   // a reset: > 2 m in a frame
      let y = 0;
      if (sc.jump && frame >= sc.jump[0] && frame < sc.jump[1]) { const u = (frame - sc.jump[0]) / (sc.jump[1] - sc.jump[0]); y = 4 * 0.9 * u * (1 - u); }
      if (Math.abs(y - prevY) / DT > 1.2) coverage.flyingFrames++;
      prevY = y;
      root.position.set(x, y, z);
      root.rotationQuaternion = Quaternion.RotationAxis(yawAxis, yaw).multiply(baseRot);
      // another writer holds the left leg for a while (S30), then hands it back
      const claimFrom = Math.floor(sc.frames * 0.35), claimTo = claimFrom + 18;
      if (frame === claimFrom) { const a = boneNode(sk, 'LeftFoot')!; a.computeWorldMatrix(true); impl.claimLeg(sk, 'Left', a.getAbsolutePosition()); }
      if (frame >= claimFrom && frame < claimTo) coverage.claimFrames++;
      if (frame === claimTo) impl.releaseLeg(sk, 'Left');
      if (sc.spin && sc.jump && frame >= sc.jump[0] && frame < sc.jump[1]) coverage.spinFrames++;
      if (frame % 97 >= 90) coverage.postureOffFrames++;

      scene.render();
      perturb?.(frame, sk);

      const row = new Float64Array(columns.length); let c = 0;
      for (const n of [root, ...nodes]) {
        const q = n.rotationQuaternion;
        row[c++] = n.position.x; row[c++] = n.position.y; row[c++] = n.position.z;
        row[c++] = q ? q.x : NaN; row[c++] = q ? q.y : NaN; row[c++] = q ? q.z : NaN; row[c++] = q ? q.w : NaN;
        const m = n.getWorldMatrix().m; for (let i = 0; i < 16; i++) row[c++] = m[i];
      }
      const L = posture.layer, d = plant.debug;
      row[c++] = L.aimRad; row[c++] = L.headYaw; row[c++] = L.headPitch; row[c++] = L.chestYaw; row[c++] = L.clipHipYaw; row[c++] = L.pose.weight; row[c++] = L.legs.weight;
      for (const s of [d.left, d.right]) { row[c++] = s.planted ? 1 : 0; row[c++] = s.pin.x; row[c++] = s.pin.y; row[c++] = s.pin.z; }
      row[c++] = misses[0]; row[c++] = misses[1];
      rows.push(row);
      coverage.postureOk = L.ok ? 1 : 0;
      if (Math.abs(L.aimRad) > 1e-4) coverage.aimFrames++;
      if (Math.abs(L.headYaw) > 1e-4 || Math.abs(L.headPitch) > 1e-4) coverage.eyesFrames++;
      if (L.clipHipYaw !== 0) coverage.hipStripFrames++;
      const pl = [d.left.planted, d.right.planted];
      if (pl[0] || pl[1]) coverage.plantedFrames++;
      for (let i = 0; i < 2; i++) { if (wasPlanted[i] && !pl[i]) coverage.releases++; }
      wasPlanted = pl;
    }
    coverage.reachSlerpFrames = reachSlerp;
    scene.onAfterAnimationsObservable.remove(armObs);
    posture.dispose(); plant.dispose();
    return { impl: impl.name, scenario: sc.name, columns, rows, coverage, missingClips };
  } finally {
    console.info = quietInfo;
    Math.random = realRandom;
    scene.dispose(); engine.dispose();
  }
}

export interface RigDifference { frame: number; column: string; a: number; b: number; count: number }
/** The first number that differs between two runs of one scenario (bit for bit by default: Object.is), with how many differ. */
export function firstDifference(a: RigTrace, b: RigTrace, tolerance = 0): RigDifference | null {
  if (a.columns.length !== b.columns.length || a.rows.length !== b.rows.length) return { frame: -1, column: 'shape', a: a.rows.length, b: b.rows.length, count: 1 };
  let first: RigDifference | null = null; let count = 0;
  for (let f = 0; f < a.rows.length; f++) {
    const ra = a.rows[f], rb = b.rows[f];
    for (let i = 0; i < ra.length; i++) {
      const same = tolerance > 0 ? (Object.is(ra[i], rb[i]) || Math.abs(ra[i] - rb[i]) <= tolerance) : Object.is(ra[i], rb[i]);
      if (!same) { count++; if (!first) first = { frame: f, column: a.columns[i], a: ra[i], b: rb[i], count: 0 }; }
    }
  }
  if (first) first.count = count;
  return first;
}

/** The largest absolute difference across two runs (diagnostics: how far apart, when they are). */
export function maxAbsDifference(a: RigTrace, b: RigTrace): number {
  let m = 0;
  for (let f = 0; f < Math.min(a.rows.length, b.rows.length); f++) for (let i = 0; i < a.rows[f].length; i++) { const d = Math.abs(a.rows[f][i] - b.rows[f][i]); if (d > m) m = d; }
  return m;
}
