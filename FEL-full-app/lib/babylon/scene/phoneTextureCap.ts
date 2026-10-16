// phoneTextureCap — a phone never uploads a model's texture above 1024² (phone-perf pass, 2026-10-14).
//
// WHY. The phone sweep (scratchpad phoneperf, 390×844 DPR 3, mobile tier) read the GPU texture list of every mode. The
// models' own 2048² maps were the biggest single items on the phone tier: the guest player's kit body
// (the kit body, heroBody KIT_BODY_URL: its skin map 2048² = 21.3 MB with mips) in nearly every mode, and the karate dojo
// (`props/meshy/dojo.glb`, three 2048² maps = 64 MB). A 2048² map is four times the memory of a 1024² one and on a
// 390-px-wide screen it is never seen at more than ~1024 texels across. The scanned hero already ships a phone file for
// exactly this reason (CharacterLibrary MOBILE_HERO_URL: "skin at 1024²"); this does the same for every glTF model at
// once, at upload, instead of one baked file per asset.
//
// HOW. Babylon decides a texture's upload size in `ThinEngine._prepareWebGLTexture` from `getCaps().maxTextureSize`: an
// image larger than the cap is drawn through its working canvas at the cap and uploaded at that size (the same path a
// GPU with a small limit takes). On the MOBILE tier only, this wraps that method on the one engine: while a glTF/GLB
// image (a texture URL ending `.glb#image<n>` / `.gltf#image<n>`) is being prepared the cap reads PHONE_MODEL_TEXTURE_MAX
// (the player's kit body: 1024 skin / 512 the rest, below), and it is restored before the call returns. Everything else is untouched: render targets, post-process buffers (they
// also read the cap, and are never inside this window), dynamic textures, sky domes and photo backdrops (plain image
// URLs: their texel density across a 360° dome is what a phone sees). Desktop and high never install it.
//
// Babylon-internal: `_prepareWebGLTexture` is private API. phoneTextureCap.test.ts reads the shipped Babylon source and
// fails if the method stops existing or stops reading the cap, so an upgrade breaks a test, not a phone.

import { KIT_BODY_URL } from '../core/heroBody';

/** The largest edge a glTF model's texture is uploaded at on the phone tier. */
export const PHONE_MODEL_TEXTURE_MAX = 1024;
/** The guest player's kit body on a phone: its skin (the file's one 2048² map) at 1024², every other map at 512². */
export const PHONE_KIT_SKIN_MAX = 1024, PHONE_KIT_OTHER_MAX = 512;

/**
 * THE KIT BODY (phone-perf, 2026-10-14). The guest player plays the kit body (heroBody's KIT_BODY_URL, male or female): one body with
 * EVERY wardrobe option in it — six hair styles, two tops, two pairs of shoes, shorts, eyes — fifteen maps, uploaded
 * whether worn or not. Measured on the phone tier: 95.8 MB, a third of the 256 MB phone ceiling, in every mode a guest
 * plays (who_scene_it's whole texture list was 225 MB). The phone split the owner already ships for bodies is the rule
 * here: the scanned hero's phone file (CharacterLibrary MOBILE_HERO_URL) and every rival (roster-from-kit) carry the skin
 * at 1024² and everything else at 512². The kit file's skin is its only 2048² map, so the split reads off the size.
 */
const KIT_FILES = Object.values(KIT_BODY_URL);   // the files are spelled in heroBody.ts only (heroBody.test holds that)
function isPlayerKitImage(url: string): boolean {
  const file = url.replace(/#image\d+$/, '');
  return KIT_FILES.some((u) => file.endsWith(u));
}

/** A glTF-embedded image, as Babylon's glTF loader names it (`<file>.glb#image7`, also behind a `data:` prefix). */
const MODEL_IMAGE = /\.(glb|gltf)#image\d+$/i;

export function isModelImageUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && MODEL_IMAGE.test(url);
}

/** Pure: the edge cap a phone uploads this image under, or Infinity for none (not a model image). */
export function phoneCapFor(url: string | null | undefined, w: number, h: number): number {
  if (!isModelImageUrl(url)) return Infinity;
  if (isPlayerKitImage(url as string)) return Math.max(w, h) >= 2048 ? PHONE_KIT_SKIN_MAX : PHONE_KIT_OTHER_MAX;
  return PHONE_MODEL_TEXTURE_MAX;
}

/** Pure: the size an image of w×h uploads at under a cap (each edge clamped, as Babylon clamps it). */
export function cappedUploadSize(w: number, h: number, cap = PHONE_MODEL_TEXTURE_MAX): { w: number; h: number } {
  return { w: Math.min(w, cap), h: Math.min(h, cap) };
}

/** Pure: GPU bytes of an RGBA texture with mips — the sweep's basis. */
export function textureBytes(w: number, h: number, mips = true): number {
  return w * h * 4 * (mips ? 1.33 : 1);
}

interface CappableEngine {
  getCaps(): { maxTextureSize: number };
  _prepareWebGLTexture?: (texture: { url?: string | null }, ...rest: unknown[]) => unknown;
}

/**
 * Install the cap on this engine when the tier is mobile. Returns the uninstall (a no-op when nothing was installed).
 * Idempotent per engine.
 */
export function installPhoneTextureCap(engine: unknown, tier: string, cap = PHONE_MODEL_TEXTURE_MAX): () => void {
  const e = engine as CappableEngine & { __felTexCap?: boolean };
  if (tier !== 'mobile' || typeof e?._prepareWebGLTexture !== 'function' || e.__felTexCap) return () => {};
  const own = Object.prototype.hasOwnProperty.call(e, '_prepareWebGLTexture');
  const prev = e._prepareWebGLTexture;
  const original = prev.bind(e);
  e._prepareWebGLTexture = function capped(texture, ...rest) {
    // Babylon's signature: (texture, extension, scene, img, ...) — the image's own size picks the kit body's split
    const img = rest[2] as { width?: number; height?: number } | undefined;
    const rule = phoneCapFor(texture?.url, img?.width ?? 0, img?.height ?? 0);
    if (!Number.isFinite(rule)) return original(texture, ...rest);
    const want = Math.min(cap, rule);
    const caps = e.getCaps();
    const was = caps.maxTextureSize;
    caps.maxTextureSize = Math.min(was, want);
    try { return original(texture, ...rest); } finally { caps.maxTextureSize = was; }
  };
  e.__felTexCap = true;
  return () => {
    if (own) e._prepareWebGLTexture = prev; else delete e._prepareWebGLTexture;
    delete e.__felTexCap;
  };
}
