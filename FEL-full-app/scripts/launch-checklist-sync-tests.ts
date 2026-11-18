import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const checklist = read('docs/LAUNCH-CHECKLIST.md');
const layout = read('app/layout.tsx');
const manifest = read('lib/pwa/manifest.ts');
const manifestRoute = read('app/app.webmanifest/route.ts');
const sw = read('lib/pwa/sw.ts');
const swRegister = read('components/pwa/sw-register.tsx');
const perfStats = read('lib/babylon/core/perfStats.ts');
const diag = read('lib/babylon/core/diag.ts');
const analyticsAnon = read('lib/analyticsAnon.ts');
const modeHarness = read('lib/babylon/core/ModeHarness.ts');

function mustInclude(haystack: string, needle: string, message: string): void {
  assert.ok(haystack.includes(needle), message);
}

for (const path of [
  'app/app.webmanifest/route.ts',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-maskable-512.png',
  'public/icons/apple-touch-icon.png',
  'public/sw.js',
  'public/offline.html',
]) {
  assert.ok(existsSync(join(ROOT, path)), `launch checklist artifact missing: ${path}`);
}

mustInclude(manifest, "export const MANIFEST_HREF = '/app.webmanifest'", 'PWA manifest href must stay canonical');
mustInclude(manifestRoute, 'FEL_MANIFEST', 'manifest route must serve the shared manifest object');
mustInclude(layout, '<link rel="manifest" href={MANIFEST_HREF}', 'root layout must link the manifest once');
mustInclude(layout, '<link rel="apple-touch-icon" href={APPLE_TOUCH_ICON_HREF}', 'root layout must link the iOS icon');
mustInclude(layout, 'appleWebApp', 'root metadata must carry iOS standalone tags');
mustInclude(layout, 'export const viewport', 'root layout must export an explicit viewport');
mustInclude(sw, 'NEXT_PUBLIC_SW_ENABLED', 'service worker must remain behind the public kill switch');
mustInclude(swRegister, 'killServiceWorker', 'SW-off path must unregister FEL workers and caches');

mustInclude(diag, "'fps'", 'game diagnostics must include fps');
mustInclude(diag, "'ttfp'", 'game diagnostics must include time-to-first-playable');
mustInclude(perfStats, "send('fps'", 'perfStats must send fps diagnostics');
mustInclude(perfStats, "send('ttfp'", 'perfStats must send ttfp diagnostics');
mustInclude(modeHarness, 'mountPerfStats', 'ModeHarness must mount perfStats for game sessions');
mustInclude(analyticsAnon, "new Set(['fps', 'ttfp'])", 'fps and ttfp diagnostics must be anonymous');

assert.match(checklist, /\| F2 \|[\s\S]*?\| \*\*done\*\* \|[\s\S]*app\/app\.webmanifest\/route\.ts/, 'F2 must name the current manifest route as done');
assert.match(checklist, /\| F3 \|[\s\S]*?\| \*\*done\*\* \|[\s\S]*public\/icons\/icon-192\.png/, 'F3 must name the current app icons as done');
assert.match(checklist, /\| F4 \|[\s\S]*?\| \*\*done\*\* \|[\s\S]*metadata\.appleWebApp/, 'F4 must name current iOS standalone metadata');
assert.match(checklist, /\| F6 \|[\s\S]*?NEXT_PUBLIC_SW_ENABLED/, 'F6 must explain the service-worker switch');
assert.match(checklist, /\| B4 \|[\s\S]*?8 s[\s\S]*?20 s/, 'B4 must carry the owner load budget');
assert.match(checklist, /\| B5 \|[\s\S]*?\| \*\*done\*\* \|[\s\S]*perfStats\.ts/, 'B5 must reflect shipped fps telemetry');
assert.match(checklist, /\| H5 \|[\s\S]*?\| \*\*done\*\* \|[\s\S]*perfStats\.ts/, 'H5 must reflect shipped fps diagnostics');
assert.match(checklist, /\| H6 \|[\s\S]*?\| \*\*done\*\* \|[\s\S]*ttfp/, 'H6 must reflect shipped ttfp diagnostics');

for (const stale of [
  'no manifest, no icons',
  "nothing reports a real phone's frame rate",
  'the `fps` `DiagKind` is never sent',
  'no number exists',
]) {
  assert.ok(!checklist.includes(stale), `launch checklist still contains stale blocker text: ${stale}`);
}

console.log('launch-checklist-sync-tests: PWA and perf telemetry rows match the current tree');
