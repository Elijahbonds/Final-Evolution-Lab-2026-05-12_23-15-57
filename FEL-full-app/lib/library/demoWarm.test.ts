// DEMO-SPEED (2026-10-27): the demo's early start fetches the file the spawn will load, asks the server once, and stays
// Babylon-free (the drill surfaces' import graph; lib/assess/replay.test.ts walks it from the Quick Screen too).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoBodyUrl, resetDemoWarm, warmDemoBody, warmedBodyUrl } from './demoWarm';
import { readHeroBodyEarly, takeHeroBodyRead } from '@/lib/babylon/core/heroBodyRead';
import { KIT_BODY_URL, SCAN_BODY_MOBILE_URL, SCAN_BODY_URL } from '@/lib/babylon/core/heroBody';
import { autoTier, explainQualityTier } from '@/lib/babylon/scene/tierRule';
import * as QualityTier from '@/lib/babylon/scene/QualityTier';

afterEach(() => {
  vi.stubGlobal('fetch', async () => new Response(null, { status: 401 }));
  void takeHeroBodyRead();   // drop any early read this test left
  resetDemoWarm();
  vi.unstubAllGlobals();
});

describe('the demo body the early start fetches', () => {
  it('is the file CharacterLibrary spawns: the scan\'s phone file on a phone, every other body as it is', () => {
    expect(demoBodyUrl('scan', 'mobile')).toBe(SCAN_BODY_MOBILE_URL);
    expect(demoBodyUrl('scan', 'desktop')).toBe(SCAN_BODY_URL);
    expect(demoBodyUrl('scan', 'high')).toBe(SCAN_BODY_URL);
    expect(demoBodyUrl('kit-female', 'mobile')).toBe(KIT_BODY_URL.female);
    expect(demoBodyUrl('kit-male', 'mobile')).toBe(KIT_BODY_URL.male);
    expect(demoBodyUrl(null, 'mobile')).toBe(KIT_BODY_URL.male);   // a guest
  });

  it('fetches the server\'s body once, and hands the hero-body answer to the spawn\'s identity read', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return u === '/api/v1/hero-body' ? Response.json({ body: 'scan' }) : new Response(new Uint8Array(8)); }));
    await Promise.all([warmDemoBody(), warmDemoBody()]);
    expect(warmedBodyUrl()).toBe(SCAN_BODY_URL);   // no window here: the desktop tier (deviceTierDecision's SSR answer)
    expect(calls).toEqual(['/api/v1/hero-body', SCAN_BODY_URL]);
    expect(await takeHeroBodyRead()).toEqual({ body: 'scan' });   // the identity read takes the early answer…
    expect(calls).toHaveLength(2);
    await takeHeroBodyRead();                                        // …once: the next read is its own
    expect(calls).toHaveLength(3);
  });

  it('a device that fetched the file before does not fetch it again (a warm visit); a new body is fetched', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
    const calls: string[] = [];
    let body = 'kit-female';
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return u === '/api/v1/hero-body' ? Response.json({ body }) : new Response(new Uint8Array(8)); }));
    await warmDemoBody();
    expect(calls).toEqual(['/api/v1/hero-body', KIT_BODY_URL.female]);
    resetDemoWarm(); void takeHeroBodyRead(); calls.length = 0;
    await warmDemoBody();                                   // the next visit: remembered, nothing fetched but the answer
    expect(calls).toEqual(['/api/v1/hero-body']);
    resetDemoWarm(); void takeHeroBodyRead(); calls.length = 0; body = 'kit-male';
    await warmDemoBody();                                   // the player changed body: that file is fetched
    expect(calls).toEqual(['/api/v1/hero-body', KIT_BODY_URL.male]);
  });

  it('storage that throws (a private window) only means the file is fetched again', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u === '/api/v1/hero-body' ? Response.json({ body: 'scan' }) : new Response(new Uint8Array(8)))));
    await expect(warmDemoBody()).resolves.toBeUndefined();
    expect(warmedBodyUrl()).toBe(SCAN_BODY_URL);
  });

  it('a failed warm-up never throws (the spawn then fetches the file itself)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(warmDemoBody()).resolves.toBeUndefined();
  });

  it('an early hero-body read older than 30 s is not handed on', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return Response.json({ body: 'kit-female' }); }));
    void readHeroBodyEarly(1_000);
    await takeHeroBodyRead(1_000 + 31_000);
    expect(calls).toHaveLength(2);
  });
});

describe('the tier rule has one home', () => {
  it('QualityTier re-exports tierRule\'s policy (its callers are unchanged)', () => {
    expect(QualityTier.explainQualityTier).toBe(explainQualityTier);
    expect(QualityTier.autoTier).toBe(autoTier);
  });
  it('the early-start modules never import Babylon', () => {
    for (const f of ['lib/library/demoWarm.ts', 'lib/babylon/core/heroBodyRead.ts', 'lib/babylon/scene/tierRule.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^import[^\n]*from\s+['"]@babylonjs\//m);
      expect(src, f).not.toMatch(/^import\s+(?!type\b)[^\n;]*from\s+['"][^'"]*(QualityTier|CharacterLibrary|playerIdentity)['"]/m);
    }
  });
});
