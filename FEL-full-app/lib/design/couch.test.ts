// The couch view (A11-05): the menus zoom like the HUD, only on a big sideways screen, only when asked or driven by a pad.
import { describe, expect, it } from 'vitest';
import { bigSideways, couchLayout, couchOn, couchVars, COUCH_PREFS, isCouchPref, PAGE_COLUMN_PX } from './couch';
import { HUD_ZOOM_MAX, TV_SAFE, consoleLayout } from '@/lib/ui/consoleView';
import { TV_MIN_READ_PX } from '@/components/games/tv-hud/tokens';

describe('when', () => {
  it('auto: on a TV driven by a pad or a remote; never a phone, never a laptop driven by a mouse or Tab', () => {
    expect(couchOn('auto', true, 1920, 1080)).toBe(true);
    expect(couchOn('auto', false, 1920, 1080)).toBe(false);
    expect(couchOn('auto', true, 844, 390)).toBe(false);    // a phone held sideways
    expect(couchOn('auto', true, 390, 844)).toBe(false);    // a phone
    expect(couchOn('auto', true, 1024, 900)).toBe(false);   // a near-square tablet is not sideways (consoleView's rule)
  });
  it('on forces it on any big sideways screen; off never', () => {
    expect(couchOn('on', false, 1280, 720)).toBe(true);
    expect(couchOn('on', false, 390, 844)).toBe(false);
    expect(couchOn('off', true, 1920, 1080)).toBe(false);
    expect(COUCH_PREFS).toEqual(['auto', 'on', 'off']);
    expect(isCouchPref('on')).toBe(true);
    expect(isCouchPref('tv')).toBe(false);
    expect(bigSideways(1280, 599)).toBe(false);
  });
});

describe('how big', () => {
  it('the column zooms exactly as the HUD does (consoleView), 2.25x at 1080p', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [3840, 2160]]) expect(couchLayout(w, h).zoom).toBe(consoleLayout(w, h).hudZoom);
    expect(couchLayout(1920, 1080).zoom).toBe(HUD_ZOOM_MAX);
  });
  it('the 11 px floor the menus keep draws past the 10-foot floor at 1080p', () => {
    expect(11 * couchLayout(1920, 1080).zoom).toBeGreaterThanOrEqual(TV_MIN_READ_PX);
  });
  it('zoomed, the column fits inside the title-safe frame: no sideways scroll', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]]) {
      const l = couchLayout(w, h);
      expect(l.columnPx * l.zoom).toBeLessThanOrEqual(w * (1 - 2 * TV_SAFE.x) + 1);
      expect(l.columnPx).toBeLessThanOrEqual(PAGE_COLUMN_PX);
    }
    expect(couchVars(couchLayout(1920, 1080))).toEqual({ '--fel-couch-zoom': '2.25', '--fel-couch-col': '768px' });
  });
});
