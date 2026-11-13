// hoops-perf (2026-11-12): THE SAME FRAME, MERGED AND NOT — does joining a body's parts into one mesh change a single pixel?
//
//   PAGE=http://127.0.0.1:3383/mode.html MODES=threevthree,onevone OUT=<dir> npx tsx scripts/probes/hoops-perf/merge-diff.mts
//   (scripts/probes/hoops-perf/run.sh <site> <cap> diff … wraps the server and the gate.)
//
// The bare mode bundle (scripts/probes/hoops-gap/entry.mjs) as the budget's phone (390×844, DPR 3, mobile tier, virtual clock,
// Math.random seeded), START, SECONDS game seconds of the perf sweep's fake player. Then the render loop is STOPPED and the frame
// is drawn again and again with nothing advancing (scene.render with animations off, the engine's frame delta 0, the virtual clock
// frozen), read back each time:
//   A, A2  with the bodies merged (core/bodyMerge.ts — every built merge swapped in now)          → A vs A2: the noise floor
//   B, B2  the same frame with every body's parts drawing again (scene.__felBodyMerge.setMode('off')) → B vs B2: the noise floor
//   A vs B                                                                                         → WHAT THE MERGE CHANGES
//   C      B with one body part hidden (the known-bad control: the probe must see it)              → B vs C must differ
// Writes <OUT>/diff-<mode>.json (pixels differing, the largest channel step, inside the bodies' screen boxes and in all) and
// <OUT>/diff-<mode>-{merged,parts,delta}.jpg (delta: every differing pixel painted red on a dimmed frame).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';

const PAGE = process.env.PAGE ?? 'http://127.0.0.1:3383/mode.html';
const MODES = (process.env.MODES ?? 'threevthree').split(',').filter(Boolean);
const OUT = process.env.OUT ?? '/tmp/merge-diff';
const SECONDS = Number(process.env.SECONDS ?? 6);
const SEED = Number(process.env.SEED ?? 7);
const RASTER = Number(process.env.RASTER ?? 1);
fs.mkdirSync(OUT, { recursive: true });

const INIT = `(() => {
  const realNow = performance.now.bind(performance);
  let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt; let lastTs = -1;
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; } cb(vt); });
  let t = ${SEED} >>> 0;
  Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const D = 1.7e12; Date.now = () => D;
  window.__name = window.__name || function (f) { return f; };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a);
})()`;

const DIFF = `(async () => {
  const scene = window.__FEL_DEV__.scene; const engine = scene.getEngine(); const bm = scene.__felBodyMerge;
  if (!bm) return { error: 'no __felBodyMerge on the scene (perf.bodyMergeOn off, or no body spawned)' };
  engine.stopRenderLoop();
  await new Promise((r) => setTimeout(r, 200));
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const swapped = bm.swapReady();
  const stats = bm.stats(); const detail = bm.detail();
  const grab = async () => { engine._deltaTime = 0; scene.render(true, true); const px = await engine.readPixels(0, 0, w, h, true, true); return new Uint8Array(px.buffer.slice(px.byteOffset, px.byteOffset + w * h * 4)); };
  // the bodies' screen boxes (every skinned mesh's world box, projected), in readPixels rows (bottom-up)
  const boxes = [];
  const vp = scene.getTransformMatrix().m;
  const roots = new Set(); for (const m of scene.meshes) if (m.skeleton && m.isEnabled()) { let r = m; while (r.parent) r = r.parent; roots.add(r); }
  for (const r of roots) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const m of r.getChildMeshes(false)) { if (!m.skeleton) continue; m.computeWorldMatrix(true); for (const v of m.getBoundingInfo().boundingBox.vectorsWorld) {
      const X = v.x * vp[0] + v.y * vp[4] + v.z * vp[8] + vp[12], Y = v.x * vp[1] + v.y * vp[5] + v.z * vp[9] + vp[13], W = v.x * vp[3] + v.y * vp[7] + v.z * vp[11] + vp[15];
      if (W <= 0) continue; const sx = (X / W * 0.5 + 0.5) * w, sy = (Y / W * 0.5 + 0.5) * h; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); } }
    if (x1 > 0 && y1 > 0 && x0 < w && y0 < h) boxes.push([Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(w, Math.ceil(x1)), Math.min(h, Math.ceil(y1))]);
  }
  const inBox = (x, y) => { for (const b of boxes) if (x >= b[0] && x < b[2] && y >= b[1] && y < b[3]) return true; return false; };
  let boxPx = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inBox(x, y)) boxPx++;
  const diff = (a, b) => { let n = 0, nb = 0, max = 0; for (let i = 0, p = 0; i < a.length; i += 4, p++) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d > 0) { n++; if (d > max) max = d; if (inBox(p % w, Math.floor(p / w))) nb++; } } return { px: n, inBodies: nb, maxStep: max }; };
  const A = await grab(); const A2 = await grab();
  const statsA = bm.stats();
  bm.setMode('off');
  const B = await grab(); const B2 = await grab();
  // the known-bad control: hide the largest visible skinned part of the nearest body, draw, put it back
  const act = scene.getActiveMeshes(); const actives = new Set(act.data.slice(0, act.length));
  let victim = null; for (const m of scene.meshes) if (actives.has(m) && m.skeleton && m.isEnabled() && m.isVisible && m.layerMask !== 0 && !m.name.startsWith('__felBody_') && (!victim || m.getTotalVertices() > victim.getTotalVertices())) victim = m;
  let C = B; if (victim) { victim.isVisible = false; C = await grab(); victim.isVisible = true; }
  const jpg = (px, mark) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4; let r = px[s], gg = px[s + 1], bb = px[s + 2];
      if (mark) { const o = mark[s] !== px[s] || mark[s + 1] !== px[s + 1] || mark[s + 2] !== px[s + 2]; if (o) { r = 255; gg = 0; bb = 0; } else { r >>= 2; gg >>= 2; bb >>= 2; } }
      img.data[d] = r; img.data[d + 1] = gg; img.data[d + 2] = bb; img.data[d + 3] = 255; }
    g.putImageData(img, 0, 0); return c.toDataURL('image/jpeg', 0.85); };
  return { w, h, swappedAtA: swapped, stats, statsA, detail, bodyBoxes: boxes.length, bodyBoxPx: boxPx, victim: victim && victim.name,
    noiseMerged: diff(A, A2), noiseParts: diff(B, B2), mergeVsParts: diff(A, B), control: diff(B, C),
    jpgMerged: jpg(A, null), jpgParts: jpg(B, null), jpgDelta: jpg(A, B) };
})()`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const ev = <T,>(fn: string | (() => T)): Promise<T> => Promise.race([p.evaluate(fn as never) as Promise<T>, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), 400000))]);
  const t0 = Date.now();
  try {
    await p.goto(`${PAGE}?mode=${mode}&perf=off${process.env.FEEL ? '&feel=' + encodeURIComponent(process.env.FEEL) : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    let state = '';
    for (let i = 0; i < 600; i++) {
      state = await ev(() => (window as unknown as { __phase?: string }).__phase ?? '');
      if (state === 'playing' || state === 'error') break;
      if (state && state !== 'loading' && i % 4 === 3) await ev(() => { const bus = (window as unknown as { __bus?: { emit(e: unknown): void } }).__bus; bus?.emit({ t: 'button', btn: 'START', pressed: true }); bus?.emit({ t: 'button', btn: 'START', pressed: false }); });
      await p.waitForTimeout(1000);
    }
    if (state !== 'playing') throw new Error(`never played (${state})`);
    // play at a cheap raster (the clock is virtual), then draw the compared frames at the asked one
    await ev(`(() => { const e = window.__FEL_DEV__.scene.getEngine(); window.__HW0 = e.getHardwareScalingLevel(); e.setHardwareScalingLevel(window.__HW0 * 4); })()`);
    await ev(`(() => { const bus = window.__bus; const t0 = performance.now(); let a = false; window.__FEL_DEV__.scene.onBeforeRenderObservable.add(() => { const g = (performance.now() - t0) / 1000; bus.emit({ t: 'stick', side: 'L', x: Math.sin(g * 0.7) * 0.8, y: -0.6 + Math.cos(g * 0.5) * 0.3 }); const on = (g % 1.5) < 0.12; if (on !== a) { a = on; bus.emit({ t: 'button', btn: 'A', pressed: on }); } }); window.__T0 = t0; })()`);
    for (;;) { const g = await ev<number>(`(performance.now() - window.__T0) / 1000`); if (g >= SECONDS || Date.now() - t0 > 900000) break; await p.waitForTimeout(500); }
    await ev(`(() => { const e = window.__FEL_DEV__.scene.getEngine(); e.setHardwareScalingLevel(window.__HW0 * ${RASTER}); })()`);
    await p.waitForTimeout(1500);
    const r = await ev<Record<string, unknown>>(DIFF);
    if (r.error) throw new Error(String(r.error));
    for (const k of ['jpgMerged', 'jpgParts', 'jpgDelta'] as const) {
      fs.writeFileSync(path.join(OUT, `diff-${mode}-${k.slice(3).toLowerCase()}.jpg`), Buffer.from(String(r[k]).split(',')[1], 'base64'));
      delete r[k];
    }
    fs.writeFileSync(path.join(OUT, `diff-${mode}.json`), JSON.stringify(r, null, 1));
    const d = (x: unknown) => { const o = x as { px: number; inBodies: number; maxStep: number }; return `${o.px} px (${o.inBodies} in bodies, max step ${o.maxStep})`; };
    console.log(`[merge-diff] ${mode} ${r.w}x${r.h}: ${JSON.stringify(r.statsA)} · merged vs parts ${d(r.mergeVsParts)} · noise merged ${d(r.noiseMerged)} parts ${d(r.noiseParts)} · control (${r.victim} hidden) ${d(r.control)} · ${r.bodyBoxes} body boxes (${Math.round(Date.now() - t0) / 1000} s)`);
  } catch (e) {
    console.log(`[merge-diff] ${mode}: FAILED ${(e as Error).message}`);
  } finally {
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
}
await Promise.race([b.close(), new Promise((r) => setTimeout(r, 15000))]);
process.exit(0);   // a hung browser close must never keep the shared gate
