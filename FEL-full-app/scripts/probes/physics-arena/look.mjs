// lane/physics-arena: the arena on screen. node look.mjs <outDir> [w] [h]   (PORT default 3871, the lane's row in docs/LANES.md)
// Loads <tag>.html (TAG, default arena) from ../hoops-gap/serve.mjs, waits for play, then: the court camera (JPG), the ball in a
// scripted shot's flight (JPG), POV (JPG), POV mid-shot (JPG). Prints the seam's state, the console errors and the load time.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [out, w = '390', h = '844'] = process.argv.slice(2);
const PORT = process.env.PORT ?? '3871', TAG = process.env.TAG ?? 'arena', MODE = process.env.MODE ?? 'physics_arena';
fs.mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const phone = Number(w) < 600;
const ctx = await b.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
const t0 = Date.now();
try {
  await p.goto(`http://127.0.0.1:${PORT}/${TAG}.html?mode=${MODE}&tier=${phone ? 'mobile' : 'desktop'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__phase === 'playing' || window.__err, null, { timeout: 300000, polling: 500 });
  const loadS = (Date.now() - t0) / 1000;
  const err = await p.evaluate(() => window.__err || null);
  if (err) throw new Error(err);
  await p.waitForTimeout(2500);
  const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
  await shot(`court-${w}x${h}`);
  await p.evaluate(() => window.__ARENA__.place(1.5, 4.2));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__ARENA__.shoot(0));
  await p.waitForTimeout(900);
  await shot(`court-shot-${w}x${h}`);
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.__ARENA__.pov());
  await p.waitForTimeout(800);
  await shot(`pov-${w}x${h}`);
  await p.evaluate(() => window.__ARENA__.place(0.2, 5.4));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__ARENA__.shoot(0));
  await p.waitForTimeout(800);
  await shot(`pov-shot-${w}x${h}`);
  await p.waitForTimeout(2000);
  const st = await p.evaluate(() => window.__ARENA__.state());
  console.log(JSON.stringify({ w, h, loadS, state: st, errors: errs.slice(0, 8) }));
} catch (e) {
  console.log(JSON.stringify({ w, h, failed: String(e.message).slice(0, 300), errors: errs.slice(0, 8) }));
  try { await p.screenshot({ path: `${out}/fail-${w}x${h}.jpg`, type: 'jpeg', quality: 70 }); } catch {}
} finally { await b.close(); }
