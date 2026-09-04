// playerIdentity — the ONE identity pipe, extracted from characterPipeline so the
// shared spawn layer (CharacterLibrary) can apply it without a runtime import
// cycle. Modes spawning a BARE hero (no tint/skinTone chosen) get the player's
// saved look applied automatically; explicit colors always win (rivals/NPCs).

import { applyHairStyle } from './hairStyles';
import { applyKit, type Wardrobe } from './kit';
import { reportDiag } from './diag';
import { applyFaceMorphs, resolveFaceWeights } from './faceMorphs';
import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import { SKIN_DETAIL_NORMAL, SKIN_LIBRARY, type SkinEntry } from './skinLibrary';
import type { Material } from '@babylonjs/core';

type TintMat = Material & { albedoColor?: Color3; diffuseColor?: Color3; bumpTexture?: { dispose(): void } | null };

/** Clone a material for tinting while SHARING its bump map. Material.clone
 *  deep-clones textures, and DynamicTexture.clone() is a blank canvas that
 *  nobody ever draws into: the copy never becomes ready, so the material never
 *  compiles and the mesh vanishes. That was the Closet's "exploded" body — the
 *  skin (the only mesh whose material carries the procedural pore map) simply
 *  never rendered. Every logged-in hero in every mode took the same path. */
export function cloneForTint(m: TintMat, name: string): TintMat | null {
  const clone = m.clone(name) as TintMat | null;
  if (clone && m.bumpTexture) {
    clone.bumpTexture?.dispose();
    clone.bumpTexture = m.bumpTexture;
  }
  return clone;
}
import type { SpawnedCharacter } from './CharacterLibrary';
import type { AvatarSpec } from '../../workout/avatar-builder';
import { boneNode } from '../anim/boneLookup';
import {
  defaultFace, defaultJersey, sanitizeJersey, getWearable,
  type FaceConfig, type WearableSlot, type JerseyConfig,
} from '../../closet/wearable-catalog';

export interface PlayerIdentity {
  proportions: AvatarSpec | null;                 // null until a body scan exists
  face: FaceConfig;
  /** jersey/shorts/shoes/accent hex derived from equipped wearables + card skin. */
  palette: { jersey: string; shorts: string; shoes: string; accent: string };
  /** Number + name plate for the hero's back. null until the player sets one. */
  jersey: JerseyConfig | null;
  /** Equipped wearable ids per kit slot — the fitted garment library (kit.ts) shows these. */
  wardrobe: Wardrobe;
  /** True when a logged-in player's closet answered — guests/dev get defaults
   *  visually UNCHANGED (identity only applies when this is true). */
  custom: boolean;
}

const FALLBACK_PALETTE = { jersey: '#00E5FF', shorts: '#0b1220', shoes: '#A855F7', accent: '#FFD700' };

let cached: PlayerIdentity | null = null;

/** Fetch + merge the user's identity once per session. Fail soft to defaults. */
export async function resolveIdentity(force = false): Promise<PlayerIdentity> {
  if (cached && !force) return cached;
  const [closet, scan] = await Promise.all([
    fetch('/api/v1/closet').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/v1/workout/scan').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const face: FaceConfig = { ...defaultFace(), ...(closet?.look?.face ?? {}) };
  const equipped: Partial<Record<WearableSlot, string | null>> = closet?.look?.equipped ?? {};
  const cardAccent: string | undefined = closet?.skins?.find(
    (s: { id: string; accent?: string }) => s.id === closet?.look?.skinCardId,
  )?.accent;

  const accentOf = (slot: WearableSlot, fallback: string): string => {
    const id = equipped[slot];
    return (id && getWearable(id)?.accent) || fallback;
  };
  const palette = {
    jersey: accentOf('tops', FALLBACK_PALETTE.jersey),
    shorts: accentOf('shorts', FALLBACK_PALETTE.shorts),
    shoes: accentOf('shoes', FALLBACK_PALETTE.shoes),
    accent: cardAccent || accentOf('accessory', FALLBACK_PALETTE.accent),
  };

  const proportions: AvatarSpec | null = scan?.scans?.[0]?.avatarSpec ?? null;
  const jerseyRaw = closet?.look?.jersey;
  const jersey = jerseyRaw ? sanitizeJersey(jerseyRaw) : null;

  const wardrobe: Wardrobe = { tops: equipped.tops ?? null, shorts: equipped.shorts ?? null, shoes: equipped.shoes ?? null };
  cached = { proportions, face, palette, jersey, wardrobe, custom: Boolean(closet?.look) };
  return cached;
}

/** Call on Closet save / new scan so the next spawn picks up changes. */
export function invalidateIdentity(): void { cached = null; }

// ── Application layers ──────────────────────────────────────────────────

const TORSO_BONES = ['Spine', 'Spine1', 'Spine2', 'Chest'];
const ARM_BONES = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];

export function applyIdentity(
  spawn: SpawnedCharacter,
  id: PlayerIdentity,
  /** 'full' = proportions + skin + wardrobe. 'body' = proportions + skin
   *  only — used when the caller authored the KIT (a team-tinted hero keeps
   *  team colors but still wears the player's skin and build). */
  parts: 'full' | 'body' = 'full',
): void {
  // 1) Proportions (scan AvatarSpec) — height on root, build on torso, reach on arms.
  if (id.proportions) {
    const p = id.proportions;
    spawn.root.scaling.scaleInPlace(p.heightScale || 1);
    scaleBones(spawn, TORSO_BONES, p.buildScale || 1);
    scaleBones(spawn, ARM_BONES, p.reachScale || 1);
  }
  // 2) Face — skin tone on skin materials (the model has no blendshapes today;
  //    the flat FaceConfig preset variety is handled by the Closet preview rig).
  applySkinTone(spawn, id.face.skinTone);
  applyHair(spawn, id.face.hairColor, id.face.hairStyle === 'Bald');
  applyHairStyle(spawn.meshes, id.face.hairStyle);   // Phase 3: real hair geometry per style
  applyKit(spawn.meshes, id.wardrobe);              // ship pass 3: fitted garments per equipped wearable (no-op without a kit)
  // Phase 3 (2026-09-02): the forge now has a face. Shape presets and the
  // fine-tune sliders resolve through one table; eye color lands on the
  // iris material. No-ops on a body without morphs or an iris.
  applyFaceMorphs(spawn.meshes, resolveFaceWeights({ faceShape: id.face.faceShape, brows: id.face.brows, sliders: id.face.sliders as never }));
  tintSlot(spawn, ['iris'], id.face.eyeColor);
  watchReadiness(spawn);
  if (parts === 'body') return;
  // 3) Wardrobe palette — jersey/shorts/shoes tints by mesh/material slot name.
  tintSlot(spawn, ['jersey', 'top', 'shirt', 'tee'], id.palette.jersey);
  tintSlot(spawn, ['shorts', 'pants', 'bottom'], id.palette.shorts);
  tintSlot(spawn, ['shoe', 'sneaker', 'boot'], id.palette.shoes);
  // 4) Jersey ID plate on the back — applied for 'body' too: a team-tinted
  //    hero still wears the player's own number.
  if (id.jersey && (id.jersey.name || id.jersey.number > 0)) attachJerseyPlate(spawn, id.jersey, id.palette.accent);
}

/** Ship watchdog. A material that never compiles renders NOTHING and throws
 *  nothing — the Closet's skin vanished that way for a whole pass. Three
 *  seconds after identity lands, name every visible mesh whose material is
 *  still not ready; the gauntlet's logged-in captures count that line as an
 *  error (`[FEL-IDENT]`, scripts/capture-mode-play.mts). */
function watchReadiness(spawn: SpawnedCharacter): void {
  const scene = spawn.root.getScene();
  // "Ready" means COMPILABLE, not "already drawn". A material compiles when its
  // mesh is first rendered, so a rig held behind a shell's countdown, or shoes
  // culled below the frame, read as "never ready" on a clock (bigair,
  // gymnastics, derby, penalty on /play, 2026-09-03) while the dev harness,
  // which draws at once, was clean. Sixty rendered frames after identity, any
  // material still not ready is asked to compile; only a FAILED compile is the
  // fault this watchdog exists for (the Closet's blank pore-map clone).
  let frames = 0;
  const obs = scene.onAfterRenderObservable.add(() => {
    if (++frames < 60) return;
    scene.onAfterRenderObservable.remove(obs);
    if (scene.isDisposed) return;
    const pending = spawn.meshes.filter((m) => !m.isDisposed() && m.isEnabled() && m.isVisible && m.material && !m.material.isReady(m, true));
    void Promise.all(pending.map(async (m) => {
      try { await m.material!.forceCompilationAsync(m); return null; }
      catch (e) { return `${m.name}/${m.material!.name}: ${String((e as Error)?.message ?? e).slice(0, 80)}`; }
    })).then((results) => {
      const bad = results.filter((r): r is string => !!r);
      if (bad.length) { reportDiag('ident', `material never ready: ${bad.join(', ')}`); console.error(`[FEL-IDENT] material never ready: ${bad.join(', ')}`); }
      else console.info(`[FEL-IDENT] ready: ${spawn.meshes.filter((m) => m.isVisible && m.isEnabled()).length} visible meshes${pending.length ? ` (${pending.length} compiled on demand)` : ''}`);
    });
  });
}

/** Number + name plate, parented to the Spine2 bone so it rides every
 *  animation. The procedural athlete faces +z (toes at +z), so the plate
 *  hangs off the back at −z, just proud of the chest-volume blob. */
function attachJerseyPlate(spawn: SpawnedCharacter, jersey: JerseyConfig, accent: string): void {
  const node = boneNode(spawn.skeleton, 'Spine2');
  if (!node) return;
  // idempotent — a second application replaces the plate, never stacks it
  for (const m of spawn.meshes.filter((x) => x.name.startsWith('jersey_decal_'))) m.dispose();
  const scene = spawn.root.getScene();
  const W = 256, H = 232;
  const tex = new DynamicTexture(`jersey_decal_tex_${spawn.id}`, { width: W, height: H }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, W, H);
  // Measured 2026-05-13 (3.2× live-scaled plate): this rig's outward plane face
  // samples the texture unmirrored — draw normally. (The earlier "mirrored"
  // reading was the π-rotated plate showing its back face.)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (jersey.name) {
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeText(jersey.name, W / 2, 40);
    ctx.fillText(jersey.name, W / 2, 40);
  }
  ctx.font = '900 150px Arial, sans-serif';
  ctx.fillStyle = accent;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 10;
  const numY = jersey.name ? 145 : H / 2;
  ctx.strokeText(String(jersey.number), W / 2, numY);
  ctx.fillText(String(jersey.number), W / 2, numY);
  tex.update();

  const mat = new StandardMaterial(`jersey_decal_mat_${spawn.id}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.disableLighting = true;
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = true; // front face measured facing out of the back — cull normally

  const plate = MeshBuilder.CreatePlane(`jersey_decal_${spawn.id}`, { width: 0.20, height: 0.18 }, scene);
  plate.material = mat;
  plate.parent = node;
  // measured against the chest blob (z-radius 0.132 from Spine2): mid-back,
  // ~4cm proud of the surface so the shoulders never swallow it
  plate.position = new Vector3(0, -0.05, -0.17);
  // Spine2's bone frame already carries the yaw — measured 2026-05-13: with any
  // extra π rotation the plate's FRONT face points into the body and the camera
  // sees a mirrored back face (live culling toggle proved which face was out).
  plate.rotation = Vector3.Zero();
  spawn.meshes.push(plate);
}

function scaleBones(spawn: SpawnedCharacter, names: string[], s: number): void {
  if (s === 1) return;
  for (const n of names) {
    boneNode(spawn.skeleton, n)?.scaling.setAll(s);
  }
}
function matColor(m: TintMat): Color3 | undefined {
  return m.albedoColor ?? m.diffuseColor;
}
function applySkinTone(spawn: SpawnedCharacter, hex: string): void {
  const tone = Color3.FromHexString(hex);
  for (const mesh of spawn.meshes) {
    const m = mesh.material as TintMat | null;
    const c = m && matColor(m);
    if (!c) continue;
    // Name first, colour heuristic second. The heuristic guesses "is this
    // flesh-coloured?", which quietly depends on the DEFAULT skin tone being
    // flesh-coloured — pick a very dark or very pale tone and it stops matching
    // its own mesh, so changing skin tone twice would fail the second time. The
    // procedural body names its material `skin_<id>`, so just ask.
    const named = `${mesh.name} ${m!.name}`.toLowerCase().includes('skin');
    const isSkin = named
      || (c.r > 0.45 && c.g > 0.25 && c.b > 0.15 && c.r > c.b && c.g > c.b * 0.9);
    if (!isSkin) continue;
    const clone = cloneForTint(m!, `${m!.name}_skin`);
    if (!clone) continue;
    mesh.material = clone;
    // Real skin (ship pass 3, rung 2): a GLB hero's PBR `skin` material gets a
    // photographed CC0 skin map from the family nearest the chosen tone, and
    // the albedo colour becomes the RATIO tone / map-mean so the mean skin
    // colour lands on the swatch while the map keeps its detail. Procedural
    // bodies (StandardMaterial, no texture slot) keep the flat tint.
    // Only a body whose skin is laid out on the MakeHuman UVs can wear the
    // photographed maps (the import marks its skin material; the forge hero's
    // own UVs would scramble them). Everything else keeps the flat tint.
    const extras = (clone.metadata as { gltf?: { extras?: { felSkinUV?: string } } } | undefined)?.gltf?.extras;
    if (clone instanceof PBRMaterial && named && extras?.felSkinUV === 'makehuman') applySkinMap(clone, tone, mesh.getScene());
    else matColor(clone)?.copyFrom(tone);
  }
}
function skinFor(tone: Color3): SkinEntry | null {
  if (!SKIN_LIBRARY.length) return null;
  const lum = 0.2126 * tone.r + 0.7152 * tone.g + 0.0722 * tone.b;
  const family = lum < 0.28 ? 'dark' : lum < 0.5 ? 'medium' : 'light';
  return SKIN_LIBRARY.find((e) => e.family === family && e.sex === 'male') ?? SKIN_LIBRARY[0];   // sex arrives with the body roster (rung 3)
}
const skinTexCache = new WeakMap<object, Map<string, Texture>>();
function applySkinMap(mat: PBRMaterial, tone: Color3, scene: ReturnType<PBRMaterial['getScene']>): void {
  const entry = skinFor(tone);
  if (!entry) { mat.albedoColor.copyFrom(tone); return; }
  let cache = skinTexCache.get(scene); if (!cache) { cache = new Map(); skinTexCache.set(scene, cache); }
  // orientation follows the file's own map (the glTF loader's flag), so the swap lands on the same UV layout
  const invertY = (mat.albedoTexture as Texture | null)?.invertY ?? false;
  const tex = (url: string) => { let t = cache!.get(url); if (!t) { t = new Texture(url, scene, false, invertY, Texture.TRILINEAR_SAMPLINGMODE); cache!.set(url, t); } return t; };
  mat.albedoTexture = tex(entry.albedo);
  const [mr, mg, mb] = entry.meanRGB.map((v) => Math.max(8, v) / 255);
  const clamp = (v: number) => Math.min(1.25, Math.max(0.35, v));   // past 1.25 the map washes out; the light family already sits near the swatch
  mat.albedoColor = new Color3(clamp(tone.r / mr), clamp(tone.g / mg), clamp(tone.b / mb));
  // photographed detail normal in place of the procedural pores (same UV layout on every MakeHuman skin)
  const n = tex(SKIN_DETAIL_NORMAL);
  mat.bumpTexture = n; n.level = 0.45;
  mat.metadata = { ...(mat.metadata ?? {}), felSkin: entry.key };
}
/** Hair color + bald toggle, matched on the forged rig's `hair` material name
 *  (scripts/avatar/forge.mts). Rigs without one skip cleanly. */
function applyHair(spawn: SpawnedCharacter, hex: string, bald: boolean): void {
  for (const mesh of spawn.meshes) {
    const m = mesh.material as TintMat | null;
    if (!m || !m.name.toLowerCase().startsWith('hair')) continue;
    // Phase 3: visibility is applyHairStyle's job (Bald = no hair node shown);
    // the brows share this material and must keep their color either way.
    void bald;
    const tone = Color3.FromHexString(hex);
    const clone = cloneForTint(m, `${m.name}_style`);
    if (clone) { matColor(clone)?.copyFrom(tone); mesh.material = clone; }
  }
}
function tintSlot(spawn: SpawnedCharacter, keys: string[], hex: string): void {
  const tint = Color3.FromHexString(hex);
  for (const mesh of spawn.meshes) {
    const m = mesh.material as TintMat | null;
    if (!m) continue;
    const name = `${mesh.name} ${m.name}`.toLowerCase();
    if (!keys.some((k) => name.includes(k))) continue;
    const clone = cloneForTint(m, `${m.name}_wear`);
    if (clone) { matColor(clone)?.copyFrom(tint); mesh.material = clone; }
  }
}

