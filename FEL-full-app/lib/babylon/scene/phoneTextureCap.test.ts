// phoneTextureCap: a phone uploads glTF model textures at ≤ 1024²; nothing else, and no other tier, changes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  PHONE_MODEL_TEXTURE_MAX, cappedUploadSize, installPhoneTextureCap, isModelImageUrl, textureBytes,
} from './phoneTextureCap';

/** A stand-in engine whose prepare records the cap it saw — the one value Babylon's prepare sizes the upload from. */
function fakeEngine(max = 16384) {
  const caps = { maxTextureSize: max };
  const seen: Array<{ url: string; cap: number }> = [];
  const e = {
    getCaps: () => caps,
    _prepareWebGLTexture(texture: { url?: string }) { seen.push({ url: texture.url ?? '', cap: caps.maxTextureSize }); return 'r'; },
  };
  return { e, caps, seen };
}

describe('phoneTextureCap', () => {
  it('names glTF-embedded images only', () => {
    expect(isModelImageUrl('data:/models/candidates/fel-kit-male.glb#image7')).toBe(true);
    expect(isModelImageUrl('/models/props/meshy/dojo.glb#image0')).toBe(true);
    expect(isModelImageUrl('/models/x.gltf#image12')).toBe(true);
    expect(isModelImageUrl('/backdrops/beach-2048.jpg')).toBe(false);
    expect(isModelImageUrl('/models/skins/light-male-1024.jpg')).toBe(false);
    expect(isModelImageUrl(null)).toBe(false);
  });

  it('caps each edge at 1024 on a phone — a 2048² map is a quarter of the memory', () => {
    expect(PHONE_MODEL_TEXTURE_MAX).toBe(1024);
    expect(cappedUploadSize(2048, 2048)).toEqual({ w: 1024, h: 1024 });
    expect(cappedUploadSize(512, 2048)).toEqual({ w: 512, h: 1024 });
    expect(cappedUploadSize(1024, 512)).toEqual({ w: 1024, h: 512 });
    expect(textureBytes(2048, 2048) / textureBytes(1024, 1024)).toBe(4);
  });

  it('on the mobile tier a model image is prepared under the cap, and the cap is restored after', () => {
    const { e, caps, seen } = fakeEngine();
    installPhoneTextureCap(e, 'mobile');
    expect(e._prepareWebGLTexture({ url: 'data:/models/props/meshy/dojo.glb#image1' })).toBe('r');
    expect(seen[0].cap).toBe(1024);
    expect(caps.maxTextureSize).toBe(16384);
  });

  it('a plain image (a sky dome, a backdrop) and a render target keep the GPU limit on a phone', () => {
    const { e, seen } = fakeEngine();
    installPhoneTextureCap(e, 'mobile');
    e._prepareWebGLTexture({ url: '/backdrops/dunk-sunset.jpg' });
    e._prepareWebGLTexture({});
    expect(seen.map((s) => s.cap)).toEqual([16384, 16384]);
  });

  it('desktop and high never install it', () => {
    for (const tier of ['desktop', 'high']) {
      const { e, seen } = fakeEngine();
      const before = e._prepareWebGLTexture;
      installPhoneTextureCap(e, tier);
      expect(e._prepareWebGLTexture).toBe(before);
      e._prepareWebGLTexture({ url: 'data:/models/candidates/fel-kit-male.glb#image7' });
      expect(seen[0].cap).toBe(16384);
    }
  });

  it('restores the cap when the prepare throws, never lifts a smaller GPU limit, installs once, uninstalls', () => {
    const caps = { maxTextureSize: 4096 };
    const e = { getCaps: () => caps, _prepareWebGLTexture() { throw new Error('gl'); } };
    const off = installPhoneTextureCap(e, 'mobile');
    expect(() => e._prepareWebGLTexture({ url: 'a.glb#image0' } as never)).toThrow('gl');
    expect(caps.maxTextureSize).toBe(4096);
    const small = fakeEngine(512);
    installPhoneTextureCap(small.e, 'mobile');
    installPhoneTextureCap(small.e, 'mobile');
    small.e._prepareWebGLTexture({ url: 'a.glb#image0' });
    expect(small.seen).toHaveLength(1);
    expect(small.seen[0].cap).toBe(512);
    off();
    expect(Object.prototype.hasOwnProperty.call(e, '_prepareWebGLTexture')).toBe(true);
  });

  it("Babylon's prepare still exists and still sizes the upload from getCaps().maxTextureSize (private API: an upgrade fails here)", () => {
    const req = createRequire(import.meta.url);
    const dir = dirname(req.resolve('@babylonjs/core/package.json'));
    const src = readFileSync(join(dir, 'Engines/thinEngine.pure.js'), 'utf8');
    const at = src.indexOf('_prepareWebGLTexture(texture, extension, scene, img');
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 400)).toMatch(/const maxTextureSize = this\.getCaps\(\)\.maxTextureSize;/);
    // createTexture hands the clamped size to its upload, which draws an over-limit image through the working canvas
    expect(src).toMatch(/img\.width > maxTextureSize \|\| img\.height > maxTextureSize/);
    expect(src).toMatch(/\(\.\.\.args\) => this\._prepareWebGLTexture\(\.\.\.args, format\)/);
  });

  it('the harness installs it once the tier is known, before anything loads', () => {
    const h = readFileSync(join(__dirname, '../core/ModeHarness.ts'), 'utf8');
    const tierAt = h.indexOf('const tier = detectRenderTier(');
    const capAt = h.indexOf('installPhoneTextureCap(engine, tier);');
    expect(tierAt).toBeGreaterThan(0);
    expect(capAt).toBeGreaterThan(tierAt);
    expect(capAt).toBeLessThan(h.indexOf('mountLightRig('));
  });
});
