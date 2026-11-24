// lane/physics-arena phase 3: the arena's three-point contest on screen. node look3.mjs <outDir> [w] [h]  (PORT 3871)
// The court camera with a ball in flight (JPG), then POV with a ball in flight (JPG). Prints the seam's state and the errors.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [out, w = '390', h = '844'] = process.argv.slice(2);
const PORT = process.env.PORT ?? '3871';
fs.mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const phone = Number(w) < 600;
const p = await (await b.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
const t0 = Date.now();
try {
  await p.goto(`http://127.0.0.1:${PORT}/arena.html?mode=physics_arena_3pt`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__phase === 'playing' || window.__err, null, { timeout: 300000, polling: 500 });
  const loadS = (Date.now() - t0) / 1000;
  await p.waitForTimeout(2000);
  await p.evaluate(() => window.__ARENA3__.shoot(0));
  await p.waitForTimeout(1100);
  await p.screenshot({ path: `${out}/3pt-court-${w}x${h}.jpg`, type: 'jpeg', quality: 82 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.__ARENA3__.pov());
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__ARENA3__.shoot(0));
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${out}/3pt-pov-${w}x${h}.jpg`, type: 'jpeg', quality: 82 });
  await p.waitForTimeout(2500);
  console.log(JSON.stringify({ w, h, loadS, state: await p.evaluate(() => window.__ARENA3__.state()), errors: errs.slice(0, 6) }));
} catch (e) { console.log(JSON.stringify({ failed: String(e.message).slice(0, 300), errors: errs.slice(0, 6) })); }
await b.close();
