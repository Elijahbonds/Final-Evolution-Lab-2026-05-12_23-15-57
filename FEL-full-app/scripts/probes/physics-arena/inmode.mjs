// lane/physics-arena: scripted releases in the LIVE mode (the page, the harness, the real loop), not the headless rig.
//   node inmode.mjs <run-tag> [shotsPerSide=8]   (PORT 3871; the rival kept still through the seam's quiet())
// Each shot: the seam places me with the ball at a spot (2.5–6.5 m, five angles), then releases at the top of the jump plus an
// offset: GOOD within ±20 ms, BAD 110–150 ms early or late. The make is the mode's own (its sensor and its score). Prints one JSON line.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [tag = 'r1', per = '8'] = process.argv.slice(2);
const PORT = process.env.PORT ?? '3871';
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 480, height: 360 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
let seed = [...tag].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const res = { tag, good: { n: 0, made: 0 }, bad: { n: 0, made: 0 } };
try {
  await p.goto(`http://127.0.0.1:${PORT}/arena.html?mode=physics_arena`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__phase === 'playing' || window.__err, null, { timeout: 300000, polling: 500 });
  await p.evaluate(() => window.__ARENA__.quiet(true));
  const spots = [];
  for (const d of [2.5, 4.5, 6.5]) for (const deg of [-60, -25, 0, 25, 60]) spots.push([Math.sin(deg * Math.PI / 180) * d, -0.6 + Math.cos(deg * Math.PI / 180) * d]);
  for (let i = 0; i < Number(per) * 2; i++) {
    const kind = i % 2 === 0 ? 'good' : 'bad';
    const off = kind === 'good' ? (rnd() * 2 - 1) * 0.02 : (rnd() < 0.5 ? -1 : 1) * (0.11 + rnd() * 0.04);
    const [x, z] = spots[Math.floor(rnd() * spots.length)];
    const before = await p.evaluate(() => window.__ARENA__.state().stats.makes.me);
    await p.evaluate(([x, z]) => window.__ARENA__.place(x, z), [x, z]);
    await p.waitForTimeout(350);
    await p.evaluate((o) => window.__ARENA__.shoot(o), off);
    // wait for the ball to be done: up to 4 s of page time, or until it is on the floor and loose
    const t0 = Date.now();
    await p.waitForTimeout(1500);
    while (Date.now() - t0 < 6000) { const s = await p.evaluate(() => window.__ARENA__.state()); if (s.phase === 'scored' || (s.ball === 'loose' && s.ballPos.y < 0.5)) break; await p.waitForTimeout(200); }
    const after = await p.evaluate(() => window.__ARENA__.state().stats.makes.me);
    res[kind].n++; res[kind].made += after > before ? 1 : 0;
    await p.waitForTimeout(1600);   // the scored beat and the check
  }
  res.state = await p.evaluate(() => window.__ARENA__.state());
} catch (e) { res.failed = String(e.message).slice(0, 200); }
res.errors = errs.slice(0, 5);
console.log(JSON.stringify(res));
await b.close();
