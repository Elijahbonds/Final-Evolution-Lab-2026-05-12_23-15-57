// CharacterLibrary — the ONLY way modes create humanoids. Baked-clip GLBs,
// cached containers, per-spawn animator + tint/scale variance (mob variety).

import '@babylonjs/loaders/glTF';                       // REQUIRED for .glb — without it .glb loads fail
import {
  Color3, PBRMaterial, SceneLoader, StandardMaterial, Vector3,
} from '@babylonjs/core';
import type {
  AbstractMesh, AssetContainer, Scene, Skeleton, TransformNode,
} from '@babylonjs/core';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { sanitizeImportedGroups, neverBindPose } from '../anim/importSanitizer';
import { registerAuthoredClips } from '../anim/authored';
import { CLIP_ALIASES } from '../anim/clipAliases';
import { registerMirroredClips, DANCE_ALIASES, DANCE_MIRROR_BASES } from '../anim/mirrored-clips';
import { installSafePlay } from '../anim/clipRegistry';
import { SkinningGuard } from '../anim/SkinningGuard';
import { gateContainerRig } from '../anim/rigNormalize';
import { solveArmsDown } from '../anim/restPose';           // M69: E25 finish
import { applyRestPoseToSkeleton } from '../anim/restPoseApply';
import { snapToGround } from './groundSnap';                // M69: feet-on-court
import { PROCEDURAL_CHARACTERS } from '../characters/CharacterProvider';
import { spawnProceduralAthlete } from '../characters/ProceduralAthlete';

// M28 dance: make dance clip ids resolvable and pre-build mirrored variants once.
Object.assign(CLIP_ALIASES, DANCE_ALIASES);

export interface SpawnedCharacter {
  id: string;
  root: TransformNode;
  meshes: AbstractMesh[];
  skeleton: Skeleton;
  animator: CharacterAnimator;
  dispose(): void;
}

export interface SpawnOpts {
  position?: Vector3;
  yawRad?: number;
  tint?: string;            // hex — mob/team variety
  accent?: string;          // M110 — override kit accent (procedural path)
  skinTone?: string;        // M110 — override skin tone (procedural path)
  hairColor?: string;       // M110 — override hair colour (procedural path)
  shoeColor?: string;       // M110 — override shoe colour (procedural path)
  scale?: number;           // 0.92–1.08 for mob variance
  startClip?: string;       // default 'idle_stand'
  modeId?: string;          // M42: tags [FEL-ANIM] MISSING CLIP warnings with the calling mode
}

// M30 fix: instantiateModelsToScene's rename suffixes AnimationGroup names too
// (guard -> guard_c58), which broke EVERY alias lookup in EVERY mode. We strip
// this suffix off the groups post-instantiation so aliases resolve again.
const SUFFIX = /_c\d+$/;
const containers = new Map<string, Promise<AssetContainer>>();
let spawnCounter = 0;

/** '/models/elijah-hero.glb' → { rootUrl: '/models/', filename: 'elijah-hero.glb' }.
 *  Babylon rejects a leading-slash filename with an empty rootUrl
 *  ("BJS - Wrong sceneFilename parameter") — the live dunk crash. Split it. */
function splitUrl(url: string): { rootUrl: string; filename: string } {
  const i = url.lastIndexOf('/');
  if (i < 0) return { rootUrl: './', filename: url };
  return { rootUrl: url.slice(0, i + 1), filename: url.slice(i + 1) };
}

async function loadContainer(scene: Scene, url: string): Promise<AssetContainer> {
  let p = containers.get(url);
  if (!p) {
    const { rootUrl, filename } = splitUrl(url);
    p = SceneLoader.LoadAssetContainerAsync(rootUrl, filename, scene)
      .then((container) => {
        // GATE 0: normalize mixamorig-prefixed bones + reject non-conformant
        // rigs AT LOAD, before any spawn can freeze at bind pose. Runs once
        // per cached container; unprefixed rigs pass through untouched.
        gateContainerRig(container, url);
        return container;
      })
      .catch((e) => {
        containers.delete(url);                          // allow retry after a failure
        throw new Error(`[FEL-CHAR] failed to load "${url}": ${e?.message ?? e}`);
      });
    containers.set(url, p);
  }
  return p;
}

export const CharacterLibrary = {
  /** Preload an asset (hero, enemy, defender…) into the cache. */
  async load(scene: Scene, url: string): Promise<void> {
    // M105: procedural path needs no GLB fetch — preloading is a no-op.
    if (PROCEDURAL_CHARACTERS) return;
    await loadContainer(scene, url);
  },

  /** Instantiate a character with its own animator + authored clips. */
  async spawn(scene: Scene, url: string, opts: SpawnOpts = {}): Promise<SpawnedCharacter> {
    // M105 (Path A): the Meshy hero GLB is visually broken. When
    // PROCEDURAL_CHARACTERS is on, bypass the GLB entirely and spawn a clean,
    // assetless, cel-shaded procedural athlete satisfying the same contract.
    if (PROCEDURAL_CHARACTERS) return spawnProceduralAthlete(scene, opts);
    const container = await loadContainer(scene, url);
    const inst = container.instantiateModelsToScene(
      (n) => `${n}_c${++spawnCounter}`, false, { doNotInstantiate: true },
    );
    const root = inst.rootNodes[0] as TransformNode;
    const skeleton = inst.skeletons[0];
    const meshes = root.getChildMeshes();

    if (!skeleton) throw new Error(`[FEL-CHAR] no skeleton in ${url}`);

    // ── THE M30 FIX: restore original clip names on this spawn's animation
    // groups. 'guard_c58' -> 'guard' so aliases (run_forward->run, jab, hook…)
    // resolve again. Groups are per-instance objects; renaming is spawn-local
    // and cannot cross-target another spawn's groups.
    for (const g of inst.animationGroups) {
      const original = g.name.replace(SUFFIX, '');
      if (original !== g.name) g.name = original;
    }

    // ── M35 FIX (in-the-ground): imported GLB clips key Hips.position in their
    // own space (below our floor). Strip position tracks from imported groups so
    // they play rotation-only; our authored clips keep their tuned hip bobs.
    sanitizeImportedGroups(inst.animationGroups);

    root.position = opts.position ?? Vector3.Zero();
    root.rotation = new Vector3(0, opts.yawRad ?? 0, 0);
    root.scaling.setAll(opts.scale ?? 1);

    if (opts.tint) applyTint(meshes, opts.tint);

    const animator = new CharacterAnimator(scene, inst.animationGroups);
    registerAuthoredClips(animator, scene, skeleton);
    // M28 dance: build '<base>.M' mirrored groups so mirrored dance steps have a
    // real reflected clip (never a T-pose) — see mirrored-clips.ts.
    registerMirroredClips(animator, scene, skeleton, DANCE_MIRROR_BASES);
    // ── M35 FIX (T-pose returns): a finished non-loop group drops to bind pose.
    // Every non-loop play now falls through to this character's base loop.
    const baseLoop = opts.startClip ?? 'idle_stand';
    neverBindPose(animator, baseLoop);
    // M42: cooperative safe-play guard — logs loudly + avoids bind pose if a
    // truly-unknown clip name is ever requested (delegates to resolver-backed
    // play so the CLIP_ALIASES table still works for known sport names).
    installSafePlay(animator, opts.modeId ?? url);

    // M69 (E25 complete): write a measured arms-down pose onto the SKELETON so
    // it is the resting state for EVERY character in EVERY state — not only the
    // one playing idle_stand. Clips that key the arms still override it. Must
    // run BEFORE the first clip starts so there is no one-frame bind-pose flash.
    const restPose = solveArmsDown(skeleton);
    applyRestPoseToSkeleton(skeleton, restPose);

    animator.play(baseLoop, { loop: true });

    // M51/M68/M69: verify skinning — v3 also takes the playhead frame so a KO'd
    // or held-pose character (playhead parked) is not mistaken for a stall.
    SkinningGuard.verify(
      scene, `char_${spawnCounter}`, meshes, skeleton,
      () => animator.isPlaying,
      () => animator.currentFrame,
    );

    // M69: sit the character ON the court — measure its true world-space lowest
    // point (skeleton-applied bounds) and lift the root by the difference.
    // LAST step: the rest pose above affects the measured bounds. courtY = 0.
    snapToGround(root, meshes, 0);

    return {
      id: `char_${spawnCounter}`,
      root, meshes, skeleton, animator,
      dispose() {
        animator.dispose();
        inst.dispose();
      },
    };
  },
};

/** Clothing-only tint: skips skin-toned materials so faces stay natural. */
function applyTint(meshes: AbstractMesh[], hex: string): void {
  const tint = Color3.FromHexString(hex);
  for (const mesh of meshes) {
    const m = mesh.material as any;
    if (!m) continue;
    const albedo = (m as PBRMaterial).albedoColor ?? (m as StandardMaterial).diffuseColor;
    if (!albedo) continue;
    const isSkinTone = albedo.r > 0.45 && albedo.g > 0.25 && albedo.b > 0.15
      && albedo.r > albedo.b && albedo.g > albedo.b * 0.9;
    if (isSkinTone) continue;
    const cloned = m.clone(`${m.name}_tint`);
    if ((cloned as PBRMaterial).albedoColor) (cloned as PBRMaterial).albedoColor = tint;
    else (cloned as StandardMaterial).diffuseColor = tint;
    mesh.material = cloned;
  }
}