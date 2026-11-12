// VENICE HUB prototype shots (lane/venice-hub, 2026-11-12). Bundles ./proto-entry.ts with esbuild (never next dev / build),
// serves it with the hoops-gap static server on this lane's port (3741), and in Chromium:
//   * three JPGs: walking up to the courts (eye height), the courts from above, the whole hub from the top;
//   * the phone count: 390x844 DPR 3 touch (the mobile tier), the same views, the worst frame's draw calls, active meshes and
//     texture MB — the V1 district's cost with placeholders around it, against the Adventure plan's phone budget.
// Run it under the shared browser gate:  /home/user/wt/gate-run.sh 300 npx tsx scripts/probes/venice-hub/proto-shot.mts
//   OUT=<dir>  (default /tmp/venice-hub)
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/venice-hub';
const PORT = Number(process.env.PORT ?? 3741);
const SITE = path.join(OUT, 'site');
fs.mkdirSync(SITE, { recursive: true });

const esbuild = createRequire(path.join(APP, 'package.json'))('esbuild');
await esbuild.build({
  absWorkingDir: APP, entryPoints: [path.join(HERE, 'proto-entry.ts')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' }, logLevel: 'error', outfile: path.join(SITE, 'proto.js'),
});
fs.writeFileSync(path.join(SITE, 'proto.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}</style></head><body><canvas id="c"></canvas><script src="proto.js"></script></body></html>');
console.log('bundle', (fs.statSync(path.join(SITE, 'proto.js')).size / 1e6).toFixed(1), 'MB');

const server = spawn(process.execPath, [path.join(APP, 'scripts/probes/hoops-gap/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/proto.html`;
for (let i = 0; i < 40; i++) { try { const r = await fetch(base); if (r.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result: Record<string, unknown> = {};
try {
  const VIEWS: Array<[string, string]> = [
    ['walkup', `h => h.view('walk', { x: 6, z: -12, yaw: -2.2 })`],
    ['courts', `h => h.view('courts')`],
    ['map', `h => h.view('map')`],
  ];
  for (const [profile, ctxOpts] of [
    ['desktop', { viewport: { width: 1280, height: 720 } }],
    ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ] as const) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}?tier=${profile === 'phone' ? 'mobile' : 'desktop'}`);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean; __err?: string }).__ready || (window as unknown as { __err?: string }).__err, null, { timeout: 120000 });
    const per: Record<string, unknown> = {};
    for (const [name, fn] of VIEWS) {
      await page.evaluate(`(${fn})(window.__VH)`);
      let worst = { drawCalls: 0, activeMeshes: 0, meshes: 0, textureMb: 0, fps: 0 };
      for (let k = 0; k < 20; k++) {
        await page.waitForTimeout(100);
        const s = await page.evaluate('window.__VH.stats()') as typeof worst;
        if (s.drawCalls > worst.drawCalls) worst = { ...s, activeMeshes: Math.max(s.activeMeshes, worst.activeMeshes) };
        else worst.activeMeshes = Math.max(s.activeMeshes, worst.activeMeshes);
      }
      per[name] = worst;
      if (profile === 'desktop' || name === 'walkup') {
        const file = path.join(OUT, `venice-proto-${name}-${profile}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
        console.log('wrote', file);
      }
    }
    result[profile] = { views: per, errors };
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(path.join(OUT, 'proto-stats.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
