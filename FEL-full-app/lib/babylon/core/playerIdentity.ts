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
import type { QualityTier } from '../scene/QualityTier';

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
import { proportionsFromFrame, type HeroBodyKind } from './heroBody';
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
  /** EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): which body this player wears — the server's decision
   *  (/api/v1/hero-body). 'kit-male' for a guest or when the server could not be asked. */
  body: HeroBodyKind;
}

const FALLBACK_PALETTE = { jersey: '#00E5FF', shorts: '#0b1220', shoes: '#A855F7', accent: '#FFD700' };

let cached: PlayerIdentity | null = null;

/** Fetch + merge the user's identity once per session. Fail soft to defaults. */
export async function resolveIdentity(force = false): Promise<PlayerIdentity> {
  if (cached && !force) return cached;
  const dev = devBodyOverride();
  if (dev) { cached = dev; return dev; }
  const [closet, scan, heroBody] = await Promise.all([
    fetch('/api/v1/closet').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/v1/workout/scan').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/v1/hero-body').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ body?: HeroBodyKind; frame?: Record<string, unknown> | null } | null>,
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

  // A measured body scan wins; without one, the creator frame's height / build / reach (a kit-body player who never
  // scanned still plays the proportions they built).
  const frame = heroBody?.frame ?? null;
  const frameScales = proportionsFromFrame(frame);
  const proportions: AvatarSpec | null = scan?.scans?.[0]?.avatarSpec ?? (frameScales ? {
    ...frameScales,
    palette: { skin: face.skinTone, primary: palette.jersey, accent: palette.accent },
    stance: (frame?.stance === 'tall' || frame?.stance === 'compact' ? frame.stance : 'athletic') as AvatarSpec['stance'],
  } : null);
  const jerseyRaw = closet?.look?.jersey;
  const jersey = jerseyRaw ? sanitizeJersey(jerseyRaw) : null;

  const wardrobe: Wardrobe = { tops: equipped.tops ?? null, shorts: equipped.shorts ?? null, shoes: equipped.shoes ?? null };
  const body: HeroBodyKind = heroBody?.body === 'scan' || heroBody?.body === 'kit-female' ? heroBody.body : 'kit-male';
  cached = { proportions, face, palette, jersey, wardrobe, custom: Boolean(closet?.look) || Boolean(frame), body };
  return cached;
}

/**
 * DEV ONLY — the body matrix (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14). `/dev/mode/<key>?body=female&height=90&build=112&reach=100`
 * plays a guest as that body without a login or a database row, so the owner's proof bar ("male/female × short/tall ×
 * slim/heavy, per mode family") can be walked by a probe. Percent scales like the creator's Vitals rows. Never in a
 * production build.
 */
function devBodyOverride(): PlayerIdentity | null {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const b = q.get('body');
  if (b !== 'male' && b !== 'female' && b !== 'scan') return null;
  const pct = (k: string) => { const v = Number(q.get(k)); return Number.isFinite(v) && v > 0 ? v / 100 : 1; };
  const face = defaultFace();
  const palette = { ...FALLBACK_PALETTE };
  return {
    proportions: { heightScale: pct('height'), buildScale: pct('build'), reachScale: pct('reach'), palette: { skin: face.skinTone, primary: palette.jersey, accent: palette.accent }, stance: 'athletic' },
    // CLOTHING-ALONE (2026-09-14): `&tops=top_lab&shorts=shorts_court&shoes=shoes_flight` dresses the guest like a Closet save
    face, palette, jersey: null, wardrobe: { tops: q.get('tops'), shorts: q.get('shorts'), shoes: q.get('shoes') },
    custom: true, body: b === 'scan' ? 'scan' : b === 'female' ? 'kit-female' : 'kit-male',
  };
}

/** Call on Closet save / new scan so the next spawn picks up changes. */
export function invalidateIdentity(): void { cached = null; }

// ── Application layers ──────────────────────────────────────────────────

// PROPORTIONS (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14). This used to set a uniform scale on Spine, Spine1, Spine2
// and Chest for BUILD and on the upper arm AND forearm for REACH. Bone scale is inherited, so it compounded down the
// chain: a 112% build was ~1.4× everything above the hips — head, shoulders, arms — and a "heavy" short body stood 0.22 m
// taller than a "slim" one (the body matrix measured the head at 1.47 m vs 1.25 m). Reach squared on the forearm and
// hand. Now:
//   height — the root, uniformly (unchanged);
//   build  — the root's GIRTH (x/z) only. (b, 1, b) commutes with any yaw, so there is no shear and no height change;
//   reach  — the elbow and wrist JOINTS move out along the bone (Mixamo rigs: a child sits on its parent's local +Y),
//            which lengthens the arm without scaling any bone, so a bent elbow cannot shear the mesh. Clips key
//            rotations only (imported position tracks are stripped), so the offsets hold through every animation, and
//            the two-bone solver already fits hands to the arm length it finds.
// Absolute from the spawn's own base, so a live editor can re-apply per keypress without the old cumulative drift.
const REACH_JOINTS = ['LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand'];

export interface ProportionScales { heightScale?: number; buildScale?: number; reachScale?: number }

export function applyProportions(spawn: Pick<SpawnedCharacter, 'root' | 'skeleton'>, p: ProportionScales, base?: Vector3): void {
  const h = p.heightScale || 1, b = p.buildScale || 1, r = p.reachScale || 1;
  const s0 = base ?? spawn.root.scaling.clone();
  spawn.root.scaling.set(s0.x * h * b, s0.y * h, s0.z * h * b);
  for (const name of REACH_JOINTS) {
    const n = boneNode(spawn.skeleton, name); if (!n) continue;
    const md = (n.metadata ??= {}) as { felBindPos?: Vector3 };
    md.felBindPos ??= n.position.clone();
    n.position.copyFrom(md.felBindPos).scaleInPlace(r);
  }
}

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
    applyProportions(spawn, id.proportions);
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
/** Contract addendum (pass 4 phase 9, docs/CONTRACTS-PASS4-RUN.md contracts 1 + 2): the skin maps follow the
 *  quality tier. Desktop takes the shipped 2048² set (`public/models/skins/<key>.jpg`); mobile takes the 1024² set
 *  export-skins writes beside it (`--suffix -1024`: `<key>-1024.jpg`, `detail-normal-1024.jpg`). Pure. Idempotent
 *  on a url already on the mobile set; a url that is not a `.jpg` has no 1024 twin and passes through unchanged.
 *  Measured 2026-09-04 before this: the three 2048² maps a logged-in hero loads were 64 MB of dunk's mobile total. */
export function skinMapUrl(url: string, tier: QualityTier): string {
  if (tier !== 'mobile') return url;
  if (/-1024\.jpg$/.test(url) || !/\.jpg$/.test(url)) return url;
  return url.replace(/\.jpg$/, '-1024.jpg');
}
const skinTexCache = new WeakMap<object, Map<string, Texture>>();
function applySkinMap(mat: PBRMaterial, tone: Color3, scene: ReturnType<PBRMaterial['getScene']>): void {
  const entry = skinFor(tone);
  if (!entry) { mat.albedoColor.copyFrom(tone); return; }
  let cache = skinTexCache.get(scene); if (!cache) { cache = new Map(); skinTexCache.set(scene, cache); }
  // orientation follows the file's own map (the glTF loader's flag), so the swap lands on the same UV layout
  const invertY = (mat.albedoTexture as Texture | null)?.invertY ?? false;
  // the tier the harness stored on the scene (ModeHarness.ts); a scene without one (Closet preview, tests) is desktop
  const tier: QualityTier = (scene.metadata as { felTier?: QualityTier } | undefined)?.felTier ?? 'desktop';
  const tex = (rawUrl: string) => { const url = skinMapUrl(rawUrl, tier); let t = cache!.get(url); if (!t) { t = new Texture(url, scene, false, invertY, Texture.TRILINEAR_SAMPLINGMODE); cache!.set(url, t); } return t; };
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

