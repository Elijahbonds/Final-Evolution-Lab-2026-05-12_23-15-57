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
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAC = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

export function chromiumExe(): string {
  const env = process.env.CHROMIUM_EXE;
  if (env) return env;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) throw new Error(`[probe] no playwright cache at ${cache} — run: npx playwright install chromium`);
  const builds = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));   // newest build first
  for (const b of builds) { const exe = join(cache, b, MAC); if (existsSync(exe)) return exe; }
  throw new Error(`[probe] no chromium in ${cache} (found: ${readdirSync(cache).join(', ') || 'nothing'}) — run: npx playwright install chromium`);
}
