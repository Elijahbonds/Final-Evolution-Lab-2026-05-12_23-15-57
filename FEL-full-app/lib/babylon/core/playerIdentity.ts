// playerIdentity — the ONE identity pipe, extracted from characterPipeline so the
// shared spawn layer (CharacterLibrary) can apply it without a runtime import
// cycle. Modes spawning a BARE hero (no tint/skinTone chosen) get the player's
// saved look applied automatically; explicit colors always win (rivals/NPCs).

import { applyHairStyle } from './hairStyles';
import { applyKit, type Wardrobe } from './kit';
import { reportDiag } from './diag';
import { applyFaceMorphs, resolveFaceWeightMap } from './faceMorphs';
import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import { SKIN_DETAIL_NORMAL, SKIN_LIBRARY, type SkinEntry } from './skinLibrary';
import type { Material } from '@babylonjs/core';
import type { QualityTier } from '../scene/QualityTier';
import type { AccessoryId } from './accessories';
import { wearPlayerAccessories } from './playerAccessories';
import { applyCreatorLayers } from './creatorLook';
import type { CreatorDoc, CreatorPart } from '../../creator/look/doc';
import { effectivePalette, type PaletteOverrides } from '../../creator/look/palette';
import { accessoriesForEquipped, wornPartsForEquipped } from '../../closet/wearableAccessories';
import { hiddenParts } from '../../creator/look/doc';
import { clothKitSlots } from '../../creator/look/clothes';
import { TEEN_DEVICE_LOOK_EVERYWHERE, activeLook, heroBodyForSlot } from '../../creator/look/slots';
import { readLocalLook, type StoredLook } from '../../creator/localLook';
import { applyEyes } from '../creator/eyes/renderEyes';
import { syncHair } from '../creator/hair/renderHair';
import { hairCover, resolveHair } from '../../creator/look/hair';
import { eyeParams } from '../creator/eyes/eyeTexture';
import { RawTexture } from '@babylonjs/core';

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
import type { AvatarSpec } from './avatarSpec';
import { proportionsFromFrame, type HeroBodyKind } from './heroBody';
import { playContextOf, playScales } from './playFrame';
import { recordPlayScale } from './playFramePoint';
import { boneNode } from '../anim/boneLookup';
import {
  defaultFace, defaultJersey, sanitizeJersey, getWearable,
  type FaceConfig, type WearableSlot, type JerseyConfig,
} from '../../closet/wearable-catalog';

export interface PlayerIdentity {
  proportions: AvatarSpec | null;                 // null until the creator frame sets one (REACH-FREEZE: never a workout scan)
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
  /** PLAYER RING (owner, 2026-09-17: "the icon correlates to the user's creator card"): the EQUIPPED creator card —
   *  the start screen's card slot / the Closet skin (AvatarLook.skinCardId) — with its accent and signature mode. null = BASE. */
  card?: EquippedCard | null;   // optional: the preview / dev literals do not carry one
  /** TRUE for an under-18 or unknown-age player (the closet row holds only catalog defaults): the real look
   *  is on the device and nowhere else (LOOK PRIVACY, PR #98; the race's local overlay, PR #138). Optional:
   *  dev literals do not carry one. */
  lookLocal?: boolean;
  /** IMPROVE (2026-10-06): the Creator's look doc (AvatarLook.face.creator), sanitised. Its colours are already folded
   *  into `palette` by resolveIdentity, and applyIdentity folds them again for a preview that passes a doc. Optional:
   *  a literal without one wears no doc. Parts / paint render from it through creatorLook.applyCreatorLayers. */
  creator?: CreatorDoc | null;
  /** IMPROVE (2026-10-06): the accessories the equipped headwear / accessory render as (wearableAccessories). Optional:
   *  a literal without one wears none. The player never gets the NPCs' seeded deal. */
  accessories?: readonly AccessoryId[];
  /** IMPROVE (2026-10-06), CREATOR-PLAN phase 2: equipped items that render as Creator parts (the Nexus Visor,
   *  wearableAccessories.wornPartsForEquipped). Optional: a literal without it wears none. */
  wornParts?: readonly CreatorPart[];
  /** IMPROVE (2026-10-06), CREATOR-PLAN phase 4a: true when the look came from the DEVICE copy (a lookLocal player, under
   *  TEEN_DEVICE_LOOK_EVERYWHERE), so the race's own overlay (raceLook.ts) knows it is already applied. */
  lookFromDevice?: boolean;
}
export interface EquippedCard { id: string; name: string; accent: string; mode: string }

const FALLBACK_PALETTE = { jersey: '#00E5FF', shorts: '#0b1220', shoes: '#A855F7', accent: '#FFD700' };

let cached: PlayerIdentity | null = null;

/** Fetch + merge the user's identity once per session. Fail soft to defaults. */
export async function resolveIdentity(force = false): Promise<PlayerIdentity> {
  if (cached && !force) return cached;
  const dev = devBodyOverride();
  if (dev) { cached = dev; return dev; }
  // CREATOR-PLAN phase 4a: `?for=spawn` — the closet answers the ACTIVE slot only (a spawn dresses one body).
  const [closet, heroBody] = await Promise.all([
    fetch('/api/v1/closet?for=spawn').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/v1/hero-body').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<HeroBodyAnswer | null>,
  ]);
  // TEENS (owner decision 2026-10-06, "Every mode, device only"): a lookLocal player's row holds only the catalog
  // defaults, so their look comes from the device copy — read here, never sent anywhere (lib/creator/look/slots.ts).
  const local = closet?.lookLocal === true && TEEN_DEVICE_LOOK_EVERYWHERE ? readLocalLook() : null;
  cached = identityFrom(closet, heroBody, local);
  return cached;
}

/** What /api/v1/hero-body answers. */
export interface HeroBodyAnswer { body?: HeroBodyKind; frame?: Record<string, unknown> | null; palette?: PaletteOverrides | null; scanOwned?: boolean }

/**
 * The identity from the two answers (pure: resolveIdentity's fetches feed it; tests drive it directly).
 * IMPROVE (2026-10-06), CREATOR-PLAN phase 4a: the look is the ACTIVE SLOT's (slots.activeLook): its face, its doc, its
 * worn items, its height and build. The body is the server's decision (hero-body read the active slot's body, honouring
 * `'scan'` only for an account that owns one). `local` is the device copy of a lookLocal player (TEEN_DEVICE_LOOK_
 * EVERYWHERE): when it carries a face, it is the look instead, and its slot's body is mapped here within what the server
 * allows (heroBodyForSlot: `'scan'` only with scanOwned).
 */
export function identityFrom(closet: any, heroBody: HeroBodyAnswer | null, local: StoredLook | null): PlayerIdentity {
  const device = !!local?.face && closet?.lookLocal === true;
  const look = activeLook(device ? local!.face : closet?.look?.face);
  const creator = look.doc;
  const face: FaceConfig = look.face;
  const equipped: Partial<Record<WearableSlot, string | null>> = device
    ? (look.equipped ?? local!.equipped ?? {})
    : (look.equipped ?? closet?.look?.equipped ?? {});
  const cardRow = closet?.skins?.find((s: { id: string }) => s.id === closet?.look?.skinCardId) as { id: string; displayName?: string; accent?: string; mode?: string } | undefined;
  const cardAccent: string | undefined = cardRow?.accent;
  const card: EquippedCard | null = cardRow ? { id: cardRow.id, name: cardRow.displayName ?? '', accent: cardRow.accent || FALLBACK_PALETTE.accent, mode: cardRow.mode || 'dunk' } : null;

  const accentOf = (slot: WearableSlot, fallback: string): string => {
    const id = equipped[slot];
    return (id && getWearable(id)?.accent) || fallback;
  };
  // IMPROVE (2026-10-06), research item 1: the Athlete Creator's colour picks (AthleteBuild.palette, sent by hero-body as
  // overrides only) used to stop at the preview; they now win over the per-garment derivation, and the Creator doc's
  // colours win over both (lib/creator/look/palette.ts).
  const palette = effectivePalette({
    jersey: accentOf('tops', FALLBACK_PALETTE.jersey),
    shorts: accentOf('shorts', FALLBACK_PALETTE.shorts),
    shoes: accentOf('shoes', FALLBACK_PALETTE.shoes),
    accent: cardAccent || accentOf('accessory', FALLBACK_PALETTE.accent),
  }, heroBody?.palette, creator?.colours);

  // The creator frame's height and build, and only those (REACH-FREEZE, 2026-09-29, spec Decision 4). This used to prefer the newest
  // workout scan's stored avatarSpec — a height made from the jump and a reach from the running cadence — so jumping higher made the
  // player taller in every mode. The scan route still stores a spec (the standard frame now) and old rows keep theirs; nothing reads
  // them here, so the fetch is gone. The owner's scan body takes its frame the same way.
  // phase 4a: a slot's own height and build (multipliers) win over the Athlete Creator's frame (percent); the device copy's
  // frame numbers (percent) for a lookLocal player without a slot frame, as the race always did
  const pct = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const frame: Record<string, unknown> | null = look.frame
    ? { ...(heroBody?.frame ?? {}), heightScale: look.frame.heightScale * 100, buildScale: look.frame.buildScale * 100 }
    : device && (pct(local!.heightScale) || pct(local!.buildScale))
      ? { ...(heroBody?.frame ?? {}), ...(pct(local!.heightScale) ? { heightScale: local!.heightScale } : {}), ...(pct(local!.buildScale) ? { buildScale: local!.buildScale } : {}) }
      : heroBody?.frame ?? null;
  const frameScales = proportionsFromFrame(frame);
  const proportions: AvatarSpec | null = (frameScales ? {
    ...frameScales,
    palette: { skin: face.skinTone, primary: palette.jersey, accent: palette.accent },
    stance: (frame?.stance === 'tall' || frame?.stance === 'compact' ? frame.stance : 'athletic') as AvatarSpec['stance'],
  } : null);
  const jerseyRaw = device && local!.jersey ? local!.jersey : closet?.look?.jersey;
  const jersey = jerseyRaw ? sanitizeJersey(jerseyRaw) : null;

  const wardrobe: Wardrobe = { tops: equipped.tops ?? null, shorts: equipped.shorts ?? null, shoes: equipped.shoes ?? null };
  const serverBody: HeroBodyKind = heroBody?.body === 'scan' || heroBody?.body === 'kit-female' ? heroBody.body : 'kit-male';
  const body: HeroBodyKind = device ? heroBodyForSlot(look.body, { scanOwned: heroBody?.scanOwned === true, fallback: serverBody }) : serverBody;
  const accessories = accessoriesForEquipped(equipped);
  const wornParts = wornPartsForEquipped(equipped);
  const id: PlayerIdentity = { proportions, face, palette, jersey, wardrobe, custom: Boolean(closet?.look) || Boolean(frame), body, card, lookLocal: closet?.lookLocal === true, creator, accessories, wornParts };
  if (device) id.lookFromDevice = true;
  return id;
}
/** The identity resolved so far this session (null before the first spawn asked) — a synchronous read for the ring / icon. */
export function cachedIdentity(): PlayerIdentity | null { return cached; }

/**
 * DEV ONLY — the body matrix (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14). `/dev/mode/<key>?body=female&height=96&build=108`
 * plays a guest as that body without a login or a database row, so the owner's proof bar ("male/female × short/tall ×
 * slim/heavy, per mode family") can be walked by a probe. Percent scales like the creator's Vitals rows, clamped the same way
 * where they are applied. `reach=` is gone with the Reach row (REACH-FREEZE). Never in a production build.
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
    proportions: { heightScale: pct('height'), buildScale: pct('build'), reachScale: 1, palette: { skin: face.skinTone, primary: palette.jersey, accent: palette.accent }, stance: 'athletic' },
    // CLOTHING-ALONE (2026-09-14): `&tops=top_lab&shorts=shorts_court&shoes=shoes_flight` dresses the guest like a Closet save
    face, palette, jersey: null, wardrobe: { tops: q.get('tops'), shorts: q.get('shorts'), shoes: q.get('shoes') },
    custom: true, body: b === 'scan' ? 'scan' : b === 'female' ? 'kit-female' : 'kit-male',
  };
}

/** Call on Closet save / new scan so the next spawn picks up changes. */
export function invalidateIdentity(): void { cached = null; }

/**
 * Seat a resolved identity as the session's one (racing/raceLook: the local-look overlay for a minor,
 * computed from what the device holds, so CharacterLibrary's own resolveIdentity picks it up). Nothing
 * here fetches or uploads — it only sets what the next spawn will wear.
 */
export function primeIdentity(id: PlayerIdentity): void { cached = id; }

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
//
// REACH-FREEZE (2026-09-29, Gameplay Systems' spec, Decisions 1–3). Reach is gone: the longer arm was an edge, because the ball rides
// the hand bone and the hoops modes read it for the rim touch and the release. The arm keeps its bind length now (a joint an older
// build moved is put back), height and build are clamped to the cosmetic range (playFrame.COSMETIC_CLAMP), and the scale put on the
// root is recorded so a mode can read its outcome points on the standard frame (playFramePoint).
const REACH_JOINTS = ['LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand'];

/** `reachScale` is read by nothing (REACH-FREEZE); it stays in the type because saved specs still carry it. */
export interface ProportionScales { heightScale?: number; buildScale?: number; reachScale?: number }

export function applyProportions(spawn: Pick<SpawnedCharacter, 'root' | 'skeleton'>, p: ProportionScales, base?: Vector3): void {
  const { heightScale: h, buildScale: b } = playScales(p);   // the cosmetic clamp; reach is never read
  const s0 = base ?? spawn.root.scaling.clone();
  spawn.root.scaling.set(s0.x * h * b, s0.y * h, s0.z * h * b);
  recordPlayScale(spawn.root, { heightScale: h, buildScale: b });
  for (const name of REACH_JOINTS) {
    const n = boneNode(spawn.skeleton, name); if (!n) continue;
    const bind = (n.metadata as { felBindPos?: Vector3 } | null | undefined)?.felBindPos;
    if (bind) n.position.copyFrom(bind);
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
  // 1) Proportions — height on the root, build as its girth, both cosmetic; the arms at their bind length (REACH-FREEZE). A ranked
  //    session and every STANDARD_FRAME_MODES mode spawn every body at exactly 1.0: playScales reads the harness's stamps on the
  //    spawn's scene (ModeHarness: `felModeId`; `felRanked`, which nothing sets yet — reach-freeze-routed.md R2).
  if (id.proportions) {
    applyProportions(spawn, playScales(id.proportions, playContextOf(spawn.root.getScene()?.metadata)));
  }
  // 2) Face — skin tone on skin materials (the model has no blendshapes today;
  //    the flat FaceConfig preset variety is handled by the Closet preview rig).
  // IMPROVE (2026-10-06), research item 4: the body's sex picks the skin map family (the female body wore male maps).
  applySkinTone(spawn, id.face.skinTone, id.body === 'kit-female' ? 'female' : 'male');
  applyHair(spawn, id.face.hairColor, id.face.hairStyle === 'Bald');
  // CREATOR-PLAN phase 4a (hide, tool #4): a doc that hides the hair (or the whole head) shows no hair node at all
  const hidden = hiddenParts(id.creator);
  applyHairStyle(spawn.meshes, hidden.hair ? 'Bald' : id.face.hairStyle);   // Phase 3: real hair geometry per style
  // ship pass 3: fitted garments per equipped wearable (no-op without a kit). CREATOR-PLAN phase 4e: a slot the player's
  // code-built clothes cover shows no kit garment (only on a full apply: a team-kit 'body' apply builds no clothes)
  applyKit(spawn.meshes, id.wardrobe, null, { covered: parts === 'full' ? clothKitSlots(id.creator?.clothes) : undefined });
  // Phase 3 (2026-09-02): the forge now has a face. Shape presets and the
  // fine-tune sliders resolve through one table; eye color lands on the
  // iris material. No-ops on a body without morphs or an iris.
  // IMPROVE (2026-10-06): the Creator doc's face values win over the Closet sliders, per morph. CREATOR-PLAN phase 4c: by
  // NAME (resolveFaceWeightMap), so a morph phase 5 bakes into the body is driven without a code change.
  const doc = id.creator ?? null;
  applyFaceMorphs(spawn.meshes, resolveFaceWeightMap({
    faceShape: id.face.faceShape, brows: id.face.brows, eyeShape: id.face.eyeShape, mouth: id.face.mouth, nose: id.face.nose,
    sliders: { ...(id.face.sliders ?? {}), ...(doc?.shape.face ?? {}) } as never,
  }));
  // CREATOR-PLAN phase 4a (tool #3): eye colour is honest now — the eyeballs wear a code-drawn texture (the base's eye
  // colour, the doc's sclera / iris size / pupil / glow), or are hidden. (This line used to tint an `iris` material the
  // kit never had.)
  applyEyes(spawn, eyeParams(id.face.eyeColor, doc?.eyes), hidden.eyes);
  // THE HAIR EXPANSION (2026-10-07): every catalog style, the beard and the hair accessories are code-built on the body's
  // own head (lib/babylon/creator/hair) — after the face morphs, so the head it fits is the face the player made. Where it
  // can fit the body it hides the baked Hair_* nodes applyHairStyle just chose; elsewhere (the scan, a roster body) that
  // node stays. A hood up or a helmet part takes the hair off; worn headwear presses tall hair down. On a 'body' apply the
  // doc's clothes and parts are not built, so they cover nothing.
  syncHair(spawn, resolveHair(id.face, doc, hidden), {
    cover: hairCover(parts === 'full' ? doc : null, parts === 'full' ? { accessories: id.accessories, wornParts: id.wornParts } : {}),
  });
  watchReadiness(spawn);
  if (parts === 'body') return;
  // 3) Wardrobe palette — jersey/shorts/shoes tints by mesh/material slot name. The doc's colours win (a no-op when
  //    resolveIdentity already folded them in; a preview passing a draft doc gets them here).
  const palette = effectivePalette(id.palette, doc?.colours);
  tintSlot(spawn, ['jersey', 'top', 'shirt', 'tee'], palette.jersey);
  tintSlot(spawn, ['shorts', 'pants', 'bottom'], palette.shorts);
  tintSlot(spawn, ['shoe', 'sneaker', 'boot'], palette.shoes);
  // 4) Jersey ID plate on the back — applied for 'body' too: a team-tinted
  //    hero still wears the player's own number.
  if (id.jersey && (id.jersey.name || id.jersey.number > 0)) attachJerseyPlate(spawn, id.jersey, palette.accent);
  // 5) IMPROVE (2026-10-06), research item 2: what the player equipped, in the palette's accent (never the NPCs' deal).
  wearPlayerAccessories(spawn, id.accessories ?? [], palette.accent);
  // 6) THE CREATOR HOOK — parts (phase 2) and paint (phase 3) render from the doc here, and only here; worn parts too.
  applyCreatorLayers(spawn, doc, id.wornParts ?? []);
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
  // idempotent — a second application replaces the plate, never stacks it. IMPROVE (2026-10-06), research item 16: the
  // old plate's own material and canvas texture go with it (they were left in the scene on every live-editor keypress),
  // and it leaves spawn.meshes instead of piling up there disposed.
  for (const m of spawn.meshes.filter((x) => x.name.startsWith('jersey_decal_'))) {
    m.dispose(false, true);
    spawn.meshes.splice(spawn.meshes.indexOf(m), 1);
  }
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

// ── TINTED-MATERIAL CACHE (IMPROVE (2026-10-06), research item 16) ─────────────────────────────────────────────────
// Every apply used to clone the mesh's CURRENT material: a live editor re-applies per keypress, so each edit cloned the
// last clone ("skin_skin_skin…") and nothing was ever disposed (measured in playerIdentity.cache.test.ts: +5 materials
// per re-apply on a five-slot body). Now each body keeps one tinted clone per (source material, slot), made from the
// ORIGINAL material and re-coloured in place: a colour drag makes no new material at all, which is what a cache keyed
// by (source, hex) would only approximate. The clones and the textures each one deep-copied are disposed when the
// body's root disposes. The cache is per body, never shared: modes flash and fade a body's own materials in place.
// A caller with no root (tintGarmentSlot on a bare mesh list) keeps the old one-off clone.
const tintSource = new WeakMap<Material, TintMat>();
const bodyTints = new WeakMap<object, Map<string, { mat: TintMat; owned: { dispose(): void }[] }>>();

/** The material a tint starts from: the original, never an earlier tint's clone. */
function sourceOf(m: TintMat): TintMat { return tintSource.get(m) ?? m; }

/** This body's tinted clone of `src` for `slot`, made once. Null when the material cannot clone. */
function tintedFor(spawn: { root?: SpawnedCharacter['root'] }, src: TintMat, slot: string, suffix = slot): TintMat | null {
  const root = spawn.root;
  if (!root) return cloneForTint(src, `${src.name}_${suffix}`);
  let cache = bodyTints.get(root);
  if (!cache) {
    const made = new Map<string, { mat: TintMat; owned: { dispose(): void }[] }>();
    bodyTints.set(root, made);
    cache = made;
    root.onDisposeObservable.addOnce(() => {
      for (const { mat, owned } of made.values()) {
        try { mat.dispose(false, false); } catch { /* gone with the scene */ }
        for (const t of owned) { try { t.dispose(); } catch { /* gone with the scene */ } }
      }
      made.clear();
      bodyTints.delete(root);
    });
  }
  const key = `${src.uniqueId}|${slot}`;
  const hit = cache.get(key);
  if (hit) return hit.mat;
  const mat = cloneForTint(src, `${src.name}_${suffix}`);
  if (!mat) return null;
  // the textures the clone deep-copied (not the source's own, not the shared bump map) are this clone's to dispose
  const keep = new Set<unknown>(src.getActiveTextures());
  const owned = mat.getActiveTextures().filter((t) => !keep.has(t));
  tintSource.set(mat, src);
  cache.set(key, { mat, owned });
  return mat;
}

function applySkinTone(spawn: SpawnedCharacter, hex: string, sex: 'male' | 'female' = 'male'): void {
  const tone = Color3.FromHexString(hex);
  for (const mesh of spawn.meshes) {
    const cur = mesh.material as TintMat | null;
    const m = cur && sourceOf(cur);
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
    const clone = tintedFor(spawn, m!, 'skin');
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
    if (clone instanceof PBRMaterial && named && extras?.felSkinUV === 'makehuman') applySkinMap(clone, tone, mesh.getScene(), sex);
    else matColor(clone)?.copyFrom(tone);
  }
}
/** The photographed skin map for a tone on a body of `sex`. IMPROVE (2026-10-06), research item 4: this always took
 *  the male entry, so the female body wore male maps although the set ships dark/medium/light female ones. A sex the
 *  set lacks falls back to the male entry of the family, then to the first entry. */
export function skinFor(tone: Color3, sex: 'male' | 'female' = 'male'): SkinEntry | null {
  if (!SKIN_LIBRARY.length) return null;
  const lum = 0.2126 * tone.r + 0.7152 * tone.g + 0.0722 * tone.b;
  const family = lum < 0.28 ? 'dark' : lum < 0.5 ? 'medium' : 'light';
  return SKIN_LIBRARY.find((e) => e.family === family && e.sex === sex)
    ?? SKIN_LIBRARY.find((e) => e.family === family && e.sex === 'male')
    ?? SKIN_LIBRARY[0];
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
function applySkinMap(mat: PBRMaterial, tone: Color3, scene: ReturnType<PBRMaterial['getScene']>, sex: 'male' | 'female'): void {
  const entry = skinFor(tone, sex);
  if (!entry) { mat.albedoColor.copyFrom(tone); return; }
  let cache = skinTexCache.get(scene); if (!cache) { cache = new Map(); skinTexCache.set(scene, cache); }
  // orientation follows the file's own map (the glTF loader's flag), so the swap lands on the same UV layout
  const invertY = (mat.albedoTexture as Texture | null)?.invertY ?? false;
  // the tier the harness stored on the scene (ModeHarness.ts); a scene without one (Closet preview, tests) is desktop
  const tier: QualityTier = (scene.metadata as { felTier?: QualityTier } | undefined)?.felTier ?? 'desktop';
  const tex = (rawUrl: string) => { const url = skinMapUrl(rawUrl, tier); let t = cache!.get(url); if (!t) { t = new Texture(url, scene, false, invertY, Texture.TRILINEAR_SAMPLINGMODE); cache!.set(url, t); } return t; };
  // CREATOR-PLAN phase 4a (free colour, tool #5): a tone far from any human one (green, blue, white, …) wears a
  // DESATURATED version of the map times the tone, so it reads clean; the per-channel ratio below would clamp it to mud.
  if (isFantasyTone(tone, entry.meanRGB)) {
    mat.albedoTexture = fantasySkinTexture(skinMapUrl(entry.albedo, tier), scene, tier, invertY);
    mat.albedoColor = fantasySkinColour(tone);
  } else {
    mat.albedoTexture = tex(entry.albedo);
    const [mr, mg, mb] = entry.meanRGB.map((v) => Math.max(8, v) / 255);
    const clamp = (v: number) => Math.min(1.25, Math.max(0.35, v));   // past 1.25 the map washes out; the light family already sits near the swatch
    mat.albedoColor = new Color3(clamp(tone.r / mr), clamp(tone.g / mg), clamp(tone.b / mb));
  }
  // photographed detail normal in place of the procedural pores (same UV layout on every MakeHuman skin)
  const n = tex(SKIN_DETAIL_NORMAL);
  mat.bumpTexture = n; n.level = 0.45;
  mat.metadata = { ...(mat.metadata ?? {}), felSkin: entry.key };
}
// ── FANTASY SKIN (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a, tool #5) ─────────────────────────────────────────────
// The photographed skin maps are tinted by a per-channel RATIO (tone / the map's mean colour), clamped to 0.35–1.25 so
// the map never washes out. Inside the human range that lands the mean on the swatch. Outside it the clamp bites, or the
// map's own warm hue shows through, and a green, blue or white skin came out muddy. Such a tone now wears a GREY version
// of the same map (its luminance, its pores and shading, no hue) times the tone itself: the colour is exactly the one
// picked and the detail is still skin.

/** The grey map's mean, as a gamma byte level (0..1): bright enough for white skin, room left for the detail above it. */
export const FANTASY_GREY_MEAN = 0.8;
/** The per-channel ratios past which a tone is not a skin tone at all (every catalog tone sits inside, tested). */
export const FANTASY_RATIO: readonly [number, number] = [0.15, 2.2];
/** A tone is "far from human" when the ratio tint would be far past its clamp, or its hue is not a skin hue (skin runs red ≥ green ≥
 *  blue, give or take). Pure; `meanRGB` is the chosen map's mean (0..255). */
export function isFantasyTone(tone: { r: number; g: number; b: number }, meanRGB: readonly number[]): boolean {
  const [mr, mg, mb] = meanRGB.map((v) => Math.max(8, v) / 255);
  const ratios = [tone.r / mr, tone.g / mg, tone.b / mb];
  // far past the ratio clamp (0.35–1.25; the catalog's palest and darkest tones already lean on it a little, and keep
  // the photographed map exactly as before)
  if (ratios.some((k) => k < FANTASY_RATIO[0] || k > FANTASY_RATIO[1])) return true;
  // skin hue: red leads, green does not trail blue by much; a grey or a green-led / blue-led tone is not skin
  if (tone.g > tone.r * 1.02 || tone.b > tone.g * 1.15 || tone.b > tone.r) return true;
  const max = Math.max(tone.r, tone.g, tone.b), min = Math.min(tone.r, tone.g, tone.b);
  return max > 0.2 && (max - min) / max < 0.08;   // a neutral grey / white
}
/** The albedo colour over the grey map: the tone in linear light over the map's mean, scaled down (never shifted in hue)
 *  where a channel would pass 1.25. */
export function fantasySkinColour(tone: Color3): Color3 {
  const lin = (v: number) => Math.pow(v, 2.2);
  const mean = lin(FANTASY_GREY_MEAN);
  let c = [lin(tone.r) / mean, lin(tone.g) / mean, lin(tone.b) / mean];
  // the shader multiplies the map's LINEAR value; albedoColor is linear too
  const peak = Math.max(...c);
  if (peak > 1.25) c = c.map((v) => (v * 1.25) / peak);
  // Color3 here is read as linear by the PBR shader (albedoColor), so store the linear ratio as is
  return new Color3(c[0], c[1], c[2]);
}

/** The grey version of a skin map, made once per (scene, url): a RawTexture at the tier's map size, flat at the grey mean
 *  until the image is read (or for good where there is no canvas — tests, workers), then its luminance, re-centred on
 *  FANTASY_GREY_MEAN. Shared by every body wearing it; it goes with the scene. */
const greyCache = new WeakMap<object, Map<string, RawTexture>>();
export function fantasySkinTexture(url: string, scene: ReturnType<PBRMaterial['getScene']>, tier: QualityTier, invertY: boolean): RawTexture {
  let cache = greyCache.get(scene); if (!cache) { cache = new Map(); greyCache.set(scene, cache); }
  const hit = cache.get(url);
  if (hit) return hit;
  const size = tier === 'mobile' ? 1024 : 2048;
  const flat = Math.round(FANTASY_GREY_MEAN * 255);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = flat; data[i + 1] = flat; data[i + 2] = flat; data[i + 3] = 255; }
  const t = new RawTexture(data, size, size, 5 /* RGBA */, scene, true, invertY, Texture.TRILINEAR_SAMPLINGMODE);
  t.name = `fel_skin_grey_${url}`;
  cache.set(url, t);
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!ctx || !t.getScene()) return;
        ctx.drawImage(img, 0, 0, size, size);
        t.update(greyFromRGBA(ctx.getImageData(0, 0, size, size).data));
      } catch { /* a tainted or lost canvas: the flat grey stands */ }
    };
    img.src = url;
  }
  return t;
}
/** RGBA bytes → their luminance, re-centred so the mean sits at FANTASY_GREY_MEAN (pure; tested). */
export function greyFromRGBA(src: ArrayLike<number>): Uint8Array {
  const n = src.length / 4;
  const out = new Uint8Array(src.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += 0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2];
  const mean = Math.max(1, sum / Math.max(1, n));
  const k = (FANTASY_GREY_MEAN * 255) / mean;
  for (let i = 0; i < n; i++) {
    const l = (0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2]) * k;
    const v = l >= 255 ? 255 : l <= 0 ? 0 : Math.round(l);
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

/** Hair color + bald toggle, matched on the forged rig's `hair` material name
 *  (scripts/avatar/forge.mts). Rigs without one skip cleanly. */
function applyHair(spawn: SpawnedCharacter, hex: string, bald: boolean): void {
  for (const mesh of spawn.meshes) {
    const cur = mesh.material as TintMat | null;
    const m = cur && sourceOf(cur);
    if (!m || !m.name.toLowerCase().startsWith('hair')) continue;
    // Phase 3: visibility is applyHairStyle's job (Bald = no hair node shown);
    // the brows share this material and must keep their color either way.
    void bald;
    const tone = Color3.FromHexString(hex);
    const clone = tintedFor(spawn, m, 'style');
    if (clone) { matColor(clone)?.copyFrom(tone); mesh.material = clone; }
  }
}
/** The garment-slot keys the tinter matches on, so a caller dressing a body uses the same names the Closet does. */
export const SLOT_KEYS = {
  jersey: ['jersey', 'top', 'shirt', 'tee'],
  shorts: ['shorts', 'pants', 'bottom'],
  shoes: ['shoe', 'sneaker', 'boot'],
} as const;

/** Tint one garment slot on a spawned body. Exported so an outfit can dress a body the same way the Closet does. */
export function tintGarmentSlot(spawn: Pick<SpawnedCharacter, 'meshes'> & Partial<Pick<SpawnedCharacter, 'root'>>, keys: readonly string[], hex: string): void {
  tintSlot(spawn, [...keys], hex);
}

function tintSlot(spawn: Pick<SpawnedCharacter, 'meshes'> & Partial<Pick<SpawnedCharacter, 'root'>>, keys: string[], hex: string): void {
  const tint = Color3.FromHexString(hex);
  for (const mesh of spawn.meshes) {
    // IMPROVE (2026-10-06): the number plate is named `jersey_decal_*`, so the jersey keys used to re-tint the previous
    // plate on every re-apply (swapping its own material for a clone that then leaked). It is a decal, not a garment.
    if (mesh.name.startsWith('jersey_decal_')) continue;
    const cur = mesh.material as TintMat | null;
    const m = cur && sourceOf(cur);
    if (!m) continue;
    const name = `${mesh.name} ${m.name}`.toLowerCase();
    if (!keys.some((k) => name.includes(k))) continue;
    const clone = tintedFor(spawn, m, `wear_${keys[0]}`, 'wear');
    if (clone) { matColor(clone)?.copyFrom(tint); mesh.material = clone; }
  }
}

