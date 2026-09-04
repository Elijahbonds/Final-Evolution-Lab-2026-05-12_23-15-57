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
import { resolveIdentity, applyIdentity } from './playerIdentity';
import { SkinningGuard } from '../anim/SkinningGuard';
import { gateContainerRig } from '../anim/rigNormalize';
import { solveArmsDown } from '../anim/restPose';           // M69: E25 finish
import { applyRestPoseToSkeleton } from '../anim/restPoseApply';
import { snapToGround } from './groundSnap';                // M69: feet-on-court
import { PROCEDURAL_CHARACTERS } from '../characters/CharacterProvider';
import { spawnProceduralAthlete } from '../characters/ProceduralAthlete';
import { rosterUrlFor, normalizeHeroUrl } from './athleteRoster';
import { applySkinShading } from './skinShading';
import { applyHairStyle, DEFAULT_HAIR_STYLE, HAIR_KEY_TO_STYLE } from './hairStyles';
import { mountSecondaryMotion, type SecondaryMotionHandle } from '../anim/SecondaryMotion';
import { mountFootPlanting } from '../anim/FootPlanting';
import type { QualityTier } from '../scene/QualityTier';

// M28 dance: make dance clip ids resolvable and pre-build mirrored variants once.
Object.assign(CLIP_ALIASES, DANCE_ALIASES);

export interface SpawnedCharacter {
  id: string;
  root: TransformNode;
  meshes: AbstractMesh[];
  skeleton: Skeleton;
  animator: CharacterAnimator;
  /** Phase 2 "alive" layer (breathing, weight shift, head look-at). GLB path
   *  only; modes call `secondary?.setLookTarget(() => ball.position)`. */
  secondary?: SecondaryMotionHandle;
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
  identity?: boolean;       // default true — set false when the CALLER applies identity (CharacterPipeline.spawnPlayer), or everything skins twice
}

// M30 fix: instantiateModelsToScene's rename suffixes AnimationGroup names too
// (guard -> guard_c58), which broke EVERY alias lookup in EVERY mode. We strip
// this suffix off the groups post-instantiation so aliases resolve again.
const SUFFIX = /_c\d+$/;
// Keyed by SCENE, then URL. An AssetContainer belongs to the scene that loaded
// it; a cache keyed by URL alone handed a container from a DISPOSED scene to
// the next one — the shipping hosts mount twice under React's dev double-mount
// and any player who leaves a mode and comes back does the same — and the
// second spawn died on a disposed root ("Cannot read properties of undefined
// (reading 'getChildMeshes')", threepoint on /play, retried five times) or
// produced a rig whose bones never moved (the "char_120" skinning stall).
// A WeakMap lets a disposed scene's containers go with it.
const containers = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();
function containersFor(scene: Scene): Map<string, Promise<AssetContainer>> {
  let m = containers.get(scene);
  if (!m) { m = new Map(); containers.set(scene, m); }
  return m;
}
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
  const cache = containersFor(scene);
  let p = cache.get(url);
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
        cache.delete(url);                               // allow retry after a failure
        throw new Error(`[FEL-CHAR] failed to load "${url}": ${e?.message ?? e}`);
      });
    cache.set(url, p);
  }
  return p;
}

export const CharacterLibrary = {
  /** Preload an asset (hero, enemy, defender…) into the cache. */
  async load(scene: Scene, url: string): Promise<void> {
    // M105: procedural path needs no GLB fetch — preloading is a no-op.
    if (PROCEDURAL_CHARACTERS) return;
    await loadContainer(scene, normalizeHeroUrl(url));
  },

  /** Instantiate a character with its own animator + authored clips. */
  async spawn(scene: Scene, url: string, opts: SpawnOpts = {}): Promise<SpawnedCharacter> {
    url = normalizeHeroUrl(url);
    // Ship pass 3 rollout flag: the dev harness and the Closet can point the DEFAULT hero at a candidate body.
    const override = (scene.metadata as { felHeroOverride?: string } | undefined)?.felHeroOverride;
    if (override && url === '/models/fel-hero.glb') url = override;
    // M105 (Path A): the Meshy hero GLB is visually broken. When
    // PROCEDURAL_CHARACTERS is on, bypass the GLB entirely and spawn a clean,
    // assetless, cel-shaded procedural athlete satisfying the same contract.
    if (PROCEDURAL_CHARACTERS) {
      const spawned = await spawnProceduralAthlete(scene, opts);
      // THE SAVED LOOK, ONE PIPE: a spawn that chose NO colors of its own
      // wears the player's Closet identity (proportions + skin + wardrobe) —
      // the same applyIdentity CharacterPipeline.spawnPlayer uses, now at the
      // layer every mode actually calls. Explicit tint/skinTone always wins
      // (rivals and NPCs keep their authored look). Identity applies only
      // when a logged-in player's closet answered (custom) — guests and dev
      // drivers get the unchanged default. Measured gap this closes: the
      // Closet saved, the rig accepted, and bare-spawned heroes played
      // anonymous.
      if (opts.tint == null && opts.skinTone == null && opts.identity !== false) {
        try {
          const id = await resolveIdentity();
          if (id.custom) applyIdentity(spawned, id);
        } catch (e) { console.error('[FEL-IDENTITY] hero identity failed', e); }
      }
      return spawned;
    }
    // ROSTER (anti-clone): a tinted spawn on the shared hero URL is a
    // rival/NPC by convention in every mode — give it a distinct baked body
    // from the athlete roster. Kit color is baked into the roster GLB, so the
    // runtime tint is skipped when a swap happens. Any roster load failure
    // falls back to the requested URL; the roster can never brick a spawn.
    const rosterUrl = rosterUrlFor(url, opts.tint);
    let effectiveUrl = url;
    let rosterPicked = false;
    let container: AssetContainer;
    if (rosterUrl) {
      try {
        container = await loadContainer(scene, rosterUrl);
        effectiveUrl = rosterUrl;
        rosterPicked = true;
      } catch {
        container = await loadContainer(scene, url);
      }
    } else {
      container = await loadContainer(scene, url);
    }
    const inst = container.instantiateModelsToScene(
      (n) => `${n}_c${++spawnCounter}`, false, { doNotInstantiate: true },
    );
    const root = inst.rootNodes[0] as TransformNode;
    const skeleton = inst.skeletons[0];
    const meshes = root.getChildMeshes();

    if (!skeleton) throw new Error(`[FEL-CHAR] no skeleton in ${effectiveUrl}`);

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

    if (opts.tint && !rosterPicked) applyTint(meshes, opts.tint);

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
    installSafePlay(animator, opts.modeId ?? effectiveUrl);

    // M69 (E25 complete): write a measured arms-down pose onto the SKELETON so
    // it is the resting state for EVERY character in EVERY state — not only the
    // one playing idle_stand. Clips that key the arms still override it. Must
    // run BEFORE the first clip starts so there is no one-frame bind-pose flash.
    const restPose = solveArmsDown(skeleton);
    applyRestPoseToSkeleton(skeleton, restPose);

    // ── Phase 2 (ship pass, 2026-09-02): the material set and the two
    // motion layers that make the forge hero read as a person. All three key
    // on the LOCKED bone/material names; all three are no-ops on a rig that
    // lacks them, and mobile gets the cheaper variants.
    const tier: QualityTier = (scene.metadata?.felTier as QualityTier | undefined) ?? 'desktop';
    applySkinShading(meshes, scene, tier);
    // Phase 3: the forge ships every hair style; show the default, hide the
    // rest. The identity pipe re-applies the player's own choice below.
    // The loader's root is a synthetic __root__; the forge's Armature (which
    // carries the roster's baked extras) is a descendant — search for it.
    const bakedHair = [root, ...root.getChildTransformNodes(false)]
      .map((n) => n.metadata?.gltf?.extras?.hairStyle as string | undefined)
      .find((v) => typeof v === 'string');
    applyHairStyle(meshes, bakedHair ? HAIR_KEY_TO_STYLE[bakedHair] ?? DEFAULT_HAIR_STYLE : DEFAULT_HAIR_STYLE);
    const skinned = meshes.find((m) => m.skeleton === skeleton) ?? meshes[0];
    const secondary = mountSecondaryMotion(scene, skeleton, { intensity: tier === 'mobile' ? 0.6 : 1 });
    // Foot planting (2026-09-03): node-space two-bone solver (TwoBoneIK.ts).
    // Babylon's BoneIKController was measured leaving non-uniform SCALE on this
    // rig's thigh and shin (0.94/0.85/0.91) and the body flew apart; the solver
    // writes rotationQuaternions only. Lighter on mobile, like secondary motion.
    const planting = skinned
      ? mountFootPlanting(scene, skinned, skeleton, { root, intensity: tier === 'mobile' ? 0.6 : 1 })
      : null;

    const spawned: SpawnedCharacter = {
      id: `char_${spawnCounter}`,
      root, meshes, skeleton, animator, secondary,
      dispose() {
        planting?.dispose();
        secondary.dispose();
        animator.dispose();
        inst.dispose();
      },
    };

    // THE SAVED LOOK, GLB PATH: same one identity pipe as the procedural
    // branch above. The forged hero (scripts/avatar/forge.mts) names its
    // materials skin/jersey/shorts/shoes/hair precisely so applyIdentity's
    // name-matched slots find them. Roster athletes carry their own baked
    // colorway and are never over-painted.
    if (!rosterPicked && opts.tint == null && opts.skinTone == null && opts.identity !== false) {
      try {
        const id = await resolveIdentity();
        if (id.custom) applyIdentity(spawned, id);
      } catch (e) { console.error('[FEL-IDENTITY] GLB hero identity failed', e); }
    }

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

    return spawned;
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