// phoneTextureCap — a phone never uploads a model's texture above 1024² (phone-perf pass, 2026-10-14).
//
// WHY. The phone sweep (scratchpad phoneperf, 390×844 DPR 3, mobile tier) read the GPU texture list of every mode. The
// models' own 2048² maps were the biggest single items on the phone tier: the guest player's kit body
// (`candidates/fel-kit-male.glb`, its skin map 2048² = 21.3 MB with mips) in nearly every mode, and the karate dojo
// (`props/meshy/dojo.glb`, three 2048² maps = 64 MB). A 2048² map is four times the memory of a 1024² one and on a
// 390-px-wide screen it is never seen at more than ~1024 texels across. The scanned hero already ships a phone file for
// exactly this reason (CharacterLibrary MOBILE_HERO_URL: "skin at 1024²"); this does the same for every glTF model at
// once, at upload, instead of one baked file per asset.
//
// HOW. Babylon decides a texture's upload size in `ThinEngine._prepareWebGLTexture` from `getCaps().maxTextureSize`: an
// image larger than the cap is drawn through its working canvas at the cap and uploaded at that size (the same path a
// GPU with a small limit takes). On the MOBILE tier only, this wraps that method on the one engine: while a glTF/GLB
// image (a texture URL ending `.glb#image<n>` / `.gltf#image<n>`) is being prepared the cap reads PHONE_MODEL_TEXTURE_MAX,
// and it is restored before the call returns. Everything else is untouched: render targets, post-process buffers (they
// also read the cap, and are never inside this window), dynamic textures, sky domes and photo backdrops (plain image
// URLs: their texel density across a 360° dome is what a phone sees). Desktop and high never install it.
//
// Babylon-internal: `_prepareWebGLTexture` is private API. phoneTextureCap.test.ts reads the shipped Babylon source and
// fails if the method stops existing or stops reading the cap, so an upgrade breaks a test, not a phone.

/** The largest edge a glTF model's texture is uploaded at on the phone tier. */
export const PHONE_MODEL_TEXTURE_MAX = 1024;

/** A glTF-embedded image, as Babylon's glTF loader names it (`<file>.glb#image7`, also behind a `data:` prefix). */
const MODEL_IMAGE = /\.(glb|gltf)#image\d+$/i;

export function isModelImageUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && MODEL_IMAGE.test(url);
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
    if (!isModelImageUrl(texture?.url)) return original(texture, ...rest);
    const caps = e.getCaps();
    const was = caps.maxTextureSize;
    caps.maxTextureSize = Math.min(was, cap);
    try { return original(texture, ...rest); } finally { caps.maxTextureSize = was; }
  };
  e.__felTexCap = true;
  return () => {
    if (own) e._prepareWebGLTexture = prev; else delete e._prepareWebGLTexture;
    delete e.__felTexCap;
  };
}
