// The exercise library's 3D demo and muscle view, measured (LIBRARY-ANATOMY, 2026-10-25). No Next server:
// scripts/probes/_library-anatomy-entry.tsx (the real stage, switcher and browser, the real data) is bundled with esbuild,
// the app's Tailwind compiled with its own CLI, and both served with public/ by a static file server into headless
// Chromium (SwiftShader GL). Jobs (argv[2]):
//   clips [names…]  a contact sheet per clip: four phases of the loop, the stage as a phone shows it
//   muscles [ids…]  the muscle view, front and back, for library entries
//   ui              the card quick links and the sheet's four tabs at 390 and 1280 px (no sideways scroll, no error)
//   perf            the phone profile (390×844, DPR 3, 4× CPU throttle): frame time and FPS, JS heap, draw calls, with
//                   the Muscles tab open and with the Demo tab playing, after the body has loaded
//   chunks          the lazy chunk sizes (esbuild, minified, code-split the way next/dynamic splits them)
//   OUT=<dir> npx tsx scripts/probes/_library-anatomy.mts <job> [args]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.OUT ?? join(ROOT, '.library-anatomy-rig');
const job = process.argv[2] ?? 'clips';
const args = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
const SITE = join(OUT, 'site');
mkdirSync(SITE, { recursive: true });

async function bundle(): Promise<void> {
  await build({
    entryPoints: [join(ROOT, 'scripts/probes/_library-anatomy-entry.tsx')], bundle: true, outdir: SITE, entryNames: 'rig', format: 'esm', splitting: true, platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', minify: false,
    banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
    loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty', '.wasm': 'empty' },
  });
  const css = join(SITE, 'rig.css');
  if (!existsSync(css) || process.env.CSS === '1') execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
  writeFileSync(join(SITE, 'index.html'), `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/rig.css"></head><body style="margin:0;background:#050505;color:#fff"><div id="root"></div><script type="module" src="/rig.js"></script></body></html>`);
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.env': 'application/octet-stream' };
function serve(): Promise<{ url: string; close(): void }> {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const tries = [join(SITE, p === '/' ? 'index.html' : p), join(ROOT, 'public', p)];
    const f = tries.find((x) => existsSync(x) && statSync(x).isFile());
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => { const a = server.address() as { port: number }; ok({ url: `http://127.0.0.1:${a.port}`, close: () => server.close() }); }));
}

/** tsx names arrow functions with esbuild's __name helper, which the page does not have */
const NAME_SHIM = 'window.__name = window.__name || function (f) { return f; }';
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

async function stageReady(page: Page, timeout = 240_000): Promise<void> {
  await page.waitForFunction(() => document.querySelector('[data-testid="exercise-stage"]')?.getAttribute('data-state') === 'ready', undefined, { timeout });
  await page.waitForTimeout(400);
}

/** Pause the playing clip at `sec` and draw one frame. */
async function at(page: Page, clip: string, sec: number): Promise<void> {
  await page.evaluate(([c, s]) => {
    const st = (window as unknown as { __FEL_LIBRARY_STAGE__: { scene: { animationGroups: { name: string; isStarted: boolean; from: number; to: number; goToFrame(f: number): void; pause(): void }[]; render(): void } } }).__FEL_LIBRARY_STAGE__;
    const g = st.scene.animationGroups.find((x) => x.name === c && x.isStarted) ?? st.scene.animationGroups.find((x) => x.name === c);
    if (g) { g.goToFrame(Math.min(g.to, g.from + (s as number) * 30)); g.pause(); }
  }, [clip, sec] as const);
  await page.waitForTimeout(250);
}

async function clipsJob(): Promise<void> {
  const { url, close } = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  const names = args.length ? args : (await import('../../lib/babylon/anim/authored/exercise.ts')).EXERCISE_CLIPS as string[];
  const report: Record<string, unknown> = {};
  const shotsDir = join(OUT, 'clips'); mkdirSync(shotsDir, { recursive: true });
  for (const clip of names) {
    const page = await browser.newPage({ viewport: { width: 420, height: 315 }, deviceScaleFactor: 1 }); await page.addInitScript(NAME_SHIM);
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await page.goto(`${url}/#stage:${clip}`);
    try { await stageReady(page); } catch (e) { errors.push(String(e)); }
    const dur = await page.evaluate((c) => { const st = (window as unknown as { __FEL_LIBRARY_STAGE__?: { scene: { animationGroups: { name: string; from: number; to: number }[] } } }).__FEL_LIBRARY_STAGE__; const g = st?.scene.animationGroups.find((x) => x.name === c); return g ? (g.to - g.from) / 30 : null; }, clip);
    const frames: string[] = [];
    if (dur) for (const f of [0, 0.25, 0.5, 0.75]) { await at(page, clip, dur * f); const p = join(shotsDir, `${clip}-${Math.round(f * 100)}.png`); await page.screenshot({ path: p }); frames.push(p); }
    report[clip] = { dur, errors: errors.filter((e) => !/favicon|404/.test(e)) };
    await page.close();
  }
  // contact sheets: 6 clips a page, four phases each
  const sheet = await browser.newPage({ viewport: { width: 4 * 300 + 160, height: 6 * 225 }, deviceScaleFactor: 1 }); await sheet.addInitScript(NAME_SHIM);
  for (let i = 0; i < names.length; i += 6) {
    const rows = names.slice(i, i + 6).map((c) => `<div style="display:flex;align-items:center"><div style="width:160px;color:#fff;font:14px sans-serif">${c}</div>${[0, 25, 50, 75].map((f) => `<img src="file://${join(shotsDir, `${c}-${f}.png`)}" style="width:300px;height:225px">`).join('')}</div>`).join('');
    writeFileSync(join(OUT, 'sheet.html'), `<body style="margin:0;background:#111">${rows}</body>`);
    await sheet.goto(`file://${join(OUT, 'sheet.html')}`); await sheet.waitForTimeout(300);
    await sheet.screenshot({ path: join(OUT, `clips-sheet-${String(i / 6 + 1).padStart(2, '0')}.png`), fullPage: true });
  }
  await browser.close(); close();
  console.log(JSON.stringify(report, null, 1));
}

/** LIBRARY-ANATOMY-2: the clips job on ONE loaded stage — the clip is swapped in place (the stage's own prop change, as the
 *  sheet's Easier / Harder swap does), so a sheet of 60 loops pays for one spawn, not 60. Same shots, same sheets. */
async function sheetJob(): Promise<void> {
  const { url, close } = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  const names = args.length ? args : (await import('../../lib/babylon/anim/authored/exercise.ts')).EXERCISE_CLIPS as string[];
  const report: Record<string, unknown> = {};
  const shotsDir = join(OUT, 'clips'); mkdirSync(shotsDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 315 }, deviceScaleFactor: 1 }); await page.addInitScript(NAME_SHIM);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(`${url}/#stage:idle_stand`);
  await stageReady(page);
  for (const clip of names) {
    const before = errors.length;
    await page.evaluate((c) => (window as unknown as { __rigSetClip(c: string): void }).__rigSetClip(c), clip);
    await page.waitForTimeout(Number(process.env.SETTLE ?? 1800));   // the camera eases to the clip's framing
    const dur = await page.evaluate((c) => { const st = (window as unknown as { __FEL_LIBRARY_STAGE__?: { scene: { animationGroups: { name: string; from: number; to: number }[] } } }).__FEL_LIBRARY_STAGE__; const g = st?.scene.animationGroups.find((x) => x.name === c); return g ? (g.to - g.from) / 30 : null; }, clip);
    if (dur) for (const f of [0, 0.25, 0.5, 0.75]) { await at(page, clip, dur * f); await page.screenshot({ path: join(shotsDir, `${clip}-${Math.round(f * 100)}.png`) }); }
    report[clip] = { dur, errors: errors.slice(before).filter((e) => !/favicon|404/.test(e)) };
    await page.evaluate((c) => { const st = (window as unknown as { __FEL_LIBRARY_STAGE__: { scene: { animationGroups: { name: string; play(loop: boolean): void }[] } } }).__FEL_LIBRARY_STAGE__; st.scene.animationGroups.find((x) => x.name === c)?.play(true); }, clip);
  }
  await page.close();
  const sheet = await browser.newPage({ viewport: { width: 4 * 300 + 160, height: 6 * 225 }, deviceScaleFactor: 1 }); await sheet.addInitScript(NAME_SHIM);
  const prefix = process.env.SHEET ?? 'clips-sheet';
  for (let i = 0; i < names.length; i += 6) {
    const rows = names.slice(i, i + 6).map((c) => `<div style="display:flex;align-items:center"><div style="width:160px;color:#fff;font:14px sans-serif;word-break:break-all">${c}</div>${[0, 25, 50, 75].map((f) => `<img src="file://${join(shotsDir, `${c}-${f}.png`)}" style="width:300px;height:225px">`).join('')}</div>`).join('');
    writeFileSync(join(OUT, 'sheet.html'), `<body style="margin:0;background:#111">${rows}</body>`);
    await sheet.goto(`file://${join(OUT, 'sheet.html')}`); await sheet.waitForTimeout(300);
    await sheet.screenshot({ path: join(OUT, `${prefix}-${String(i / 6 + 1).padStart(2, '0')}.png`), fullPage: true });
  }
  await browser.close(); close();
  console.log(JSON.stringify(report));
}

async function musclesJob(): Promise<void> {
  const { url, close } = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  const ids = args.length ? args : ['goblet-squat', 'romanian-deadlift', 'push-up', 'pull-up'];
  const out: Record<string, unknown> = {};
  for (const id of ids) for (const side of ['front', 'back']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 520 }, deviceScaleFactor: 2 }); await page.addInitScript(NAME_SHIM);
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/#muscles:${id}:${side}`);
    try { await stageReady(page); await page.waitForTimeout(1500); } catch (e) { errors.push(String(e)); }
    await page.screenshot({ path: join(OUT, `muscles-${id}-${side}.png`) });
    out[`${id}:${side}`] = errors;
    await page.close();
  }
  await browser.close(); close();
  console.log(JSON.stringify(out, null, 1));
}

async function uiJob(): Promise<void> {
  const { url, close } = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  const SCENES: { name: string; q: string; tab: 'demo' | 'muscles' | 'cues' | 'card' }[] = [
    { name: 'card', q: 'goblet squat', tab: 'card' },
    { name: 'sheet-demo', q: 'goblet squat', tab: 'demo' },
    { name: 'sheet-muscles', q: 'romanian deadlift', tab: 'muscles' },
    { name: 'sheet-cues', q: 'pogo', tab: 'cues' },
    { name: 'sheet-demo-cuecard', q: 'preacher curl', tab: 'demo' },
  ];
  const results: Record<string, unknown> = {};
  let ok = true;
  for (const width of [390, 1280]) for (const s of SCENES) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width === 390, hasTouch: width === 390 }); await page.addInitScript(NAME_SHIM);
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/#ui`);
    try {
      await page.waitForSelector('[data-testid="library-browser"]', { timeout: 60_000 });
      await page.fill('input[aria-label="Search the exercise library"]', s.q); await page.waitForTimeout(700);
      if (s.tab !== 'card') {
        await page.locator(`[data-testid="library-card"]`).first().locator(`[data-testid="card-link-${s.tab}"]`).click();
        await page.waitForSelector('[data-testid="library-sheet"]');
        if (s.tab === 'demo' || s.tab === 'muscles') { try { await stageReady(page, 240_000); } catch { /* the cue card has no stage */ } await page.waitForTimeout(1200); }
      }
    } catch (e) { errors.push(String(e)); }
    const r = await page.evaluate(`(() => ({ scrollWidth: document.documentElement.scrollWidth, sheetScrollWidth: document.querySelector('[data-testid="library-sheet"]')?.scrollWidth ?? null, sheetWidth: document.querySelector('[data-testid="library-sheet"]')?.clientWidth ?? null,
      tabs: Array.from(document.querySelectorAll('[role="tab"][data-testid^="demo-tab"]')).map((b) => b.textContent), legend: Array.from(document.querySelectorAll('[data-testid="muscle-legend"] li')).map((l) => l.textContent),
      links: Array.from(document.querySelectorAll('[data-testid="card-demo-links"]')).slice(0, 1).map((d) => d.textContent), stage: document.querySelector('[data-testid="exercise-stage"]')?.getAttribute('data-state') ?? null, cueCard: !!document.querySelector('[data-testid="demo-cue-card"]') }))()`) as { scrollWidth: number; sheetScrollWidth: number | null; sheetWidth: number | null };
    const shot = join(OUT, `ui-${s.name}-${width}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    if (s.tab !== 'card') { const sheet = page.locator('[data-testid="library-sheet"]'); if (await sheet.count()) await sheet.screenshot({ path: join(OUT, `ui-${s.name}-${width}-sheet.png`) }); }
    results[`${s.name}@${width}`] = { ...r, errors };
    if (r.scrollWidth > width || (r.sheetScrollWidth ?? 0) > (r.sheetWidth ?? Infinity) + 1 || errors.length) ok = false;
    await page.close();
  }
  await browser.close(); close();
  console.log(JSON.stringify({ ok, results }, null, 1));
  if (!ok) process.exitCode = 1;
}

async function perfJob(): Promise<void> {
  const { url, close } = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: [...GL_ARGS, '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const out: Record<string, unknown> = {};
  for (const [name, hash] of (process.env.CASES ? process.env.CASES.split(',').map((c) => c.split('=') as [string, string]) : [['idle', 'stage:'], ['muscles', 'muscles:romanian-deadlift:back'], ['demo-squat', 'stage:ex_squat'], ['demo-pushup', 'stage:ex_pushup'], ['demo-layup', 'stage:bball_layup_gather']]) as [string, string][]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); await page.addInitScript(NAME_SHIM);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    const t0 = Date.now();
    await page.goto(`${url}/?w=358&h=268#${hash}`);
    await stageReady(page, 600_000);
    const loadMs = Date.now() - t0;
    // RASTER: SwiftShader rasterises on this box's CPU (a phone's GPU does not): draw a 390×292 stage at DPR 1.5, the
    // stage's own cap, so the frame time is the JS + submission a phone pays, not this box's software fill
    const sample = await page.evaluate(async () => {
      const st = (window as unknown as { __FEL_LIBRARY_STAGE__: { engine: { getFps(): number; _drawCalls?: { current: number }; getRenderWidth(): number; getRenderHeight(): number }; scene: { getActiveMeshes(): { length: number }; getEngine(): unknown; meshes: unknown[]; textures: { getSize?(): { width: number; height: number } }[] } } }).__FEL_LIBRARY_STAGE__;
      const frames: number[] = [];
      const js: number[] = [];
      let t0 = 0;
      const sc = st.scene as unknown as { onBeforeRenderObservable: { add(f: () => void): unknown }; onAfterRenderObservable: { add(f: () => void): unknown } };
      sc.onBeforeRenderObservable.add(() => { t0 = performance.now(); });
      sc.onAfterRenderObservable.add(() => { js.push(performance.now() - t0); });
      let last = performance.now();
      await new Promise<void>((done) => { let n = 0; const tick = () => { const now = performance.now(); frames.push(now - last); last = now; if (++n < 90) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
      frames.shift();
      const sorted = [...frames].sort((a, b) => a - b);
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const tex = st.scene.textures.reduce((a, t) => { const s = t.getSize?.(); return a + (s ? s.width * s.height * 4 : 0); }, 0);
      const drawCalls = (st.engine as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? null;
      const jsSorted = js.slice(5).sort((a, b) => a - b);
      const T = (window as unknown as { __FEL_STAGE_T__?: Record<string, number> }).__FEL_STAGE_T__ ?? {};
      return { reskins: (window as unknown as { __FEL_ANATOMY_RESKIN__?: number }).__FEL_ANATOMY_RESKIN__ ?? null, importedAtMs: T.imported, spawnMs: T.spawned - T.imported, jsP50: jsSorted[Math.floor(jsSorted.length / 2)], jsP95: jsSorted[Math.floor(jsSorted.length * 0.95)], anatomyMs: (window as unknown as { __FEL_ANATOMY_MS__?: number }).__FEL_ANATOMY_MS__ ?? null,
        p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length), heapMB: mem ? mem.usedJSHeapSize / 1048576 : null, textureMB: tex / 1048576, activeMeshes: st.scene.getActiveMeshes().length, meshes: st.scene.meshes.length, drawCalls, backing: `${st.engine.getRenderWidth()}x${st.engine.getRenderHeight()}` };
    });
    const m = await cdp.send('Performance.getMetrics') as { metrics: { name: string; value: number }[] };
    const metric = (n: string) => m.metrics.find((x) => x.name === n)?.value ?? null;
    out[name] = { loadMs, ...sample, jsHeapUsedMB: (metric('JSHeapUsedSize') ?? 0) / 1048576, nodes: metric('Nodes') };
    await page.screenshot({ path: join(OUT, `perf-${name}.png`) });
    await ctx.close();
  }
  await browser.close(); close();
  console.log(JSON.stringify(out, null, 1));
}

async function chunksJob(): Promise<void> {
  // the same split next/dynamic makes: the library page's own code, then the stage (Babylon, the body pipeline) only when
  // a 3D tab opens. Minified, so the numbers are a release build's, not the rig's dev bundle.
  const dir = join(OUT, 'chunks');
  await build({
    entryPoints: { switcher: join(ROOT, 'components/library/library-demo.tsx') }, bundle: true, outdir: dir, format: 'esm', splitting: true, platform: 'browser', minify: true,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', metafile: true,
    external: ['react', 'react-dom', 'next/*', 'lucide-react'],
    loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty', '.wasm': 'empty' },
  }).then((r) => writeFileSync(join(dir, 'meta.json'), JSON.stringify(r.metafile)));
  const rows = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => { const b = readFileSync(join(dir, f)); return { file: f, kB: +(b.length / 1024).toFixed(1), gzipKB: +(gzipSync(b).length / 1024).toFixed(1) }; }).sort((a, b) => b.kB - a.kB);
  console.log(JSON.stringify(rows, null, 1));
}

async function measureJob(): Promise<void> {
  // the live rig's joints at a few phases of each clip (world metres): the same numbers the node rig tests read, from the
  // body the stage actually spawned
  const { url, close } = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  for (const clip of args) {
    const page = await browser.newPage({ viewport: { width: 420, height: 315 } }); await page.addInitScript(NAME_SHIM);
    await page.goto(`${url}/#stage:${clip}`);
    await stageReady(page);
    for (const f of (process.env.F ?? '0,0.25,0.5').split(',').map(Number)) {
      const r = await page.evaluate(([c, frac]) => {
        const st = (window as unknown as { __FEL_LIBRARY_STAGE__: { scene: { animationGroups: { name: string; from: number; to: number; goToFrame(f: number): void; pause(): void; targetedAnimations: unknown[] }[]; render(): void }; hero: { skeleton: { bones: { name: string; getTransformNode(): { getAbsolutePosition(): { x: number; y: number; z: number }; computeWorldMatrix(f: boolean): void } | null }[] }; root: { position: { x: number; y: number; z: number }; rotation: { y: number } } } } }).__FEL_LIBRARY_STAGE__;
        const g = st.scene.animationGroups.find((x) => x.name === c)!;
        g.goToFrame(g.from + (g.to - g.from) * (frac as number)); g.pause(); st.scene.render();
        const P = (n: string) => { const b = st.hero.skeleton.bones.find((x) => x.name.replace(/^mixamorig:?/, '').replace(/_[a-z]{1,2}\d+$/, '') === n)?.getTransformNode(); if (!b) return null; b.computeWorldMatrix(true); const p = b.getAbsolutePosition(); return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; };
        return { groups: st.scene.animationGroups.filter((x) => x.name === c).length, rootYaw: st.hero.root.rotation.y, hips: P('Hips'), head: P('Head'), lArm: P('LeftArm'), lHand: P('LeftHand'), rHand: P('RightHand'), lFoot: P('LeftFoot') };
      }, [clip, f] as const);
      console.log(clip, f, JSON.stringify(r));
    }
    await page.close();
  }
  await browser.close(); close();
}

await bundle();
if (job === 'measure') await measureJob();
if (job === 'clips') await clipsJob();
else if (job === 'sheet') await sheetJob();
else if (job === 'muscles') await musclesJob();
else if (job === 'ui') await uiJob();
else if (job === 'perf') await perfJob();
else if (job === 'chunks') await chunksJob();
