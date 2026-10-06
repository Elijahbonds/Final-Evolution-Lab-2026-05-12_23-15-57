import { describe, expect, it } from 'vitest';
import { OUTDOOR_MOODS, resolveQualityTier, explainQualityTier, classifyGpu, tierFromName, tierRigSettings, legacyAa, type TierInput } from './QualityTier';
import { fitCanvas } from '../core/canvasFit';

const desktop = { touch: false, coarsePointer: false, cssWidth: 1440, cssHeight: 900, limitedBy: null as null };

describe('resolveQualityTier', () => {
  it('a mouse-driven laptop is desktop', () => {
    expect(resolveQualityTier(desktop)).toBe('desktop');
  });
  it('a touch-first coarse-pointer device is mobile', () => {
    expect(resolveQualityTier({ ...desktop, touch: true, coarsePointer: true })).toBe('mobile');
  });
  it('a touch laptop with a fine pointer stays desktop', () => {
    expect(resolveQualityTier({ ...desktop, touch: true, coarsePointer: false })).toBe('desktop');
  });
  it('a phone-sized viewport is mobile even with a mouse', () => {
    expect(resolveQualityTier({ ...desktop, cssWidth: 390, cssHeight: 844 })).toBe('mobile');
  });
  // CHANGED 2026-10-06 (visual-foundation): this read 'a backing buffer cut by the pixel budget is mobile' and pinned the
  // bug that sent every big screen — the owner's TV included — to the phone tier. The budget caps RESOLUTION (canvasFit);
  // on a fine-pointer screen it no longer picks the tier. The one demotion it keeps is pinned below (coarse + mid-size).
  it('a backing buffer cut by the pixel budget stays desktop on a fine pointer (the budget caps resolution only)', () => {
    expect(resolveQualityTier({ ...desktop, limitedBy: 'pixel-budget' })).toBe('desktop');
  });
  it('the pixel budget still demotes a coarse pointer on a mid-size screen', () => {
    expect(resolveQualityTier({ ...desktop, coarsePointer: true, cssWidth: 1280, cssHeight: 800, limitedBy: 'pixel-budget' })).toBe('mobile');
  });
  it('?look=legacy restores the old demotion (the before/after switch)', () => {
    expect(resolveQualityTier({ ...desktop, limitedBy: 'pixel-budget', legacy: true })).toBe('mobile');
    expect(resolveQualityTier({ ...desktop, gpu: 'discrete', legacy: true })).toBe('desktop');
  });
  it('a dpr cap alone does not demote (a 3x tablet is still a big screen)', () => {
    expect(resolveQualityTier({ ...desktop, limitedBy: 'dpr' })).toBe('desktop');
  });
  it('the env override always wins, both ways', () => {
    expect(resolveQualityTier({ ...desktop, touch: true, coarsePointer: true, override: 'desktop' })).toBe('desktop');
    expect(resolveQualityTier({ ...desktop, override: 'mobile' })).toBe('mobile');
  });
  it('an unknown override is ignored', () => {
    expect(resolveQualityTier({ ...desktop, override: 'ultra' })).toBe('desktop');
  });
});

/**
 * THE DEVICES (visual-foundation, 2026-10-06). Each row is the real signal set a browser on that device reports, run
 * through the real canvas fit first — the tier is decided from `fit.limitedBy`, so the fit is part of the case.
 */
function device(o: { w: number; h: number; dpr: number; touch: boolean; coarse: boolean; renderer?: string }, extra: Partial<TierInput> = {}) {
  const fit = fitCanvas({ cssWidth: o.w, cssHeight: o.h, dpr: o.dpr });
  return { fit, ...explainQualityTier({ touch: o.touch, coarsePointer: o.coarse, cssWidth: o.w, cssHeight: o.h, limitedBy: fit.limitedBy, gpu: classifyGpu(o.renderer), ...extra }) };
}
const TV_4K = { w: 1920, h: 1080, dpr: 2, touch: false, coarse: true };              // a TV browser: remote = coarse, no touch
const PC_ON_TV = { w: 1920, h: 1080, dpr: 2, touch: false, coarse: false, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)' };
const MONITOR_1440P = { w: 2560, h: 1440, dpr: 1, touch: false, coarse: false };
const RETINA_LAPTOP = { w: 1440, h: 900, dpr: 2, touch: false, coarse: false, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' };
const PHONE = { w: 390, h: 844, dpr: 3, touch: true, coarse: true, renderer: 'Apple GPU' };
const PHONE_LANDSCAPE = { w: 844, h: 390, dpr: 3, touch: true, coarse: true, renderer: 'Adreno (TM) 740' };
const TABLET = { w: 1024, h: 1366, dpr: 2, touch: true, coarse: true, renderer: 'Apple GPU' };

describe('the device matrix', () => {
  it('a 4K TV browser is over the pixel budget, and is NOT the phone tier (the owner\'s TV)', () => {
    const d = device(TV_4K);
    expect(d.fit.limitedBy).toBe('pixel-budget');              // the case the old rule demoted
    expect(d.fit.backingWidth * d.fit.backingHeight).toBeLessThanOrEqual(2_100_000 * 1.001);   // resolution is still capped (to rounding)
    expect(d.tier).toBe('desktop');
  });
  it('a PC with a discrete GPU driving the TV is the high tier', () => {
    expect(device(PC_ON_TV).tier).toBe('high');
  });
  it('a 1440p monitor full screen is desktop, high with a discrete GPU', () => {
    expect(device(MONITOR_1440P).fit.limitedBy).toBe('pixel-budget');
    expect(device(MONITOR_1440P).tier).toBe('desktop');
    expect(device({ ...MONITOR_1440P, renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)' }).tier).toBe('high');
  });
  it('a retina laptop is desktop (its integrated GPU does not lift it to high; an M-series Max does)', () => {
    expect(device(RETINA_LAPTOP).fit.limitedBy).toBe('pixel-budget');
    expect(device(RETINA_LAPTOP).tier).toBe('desktop');
    expect(device({ ...RETINA_LAPTOP, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)' }).tier).toBe('high');
  });
  it('a phone is mobile, upright and sideways', () => {
    expect(device(PHONE).tier).toBe('mobile');
    expect(device(PHONE_LANDSCAPE).tier).toBe('mobile');
  });
  it('a touch tablet is mobile', () => {
    expect(device(TABLET).tier).toBe('mobile');
  });
  it('a phone stays mobile even if its renderer string looked discrete (touch-first decides first)', () => {
    expect(device({ ...PHONE, renderer: 'NVIDIA Tegra X1' }).tier).toBe('mobile');
  });
  it('a software renderer is never lifted to high (the cloud probes run SwiftShader)', () => {
    expect(device({ ...PC_ON_TV, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)' }).tier).toBe('desktop');
  });
});

describe('the Graphics setting and ?tier=', () => {
  it('names map to tiers; junk maps to nothing', () => {
    expect(tierFromName('performance')).toBe('mobile');
    expect(tierFromName('quality')).toBe('high');
    expect(tierFromName('high')).toBe('high');
    expect(tierFromName('auto')).toBe('auto');
    expect(tierFromName('ultra')).toBeNull();
    expect(tierFromName(null)).toBeNull();
  });
  it('Performance forces the phone tier on a desktop, Quality forces high on a laptop', () => {
    expect(device(PC_ON_TV, { choice: 'performance' }).tier).toBe('mobile');
    expect(device(RETINA_LAPTOP, { choice: 'quality' }).tier).toBe('high');
    expect(device(RETINA_LAPTOP, { choice: 'auto' }).tier).toBe('desktop');
  });
  it('?tier= beats the stored choice; the build env beats both', () => {
    expect(device(RETINA_LAPTOP, { choice: 'quality', urlTier: 'mobile' })).toMatchObject({ tier: 'mobile', source: 'url' });
    expect(device(RETINA_LAPTOP, { choice: 'quality', urlTier: 'mobile', override: 'desktop' })).toMatchObject({ tier: 'desktop', source: 'env' });
    expect(device(RETINA_LAPTOP, { urlTier: 'auto', choice: 'performance' })).toMatchObject({ tier: 'mobile', source: 'setting' });
    expect(device(RETINA_LAPTOP, { urlTier: 'nonsense' })).toMatchObject({ tier: 'desktop', source: 'auto' });
  });
});

describe('classifyGpu', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['ANGLE (AMD, AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)', 'discrete'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'integrated'],
    ['Mali-G78', 'integrated'],
    ['NVIDIA Tegra X1', 'integrated'],
    ['Google SwiftShader', 'software'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'software'],
    ['WebKit WebGL', 'unknown'],
    ['', 'unknown'],
  ] as const)('%s → %s', (r, want) => {
    expect(classifyGpu(r)).toBe(want);
  });
});

describe('tierRigSettings', () => {
  it('MSAA replaces FXAA on desktop and high; the phones keep FXAA as their only AA (A9.2)', () => {
    for (const t of ['desktop', 'high'] as const) expect(tierRigSettings(t, 'nightGame')).toMatchObject({ msaaSamples: 4, fxaa: false });
    expect(tierRigSettings('mobile', 'nightGame')).toMatchObject({ msaaSamples: 1, fxaa: true });
    expect(legacyAa(tierRigSettings('high', 'nightGame'))).toMatchObject({ msaaSamples: 1, fxaa: true });
  });
  it('high runs at least everything desktop runs', () => {
    const d = tierRigSettings('desktop', 'goldenHour'), h = tierRigSettings('high', 'goldenHour');
    expect(h.shadowMapSize).toBeGreaterThanOrEqual(d.shadowMapSize);
    expect(h.ssao && h.sharpen && h.cascaded).toBe(true);
  });
  it('mobile drops SSAO, sharpen and cascades and shrinks the shadow map', () => {
    const s = tierRigSettings('mobile', 'goldenHour');
    expect(s).toEqual({ shadowMapSize: 512, cascaded: false, sharpen: false, bloomScaleMul: 0.7, ssao: false, msaaSamples: 1, fxaa: true });
  });
  it('desktop cascades only outdoors', () => {
    expect(tierRigSettings('desktop', 'goldenHour').cascaded).toBe(true);
    expect(tierRigSettings('desktop', 'dojoWarm').cascaded).toBe(false);
    expect(tierRigSettings('desktop', 'dojoWarm').ssao).toBe(true);
  });
  it('every outdoor mood is a real mood key', () => {
    for (const m of OUTDOOR_MOODS) expect(['goldenHour', 'daylight', 'alpine', 'nightGame']).toContain(m);
  });
});
