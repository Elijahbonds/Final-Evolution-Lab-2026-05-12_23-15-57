// hoops-p08 (2026-11-12): WHAT A PHONE DRAWS in each hoops mode, mesh by mesh — so the phone budget is cut where the draws are,
// not where they are guessed to be.
//
//   PAGE=http://127.0.0.1:3352/mode.html MODES=threevthree,threepoint OUT=<dir> TAG=before npx tsx scripts/probes/hoops-p08/scene-census.mts
//   (scripts/probes/hoops-p08/run.sh <site> <cap> census … wraps the server and the gate.)
//
// The bare mode bundle (scripts/probes/hoops-gap/entry.mjs: the real mode through runMode, no React) as the budget's phone:
// 390×844, DPR 3, isMobile + hasTouch (the mobile tier), virtual clock, Math.random seeded, START, SECONDS game seconds of a slow
// circle on the stick. Then one frame is drawn with every mesh's draws counted (Mesh._renderSubMesh / the instanced path are not
// public, so the census wraps AbstractMesh.render: one call per sub-mesh per pass — the main pass and each shadow map). Writes
// <OUT>/census-<TAG>-<mode>.json: per active mesh its name, three ancestors, material, sub-meshes, instances, vertices and the
// draws it cost; the textures (name, size, MB); and the totals, so analyze can group them.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';

const PAGE = process.env.PAGE ?? 'http://127.0.0.1:3352/mode.html';
const MODES = (process.env.MODES ?? 'threevthree').split(',').filter(Boolean);
const OUT = process.env.OUT ?? '/tmp/census';
const TAG = process.env.TAG ?? 'run';
const SECONDS = Number(process.env.SECONDS ?? 6);
const SEED = Number(process.env.SEED ?? 7);
const RASTER = Number(process.env.RASTER ?? 4);
// FEEL='{"knob.id": value}': play on those feel-panel values (the bare bundle's ?feel=, scripts/probes/hoops-gap/entry.mjs) — one build, several variants
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

/** Installed when play starts: every frame, the draws each mesh cost (AbstractMesh.render is called once per sub-mesh per pass that
 *  goes through it — the main pass, the outline (ink) passes, the glow; the shadow maps draw through their own path and are counted
 *  as a whole), the frame's total (SceneInstrumentation), and the WORST frame's split is kept. */
const INSTALL = `(() => {
  const scene = window.__FEL_DEV__.scene; const engine = scene.getEngine(); const si = window.__FEL_DEV__.instrument();
  const W = window.__CEN = { per: new Map(), worst: null, worstDraws: -1, frames: 0, totals: [] };
  const wrap = (m) => { if (m.__cenWrapped || typeof m.render !== 'function') return; m.__cenWrapped = true; const orig = m.render;
    m.render = function (...a) { const d0 = engine._drawCalls.current; const r = orig.apply(this, a); W.per.set(this, (W.per.get(this) || 0) + (engine._drawCalls.current - d0)); return r; }; };
  for (const m of scene.meshes) wrap(m);
  scene.onNewMeshAddedObservable.add(wrap);
  let sd = 0; const hooked = new WeakSet();
  const hook = () => { for (const l of scene.lights) { const sg = l.getShadowGenerator && l.getShadowGenerator(); const rt = sg && sg.getShadowMap && sg.getShadowMap(); if (!rt || hooked.has(rt)) continue; hooked.add(rt); let d0 = 0;
    rt.onBeforeRenderObservable.add(() => { d0 = engine._drawCalls.current; }); rt.onAfterRenderObservable.add(() => { sd += engine._drawCalls.current - d0; }); } };
  engine.onBeginFrameObservable.add(() => { W.per = new Map(); sd = 0; hook(); });
  engine.onEndFrameObservable.add(() => {
    const total = si.drawCallsCounter.current; W.frames++; W.totals.push(total);
    if (total > W.worstDraws) { W.worstDraws = total; W.worst = { per: new Map(W.per), shadow: sd, active: [...scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length)] }; }
  });
  return 'ok';
})()`;

const CENSUS = `(async () => {
  const scene = window.__FEL_DEV__.scene; const engine = scene.getEngine(); const W = window.__CEN;
  const anc = (m) => { const out = []; for (let p = m.parent; p && out.length < 4; p = p.parent) out.push(p.name); return out; };
  const per = W.worst.per; const active = new Set(W.worst.active);
  const casters = new Set();
  for (const l of scene.lights) { const sg = l.getShadowGenerator && l.getShadowGenerator(); const map = sg && sg.getShadowMap && sg.getShadowMap(); if (map && map.renderList) for (const m of map.renderList) casters.add(m); }
  const meshes = [];
  for (const m of scene.meshes) {
    const draws = per.get(m) || 0;
    if (!active.has(m) && !draws) continue;
    const mat = m.material;
    meshes.push({ name: m.name, cls: m.getClassName(), anc: anc(m), mat: mat ? mat.name : null, matCls: mat ? mat.getClassName() : null,
      sub: m.subMeshes ? m.subMeshes.length : 0, inst: m.instances ? m.instances.length : 0, src: m.sourceMesh ? m.sourceMesh.name : null,
      verts: m.getTotalVertices ? m.getTotalVertices() : 0, draws, active: active.has(m), caster: casters.has(m), skinned: !!m.skeleton, ink: !!m.renderOutline });
  }
  const tex = [];
  const RT = new Set([5, 6, 12, 14]);
  for (const t of engine._internalTexturesCache || []) {
    const mb = t.width * t.height * 4 * (t.generateMipMaps ? 1.33 : 1) * (t.isCube ? 6 : 1) * (t.is3D ? Math.max(1, t.depth) : 1) / 1048576;
    tex.push({ url: String(t.url || '').slice(-90), w: t.width, h: t.height, mb: Math.round(mb * 100) / 100, rt: RT.has(t.source), src: t.source });
  }
  const sorted = [...W.totals].sort((a, b) => a - b);
  // every shadow caster (the full render list: a cache re-bake draws all of them in one frame)
  const casterList = [];
  for (const l of scene.lights) { const sg = l.getShadowGenerator && l.getShadowGenerator(); const map = sg && sg.getShadowMap && sg.getShadowMap(); if (!map || !map.renderList) continue;
    for (const m of map.renderList) casterList.push({ name: m.name, mat: m.material ? m.material.name : null, sub: m.subMeshes ? m.subMeshes.length : 0, thin: m.thinInstanceCount || 0, on: m.isEnabled() && m.isVisible, skinned: !!m.skeleton, anc: anc(m).slice(0, 2) }); }
  return { frameDraws: W.worstDraws, shadowDraws: W.worst.shadow, frames: W.frames, drawsP50: sorted[Math.floor(sorted.length / 2)], activeMeshes: W.worst.active.length,
    meshesTotal: scene.meshes.length, materials: scene.materials.length, meshes, tex, casterList,
    texMb: tex.filter((t) => !t.rt).reduce((s, t) => s + t.mb, 0), tier: scene.metadata && scene.metadata.felTier };
})()`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const ev = <T,>(fn: string | (() => T)): Promise<T> => Promise.race([p.evaluate(fn as never) as Promise<T>, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), 300000))]);
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
    await ev(`(() => { const e = window.__FEL_DEV__.scene.getEngine(); e.setHardwareScalingLevel(e.getHardwareScalingLevel() * ${RASTER}); })()`);
    await ev(INSTALL);
    // the perf sweep's fake player: a slow circle on the left stick, A tapped every ~1.5 s of game time
    await ev(`(() => { const bus = window.__bus; const t0 = performance.now(); let a = false; window.__FEL_DEV__.scene.onBeforeRenderObservable.add(() => { const g = (performance.now() - t0) / 1000; bus.emit({ t: 'stick', side: 'L', x: Math.sin(g * 0.7) * 0.8, y: -0.6 + Math.cos(g * 0.5) * 0.3 }); const on = (g % 1.5) < 0.12; if (on !== a) { a = on; bus.emit({ t: 'button', btn: 'A', pressed: on }); } }); window.__T0 = t0; })()`);
    for (;;) { const g = await ev<number>(`(performance.now() - window.__T0) / 1000`); if (g >= SECONDS || Date.now() - t0 > 900000) break; await p.waitForTimeout(500); }
    const c = await ev<Record<string, unknown>>(CENSUS);
    fs.writeFileSync(path.join(OUT, `census-${TAG}-${mode}.json`), JSON.stringify(c));
    console.log(`[census] ${TAG} ${mode}: worst frame ${c.frameDraws} draws (shadow ${c.shadowDraws}; p50 ${c.drawsP50} over ${c.frames} frames), ${c.activeMeshes} active meshes, ${(c.texMb as number).toFixed(0)} MB textures, ${c.materials} materials (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    console.log(`[census] ${TAG} ${mode}: FAILED ${(e as Error).message}`);
  } finally {
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
}
await b.close();
