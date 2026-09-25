import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { chromiumExe, playwrightCacheDir, playwrightEnv, resolveChromium } from '../../scripts/probes/_chromium.mts';

// HOTFIX (2026-09-24): the probes' browser resolver. Pinned here: it prefers playwright's Chrome for Testing over a
// system Chrome, finds playwright's cache by playwright's own rule on every OS, and never switches browsers silently —
// an env override or the system fallback always says which executable it picked and why. Everything runs against a
// throwaway cache directory, so the answers do not depend on what this machine has installed.

let tmp: string;
const touch = (p: string) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, ''); return p; };

beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'fel-chromium-')); });
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

/** an env with nothing set but the cache, and an empty PATH so no system browser is found by accident */
const envWith = (extra: Record<string, string> = {}) => ({ PATH: '', ...extra });

describe('the playwright cache', () => {
  it('picks the newest chromium build, in whichever layout it was installed, and says nothing', () => {
    const cache = join(tmp, 'cache-a');
    touch(join(cache, 'chromium-1100/chrome-linux/chrome'));
    const newest = touch(join(cache, 'chromium-1200/chrome-linux64/chrome'));
    touch(join(cache, 'chromium_headless_shell-1300/chrome-linux/headless_shell'));   // not a chromium-N build
    mkdirSync(join(cache, 'chromium-1300'), { recursive: true });                      // an empty (half-installed) build
    const pick = resolveChromium({ env: envWith({ PLAYWRIGHT_BROWSERS_PATH: cache }), system: [] });
    expect(pick).toEqual({ exe: newest, source: 'playwright-cache' });
  });

  it('beats a system Chrome that is also installed', () => {
    const cache = join(tmp, 'cache-b');
    const cft = touch(join(cache, 'chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    const everyday = touch(join(tmp, 'system-b/Google Chrome'));
    const pick = resolveChromium({ env: envWith({ PLAYWRIGHT_BROWSERS_PATH: cache }), system: [everyday] });
    expect(pick.exe).toBe(cft);
    expect(pick.source).toBe('playwright-cache');
  });

  it('is found where playwright-core itself looks, on every OS', () => {
    const home = '/home/fel';
    expect(playwrightCacheDir({ env: {}, platform: 'darwin', home })).toBe('/home/fel/Library/Caches/ms-playwright');
    expect(playwrightCacheDir({ env: {}, platform: 'linux', home })).toBe('/home/fel/.cache/ms-playwright');
    expect(playwrightCacheDir({ env: { XDG_CACHE_HOME: '/xdg' }, platform: 'linux', home })).toBe('/xdg/ms-playwright');
    expect(playwrightCacheDir({ env: { LOCALAPPDATA: 'C:/Users/fel/AppData/Local' }, platform: 'win32', home }))
      .toBe(join('C:/Users/fel/AppData/Local', 'ms-playwright'));
    expect(playwrightCacheDir({ env: { PLAYWRIGHT_BROWSERS_PATH: '/abs/browsers' }, platform: 'linux', home })).toBe('/abs/browsers');
  });

  it('PLAYWRIGHT_BROWSERS_PATH=0 means playwright-core\'s own .local-browsers, not the user cache', () => {
    const require = createRequire(import.meta.url);
    const expected = join(dirname(require.resolve('playwright-core/package.json')), '.local-browsers');
    expect(playwrightCacheDir({ env: { PLAYWRIGHT_BROWSERS_PATH: '0' } })).toBe(expected);
  });

  it('a relative PLAYWRIGHT_BROWSERS_PATH is resolved against INIT_CWD, as playwright resolves it', () => {
    expect(playwrightCacheDir({ env: { PLAYWRIGHT_BROWSERS_PATH: 'pw-browsers', INIT_CWD: '/repo' } })).toBe('/repo/pw-browsers');
  });

  // HOTFIX (2026-09-24): playwright-core reads its settings through getFromENV, which falls back to npm's config
  // variables. An .npmrc `playwright_browsers_path=` moved playwright's browsers while the resolver kept looking in
  // ~/Library/Caches — the probes and `npx playwright` disagreed about which browser was installed.
  it('reads PLAYWRIGHT_BROWSERS_PATH through npm config too, in playwright-core\'s order', () => {
    const home = '/home/fel';
    expect(playwrightCacheDir({ env: { npm_config_playwright_browsers_path: '/npmrc/browsers' }, platform: 'darwin', home }))
      .toBe('/npmrc/browsers');
    expect(playwrightCacheDir({ env: { npm_package_config_playwright_browsers_path: '/pkg/browsers' }, platform: 'darwin', home }))
      .toBe('/pkg/browsers');
    // the bare variable wins over both, and npm_config over the package.json config block
    expect(playwrightEnv({ PLAYWRIGHT_BROWSERS_PATH: '/a', npm_config_playwright_browsers_path: '/b' }, 'PLAYWRIGHT_BROWSERS_PATH')).toBe('/a');
    expect(playwrightEnv({ npm_config_playwright_browsers_path: '/b', npm_package_config_playwright_browsers_path: '/c' }, 'PLAYWRIGHT_BROWSERS_PATH')).toBe('/b');
    // an empty variable is SET for playwright (it stops the fallback) and then means "the default cache"
    expect(playwrightCacheDir({ env: { PLAYWRIGHT_BROWSERS_PATH: '', npm_config_playwright_browsers_path: '/b' }, platform: 'darwin', home }))
      .toBe('/home/fel/Library/Caches/ms-playwright');
    // INIT_CWD is read the same way
    expect(playwrightCacheDir({ env: { PLAYWRIGHT_BROWSERS_PATH: 'rel', npm_config_init_cwd: '/npm-root' } })).toBe('/npm-root/rel');
  });

  it('an npm-config cache is where the browser is actually found', () => {
    const cache = join(tmp, 'cache-npmrc');
    const cft = touch(join(cache, 'chromium-1250/chrome-linux64/chrome'));
    const pick = resolveChromium({ env: envWith({ npm_config_playwright_browsers_path: cache }), system: [] });
    expect(pick).toEqual({ exe: cft, source: 'playwright-cache' });
  });

  it('has no cache on a platform playwright does not support, rather than guessing the Mac one', () => {
    expect(playwrightCacheDir({ env: {}, platform: 'freebsd', home: '/home/fel' })).toBeNull();
    expect(() => resolveChromium({ env: envWith(), platform: 'freebsd', home: '/home/fel', system: [] }))
      .toThrow(/playwright has none on freebsd/);
  });
});

describe('env overrides', () => {
  it('CHROMIUM_EXE wins, and the pick says so', () => {
    const exe = touch(join(tmp, 'override/chrome'));
    const pick = resolveChromium({ env: envWith({ CHROMIUM_EXE: exe, CHROME_PATH: '/elsewhere/chrome' }), system: [] });
    expect(pick.exe).toBe(exe);
    expect(pick.source).toBe('CHROMIUM_EXE');
    expect(pick.why).toMatch(/CHROMIUM_EXE is set/);
  });

  it('CHROME_PATH (also read by Lighthouse and Puppeteer) is honoured, but never quietly', () => {
    const exe = touch(join(tmp, 'lighthouse/chrome'));
    const pick = resolveChromium({ env: envWith({ CHROME_PATH: exe }), system: [] });
    expect(pick).toMatchObject({ exe, source: 'CHROME_PATH' });
    expect(pick.why).toMatch(/CHROME_PATH is set \(CHROMIUM_EXE unset\)/);
  });

  it('a wrong override is returned as given (the launch fails loudly) and flagged', () => {
    const pick = resolveChromium({ env: envWith({ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/nope/chrome' }), system: [] });
    expect(pick.exe).toBe('/nope/chrome');
    expect(pick.why).toMatch(/DOES NOT EXIST/);
  });
});

describe('the system fallback', () => {
  it('is used only when the cache has no chromium, and says why and how to get back', () => {
    const cache = join(tmp, 'cache-empty');
    mkdirSync(cache, { recursive: true });
    const everyday = touch(join(tmp, 'system-c/Google Chrome'));
    const pick = resolveChromium({ env: envWith({ PLAYWRIGHT_BROWSERS_PATH: cache }), system: [everyday] });
    expect(pick.exe).toBe(everyday);
    expect(pick.source).toBe('system');
    expect(pick.why).toContain(cache);
    expect(pick.why).toMatch(/SYSTEM browser/);
    expect(pick.why).toMatch(/npx playwright install chromium/);
  });

  it('with no browser anywhere, it throws rather than guess', () => {
    const missing = join(tmp, 'no-such-cache');
    expect(() => resolveChromium({ env: envWith({ PLAYWRIGHT_BROWSERS_PATH: missing }), system: [] }))
      .toThrow(/no chromium in .*no-such-cache.*no such directory/);
  });
});

describe('chromiumExe()', () => {
  it('prints one `[probe] browser:` line for an override, once per executable', () => {
    const exe = touch(join(tmp, 'announce/chrome'));
    vi.stubEnv('CHROMIUM_EXE', exe);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(chromiumExe()).toBe(exe);
    expect(chromiumExe()).toBe(exe);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(new RegExp(`^\\[probe\\] browser: ${exe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — CHROMIUM_EXE is set`));
  });

  it('stays quiet for the normal case, the playwright cache', () => {
    const cache = join(tmp, 'cache-quiet');
    const cft = touch(join(cache, 'chromium-1300/chrome-linux64/chrome'));
    for (const name of ['CHROMIUM_EXE', 'CHROME_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']) vi.stubEnv(name, '');
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', cache);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(chromiumExe()).toBe(cft);
    expect(warn).not.toHaveBeenCalled();
  });
});
