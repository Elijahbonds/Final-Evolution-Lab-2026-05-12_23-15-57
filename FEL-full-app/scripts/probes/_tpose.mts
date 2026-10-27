// T-POSE (owner playtest 2026-10-27): "the avatar wasn't performing the exercise properly, it was a T-pose". The drill
// demo canvas (components/coach/exercise-avatar-canvas.tsx — the Mirror Quick Screen, Today's drill and the drills app
// mount it) bundled with esbuild as a release build (NODE_ENV production, minified), served with public/ by a static file
// server into headless Chromium at 390 px. For each stat a drill-demo passes, it reports the arm's angle from hanging
// (a T-pose holds the arms out level: ~90°) and how far the hand moves in 0.8 s, and shoots the canvas.
//   OUT=<dir> npx tsx scripts/probes/_tpose.mts
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.OUT ?? join(ROOT, '.tpose-rig');
const SITE = join(OUT, 'site');
mkdirSync(SITE, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_avatar-canvas-entry.tsx')], bundle: true, outdir: SITE, entryNames: 'rig', format: 'esm', splitting: true, platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', minify: true,
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty', '.wasm': 'empty' },
});
writeFileSync(join(SITE, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#050505"><div id="root"></div><script type="module" src="/rig.js"></script></body></html>');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const f = [join(SITE, p === '/' ? 'index.html' : p), join(ROOT, 'public', p)].find((x) => existsSync(x) && statSync(x).isFile());
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out: Record<string, unknown> = {};
for (const stat of (process.env.STATS ?? 'power,mobility,speed').split(',')) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const logs: string[] = []; page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`)); page.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(`${url}/#canvas:${stat}`);
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForTimeout(Number(process.env.WAIT ?? 12_000));
  const j1 = await page.evaluate(() => (window as unknown as { __rigJoints(): { hand?: number[] } | null }).__rigJoints());
  await page.screenshot({ path: join(OUT, `canvas-${stat}-a.png`), clip: { x: 0, y: 0, width: 358, height: 202 } });
  await page.waitForTimeout(800);
  const j2 = await page.evaluate(() => (window as unknown as { __rigJoints(): { hand?: number[] } | null }).__rigJoints());
  await page.screenshot({ path: join(OUT, `canvas-${stat}-b.png`), clip: { x: 0, y: 0, width: 358, height: 202 } });
  const moved = j1?.hand && j2?.hand ? Math.round(Math.hypot(j1.hand[0] - j2.hand[0], j1.hand[1] - j2.hand[1], j1.hand[2] - j2.hand[2]) * 100) : null;
  // the arm through one whole pass of the clip (elijah.glb's one clip is 23.9 s), a sample a second
  const series: (number | null)[] = [];
  if (process.env.SERIES) for (let i = 0; i < 26; i++) { series.push(((await page.evaluate(() => (window as unknown as { __rigJoints(): { armFromDownDeg: number | null } | null }).__rigJoints())) ?? { armFromDownDeg: null }).armFromDownDeg); if (i % 4 === 0) await page.screenshot({ path: join(OUT, `canvas-${stat}-t${i}.png`) }); await page.waitForTimeout(1000); }
  out[stat] = { joints: j1, handMovedCm: moved, armSeries: series.join(' '), logs: logs.filter((l) => !/DevTools|favicon/.test(l)).slice(0, 10) };
  await page.close();
}
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 1));
