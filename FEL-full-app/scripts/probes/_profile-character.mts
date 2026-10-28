// PROFILE-CHARACTER: the profile's athlete stage on a phone, measured (lane/profile-character, 2026-10-27). No Next server:
// scripts/probes/_profile-character-entry.tsx (the real /profile and /u/[slug] page modules, the server stubbed) is
// bundled with esbuild as a RELEASE build (NODE_ENV production, minified, code-split the way next/dynamic splits, so
// Babylon is its own lazy chunk), the app's Tailwind compiled with its own CLI, and both served with public/ by a static
// file server into headless Chromium (SwiftShader GL).
//
//   npx tsx scripts/probes/_profile-character.mts build <outDir> <label>      bundle the tree as it is now (no browser)
//   flock /home/user/wt/gate-queue.lock timeout 900 npx tsx scripts/probes/_profile-character.mts run <outDir> <label>…
//
// `run`, per label, on the phone profile (390×844, DPR 3, CPU throttled 4×), each label in a FRESH browser context:
//   first   the first visit to /profile: FCP, the long tasks, the tap response (six taps 2.5 s apart from FCP+0.5 s, each timed
//           with the Event Timing API), when the real character shows, the JS heap once settled
//   repeat  the same context reloads /profile (what the device kept is still there): the same numbers
//   viewer  /u/jordan seen by another account: FCP and the stage
// Shots (jpg) at first paint and once settled; metrics.json beside them.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const [job = 'run', outArg, ...labels] = process.argv.slice(2);
const OUT = resolve(outArg ?? join(ROOT, '.profile-character-rig'));
mkdirSync(OUT, { recursive: true });

// Next's server and router pieces, stubbed (the same set as scripts/a11y/rig.mts, copied so neither rig can break the
// other); the database answers from window.__DB[model][method] (the entry's fixture), else "nothing".
const STUBS: Record<string, string> = {
  'next/link': `import { createElement, forwardRef } from 'react';
    const Link = forwardRef(function Link({ href, children, prefetch, replace, scroll, shallow, passHref, legacyBehavior, ...rest }, ref) {
      return createElement('a', { href: typeof href === 'string' ? href : (href && href.pathname) || '/', ref, ...rest }, children); });
    export default Link;`,
  'next/image': `import { createElement } from 'react';
    export default function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, ...rest }) {
      return createElement('img', { src: typeof src === 'string' ? src : (src && src.src) || '', alt, ...rest, style: fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...(rest.style || {}) } : rest.style }); }`,
  'next/navigation': `export const usePathname = () => window.__PATH;
    export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} });
    export const useSearchParams = () => new URLSearchParams('');
    export const useParams = () => ({});
    export const redirect = (to) => { throw new Error('redirect ' + to); };
    export const notFound = () => { throw new Error('404'); };`,
  'next/dynamic': `import { createElement, lazy, Suspense } from 'react';
    export default function dynamic(loader, opts) { const L = lazy(async () => { const m = await loader(); return { default: m.default || m }; });
      const fb = opts && opts.loading ? createElement(opts.loading) : null;
      return (props) => createElement(Suspense, { fallback: fb }, createElement(L, props)); }`,
  'next/headers': `export const cookies = () => ({ get: () => undefined, getAll: () => [], has: () => false });
    export const headers = () => new Headers();`,
  'next-auth': `export const getServerSession = async () => window.__SESSION; export default function NextAuth() {}`,
  'next-auth/react': `import { createContext, createElement } from 'react';
    const value = () => ({ data: window.__SESSION, status: window.__SESSION ? 'authenticated' : 'unauthenticated', update: async () => window.__SESSION });
    export const SessionContext = createContext(undefined);
    export const useSession = () => value();
    export const SessionProvider = ({ children }) => createElement(SessionContext.Provider, { value: value() }, children);
    export const signIn = async () => ({ ok: true }); export const signOut = async () => {};
    export const getSession = async () => window.__SESSION; export const getCsrfToken = async () => 'x'; export const getProviders = async () => ({});`,
  '@/lib/auth': `export const authOptions = {};`,
  '@/lib/db': `const answer = (k, m) => { const f = (window.__DB || {})[k]; if (f && m in f) return f[m];
      return m === 'count' ? 0 : /^findMany|groupBy$/.test(m) ? [] : m === 'aggregate' ? { _sum: {}, _count: 0, _max: {}, _min: {}, _avg: {} } : null; };
    const model = (k) => new Proxy({}, { get: (_, m) => async () => answer(String(k), String(m)) });
    export const prisma = new Proxy({}, { get: (_, k) => k === '$transaction' ? async (x) => Array.isArray(x) ? Promise.all(x) : x(prisma) : k === '$queryRaw' || k === '$queryRawUnsafe' ? async () => [] : model(k) });
    export const db = prisma; export default prisma;`,
  'server-only': ``,
};

async function bundle(label: string): Promise<void> {
  const SITE = join(OUT, `.build-${label}`);
  mkdirSync(SITE, { recursive: true });
  await build({
    entryPoints: [join(ROOT, 'scripts/probes/_profile-character-entry.tsx')], bundle: true, outdir: SITE, entryNames: 'rig', format: 'esm', splitting: true, platform: 'browser',
    // MINIFY=0: readable names for the `profile` job's CPU profile (still a production build)
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', minify: process.env.MINIFY !== '0',
    banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } }; var __dirname = "/";' },
    loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty', '.wasm': 'empty' },
    external: ['@mediapipe/tasks-vision'],
    plugins: [{
      name: 'profile-character-stubs',
      setup(b) {
        const re = new RegExp(`^(${Object.keys(STUBS).map((k) => k.replace(/[/@-]/g, '\\$&')).join('|')})$`);
        b.onResolve({ filter: re }, (a) => ({ path: a.path, namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ loader: 'tsx', resolveDir: ROOT, contents: STUBS[a.path] }));
        b.onResolve({ filter: /^(node:.*|crypto|fs|fs\/promises|path|os|stream|zlib|http|https|net|tls|dns|child_process|util|async_hooks|perf_hooks|worker_threads|url|buffer|events)$/ }, (a) => ({ path: a.path, namespace: 'nodestub' }));
        b.onLoad({ filter: /.*/, namespace: 'nodestub' }, () => ({ loader: 'js', contents: 'const f = function () { return p; }; const p = new Proxy(f, { get: (t, k) => k === "__esModule" ? false : k === Symbol.toPrimitive ? () => "" : p, apply: () => p, construct: () => p }); module.exports = p;' }));
      },
    }],
  });
  const css = join(SITE, 'tw.css');
  execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
  const face = (fam: string, file: string, weight: string) => `@font-face{font-family:'${fam}';src:url('/__fonts/${file}') format('woff2');font-weight:${weight};font-display:swap}`;
  const fonts = [
    ...['500', '600', '700', '800'].map((wt) => face('FEL Barlow', `barlow-condensed-latin-${wt}.woff2`, wt)),
    face('FEL Plex', 'ibm-plex-sans-latin-variable.woff2', '400 700'),
    face('FEL Mono', 'jetbrains-mono-latin-variable.woff2', '100 800'),
    ...['400', '500', '600', '700'].map((wt) => face('FEL Chakra', `chakra-petch-latin-${wt}.woff2`, wt)),
    `:root{--font-display:'FEL Barlow';--font-sans:'FEL Plex';--font-mono:'FEL Mono';--font-chakra:'FEL Chakra'}`,
  ].join('\n');
  writeFileSync(join(SITE, 'rig.css'), fonts + '\n' + readFileSync(css, 'utf8') + '\n' + readFileSync(join(ROOT, 'app/theme.css'), 'utf8'));
  writeFileSync(join(SITE, 'index.html'), `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/rig.css"></head><body class="font-sans min-h-screen bg-[#050505]"><div id="root"></div><script type="module" src="/rig.js"></script></body></html>`);
  console.log(`built → ${SITE}`);
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.woff2': 'font/woff2', '.env': 'application/octet-stream' };
function serve(site: string): Promise<{ url: string; close(): void }> {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const tries = p.startsWith('/__fonts/') ? [join(ROOT, 'app/fonts', p.slice(9))] : [join(site, p === '/' ? 'index.html' : p), join(ROOT, 'public', p)];
    const f = tries.find((x) => existsSync(x) && statSync(x).isFile());
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() })));
}

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
const NAME_SHIM = 'window.__name = window.__name || function (f) { return f; }';
/** The page-side recorder: paint, long tasks, and every timed event (Event Timing), from the very start of the load. */
const RECORDER = `(() => {
  const M = window.__M = { fcp: null, long: [], events: [], marks: {} };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') M.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) M.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'pointerdown' || e.name === 'pointerup' || e.name === 'click') M.events.push([e.name, Math.round(e.startTime), Math.round(e.duration), Math.round(e.processingStart - e.startTime)]); }).observe({ type: 'event', buffered: true, durationThreshold: 16 }); } catch {}
  const seen = new Set();
  const tick = () => { const s = document.querySelector('[data-athlete-state]'); const v = s && s.getAttribute('data-athlete-state'); if (v && !seen.has(v)) { seen.add(v); M.marks[v] = Math.round(performance.now()); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})()`;

interface Visit { fcp: number | null; marks: Record<string, number>; steps: Record<string, number>; long: [number, number][]; longCount: number; longTotal: number; longMax: number; tbtAfterFcp: number; longBeforeFcp: number; taps: { maxMs: number; maxDelay: number; all: number[]; wallMs: number[]; maxWallMs: number; events: [string, number, number, number][] }; heapMB: number; error?: string }

async function visit(ctx: BrowserContext, page: Page, url: string, shot: string, opts: { liveTimeout: number; taps: boolean; before: boolean; tap3d?: boolean }): Promise<Visit> {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => (window as unknown as { __M?: { fcp: number | null } }).__M?.fcp != null, undefined, { timeout: 60_000 });
  await page.screenshot({ path: `${shot}-paint.jpg`, type: 'jpeg', quality: 80 });
  // the kept picture, the moment it is up (a repeat visit), before the live 3D replaces it — watched beside the taps
  const posterShot = opts.before ? Promise.resolve() : page.waitForFunction(() => document.querySelector('[data-athlete-state]')?.getAttribute('data-athlete-state') === 'poster', undefined, { timeout: 6000 })
    .then(() => page.screenshot({ path: `${shot}-poster.jpg`, type: 'jpeg', quality: 80 })).then(() => {}, () => {});
  if (opts.tap3d) {
    // the control: the same 3D, the old way — opened by its button
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /See in 3D/ }).click();
  }
  const wall: number[] = [];
  if (opts.taps) {
    // six taps on the page's first heading, 2.5 s apart from FCP+0.5 s (the stage waits for a quiet second, so taps this
    // far apart also land while the 3D loads): a tap the stage's load must not hold up
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(i === 0 ? 500 : 2500);
      const t = page.locator('h2, h1').first();
      const box = await t.boundingBox().catch(() => null);
      // wall time from sending the tap to the page having taken it (the renderer's main thread must be free to ack it)
      if (box) { const t = Date.now(); await page.mouse.click(box.x + 8, box.y + 6); wall.push(Date.now() - t); }
    }
  }
  await posterShot;
  const t0 = Date.now();
  if (opts.tap3d) {
    await page.waitForFunction(() => !!document.querySelector('canvas') && !/Loading your athlete/.test(document.body.innerText), undefined, { timeout: opts.liveTimeout }).catch(() => {});
  }
  if (!opts.before) {
    await page.waitForFunction(() => { const v = document.querySelector('[data-athlete-state]')?.getAttribute('data-athlete-state'); return v === 'live' || v === 'failed' || v === 'viewer'; }, undefined, { timeout: opts.liveTimeout }).catch(() => {});
  }
  await page.waitForTimeout(Math.max(0, 2500 - (Date.now() - t0)));
  await page.screenshot({ path: `${shot}-settled.jpg`, type: 'jpeg', quality: 80 });
  const m = await page.evaluate(() => (window as unknown as { __M: { fcp: number; long: [number, number][]; events: [string, number, number, number][]; marks: Record<string, number> } }).__M);
  const steps = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').filter((e) => e.name.startsWith('fel-athlete:')).map((e) => [e.name.slice(12), Math.round(e.startTime)])));
  const err = await page.evaluate(() => document.body.dataset.rigError ?? null);
  const metrics = (await cdp.send('Performance.getMetrics')).metrics as { name: string; value: number }[];
  const heap = metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0;
  const fcp = m.fcp;
  const long = m.long;
  const taps = m.events.filter((e) => e[0] === 'pointerdown' || e[0] === 'click');
  return {
    fcp: fcp != null ? Math.round(fcp) : null, marks: m.marks, steps, long,
    longCount: long.length, longTotal: long.reduce((a, l) => a + l[1], 0), longMax: long.reduce((a, l) => Math.max(a, l[1]), 0),
    longBeforeFcp: long.filter((l) => l[0] < (fcp ?? 0)).reduce((a, l) => a + l[1], 0),
    tbtAfterFcp: long.filter((l) => l[0] >= (fcp ?? 0)).reduce((a, l) => a + Math.max(0, l[1] - 50), 0),
    taps: { maxMs: taps.reduce((a, e) => Math.max(a, e[2]), 0), maxDelay: taps.reduce((a, e) => Math.max(a, e[3]), 0), all: taps.map((e) => e[2]), wallMs: wall, maxWallMs: Math.max(0, ...wall), events: m.events },
    heapMB: Math.round(heap / 1e5) / 10,
    ...(err ? { error: err.slice(0, 400) } : {}),
  };
}

async function run(label: string): Promise<void> {
  const site = join(OUT, `.build-${label}`);
  if (!existsSync(join(site, 'index.html'))) throw new Error(`no bundle for ${label}: build it first`);
  const dir = join(OUT, label); mkdirSync(dir, { recursive: true });
  const { url, close } = await serve(site);
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  const before = label.startsWith('before');
  const out: Record<string, Visit> = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript(NAME_SHIM);
    await ctx.addInitScript(RECORDER);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`[${label}] pageerror`, String(e).slice(0, 300)));
    out.first = await visit(ctx, page, `${url}/#own`, join(dir, 'own-first'), { liveTimeout: 240_000, taps: true, before });
    console.log(label, 'first', JSON.stringify(out.first));
    // the same device, a later visit: a fresh page in the same context (IndexedDB and the HTTP cache are kept)
    await page.close();
    const page2 = await ctx.newPage();
    out.repeat = await visit(ctx, page2, `${url}/#own`, join(dir, 'own-repeat'), { liveTimeout: 240_000, taps: true, before });
    console.log(label, 'repeat', JSON.stringify(out.repeat));
    await page2.close();
    const page3 = await ctx.newPage();
    out.viewer = await visit(ctx, page3, `${url}/#viewer`, join(dir, 'viewer'), { liveTimeout: 20_000, taps: false, before });
    console.log(label, 'viewer', JSON.stringify(out.viewer));
    await ctx.close();
    if (before) {
      // the control: the old stage's "See in 3D", tapped half a second after first paint, in a fresh context
      const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await c2.addInitScript(NAME_SHIM);
      await c2.addInitScript(RECORDER);
      const p4 = await c2.newPage();
      out.tapped3d = await visit(c2, p4, `${url}/#own`, join(dir, 'own-tapped3d'), { liveTimeout: 240_000, taps: true, before, tap3d: true });
      console.log(label, 'tapped3d', JSON.stringify(out.tapped3d));
      await c2.close();
    }
  } finally {
    await browser.close();
    close();
  }
  writeFileSync(join(dir, 'metrics.json'), JSON.stringify(out, null, 2));
}

/** Where the 3D's main-thread time goes: a CPU profile of the first visit (build with MINIFY=0), self time by function. */
async function profileJob(label: string): Promise<void> {
  const site = join(OUT, `.build-${label}`);
  const { url, close } = await serve(site);
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript(NAME_SHIM);
    await ctx.addInitScript(RECORDER);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
    await page.goto(`${url}/#own`);
    await page.waitForFunction(() => document.querySelector('[data-athlete-state]')?.getAttribute('data-athlete-state') === 'live', undefined, { timeout: 300_000 }).catch(() => {});
    const { profile } = await cdp.send('Profiler.stop') as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[]; samples: number[]; timeDeltas: number[] } };
    const m = await page.evaluate(() => ({ long: (window as unknown as { __M: { long: [number, number][] } }).__M.long, steps: Object.fromEntries(performance.getEntriesByType('mark').filter((e) => e.name.startsWith('fel-athlete:')).map((e) => [e.name.slice(12), Math.round(e.startTime)])) }));
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map<number, number>();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const self = new Map<string, number>();
    const incl = new Map<string, number>();
    profile.samples.forEach((id, i) => {
      const dt = (profile.timeDeltas[i] ?? 0) / 1000;
      const n = byId.get(id)!;
      const key = (f: { functionName: string; url: string; lineNumber: number }) => `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
      self.set(key(n.callFrame), (self.get(key(n.callFrame)) ?? 0) + dt);
      const seen = new Set<string>();
      for (let cur: number | undefined = id; cur != null; cur = parent.get(cur)) { const k = key(byId.get(cur)!.callFrame); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); } }
    });
    const top = (mp: Map<string, number>, n: number) => [...mp].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v)} ms  ${k}`);
    const out = { steps: m.steps, long: m.long.filter((l) => l[1] >= 150), self: top(self, 30), inclusive: top(incl, 60) };
    writeFileSync(join(OUT, `profile-${label}.json`), JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ steps: out.steps, long: out.long }));
    console.log(out.self.join('\n'));
    await ctx.close();
  } finally { await browser.close(); close(); }
}

/** FCP only, many samples, labels interleaved (A B A B …): a fresh context per sample, the page closed 1.5 s after FCP. */
async function fcpJob(ls: string[], reps: number): Promise<void> {
  const sites = await Promise.all(ls.map((l) => serve(join(OUT, `.build-${l}`))));
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: GL_ARGS });
  const out: Record<string, { fcp: number[]; preFcpLong: number[] }> = Object.fromEntries(ls.map((l) => [l, { fcp: [], preFcpLong: [] }]));
  try {
    // r = -1: one warm-up visit per label, not counted (the first load on an origin compiles every script cold)
    for (let r = -1; r < reps; r++) for (let i = 0; i < ls.length; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await ctx.addInitScript(NAME_SHIM); await ctx.addInitScript(RECORDER);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(`${sites[i].url}/#own`, { waitUntil: 'commit' });
      await page.waitForFunction(() => (window as unknown as { __M?: { fcp: number | null } }).__M?.fcp != null, undefined, { timeout: 60_000 });
      await page.waitForTimeout(1500);
      const m = await page.evaluate(() => (window as unknown as { __M: { fcp: number; long: [number, number][] } }).__M);
      if (r >= 0) out[ls[i]].fcp.push(Math.round(m.fcp)); if (r >= 0) out[ls[i]].preFcpLong.push(m.long.filter((l) => l[0] < m.fcp).reduce((a, l) => a + l[1], 0));
      await ctx.close();
    }
  } finally { await browser.close(); for (const s of sites) s.close(); }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const res = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, fcpMedian: med(v.fcp), preFcpLongMedian: med(v.preFcpLong) }]));
  writeFileSync(join(OUT, 'fcp.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res));
}

if (job === 'build') { for (const l of labels.length ? labels : ['now']) await bundle(l); }
else if (job === 'fcp') { await fcpJob(labels, Number(process.env.REPS ?? 5)); }
else if (job === 'profile') { for (const l of labels) await profileJob(l); }
else if (job === 'run') { for (const l of labels.length ? labels : ['now']) await run(l); }
else throw new Error(`unknown job ${job}`);
