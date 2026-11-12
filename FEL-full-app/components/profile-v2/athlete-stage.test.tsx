import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AthleteStage } from './athlete-stage';

// PROFILE-CHARACTER (owner 2026-10-27: "Make the profile show your actual character, not some stick figure").
const html = (p: Parameters<typeof AthleteStage>[0]) => renderToStaticMarkup(createElement(AthleteStage, p));
const src = (f: string) => readFileSync(join(__dirname, f), 'utf8');

describe('the athlete stage', () => {
  it('your own profile: no button to press, and the first paint is the athlete’s shape loading, never the stick figure', () => {
    const h = html({ name: 'Jordan', accent: '#00E5FF', poster: { owner: 'k', stamp: 's' } });
    expect(h).toContain('data-athlete-state="loading"');
    expect(h).toContain('data-athlete-silhouette');
    expect(h).toContain('role="status"');            // the kit's skeleton group: "Loading", once
    expect(h).not.toMatch(/<button/);
    expect(h).not.toMatch(/See in 3D|Close 3D/);
  });

  it('someone else’s profile: a still silhouette, never the visitor’s own 3D body and never a picture', () => {
    const h = html({ name: 'Jordan', accent: '#00E5FF', viewer: true, poster: { owner: 'k', stamp: 's' } });
    expect(h).toContain('data-athlete-state="viewer"');
    expect(h).toContain('aria-label="Jordan&#x27;s athlete"');
    expect(h).not.toMatch(/<canvas|<img|role="status"/);
  });

  it('the stick figure is gone from the profile stage', () => {
    for (const f of ['athlete-stage.tsx', 'athlete-silhouette.tsx', 'progress-header.tsx']) {
      expect(src(f), f).not.toMatch(/AvatarFigure|avatar-figure/);
    }
  });

  it('opens by itself (the demos’ autoplay hook) and only after the first paint, on idle', () => {
    const s = src('athlete-stage.tsx');
    expect(s).toContain("useAutoOpen");
    expect(s).toMatch(/requestIdleCallback/);
    expect(s).toMatch(/dynamic\(\(\) => import\('\.\/athlete-3d'\), \{ ssr: false/);   // its own lazy chunk
  });

  it('phone care in the 3D: DPR capped at 2, the loop stops off-screen and hidden, disposed on unmount, the page still scrolls', () => {
    const s = src('athlete-3d.tsx');
    expect(s).toMatch(/Math\.min\(2, window\.devicePixelRatio/);
    expect(s).toMatch(/IntersectionObserver/);
    expect(s).toMatch(/visibilitychange/);
    expect(s).toMatch(/engine\.dispose\(\)/);
    expect(s).toMatch(/touchAction: 'pan-y'/);
    expect(s).toMatch(/reducedMotion\(\)/);
    expect(s).toMatch(/atBindPose/);   // never a T-pose, never a T-pose picture
  });

  it('spawns in the library’s lazy clip scope (an unscoped scene built every sport’s clips: 11 of 14 s on the rig), not a standard-frame mode', async () => {
    expect(src('athlete-3d.tsx')).toMatch(/felModeId = 'library'/);
    const { scopeForMode } = await import('@/lib/babylon/anim/clipScope');
    const { isStandardFrame } = await import('@/lib/babylon/core/playFrame');
    expect(scopeForMode('library')?.lazy).toBe(true);
    expect(isStandardFrame({ modeId: 'library' })).toBe(false);   // the player's own height and build still show
  });

  it('a phone gets the phone body: the scene carries the tier CharacterLibrary reads, decided on the screen, not the small canvas', async () => {
    const s = src('athlete-3d.tsx');
    expect(s).toMatch(/scene\.metadata\.felTier = detectRenderTier\(\{ clientWidth: window\.innerWidth, clientHeight: window\.innerHeight \}/);
    const { autoTier } = await import('@/lib/babylon/scene/QualityTier');
    const phone = autoTier({ touch: true, coarsePointer: true, cssWidth: 390, cssHeight: 844, limitedBy: null, gpu: 'unknown', legacy: false } as Parameters<typeof autoTier>[0]);
    const laptop = autoTier({ touch: false, coarsePointer: false, cssWidth: 1440, cssHeight: 900, limitedBy: null, gpu: 'unknown', legacy: false } as Parameters<typeof autoTier>[0]);
    const stageCanvas = autoTier({ touch: false, coarsePointer: false, cssWidth: 520, cssHeight: 300, limitedBy: null, gpu: 'unknown', legacy: false } as Parameters<typeof autoTier>[0]);
    expect([phone.tier, laptop.tier, stageCanvas.tier]).toEqual(['mobile', 'desktop', 'mobile']);   // why the canvas is not asked
  });
});
