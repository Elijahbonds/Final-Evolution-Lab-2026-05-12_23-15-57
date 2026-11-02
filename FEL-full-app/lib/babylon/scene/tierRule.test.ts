// DEMO-SPEED-3 (2026-10-28): the small embedded 3D views (the library stage, the profile, the Closet) take the SCREEN's tier
// (deviceTierDecision), never their own box's. A desktop's Closet stage box (here 900 × 640) read as a "phone-sized viewport"
// under the box rule and got the phone files and shading; the screen it sits on says desktop.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoTier, deviceTierDecision } from './tierRule';

function screen(w: number, h: number, touch: boolean, dpr = 1): void {
  vi.stubGlobal('navigator', { maxTouchPoints: touch ? 5 : 0 });
  vi.stubGlobal('window', { innerWidth: w, innerHeight: h, devicePixelRatio: dpr, matchMedia: (q: string) => ({ matches: touch && q.includes('coarse') }), location: { search: '' }, localStorage: { getItem: () => null } });
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('deviceTierDecision: the screen decides, not the canvas', () => {
  it('a desktop screen is desktop even where a box on it would read as a phone (the control: the box rule says mobile)', () => {
    expect(autoTier({ touch: false, coarsePointer: false, cssWidth: 900, cssHeight: 640, limitedBy: null }).tier).toBe('mobile');
    screen(1440, 900, false, 2);
    expect(deviceTierDecision().tier).toBe('desktop');
  });
  it('a phone is mobile; a touch-first tablet is mobile; no window is desktop', () => {
    screen(390, 844, true, 3);
    expect(deviceTierDecision().tier).toBe('mobile');
    screen(1024, 1366, true, 2);
    expect(deviceTierDecision().tier).toBe('mobile');
    vi.unstubAllGlobals();
    expect(deviceTierDecision()).toMatchObject({ tier: 'desktop', why: 'no window' });
  });
});
