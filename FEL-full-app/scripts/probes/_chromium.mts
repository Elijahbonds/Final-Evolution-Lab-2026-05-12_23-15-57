// Where the probes' browser lives (BIOMECH-WAVE2, 2026-09-09).
//
// Browser QA runs on developer laptops, CI/Linux agents, and ad-hoc Cloud VMs.
// A fixed Playwright cache path is a moving target, so resolve overrides first,
// then common system installs, then the newest Playwright-managed Chromium.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PLAYWRIGHT_RELATIVE_EXECUTABLES = [
  'chrome-linux/chrome',
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-win/chrome.exe',
];

const SYSTEM_EXECUTABLES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function firstExisting(paths: Array<string | undefined>): string | null {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function executableFromPath(): string | null {
  const pathEntries = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':');
  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'];
  for (const dir of pathEntries) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function chromiumExe(): string {
  const override = firstExisting([
    process.env.CHROMIUM_EXE,
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ]);
  if (override) return override;

  const system = firstExisting(SYSTEM_EXECUTABLES) ?? executableFromPath();
  if (system) return system;

  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) {
    throw new Error(
      `[probe] no Chromium executable found. Set CHROMIUM_EXE or CHROME_PATH, install a system Chromium/Chrome, or run: npx playwright install chromium`,
    );
  }
  const builds = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));   // newest build first
  for (const build of builds) {
    const exe = firstExisting(PLAYWRIGHT_RELATIVE_EXECUTABLES.map((relative) => join(cache, build, relative)));
    if (exe) return exe;
  }
  throw new Error(
    `[probe] no Chromium executable in ${cache} (found: ${readdirSync(cache).join(', ') || 'nothing'}). Set CHROMIUM_EXE/CHROME_PATH or run: npx playwright install chromium`,
  );
}
