// crowdBake — the five crowd bodies, baked once into vertex-animation textures (w3-crowds, A9.9).
//
// `public/models/crowd/*.glb` are five Meshy spectators on the 22-joint FEL rig, unused until now. They share ONE texture
// set (byte-identical images — the five figures were cut from one sheet), and only the base colour carries anything: the
// emissive map is black and the normal map is flat. So: the first body loads with its material, keeps its base colour and
// drops the other three maps; the other four load with no materials at all and wear the first one's. One material, one
// 1024² texture (5 MB with mips), for the whole crowd.
//
// THE BAKE. For each body, each crowd clip (crowdClips.ts) is built on the live skeleton, sampled at CROWD_FPS by evaluating
// its animations directly (no scene.render(): Babylon's VertexAnimationBaker renders the whole scene once per frame) and
// the bone matrices of every row written into a float texture (crowdVat.layoutClips: each clip behind a pad row). The
// clip is then thrown away. A fan is a thin instance of the body's mesh; the shader reads its pose from that texture.
//
// THE LIVE SKELETON IS FOLDED AWAY after the bake (its hips scaled to zero). The main pass, the depth renderer, the outline
// and the effect layers all draw these meshes through the baked texture; Babylon's geometry-buffer renderer (the SSAO's
// G-buffer) does NOT know baked animation and skins with the live bones instead — a crowd frozen in its T-pose bind, darkening
// the stands with ambient occlusion from arms nobody can see. With the bones folded to a point that pass draws nothing.
//
// Cached per scene (`scene.metadata.felCrowdBake`): every crowd in a scene shares the bake, and it dies with the scene.

import { BakedVertexAnimationManager, Constants, LoadAssetContainerAsync, Matrix, RawTexture, Texture, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AnimationGroup, AssetContainer, Mesh, PBRMaterial, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { gateContainerRig } from '../../anim/rigNormalize';
import { buildCrowdClip } from './crowdClips';
import { CLOCK_T0, CROWD_CLIPS, CROWD_FPS, layoutClips, type ClipRange, type CrowdClipName } from './crowdVat';

/** The five bodies, in the order a seat's `body` index picks them. */
export const CROWD_BODY_URLS = ['scout', 'marlow', 'dodge', 'pike', 'bramble'].map((n) => `/models/crowd/${n}.glb`);

export interface CrowdBody {
  /** The skinned mesh (disabled): every block of fans is a clone of it, sharing its geometry. */
  mesh: Mesh;
  manager: BakedVertexAnimationManager;
  /** The mesh's world matrix as loaded (the glTF root's handedness flip included) and its inverse. */
  w0: Matrix;
  w0inv: Matrix;
}

export interface CrowdBake {
  bodies: CrowdBody[];
  material: PBRMaterial;
  ranges: Record<CrowdClipName, ClipRange>;
  rows: number;
  /** Set every body's VAT clock (seconds since the crowd started; CLOCK_T0 is added here). */
  setClock(t: number): void;
  dispose(): void;
}

interface Md { felCrowdBake?: Promise<CrowdBake | null> }

/** The scene's bake, built on first ask. Null when the device cannot (no float textures) or a body would not load. */
export function crowdBake(scene: Scene): Promise<CrowdBake | null> {
  const md = (scene.metadata ??= {}) as Md;
  if (!md.felCrowdBake) {
    md.felCrowdBake = buildBake(scene).catch((e) => { console.warn('[FEL-CROWD] bake failed', (e as Error)?.message ?? e); return null; });
    scene.onDisposeObservable.addOnce(() => { void md.felCrowdBake?.then((b) => b?.dispose()); delete md.felCrowdBake; });
  }
  return md.felCrowdBake;
}

/** A float texture is the bake's only hard requirement (WebGL2 always has it). */
export function canBake(scene: Scene): boolean {
  const caps = scene.getEngine().getCaps() as { textureFloat?: boolean };
  return !!caps.textureFloat;
}

async function buildBake(scene: Scene): Promise<CrowdBake | null> {
  if (!canBake(scene)) return null;
  const containers: AssetContainer[] = [];
  try {
    for (let i = 0; i < CROWD_BODY_URLS.length; i++) {
      const url = CROWD_BODY_URLS[i];
      // eslint-disable-next-line no-await-in-loop
      const c = await LoadAssetContainerAsync(url, scene, { pluginOptions: { gltf: { skipMaterials: i > 0 } } });
      gateContainerRig(c, url);
      containers.push(c);
      if (scene.isDisposed) throw new Error('scene disposed during the crowd load');
    }
  } catch (e) {
    for (const c of containers) c.dispose();
    throw e;
  }
  const { ranges, rows } = layoutClips();
  let material: PBRMaterial | null = null;
  const bodies: CrowdBody[] = [];
  for (const c of containers) {
    // one body a frame: the bake is a few thousand skeleton evaluations, spread so no single frame carries it
    // eslint-disable-next-line no-await-in-loop
    if (bodies.length) await new Promise<void>((r) => { const o = scene.onAfterRenderObservable.addOnce(() => r()); scene.onDisposeObservable.addOnce(() => { scene.onAfterRenderObservable.remove(o); r(); }); });
    if (scene.isDisposed) break;
    c.addAllToScene();
    const mesh = c.meshes.find((m) => !!m.skeleton) as Mesh | undefined;
    const sk = c.skeletons[0];
    if (!mesh || !sk) continue;
    if (!material) material = adoptMaterial(mesh.material as PBRMaterial | null);
    const data = bakeBody(scene, sk, mesh, ranges, rows);
    const tex = RawTexture.CreateRGBATexture(data, (sk.bones.length + 1) * 4, rows, scene, false, false, Texture.NEAREST_NEAREST, Constants.TEXTURETYPE_FLOAT);
    tex.name = `crowd_vat_${bodies.length}`;
    const manager = new BakedVertexAnimationManager(scene);
    manager.texture = tex;
    manager.time = CLOCK_T0;
    mesh.bakedVertexAnimationManager = manager;
    foldSkeleton(sk);
    const w0 = mesh.computeWorldMatrix(true).clone();
    mesh.setEnabled(false);
    mesh.isPickable = false;
    bodies.push({ mesh, manager, w0, w0inv: w0.clone().invert() });
  }
  if (!material || bodies.length === 0) {
    for (const c of containers) c.dispose();
    return null;
  }
  for (const b of bodies) b.mesh.material = material;
  // the four material-less bodies came in with no material, the first one's other maps are gone: nothing else to drop
  return {
    bodies, material, ranges, rows,
    setClock(t: number) { for (const b of bodies) b.manager.time = CLOCK_T0 + t; },
    dispose() {
      for (const b of bodies) { b.manager.texture?.dispose(); b.manager.dispose(); }
      material?.dispose(true, true);
      for (const c of containers) c.dispose();
    },
  };
}

/** The shared look: the base colour only (the emissive map is black, the normal map flat, the metal-rough map unused). */
function adoptMaterial(mat: PBRMaterial | null): PBRMaterial | null {
  if (!mat) return null;
  mat.name = 'crowd_body_mat';
  for (const k of ['emissiveTexture', 'bumpTexture', 'metallicTexture'] as const) {
    const t = (mat as unknown as Record<string, Texture | null>)[k];
    if (t) { t.dispose(); (mat as unknown as Record<string, Texture | null>)[k] = null; }
  }
  mat.emissiveColor.set(0, 0, 0);
  mat.metallic = 0;
  mat.roughness = 0.85;
  return mat;
}

/** Sample every crowd clip on this skeleton into a (bones + 1) × 16 floats-per-row buffer. */
export function bakeBody(scene: Scene, sk: Skeleton, mesh: AbstractMesh, ranges: Record<CrowdClipName, ClipRange>, rows: number): Float32Array {
  const stride = (sk.bones.length + 1) * 16;
  const data = new Float32Array(stride * rows);
  const nodes = sk.bones.map((b) => b.getTransformNode()).filter((n): n is TransformNode => !!n);
  const bind = nodes.map((n) => ({ n, p: n.position.clone(), q: n.rotationQuaternion?.clone() ?? null, r: n.rotation.clone() }));
  const restore = (): void => { for (const b of bind) { b.n.position.copyFrom(b.p); if (b.q) b.n.rotationQuaternion = b.q.clone(); else b.n.rotation.copyFrom(b.r); } };
  for (const spec of CROWD_CLIPS) {
    const r = ranges[spec.name];
    restore();
    const group = buildCrowdClip(scene, sk, spec.name, spec.seconds);
    for (let i = 0; i < r.frames; i++) {
      if (group) poseAt(group, i / CROWD_FPS);
      const m = sk.getTransformMatrices(markDirty(sk, mesh));
      data.set(m.subarray(0, stride), (r.start + 1 + i) * stride);
      if (i === 0) data.set(m.subarray(0, stride), r.start * stride);   // the pad row: a copy of the first pose
    }
    group?.dispose();
  }
  restore();
  return data;
}

/** Write a clip's pose at `t` seconds onto its targets, the way the animation would at that frame. */
function poseAt(group: AnimationGroup, t: number): void {
  for (const ta of group.targetedAnimations) {
    const a = ta.animation;
    const v = a.evaluate(t * a.framePerSecond);
    const target = ta.target as Record<string, unknown>;
    target[a.targetProperty] = (v as { clone?: () => unknown })?.clone ? (v as { clone: () => unknown }).clone() : v;
  }
}

function markDirty(sk: Skeleton, mesh: AbstractMesh): AbstractMesh {
  // prepare(true) copies each linked node's TRS onto its bone and recomputes the matrices now (not at the next render)
  (sk as unknown as { _markAsDirty(): void })._markAsDirty();
  sk.prepare(true);
  return mesh;
}

/** After the bake: the live bones collapse to a point, so a pass that skins with them (the SSAO's G-buffer) draws nothing. */
function foldSkeleton(sk: Skeleton): void {
  const hips = sk.bones.find((b) => b.name === 'Hips')?.getTransformNode();
  if (hips) hips.scaling = new Vector3(0, 0, 0);
  (sk as unknown as { _markAsDirty(): void })._markAsDirty();
}
