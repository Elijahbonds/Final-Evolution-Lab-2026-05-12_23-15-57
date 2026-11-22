// LANE C rig (improve-world, 2026-11-22; docs/IMPROVE-10-PHASE-AUDIT.md phases 5, 7, 9): the story, the Coast and the Venice hub,
// played as a phone, each SIDE of a knob A/B interleaved in one browser on the same build.
//
// Bundles (esbuild, production; never next dev / build) and serves on this lane's port (3893) with the hoops-gap static server:
//   story   ./story-entry.tsx — the REAL /play/adventure stage (picker → start → Chapter 1), at /play/adventure/index.html;
//           story@<beat> resumes Chapter 1 at that beat (e.g. story@b05-rail: World 1's rail run)
//   coast   scripts/probes/coast-islands/zone-entry.ts — the REAL zone through runMode (it presses START itself at READY)
//   venice  the same bundle with ?mode=venice_hub — the control; venice@court.run: arriving back from that court's game
// Phone tier (the audit's): 390 × 844, DPR 3, touch, the page's JS throttled 4× over CDP for the whole run. Per run it reads:
//   readySec    navigation → the story's START enabled (after the partner pick), or the zone / hub's first played frame
//   play        after the start and 1.5 s settle, 4 s warm-up then an 8 s window driven with WASD and Space / J (the audit's
//               desktop drive: the keyboard reaches every mode's InputBus): the sound starts in the window (the audit's hook on
//               AudioScheduledSourceNode.start and <audio>.play), the beds built (SoundKit's bed filters: 900 stadium, 500 ocean,
//               1400 wind), every frame interval (p50 / p95 / max)
//   draw        at the end: draw calls, active meshes, meshes, materials, textures and their MB (the coast rig's formula)
//   cam         (phase 9) every 250 ms in the window: whether the camera's eye is inside any pickable mesh's world box, and whether
//               the player's root projects inside the screen
//   a JPG at the end of each place's first run per side
// Env: OUT (dir), PORT (3893), RUNS (3), PLACES (story,coast,venice), SIDES ('on={};off={"story.sfxOn":0}' — name=json;…),
//      THROTTLE (4)
// Run under the shared browser gate:  /home/user/wt/gate-run.sh 2400 npx tsx scripts/probes/improve-world/world-rig.mts
// SwiftShader draws on the CPU: frame times and load seconds are the rig's, compared side to side; the owner's phone is the judge.
import { chromium, type Page } from 'playwright-core';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/improve-world';
const PORT = Number(process.env.PORT ?? 3893);
const RUNS = Number(process.env.RUNS ?? 3);
const PLACES = (process.env.PLACES ?? 'story,coast,venice').split(',').filter(Boolean);
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const SIDES = (process.env.SIDES ?? 'on={}').split(';').filter(Boolean).map((s) => { const i = s.indexOf('='); return { name: s.slice(0, i), feel: JSON.parse(s.slice(i + 1)) as Record<string, number> }; });
const SITE = path.join(OUT, 'site');
fs.mkdirSync(path.join(SITE, 'play/adventure'), { recursive: true });
const esbuild = createRequire(path.join(APP, 'package.json'))('esbuild');
const bundle = (entry: string, out: string, jsx = false) => esbuild.build({
  absWorkingDir: APP, entryPoints: [entry], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), ...(jsx ? { jsx: 'automatic' } : {}), define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
  loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(SITE, out),
});
if (PLACES.some((p) => p.startsWith('story'))) {
  await bundle(path.join(HERE, 'story-entry.tsx'), 'story.js', true);
  execFileSync(path.join(APP, 'node_modules/.bin/tailwindcss'), ['-c', path.join(APP, 'tailwind.config.ts'), '-i', path.join(APP, 'app/globals.css'), '-o', path.join(SITE, 'story.css')], { cwd: APP, stdio: 'ignore' });
  fs.writeFileSync(path.join(SITE, 'play/adventure/index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/story.css"><style>html,body,#root{margin:0;height:100%;overflow:hidden;background:#000}</style></head><body><div id="root"></div><script src="/story.js"></script></body></html>`);
}
if (PLACES.some((p) => p === 'coast' || p.startsWith('venice'))) {
  await bundle(path.join(APP, 'scripts/probes/coast-islands/zone-entry.ts'), 'zone.js');
  fs.writeFileSync(path.join(SITE, 'zone.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}#card{display:none;position:fixed;left:16px;right:16px;top:16px;padding:12px;border-radius:16px;background:rgba(0,0,0,.75);color:#fff;font:600 16px system-ui}</style></head><body><canvas id="c"></canvas><div id="card"></div><script src="zone.js"></script></body></html>`);
}
const server = spawn(process.execPath, [path.join(APP, 'scripts/probes/hoops-gap/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stopServer);
const ORIGIN = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(`${ORIGIN}/`)).status < 500) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

// the audit's sound hook (scripts/probes/improve-audit/walk.mts INIT), and a frame sampler
const INIT = `(() => {
  const w = window; w.__name = (f) => f;
  w.__ia = { sounds: 0, soundsAt: [], loops: [], bedFilters: [] };
  const bump = () => { w.__ia.sounds++; if (w.__ia.soundsAt.length < 400) w.__ia.soundsAt.push(Math.round(performance.now())); };
  try { const S = w.AudioScheduledSourceNode && w.AudioScheduledSourceNode.prototype; if (S) { const o = S.start; S.start = function (...a) { bump(); return o.apply(this, a); }; } } catch {}
  try { const C = w.BaseAudioContext && w.BaseAudioContext.prototype; if (C) { const o = C.createBiquadFilter; C.createBiquadFilter = function (...a) { const f = o.apply(this, a); if (w.__ia.bedFilters.length < 400) w.__ia.bedFilters.push(f); return f; }; } } catch {}
  w.__iaBeds = () => [...new Set(w.__ia.bedFilters.filter((f) => f.type === 'bandpass' && Math.abs(f.Q.value - 0.4) < 0.01).map((f) => Math.round(f.frequency.value)))];
  try { const M = w.HTMLMediaElement.prototype; const o = M.play; M.play = function (...a) { bump(); return o.apply(this, a); }; } catch {}
  w.__iaRaf = (ms) => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last;
    const f = (t) => { out.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); });
})();`;

const STATS = `(() => { const d = window.__FEL_DEV__; if (!d || !d.scene) return null; const s = d.scene; const e = s.getEngine();
  let tex = 0; for (const t of s.textures) { try { const z = t.getSize(); tex += z.width * z.height * 4 * (t.noMipmap ? 1 : 1.33); } catch {} }
  return { draws: e._drawCalls ? e._drawCalls.current : null, active: s.getActiveMeshes().length, meshes: s.meshes.length, materials: s.materials.length, textures: s.textures.length, textureMb: Math.round(tex / 1e6) }; })()`;

// phase 9: is the camera's eye inside a solid's box. The solids, by place: the Coast's palms, rocks and bushes (each thin instance
// its own box, from the geometry's extents) and the boat; the story's raised blocks and run-wall (the pieces, through the probe seam)
// and its trees. Read from the scene as drawn, independent of the mode's own clear-view lists.
const CAM = (place: string) => `(() => { const d = window.__FEL_DEV__; if (!d || !d.scene) return null; const s = d.scene; const c = s.activeCamera; if (!c) return null;
  const eye = c.globalPosition; const boxes = [];
  const solid = ${place === 'coast' ? '/^coast_(prop_|boat$)/' : '/^dress_prop_(pine|pineTall|oak|tree)_/'};
  for (const m of s.meshes) {
    if (!m.isEnabled() || !m.isVisible || !solid.test(m.name)) continue;
    if (m.thinInstanceCount > 0) {
      const pos = m.getVerticesData('position'); if (!pos) continue;
      let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], pos[i + k]); b[k] = Math.max(b[k], pos[i + k]); }
      for (const w of m.thinInstanceGetWorldMatrices()) {
        const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (let q = 0; q < 8; q++) { const x = q & 1 ? b[0] : a[0], y = q & 2 ? b[1] : a[1], z = q & 4 ? b[2] : a[2]; const M = w.m;
          const v = [x * M[0] + y * M[4] + z * M[8] + M[12], x * M[1] + y * M[5] + z * M[9] + M[13], x * M[2] + y * M[6] + z * M[10] + M[14]];
          for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); } }
        boxes.push([lo, hi, m.name]);
      }
    } else { const bb = m.getBoundingInfo().boundingBox; boxes.push([[bb.minimumWorld.x, bb.minimumWorld.y, bb.minimumWorld.z], [bb.maximumWorld.x, bb.maximumWorld.y, bb.maximumWorld.z], m.name]); }
  }
  const a = s.metadata && s.metadata.adventure;
  if (a && a.session) for (const p of a.session.map.pieces) if (p.kind === 'block') boxes.push([[p.minX, p.y0, p.minZ], [p.maxX, p.top, p.maxZ], p.id]);
  let inside = null;
  for (const [lo, hi, n] of boxes) if (eye.x > lo[0] && eye.x < hi[0] && eye.y > lo[1] && eye.y < hi[1] && eye.z > lo[2] && eye.z < hi[2]) { inside = n; break; }
  return { inside, eye: [+eye.x.toFixed(1), +eye.y.toFixed(1), +eye.z.toFixed(1)], solids: boxes.length }; })()`;

const pct = (a: number[], p: number) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] * 10) / 10; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function drive(page: Page, ms: number): Promise<void> {
  const end = Date.now() + ms - 500;
  let i = 0;
  while (Date.now() < end) {
    const k = ['w', 'd', 's', 'a'][i % 4];
    await page.keyboard.down(k).catch(() => {}); await sleep(700); await page.keyboard.up(k).catch(() => {});
    await page.keyboard.press(i % 2 ? 'Space' : 'j').catch(() => {});
    i++; await sleep(700);
  }
}

async function one(place: string, side: { name: string; feel: Record<string, number> }, run: number, browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const desk = process.env.TIER === 'desktop';
  const ctx = await browser.newContext(desk ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const guard: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (/off-screen|recenter|FrameGuard/i.test(t) && guard.length < 20) guard.push(t.slice(0, 160)); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: process.env.TIER === 'desktop' ? 1 : THROTTLE });
  const feelQ = Object.keys(side.feel).length ? `feel=${encodeURIComponent(JSON.stringify(side.feel))}` : '';
  const res: Record<string, unknown> = { place, side: side.name, run };
  const t0 = Date.now();
  if (place.startsWith('story')) {
    // story: a fresh device at the hub; story@<beat>: Chapter 1 resumed at that beat (AdventureMode's `?beat=` probe seam, never saved)
    const q = [place.startsWith('story@') ? `beat=${place.slice(6)}` : '', feelQ].filter(Boolean).join('&');
    await page.goto(`${ORIGIN}/play/adventure/index.html${q ? `?${q}` : ''}`, { waitUntil: 'load' });
    const pick = await page.waitForSelector('[data-testid="adventure-partner-picker"], [data-testid="adventure-start"]', { timeout: 120000 }).then((h) => h.getAttribute('data-testid')).catch(() => null);
    if (pick === 'adventure-partner-picker') {
      const press = (l: ReturnType<Page['locator']>) => (process.env.TIER === 'desktop' ? l.click() : l.tap()).catch(() => {});
      await press(page.locator('[data-testid^="partner-species-"]').first());
      await page.waitForTimeout(300);
      await press(page.getByTestId('adventure-partner-confirm'));
    }
    const ready = await page.waitForSelector('[data-testid="adventure-start"]:not([disabled])', { timeout: 240000 }).then(() => true).catch(() => false);
    res.readySec = ready ? +((Date.now() - t0) / 1000).toFixed(1) : null;
    if (!ready) { res.errors = errors; await ctx.close(); return res; }
    await (process.env.TIER === 'desktop' ? page.getByTestId('adventure-start').click() : page.getByTestId('adventure-start').tap()).catch(() => {});
  } else {
    // venice: a cold arrival; venice@<spot>: back from a court's game (`?spot=court.run`), as the audit's walk-through arrived
    const spotQ = place.startsWith('venice@') ? `spot=${place.slice(7)}` : '';
    await page.goto(`${ORIGIN}/zone.html?${[place.startsWith('venice') ? 'mode=venice_hub' : '', spotQ, feelQ].filter(Boolean).join('&')}`, { waitUntil: 'load' });
    const ok = await page.waitForFunction(() => { const w = window as unknown as { __ttfp?: number; __err?: string }; return !!w.__ttfp || !!w.__err; }, null, { timeout: 240000 }).then(() => true).catch(() => false);
    const t = await page.evaluate(() => { const w = window as unknown as { __ttfp?: number; __err?: string }; return { ttfp: w.__ttfp ?? null, err: w.__err ?? null }; });
    res.readySec = ok && t.ttfp ? +(t.ttfp / 1000).toFixed(1) : null;
    if (t.err) errors.push(t.err);
    if (!res.readySec) { res.errors = errors; await ctx.close(); return res; }
  }
  await page.waitForTimeout(1500);
  await page.evaluate('window.__iaRaf(4000)');
  const w0 = await page.evaluate('performance.now()') as number;
  const cams: Array<{ inside: string | null }> = [];
  const camSampler = (async () => { const end = Date.now() + 8000; while (Date.now() < end) { const c = await page.evaluate(CAM(place)).catch(() => null) as { inside: string | null } | null; if (c) cams.push(c); await sleep(250); } })();
  const raf = page.evaluate('window.__iaRaf(8000)') as Promise<number[]>;
  await drive(page, 8000);
  const frames = await raf; await camSampler;
  const ia = await page.evaluate('({ soundsAt: window.__ia.soundsAt, beds: window.__iaBeds() })') as { soundsAt: number[]; beds: number[] };
  res.play = { frames: frames.length, p50: pct(frames, 0.5), p95: pct(frames, 0.95), max: pct(frames, 1), sounds: ia.soundsAt.filter((t) => t >= w0).length, beds: ia.beds };
  // the story: a second window in control (the opening scene skipped through the probe seam, as SKIP does), the same drive
  if (place.startsWith('story')) {
    const SEAM = 'window.__FEL_DEV__.scene.metadata.adventure';
    for (let k = 0; k < 20; k++) {
      const paused = await page.evaluate(`(() => { const a = ${SEAM}; if (!a) return null; if (a.session.paused) a.session.runner.skipScene(); return a.session.paused; })()`).catch(() => null);
      if (paused === false) break;
      await sleep(300);
    }
    await page.waitForTimeout(1000);
    const w1 = await page.evaluate('performance.now()') as number;
    const raf2 = page.evaluate('window.__iaRaf(8000)') as Promise<number[]>;
    await drive(page, 8000);
    const f2 = await raf2;
    const at2 = await page.evaluate('window.__ia.soundsAt') as number[];
    const st = await page.evaluate(`${SEAM}.state()`).catch(() => null) as { paused: boolean; beat: string | null } | null;
    res.free = { frames: f2.length, p50: pct(f2, 0.5), p95: pct(f2, 0.95), max: pct(f2, 1), sounds: at2.filter((t) => t >= w1).length, paused: st?.paused ?? null, beat: st?.beat ?? null };
  }
  // phase 9 (CAMWALK=1): the Coast — walk out to the boat at the dock's end with the mode's probe driver, then turn the camera
  // round with the look stick (the eye sweeps over the boat and the sign), sampling the eye every 250 ms
  if (place === 'coast' && process.env.CAMWALK === '1') {
    const walk: Array<{ inside: string | null }> = [];
    const sample = async () => { const c = await page.evaluate(CAM(place)).catch(() => null) as { inside: string | null } | null; if (c) walk.push(c); };
    await page.evaluate('window.__drive({ x: 46, z: 24 })');
    for (let k = 0; k < 60; k++) { await sample(); const d = await page.evaluate('(() => { const c = window.__coast(); return Math.hypot(46 - c.x, 24 - c.z); })()') as number; if (d < 2) break; await sleep(250); }
    await page.evaluate('window.__drive(null)');
    for (const sx of [0.8, -0.8]) {
      await page.evaluate(`window.__bus.emit({ t: 'stick', side: 'R', x: ${sx}, y: 0 })`);
      for (let k = 0; k < 24; k++) { await sample(); await sleep(250); }
      await page.evaluate(`window.__bus.emit({ t: 'stick', side: 'R', x: 0, y: 0 })`);
    }
    // and back along the dock, the camera trailing over the boat
    await page.evaluate('window.__drive({ x: 70, z: 24 })');
    for (let k = 0; k < 40; k++) { await sample(); await sleep(250); }
    await page.evaluate('window.__drive(null)');
    const probe = await page.evaluate('window.__coast()').catch(() => null) as { camPulls?: number | null } | null;
    res.camWalk = { samples: walk.length, inside: walk.filter((c) => c.inside).length, insideOf: [...new Set(walk.map((c) => c.inside).filter(Boolean))], pulls: probe?.camPulls ?? null };
    if (run === 1) { await page.evaluate(`window.__bus.emit({ t: 'stick', side: 'R', x: 0.8, y: 0 })`); await sleep(1200); await page.evaluate(`window.__bus.emit({ t: 'stick', side: 'R', x: 0, y: 0 })`); const f = path.join(OUT, `coast-${side.name}-boat-phone.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 80 }); }
  }
  res.draw = await page.evaluate(STATS).catch(() => null);
  res.cam = { samples: cams.length, inside: cams.filter((c) => c.inside).length, insideOf: [...new Set(cams.map((c) => c.inside).filter(Boolean))] };
  res.guard = guard;
  res.errors = errors;
  if (run === 1) { const f = path.join(OUT, `${place}-${side.name}-${process.env.TIER === 'desktop' ? 'desktop' : 'phone'}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 80 }); res.jpg = f; }
  await ctx.close();
  return res;
}

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results: Record<string, unknown>[] = [];
try {
  for (let r = 1; r <= RUNS; r++) for (const place of PLACES) for (const side of SIDES) {
    const t = Date.now();
    const res = await one(place, side, r, browser);
    results.push(res);
    const p = res.play as { p50: number; p95: number; sounds: number; beds: number[] } | undefined;
    const c = res.cam as { inside: number; samples: number } | undefined;
    const fr = res.free as { sounds: number; p50: number; p95: number; paused: boolean | null } | undefined;
    console.log(`${place} ${side.name} r${r} ${Math.round((Date.now() - t) / 1000)}s ready ${res.readySec} ${fr ? `FREE snd ${fr.sounds} p50 ${fr.p50} p95 ${fr.p95} paused ${fr.paused} ` : ''}${p ? `snd ${p.sounds} beds ${p.beds.join('/')} p50 ${p.p50} p95 ${p.p95}` : ''} ${c ? `camInside ${c.inside}/${c.samples}` : ''} draw ${JSON.stringify(res.draw)} err ${(res.errors as string[]).length} guard ${(res.guard as string[] | undefined)?.length ?? 0}`);
    fs.writeFileSync(path.join(OUT, 'world-rig.json'), JSON.stringify(results, null, 1));
  }
} finally { await browser.close(); stopServer(); }

// the summary: medians per place and side
const med = (a: number[]) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const summary: Record<string, unknown> = {};
for (const place of PLACES) for (const side of SIDES) {
  const rs = results.filter((x) => x.place === place && x.side === side.name);
  const P = rs.map((x) => x.play as { sounds: number; p50: number; p95: number; beds: number[] } | undefined).filter(Boolean) as { sounds: number; p50: number; p95: number; beds: number[] }[];
  const D = rs.map((x) => x.draw as { draws: number; textureMb: number; meshes: number } | null).filter(Boolean) as { draws: number; textureMb: number; meshes: number }[];
  summary[`${place}.${side.name}`] = {
    n: rs.length, ready: rs.map((x) => x.readySec), readyMed: med(rs.map((x) => x.readySec as number)), sounds: P.map((p) => p.sounds), beds: P.map((p) => p.beds.join('/')),
    p50: P.map((p) => p.p50), p95: P.map((p) => p.p95), draws: D.map((d) => d.draws), textureMb: D.map((d) => d.textureMb), meshes: D.map((d) => d.meshes),
    freeSounds: rs.map((x) => (x.free as { sounds: number } | undefined)?.sounds ?? null), freeP50: rs.map((x) => (x.free as { p50: number } | undefined)?.p50 ?? null), freeP95: rs.map((x) => (x.free as { p95: number } | undefined)?.p95 ?? null),
    camInside: rs.map((x) => (x.cam as { inside: number } | undefined)?.inside ?? null),
    camWalkInside: rs.map((x) => (x.camWalk as { inside: number; samples: number } | undefined) ? `${(x.camWalk as { inside: number }).inside}/${(x.camWalk as { samples: number }).samples}` : null),
    camWalkPulls: rs.map((x) => (x.camWalk as { pulls: number | null } | undefined)?.pulls ?? null), guard: rs.map((x) => (x.guard as string[] | undefined)?.length ?? 0), errors: rs.map((x) => (x.errors as string[]).length),
  };
}
fs.writeFileSync(path.join(OUT, 'world-rig-summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
