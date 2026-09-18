import { describe, expect, it } from 'vitest';
import { OUTDOOR_MOODS, resolveQualityTier, tierRigSettings } from './QualityTier';

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
  it('a backing buffer cut by the pixel budget is mobile', () => {
    expect(resolveQualityTier({ ...desktop, limitedBy: 'pixel-budget' })).toBe('mobile');
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

describe('tierRigSettings', () => {
  it('mobile drops SSAO, sharpen and cascades and shrinks the shadow map', () => {
    const s = tierRigSettings('mobile', 'goldenHour');
    expect(s).toEqual({ shadowMapSize: 512, cascaded: false, sharpen: false, bloomScaleMul: 0.7, ssao: false });
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
