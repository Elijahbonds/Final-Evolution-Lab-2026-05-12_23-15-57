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
import { rosterUrlFor, normalizeHeroUrl, DEFAULT_HERO_URL } from './athleteRoster';
import { urlForHeroBody, KIT_BODY_URL } from './heroBody';
import { installOpponentMotion, HERO_CAPTURE } from '../anim/opponentMotion';
import { installStyleMotion } from '../anim/styleMotion';
import { pickedVocab } from '../combat/styleVocab';
/** The modes a picked fighting style's moves play in (The Hundred + the versus fights). */
const STYLE_FIGHT_MODES: ReadonlySet<string> = new Set(['karate', 'karate_vs', 'mixedcombat', 'duel', 'showdown']);
import { applySkinShading } from './skinShading';
import { attachAccessories, lookFor, type AccessorySet } from './accessories';
import { applyKit } from './kit';
import { attachContactShadow } from '../visual/contactShadow';
import { applyHairStyle, DEFAULT_HAIR_STYLE, HAIR_KEY_TO_STYLE } from './hairStyles';
import { defaultFace } from '../../closet/wearable-catalog';
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
  /** Who this is, for the accessory deal: a rival's name gets their signature, anything else gets a look it keeps. */
  name?: string;
  /** An explicit accessory set (implies accessories on). */
  look?: AccessorySet;
  /** Opt IN to the accessory layer. Off by default until its rig-relative sizing lands — see the note at the call. */
  accessories?: boolean;
  accent?: string;          // M110 — override kit accent (procedural path)
  skinTone?: string;        // M110 — override skin tone (procedural path)
  hairColor?: string;       // M110 — override hair colour (procedural path)
  shoeColor?: string;       // M110 — override shoe colour (procedural path)
  scale?: number;           // 0.92–1.08 for mob variance
  startClip?: string;       // default 'idle_stand'
  modeId?: string;          // M42: tags [FEL-ANIM] MISSING CLIP warnings with the calling mode
  identity?: boolean;       // default true — set false when the CALLER applies identity (CharacterPipeline.spawnPlayer), or everything skins twice
  /** EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): who this body is. Omit and the library decides (see decideRole): a
   *  tinted spawn is an opponent; an untinted hero spawn is the PLAYER unless the scene already has a live, enabled
   *  player — then it is an opponent. Pass it only where that rule cannot see the intent (a preview that spawns the
   *  next body before disposing the last). */
  role?: 'player' | 'opponent';
}

// ── WHO IS THE PLAYER (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14) ───────────────────────────────────────────────────
// The owner saw two of himself in a dunk duel: P2 spawned untinted on the hero URL and got the hero's own file. The rule
// used to live in each mode (pass a tint or get a clone); it lives here now. Per scene, the live player bodies; a body
// that is disposed, or hidden (the carnival hides its hub host while an event spawns its own player), no longer counts.
const livePlayers = new WeakMap<Scene, Set<TransformNode>>();
const opponentSeq = new WeakMap<Scene, number>();
/** Count `root` as a live player body in `scene` until it is disposed or hidden. */
export function trackPlayerBody(scene: Scene, root: TransformNode): void {
  let set = livePlayers.get(scene); if (!set) { set = new Set(); livePlayers.set(scene, set); } set.add(root);
}
function hasLivePlayer(scene: Scene): boolean {
  const set = livePlayers.get(scene); if (!set) return false;
  for (const r of set) { if (r.isDisposed()) { set.delete(r); continue; } if (r.isEnabled()) return true; }
  return false;
}
export function decideRole(scene: Scene, heroRequest: boolean, opts: Pick<SpawnOpts, 'role' | 'tint'>): 'player' | 'opponent' {
  if (opts.role) return opts.role;
  if (opts.tint) return 'opponent';
  return heroRequest && hasLivePlayer(scene) ? 'opponent' : 'player';
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
  if (!m) {
    m = new Map(); containers.set(scene, m);
    // OOM-HYGIENE (2026-09-07): a container's meshes, geometry, textures and clips sit OUTSIDE the scene's arrays, so
    // scene.dispose() never frees them — they lived exactly as long as the Scene object, and anything that kept a
    // disposed scene reachable (a mode's last spawn, Babylon's floating-origin holder) kept the whole GLB with it.
    scene.onDisposeObservable.addOnce(() => { releaseContainers(m!); containers.delete(scene); });
  }
  return m;
}
function releaseContainers(m: Map<string, Promise<AssetContainer>>): void {
  for (const p of m.values()) void p.then((c) => { try { c.dispose(); } catch { /* a container from a lost context */ } }, () => undefined);
  m.clear();
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

/** Pass 4 phase 9 (2026-09-04): the mobile tier's hero file. Same nodes, skin, joints, weights, morphs and clips as
 *  fel-hero.glb — only the textures differ: skin at 1024², every other map (six hair styles, two jerseys, two shoes,
 *  shorts, eyes) at 512² (`scripts/avatar/import-mpfb.mts <in> <out> --textures-only`). Measured before this: the
 *  desktop file's fifteen maps were 96 MB of GPU memory in EVERY mode that spawns the untinted hero, on both tiers
 *  (the probe's old scene.textures basis could not see them); the mobile file is 24 MB. Only the DEFAULT hero is
 *  swapped — a dev override (?hero=) or an explicitly requested body always loads as asked, and the desktop tier's
 *  look is untouched. */
const MOBILE_HERO_URL = '/models/elijah-meshy.mobile.glb';   // Ship Pass 6: the scan's decimated bake (54k verts, 1K textures)
function tierOf(scene: Scene): QualityTier { return (scene.metadata?.felTier as QualityTier | undefined) ?? 'desktop'; }
function heroUrlForTier(url: string, scene: Scene): string { return url === DEFAULT_HERO_URL && tierOf(scene) === 'mobile' ? MOBILE_HERO_URL : url; }
/** The hero for this scene's tier, falling back to the requested file if the tier's variant will not load — a
 *  texture variant can never brick a spawn (the roster's rule). */
async function loadHero(scene: Scene, url: string): Promise<{ container: AssetContainer; url: string }> {
  const tiered = heroUrlForTier(url, scene);
  if (tiered !== url) {
    try { return { container: await loadContainer(scene, tiered), url: tiered }; }
    catch (e) { console.warn(`[FEL-CHAR] tier hero "${tiered}" unavailable, using "${url}": ${(e as Error)?.message ?? e}`); }
  }
  return { container: await loadContainer(scene, url), url };
}

export const CharacterLibrary = {
  /** Preload an asset (hero, enemy, defender…) into the cache. */
  async load(scene: Scene, url: string): Promise<void> {
    // M105: procedural path needs no GLB fetch — preloading is a no-op.
    if (PROCEDURAL_CHARACTERS) return;
    await loadHero(scene, normalizeHeroUrl(url));
  },

  /** Instantiate a character with its own animator + authored clips. */
  async spawn(scene: Scene, url: string, opts: SpawnOpts = {}): Promise<SpawnedCharacter> {
    url = normalizeHeroUrl(url);
    const heroRequest = url === DEFAULT_HERO_URL;
    const role = decideRole(scene, heroRequest, opts);
    // Ship pass 3 rollout flag: the dev harness and the Closet can point the DEFAULT hero at a candidate body.
    const override = (scene.metadata as { felHeroOverride?: string } | undefined)?.felHeroOverride;
    if (override && heroRequest && role === 'player') url = override;
    else if (heroRequest && role === 'player') {
      // THE PLAYER'S BODY: the scan for the owner's account, otherwise the kit body their creator chose (heroBody.ts).
      // The server decides; a guest or a failed request plays the male kit body — never the owner's scan.
      const id = await resolveIdentity().catch(() => null);
      url = urlForHeroBody(id?.body ?? 'kit-male');
    }
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
    // An untinted OPPONENT on the hero URL seeds the roster pick by its order in the scene, so a dunk duel's P2 and a
    // three-point field of rivals are distinct bodies — and none of them is the player's.
    let rosterSeed = opts.tint;
    if (!rosterSeed && role === 'opponent' && heroRequest) {
      const n = opponentSeq.get(scene) ?? 0; opponentSeq.set(scene, n + 1);
      rosterSeed = `opponent-${n}`;
    }
    const rosterUrl = role === 'opponent' ? rosterUrlFor(heroRequest ? DEFAULT_HERO_URL : url, rosterSeed) : null;
    let effectiveUrl = url;
    let rosterPicked = false;
    let container: AssetContainer;
    if (rosterUrl) {
      try {
        container = await loadContainer(scene, rosterUrl);
        effectiveUrl = rosterUrl;
        rosterPicked = true;
      } catch {
        // a roster file that will not load must not hand an opponent the player's body: the kit body, tinted below
        ({ container, url: effectiveUrl } = await loadHero(scene, heroRequest ? KIT_BODY_URL.male : url));
      }
    } else {
      ({ container, url: effectiveUrl } = await loadHero(scene, url));
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
    else if (!rosterPicked && role === 'opponent' && heroRequest) applyTint(meshes, '#8b1e2d');

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
    // AN OPPONENT MOVES LIKE A CAPTURED PERSON (EVERYONE-BODY-MOCAP-OPPONENTS): the mode's in-scope captures replace the
    // authored clips it asks for. The outermost play wrapper, so modes that re-call neverBindPose/installSafePlay are no-ops.
    if (role === 'opponent') installOpponentMotion(animator, scene, skeleton);
    // HOOPS MOVEMENT (owner 2026-09-15): the player plays the same hoops captures — one motion set for both bodies on a court
    else if (!heroCaptureOff()) installOpponentMotion(animator, scene, skeleton, undefined, HERO_CAPTURE);
    // THE STYLE'S OWN MOVES (2026-09-15, owner: capoeira / breaking, taekwondo / tricking, parkour): in a fight mode the
    // player's picked school brings its vocabulary; The Hundred and Free Run also get the parkour set. Outermost wrapper.
    if (role !== 'opponent') {
      const modeId = (scene.metadata as { felModeId?: string } | undefined)?.felModeId ?? opts.modeId ?? '';
      const fight = STYLE_FIGHT_MODES.has(modeId);
      const parkour = modeId === 'karate' || modeId === 'freerun';
      if (fight || parkour) installStyleMotion(animator, scene, skeleton, root, fight ? pickedVocab() : null, { parkour });
    }

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
    const tier = tierOf(scene);
    applySkinShading(meshes, scene, tier);
    // ACCESSORIES (appearance pass, 2026-09-16) — OPT-IN, and here is why.
    //
    // The wardrobe is two tops, one short and two shoes, so without something every character in the game is the same
    // person in a different colour. These hang on bones, follow the animation for free, and are dealt deterministically
    // so a named rival keeps his signature and a re-spawned NPC comes back wearing what it had on. That part works and
    // is tested.
    //
    // What does NOT work yet is how they LOOK on a body, measured on rc46 with five of them on court: the sizes and
    // offsets here were read off the kit body, and the anti-clone rule spawns NPCs on ROSTER bodies whose bones are
    // scaled differently — so a headband sits high and thick, and a chain floats off the chest entirely. And every
    // accessory rendered pale blue-white whatever accent it was dealt, which is a material being overridden somewhere
    // after this runs and is not yet found. Broken rings floating on every NPC in the game is worse than no rings, so
    // nothing gets them until a caller asks: pass `look`, or `accessories: true`.
    const wantsAccessories = opts.accessories !== false;
    const accDispose = wantsAccessories
      ? attachAccessories(scene, skeleton, root, opts.look ?? lookFor(opts.name ?? opts.tint ?? `char_${spawnCounter}`), `acc_${spawnCounter}`)
      : null;
    // ship pass 4: a kit body carries every garment; show one per slot even with no identity
    // (anonymous dev captures, guests, rivals) — the identity pipe re-applies the player's own choice below
    applyKit(meshes, null);
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

    if (role === 'player') trackPlayerBody(scene, root);
    const spawned: SpawnedCharacter = {
      id: `char_${spawnCounter}`,
      root, meshes, skeleton, animator, secondary,
      dispose() {
        livePlayers.get(scene)?.delete(root);
        accDispose?.();   // an accessory that outlives its body is a torus floating over the court
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
    if (!rosterPicked && role === 'player' && opts.tint == null && opts.skinTone == null && opts.identity !== false) {
      try {
        const id = await resolveIdentity();
        if (id.custom) applyIdentity(spawned, id);
        // A guest on the kit body wears the Closet's OWN default look, not the library's hair fallback ('Straight' → the
        // cap node, which read as a woman's bun on the male kit body in the first guest frames, 2026-09-14).
        else applyHairStyle(meshes, defaultFace().hairStyle);
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
    // LAST step: the rest pose above affects the measured bounds.
    // SHARED-PLACE-FLOOR (feet on floor): the floor is WHERE THE MODE PUT THE BODY, not y 0. This snapped to 0 for every
    // spawn, so a body placed on something raised was pulled down into it: the dancer spawned on the stage deck at 0.7
    // stood 0.69 m inside the podium (the PLACE eye measured it), the derby pitcher sank into his mound (0.35), and both
    // duelists stood in their 0.12 m disc. A court spawn passes y 0 and snaps exactly as before.
    snapToGround(root, meshes, opts.position?.y ?? 0);

    attachContactShadow(scene, root);   // Pass 7 phase 8: a soft disc grounds the feet where the shadow map does not reach
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
    // Name first (the material contract: skin / hair / eyes are never clothing),
    // colour heuristic second. A photographed skin is a WHITE albedo with the
    // colour in the texture, which the heuristic reads as "not flesh" — the
    // MPFB2 candidate's rival went red head to toe (measured 2026-09-04).
    const mname = String(m.name ?? '').toLowerCase();
    if (/^(skin|hair|eyes|iris|lips)/.test(mname)) continue;
    const isSkinTone = albedo.r > 0.45 && albedo.g > 0.25 && albedo.b > 0.15
      && albedo.r > albedo.b && albedo.g > albedo.b * 0.9;
    if (isSkinTone) continue;
    const cloned = m.clone(`${m.name}_tint`);
    if ((cloned as PBRMaterial).albedoColor) (cloned as PBRMaterial).albedoColor = tint;
    else (cloned as StandardMaterial).diffuseColor = tint;
    mesh.material = cloned;
  }
}

/** `?heroMocap=0` plays the hero's authored hoops clips instead of the captures — the A/B a movement probe measures against. */
function heroCaptureOff(): boolean {
  try { return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('heroMocap') === '0'; } catch { return false; }
}
