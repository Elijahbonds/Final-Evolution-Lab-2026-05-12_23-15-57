// lane/physics-arena: where a body's render time goes on the phone profile (the soccer 3v3: ~2.7 ms of render a body whatever
// its draws). In ONE page, 3 s into play, the render's own time (scene.render, before → after) over 90 frames under each condition:
//   base     as it is
//   hidden   every body part hidden (the draws, the ink and the shadow of the bodies gone; the skeletons and clips still run)
//   noink    every body part's ink off
//   nocast   every body out of the shadow maps (a getCustomRenderList filter)
//   nomorph  every body part's morph targets at influence 0
//   (back to base at the end: the drift check)
//   node bodycost.mjs     (PORT 3871, TAG arena, MODE=physics_arena_soccer_3v3, inside rig.sh)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const PORT = process.env.PORT ?? '3871', TAG = process.env.TAG ?? 'arena', MODE = process.env.MODE ?? 'physics_arena_soccer_3v3', FEEL = process.env.FEEL ?? '';
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${PORT}/${TAG}.html?mode=${MODE}&tier=mobile&perf=off${FEEL ? '&feel=' + encodeURIComponent(FEEL) : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => window.__phase === 'playing' || window.__err, null, { timeout: 300000, polling: 250 });
await p.waitForFunction(() => { const m = (window.__marks || []).find((x) => x[0] === 'playing'); return m && performance.now() - m[1] > 3000; }, null, { timeout: 120000, polling: 200 });
const res = await p.evaluate(async () => {
  const s = window.__FEL_DEV__.scene;
  const bodies = s.meshes.filter((m) => m.skeleton || m.name.startsWith('__felBody_'));
  let t0 = 0; const times = [];
  s.onBeforeRenderObservable.add(() => { t0 = performance.now(); });
  s.onAfterRenderObservable.add(() => { times.push(performance.now() - t0); });
  const frames = (n) => new Promise((r) => { const start = times.length; const f = () => (times.length - start >= n ? r(times.slice(start).sort((a, b) => a - b)) : requestAnimationFrame(f)); f(); });
  const med = (a) => a[Math.floor(a.length / 2)];
  const maps = s.lights.map((l) => l.getShadowGenerator?.()?.getShadowMap?.()).filter(Boolean);
  const vis = bodies.map((m) => m.isVisible), ink = bodies.map((m) => m.renderOutline);
  const out = {};
  const run = async (name, on, off) => { on(); await frames(15); out[name] = +med(await frames(60)).toFixed(2); off(); };
  await run('base', () => {}, () => {});
  await run('hidden', () => bodies.forEach((m) => { m.isVisible = false; }), () => bodies.forEach((m, i) => { m.isVisible = vis[i]; }));
  await run('noink', () => bodies.forEach((m) => { m.renderOutline = false; }), () => bodies.forEach((m, i) => { m.renderOutline = ink[i]; }));
  const set = new Set(bodies);
  await run('nocast', () => maps.forEach((mp) => { mp.getCustomRenderList = (_l, list, len) => list ? list.slice(0, len).filter((m) => !set.has(m)) : null; }), () => maps.forEach((mp) => { mp.getCustomRenderList = null; }));
  const morphs = bodies.flatMap((m) => { const mt = m.morphTargetManager; if (!mt) return []; return Array.from({ length: mt.numTargets }, (_, i) => mt.getTarget(i)); });
  const infl = morphs.map((t) => t.influence);
  await run('nomorph', () => morphs.forEach((t) => { t.influence = 0; }), () => morphs.forEach((t, i) => { t.influence = infl[i]; }));
  const rings = s.meshes.filter((m) => m.name.startsWith('__arena_ring_'));
  if (rings.length) {
    await run('norings', () => rings.forEach((m) => { m.isVisible = false; }), () => rings.forEach((m) => { m.isVisible = true; }));
    await run('rings', () => {}, () => {});
    await run('norings2', () => rings.forEach((m) => { m.isVisible = false; }), () => rings.forEach((m) => { m.isVisible = true; }));
  }
  await run('base2', () => {}, () => {});
  out.bodies = bodies.length; out.morphTargets = morphs.length; out.skeletons = new Set(bodies.map((m) => m.skeleton)).size;
  out.bones = [...new Set(bodies.map((m) => m.skeleton).filter(Boolean))].map((k) => k.bones.length).join(',');
  out.gpuBones = bodies.filter((m) => m.computeBonesUsingShaders).length;
  return out;
});
console.log(`${MODE}: render ms (median of 60) ${JSON.stringify(res)}`);
await b.close();
