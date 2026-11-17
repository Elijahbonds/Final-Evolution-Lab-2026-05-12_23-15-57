// hoops-audit-show (2026-11-12): build the probe pages into one site folder.
//   npx tsx scripts/probes/hoops-audit/show/build.mts <siteDir>            (run it through /home/user/wt/cpu-run.sh: Tailwind + two bundles)
// Writes:
//   <site>/host/index.html  — the real hoops screens (GameShell + the mode's host: ./host-entry.tsx), production React, the app's CSS
//                             and fonts (scripts/a11y/rig.mts buildRig);
//   <site>/fonts/*.woff2    — the app's font files (the host page loads them over http);
//   <site>/mode.html/.js    — the bare mode (scripts/probes/hoops-gap/entry.mjs: runMode, no React), production, for _perf-sweep's PAGE=.
// Serve it with scripts/probes/hoops-gap/serve.mjs <site> <port> (anything not in <site> comes from public/).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const site = process.argv[2];
if (!site) { console.error('usage: build.mts <siteDir>'); process.exit(2); }
fs.mkdirSync(path.join(site, 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'app/fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(ROOT, 'app/fonts', f), path.join(site, 'fonts', f));
if (!process.env.SKIP_HOST) {
  const { buildRig } = await import('../../../a11y/rig.mts');
  await buildRig(path.join(site, 'host'), { entry: path.join(import.meta.dirname, 'host-entry.tsx'), fontBase: '/fonts', prodFonts: true, external: ['@mediapipe/tasks-vision'], nodeEnv: 'production' });
  console.log('[show] host page built', path.join(site, 'host'));
}
if (!process.env.SKIP_MODE) {
  execFileSync('node', [path.join(ROOT, 'scripts/probes/hoops-gap/build.mjs'), site, 'mode'], { cwd: ROOT, stdio: 'inherit' });
}
