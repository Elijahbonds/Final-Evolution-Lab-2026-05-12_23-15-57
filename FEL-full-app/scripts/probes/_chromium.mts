// Where the probes' browser lives (BIOMECH-WAVE2, 2026-09-09).
//
// Every probe in this directory hardcodes
//   ~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/...
// and that path is a MOVING TARGET: playwright's browser cache is keyed by its own build number, and anything that
// clears it (a `playwright install` on a newer version, a disk cleaner — this session watched the whole directory go
// empty between two probe runs) brings the browser back under a different number. `npx playwright install chromium`
// restored it as chromium-1243, at which point every hardcoded probe fails with "executable doesn't exist".
//
// This resolves it instead: `CHROMIUM_EXE` wins, otherwise the newest `chromium-*` in the cache. Existing probes still
// carry their literal path — pointing them here is a one-line change each, worth doing the next time one is touched.
//
// HOTFIX (2026-09-24): off this Mac too (the resolver body from 33245c6, reworked). The order is:
//   1. an env override — CHROMIUM_EXE, then CHROME_PATH, then PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH — returned as
//      given, so a wrong path fails loudly at launch instead of quietly running some other browser;
//   2. the newest `chromium-*` build in playwright's cache, trying every build layout (Chrome for Testing's
//      chrome-mac-arm64 / -mac-x64 / -linux64 / -win64, and the older chrome-mac / -linux / -win);
//   3. a system Chrome or Chromium, last.
// The cache is found by playwright-core's own rule (lib/server/registry/index.js, `registryDirectory`):
// PLAYWRIGHT_BROWSERS_PATH, where `0` means playwright-core's own `.local-browsers` and a relative path is resolved
// against INIT_CWD or the cwd; otherwise ~/Library/Caches on a Mac, XDG_CACHE_HOME or ~/.cache on Linux, LOCALAPPDATA
// on Windows, and no cache at all anywhere else (playwright throws "Unsupported platform" there).
// HOTFIX (2026-09-24): both of those names are read the way playwright-core reads them (lib/utils/env.js,
// `getFromENV`): the variable itself, then npm's `npm_config_<name>` (an .npmrc `playwright_browsers_path=` line), then
// `npm_package_config_<name>` (a package.json "config" block). Reading only the bare variable meant an .npmrc setting
// that moved playwright's browsers was ignored here, and the probes quietly took a different browser than
// `npx playwright` itself would launch.
// 33245c6 tried the system browser BEFORE the cache. This Mac has /Applications/Google Chrome.app, so every probe would
// have moved from the Chrome for Testing build it has always been measured on to the owner's everyday Chrome. The
// cache stays ahead of it, so on this Mac nothing changes.
//
// HOTFIX (2026-09-24): NEVER SWITCH BROWSERS SILENTLY. A probe's numbers are only comparable run to run on the same
// browser, so whenever the pick is not the playwright cache — any env override (CHROME_PATH and friends are also read
// by Lighthouse and Puppeteer, and may be exported for them) or the system fallback — one `[probe] browser:` line on
// stderr says which executable and why. The cache pick stays quiet: that is the normal case.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const PLAYWRIGHT_LAYOUTS = [
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-linux64/chrome',
  'chrome-linux/chrome',
  'chrome-win64/chrome.exe',
  'chrome-win/chrome.exe',
];

export const SYSTEM_EXECUTABLES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const OVERRIDES = ['CHROMIUM_EXE', 'CHROME_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] as const;

export interface ChromiumPick {
  exe: string;
  /** which rule picked it: an env var's name, the playwright cache, or the system fallback */
  source: (typeof OVERRIDES)[number] | 'playwright-cache' | 'system';
  /** the one-line reason printed when the pick is not the playwright cache */
  why?: string;
}

/** An environment to read: process.env, or a plain object in a test (Next's types make NODE_ENV required on ProcessEnv). */
export type Env = Readonly<Record<string, string | undefined>>;

export interface ResolveOptions {
  env?: Env;
  platform?: NodeJS.Platform;
  home?: string;
  /** system install paths to try when the cache is empty (tests pass their own; the default is SYSTEM_EXECUTABLES) */
  system?: string[];
}

/** playwright-core's own `.local-browsers`, which PLAYWRIGHT_BROWSERS_PATH=0 selects; null if it is not installed. */
function localBrowsersDir(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve('playwright-core/package.json')), '.local-browsers');
  } catch {
    return null;
  }
}

/** playwright-core's `getFromENV`: the variable, else npm's `npm_config_<name>`, else `npm_package_config_<name>`. An
 *  empty string counts as set (it stops the fallback), exactly as it does there. */
export function playwrightEnv(env: Env, name: string): string | undefined {
  const lower = name.toLowerCase();
  return env[name] ?? env[`npm_config_${lower}`] ?? env[`npm_package_config_${lower}`];
}

/** Where playwright keeps its browsers — playwright-core's `registryDirectory` rule, for any OS it supports; null
 *  where it has none (an unsupported platform, or `0` with playwright-core not installed). */
export function playwrightCacheDir(opts: ResolveOptions = {}): string | null {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? homedir();
  const set = playwrightEnv(env, 'PLAYWRIGHT_BROWSERS_PATH');
  if (set === '0') return localBrowsersDir();
  if (set) return isAbsolute(set) ? set : resolve(playwrightEnv(env, 'INIT_CWD') || process.cwd(), set);
  if (platform === 'linux') return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'ms-playwright');
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'ms-playwright');
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'ms-playwright');
  return null;
}

function onPath(env: Env, platform: NodeJS.Platform): string | null {
  const names = platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'];
  for (const dir of (env.PATH ?? '').split(platform === 'win32' ? ';' : ':')) {
    if (!dir) continue;
    for (const name of names) { const exe = join(dir, name); if (existsSync(exe)) return exe; }
  }
  return null;
}

/** Pure pick: which browser, and why. Throws only when there is none at all. */
export function resolveChromium(opts: ResolveOptions = {}): ChromiumPick {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;

  for (let i = 0; i < OVERRIDES.length; i++) {
    const name = OVERRIDES[i];
    const exe = env[name];
    if (!exe) continue;
    const shadowing = i > 0 ? ` (${OVERRIDES.slice(0, i).join(', ')} unset)` : '';
    const missing = existsSync(exe) ? '' : ' — THAT PATH DOES NOT EXIST, the launch will fail';
    return { exe, source: name, why: `${name} is set${shadowing}, so the playwright cache is not used${missing}` };
  }

  const cache = playwrightCacheDir(opts);
  const listing = cache && existsSync(cache) ? readdirSync(cache) : null;
  const builds = (listing ?? [])
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));   // newest build first
  for (const b of builds) {
    for (const layout of PLAYWRIGHT_LAYOUTS) {
      const exe = join(cache as string, b, layout);
      if (existsSync(exe)) return { exe, source: 'playwright-cache' };
    }
  }

  const where = cache ?? (playwrightEnv(env, 'PLAYWRIGHT_BROWSERS_PATH') === '0'
    ? 'playwright-core/.local-browsers (playwright-core is not installed)'
    : `a playwright cache (playwright has none on ${platform})`);
  const found = listing ? listing.join(', ') || 'nothing' : 'no such directory';
  const system = (opts.system ?? SYSTEM_EXECUTABLES).find((p) => existsSync(p)) ?? onPath(env, platform);
  if (system) {
    return {
      exe: system,
      source: 'system',
      why: `no playwright chromium in ${where} (found: ${found}), so this is the SYSTEM browser — numbers may not `
        + 'match runs on Chrome for Testing. Run `npx playwright install chromium` to go back to it',
    };
  }
  throw new Error(`[probe] no chromium in ${where} (found: ${found}) and none installed on the system — set CHROMIUM_EXE, or run: npx playwright install chromium`);
}

const announced = new Set<string>();

/** The probes' entry point: the executable to hand to `chromium.launch({ executablePath })`. */
export function chromiumExe(): string {
  const pick = resolveChromium();
  if (pick.why && !announced.has(pick.exe)) {
    announced.add(pick.exe);
    console.warn(`[probe] browser: ${pick.exe} — ${pick.why}`);
  }
  return pick.exe;
}
