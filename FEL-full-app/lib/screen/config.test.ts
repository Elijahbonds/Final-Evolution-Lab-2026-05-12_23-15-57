// The two build-time switches (SCREEN-SHIP gate 6, A3-5): the game button's route and the future sign-up flag.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SCREEN_NEXT_ROUTE, programSignupEnabled, screenNextRoute } from './config';

describe('NEXT_PUBLIC_SCREEN_NEXT_ROUTE', () => {
  it('unset or empty → the Brain Brawl route, which exists in the app', () => {
    expect(DEFAULT_SCREEN_NEXT_ROUTE).toBe('/play/brain-brawl');
    expect(readFileSync(join(__dirname, '../../app/play/brain-brawl/page.tsx'), 'utf8')).toMatch(/export default/);
    expect(screenNextRoute(undefined)).toBe('/play/brain-brawl');
    expect(screenNextRoute('')).toBe('/play/brain-brawl');
    expect(screenNextRoute('   ')).toBe('/play/brain-brawl');
  });
  it('a same-origin path overrides it', () => {
    expect(screenNextRoute('/try')).toBe('/try');
    expect(screenNextRoute('/play/brain-brawl?src=screen')).toBe('/play/brain-brawl?src=screen');
  });
  it('anything that could leave the site falls back to the default', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'play/brain-brawl', 'http:/x', '/a b', 'mailto:x@y']) {
      expect(screenNextRoute(bad), bad).toBe('/play/brain-brawl');
    }
  });
});

describe('NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED', () => {
  it('off unless exactly "true"', () => {
    for (const v of [undefined, '', 'false', '1', 'TRUE', 'yes']) expect(programSignupEnabled(v), String(v)).toBe(false);
    expect(programSignupEnabled('true')).toBe(true);
  });
  it('its read site carries the A3-5 and A4-7 notes', () => {
    const src = readFileSync(join(__dirname, 'config.ts'), 'utf8');
    expect(src).toMatch(/only enabled after Cyber hardening[\s*]+steps 1–2 land/);
    expect(src).toMatch(/only the PARENT's email is collected/);
  });
});
