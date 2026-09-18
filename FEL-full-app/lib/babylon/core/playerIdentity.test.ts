// Ship pass 4, phase 9 — the skin maps follow the quality tier.
//
// Contract addendum (docs/CONTRACTS-PASS4-RUN.md, contracts 1 + 2): the shipped
// skin set is `public/models/skins/<key>.jpg` at 2048²; the mobile set is
// `<key>-1024.jpg`. `skinMapUrl(url, tier)` is the pure function that picks
// between them — unchanged on desktop, `.jpg` → `-1024.jpg` on mobile — and it
// is what applySkinMap hands to `new Texture(...)`.
//
// Written before the perf lane exports skinMapUrl from ./playerIdentity, so this
// file fails to compile until that lands. That is the point: the test is the
// contract the implementation has to meet, not a description of what it did.
//
// Pure function only — no NullEngine, no scene — so it runs in plain node.
import { describe, expect, it } from 'vitest';
import { skinMapUrl } from './playerIdentity';
import { SKIN_DETAIL_NORMAL, SKIN_LIBRARY } from './skinLibrary';

describe('skinMapUrl', () => {
  it('returns the url unchanged on the desktop tier', () => {
    expect(skinMapUrl('/models/skins/medium-male.jpg', 'desktop')).toBe('/models/skins/medium-male.jpg');
    expect(skinMapUrl('/models/skins/detail-normal.jpg', 'desktop')).toBe('/models/skins/detail-normal.jpg');
  });

  it('replaces a trailing .jpg with -1024.jpg on the mobile tier', () => {
    expect(skinMapUrl('/models/skins/medium-male.jpg', 'mobile')).toBe('/models/skins/medium-male-1024.jpg');
    expect(skinMapUrl('/models/skins/detail-normal.jpg', 'mobile')).toBe('/models/skins/detail-normal-1024.jpg');
  });

  it('only rewrites the file extension, never a .jpg inside the path', () => {
    // a directory that happens to be called ".jpg" (or a key containing it) is not the extension
    expect(skinMapUrl('/models/skins.jpg/medium-male.jpg', 'mobile')).toBe('/models/skins.jpg/medium-male-1024.jpg');
  });

  it('leaves urls that are not .jpg alone on mobile (there is no 1024 set for them)', () => {
    expect(skinMapUrl('/models/skins/medium-male.png', 'mobile')).toBe('/models/skins/medium-male.png');
    expect(skinMapUrl('/models/skins/medium-male.webp', 'mobile')).toBe('/models/skins/medium-male.webp');
  });

  it('is idempotent: a url already on the mobile set is not rewritten twice', () => {
    expect(skinMapUrl('/models/skins/medium-male-1024.jpg', 'mobile')).toBe('/models/skins/medium-male-1024.jpg');
  });

  it('maps every shipped skin entry and the detail normal onto the mobile set', () => {
    // skinLibrary describes the base (2048²) set only — contract 2. Every
    // albedo in it, and the shared detail normal, must resolve to a `-1024.jpg`.
    const base = [...SKIN_LIBRARY.map((e) => e.albedo), SKIN_DETAIL_NORMAL];
    expect(base.length).toBeGreaterThan(0);
    for (const url of base) {
      expect(url.endsWith('.jpg'), `${url} is a .jpg in the base set`).toBe(true);
      const mobile = skinMapUrl(url, 'mobile');
      expect(mobile).toBe(url.replace(/\.jpg$/, '-1024.jpg'));
      expect(skinMapUrl(url, 'desktop')).toBe(url);
    }
  });
});
