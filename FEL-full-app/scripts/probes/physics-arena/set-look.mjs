// lane/physics-arena, look pass (LOOK-PASS-AUDIT finding 12): the arena's before / after pictures — the same mode, size, seed and
// moment on both sides, ?perf=off (the audit's §1 caveat: the guard's render scale must not soften one side), the set off and on.
//   node set-look.mjs <outDir> <runTag>      (PORT 3871, TAG arena: the esbuild page; one browser, every shot in sequence)
// Writes <outDir>/<runTag>-<mode>-<size>-<off|on>.jpg and prints the load time to 'playing' for each.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [out, run = 'r1'] = process.argv.slice(2);
const PORT = process.env.PORT ?? '3871', TAG = process.env.TAG ?? 'arena';
const MODES = (process.env.MODES ?? 'physics_arena,physics_arena_3v3,physics_arena_3pt').split(',');
const SIZES = (process.env.SIZES ?? '390x844,844x390').split(',');
const SIDES = (process.env.SIDES ?? 'off,on').split(',');
// the knob the two sides differ in (slice 2's floor past the boards: FEEL_KEY=arena.soccerApron); EXTRA: more knobs on both sides
const KEY = process.env.FEEL_KEY ?? 'arena.setV1', EXTRA = JSON.parse(process.env.EXTRA ?? '{}');
fs.mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const SEED = `{ let t = 7 >>> 0; Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }`;
for (const mode of MODES) for (const size of SIZES) for (const side of SIDES) {
  const [w, h] = size.split('x').map(Number), phone = w < 600 || h < 600;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
  await ctx.addInitScript({ content: SEED });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const feel = encodeURIComponent(JSON.stringify({ ...EXTRA, [KEY]: side === 'on' ? 1 : 0 }));
  const t0 = Date.now();
  try {
    await p.goto(`http://127.0.0.1:${PORT}/${TAG}.html?mode=${mode}&tier=${phone ? 'mobile' : 'desktop'}&perf=off&feel=${feel}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => window.__phase === 'playing' || window.__err, null, { timeout: 300000, polling: 250 });
    const loadS = (Date.now() - t0) / 1000;
    const err = await p.evaluate(() => window.__err || null);
    if (err) throw new Error(err);
    // the same moment: the game's own clock, not the wall's (a slow software frame would otherwise move it)
    await p.waitForFunction(() => { const m = (window.__marks || []).find((x) => x[0] === 'playing'); return m && performance.now() - m[1] > 3000; }, null, { timeout: 120000, polling: 200 });
    const file = `${out}/${run}-${mode}-${size}-${side}.jpg`;
    await p.screenshot({ path: file, type: 'jpeg', quality: 80 });
    const meshes = await p.evaluate(() => { const s = window.__FEL_DEV__?.scene; return s ? { meshes: s.meshes.length, active: s.getActiveMeshes().length } : null; });
    console.log(`${mode} ${size} ${side}: load ${loadS.toFixed(1)} s, ${JSON.stringify(meshes)} ${errs.length ? 'errors: ' + errs.slice(0, 2).join(' | ') : ''} -> ${file}`);
  } catch (e) {
    console.log(`${mode} ${size} ${side}: FAILED ${String(e.message).slice(0, 160)} ${errs.slice(0, 2).join(' | ')}`);
  }
  await ctx.close();
}
await b.close();
