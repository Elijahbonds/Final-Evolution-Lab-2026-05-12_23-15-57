// EDU-05 motion lessons: the every-screen plan's speed budgets (docs/PLAN-EVERY-SCREEN-10PHASE.md check 3, owner-approved
// 2026-11-10) on /teach/motion, on the throttled phone: first content ≤ 2.5 s, layout shift ≤ 0.02, a tap answers within
// 200 ms. Plus the 3D: when the body first moves.
//
//   npx tsx scripts/probes/motion-lesson/speed.mts build <siteDir>        (CPU: cpu-run.sh / cpu-short.sh)
//   npx tsx scripts/probes/motion-lesson/speed.mts run <siteDir> [runs]   (browser: /home/user/wt/gate-run.sh)
//
// The bundle is PRODUCTION-like, unlike rig.mts's: esbuild, minified, NODE_ENV production, ESM with code splitting, so the
// stage and Babylon are a lazy chunk exactly as next/dynamic makes them (rig.mts bundles everything into one 23 MB file
// to measure the 3D, which says nothing about how soon the page shows). The page is RENDERED IN THE BROWSER here, while
// production sends its HTML from the server: the first-content number is therefore an upper bound. Next's server pieces
// are stubbed the way the accessibility rig stubs them (scripts/a11y/rig.mts, copied: that file does not export them).
//
// The phone: 390 × 844 at 3× pixels, touch, the CPU slowed 4× (Emulation.setCPUThrottlingRate, as the library and
// first-run probes do). Network not throttled: the files come from this machine.
// Per run: first contentful paint, layout shift (every shift not caused by input, until the body is moving + 2 s), the
// body's first moving frame (the stage's ready), and the tap response for three taps by Event Timing (input → the next
// frame painted): a lesson chip, Slow, a phrase chip. Prints one line per run and the median; writes <siteDir>/speed.json.
import { build, type Plugin } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const [job, siteArg, runsArg] = process.argv.slice(2);
if (!job || !siteArg) { console.error('usage: speed.mts build <siteDir> | run <siteDir> [runs]'); process.exit(2); }
const SITE = resolve(siteArg);

const STUBS: Record<string, string> = {
  'next/link': `import { createElement, forwardRef } from 'react';
    const Link = forwardRef(function Link({ href, children, prefetch, replace, scroll, shallow, passHref, legacyBehavior, ...rest }, ref) {
      return createElement('a', { href: typeof href === 'string' ? href : (href && href.pathname) || '/', ref, ...rest }, children); });
    export default Link;`,
  'next/image': `import { createElement } from 'react';
    export default function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, ...rest }) {
      return createElement('img', { src: typeof src === 'string' ? src : (src && src.src) || '', alt, ...rest }); }`,
  'next/navigation': `export const usePathname = () => window.__PATH;
    export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} });
    export const useSearchParams = () => new URLSearchParams('');
    export const useParams = () => ({});
    export const redirect = (to) => { throw new Error('redirect ' + to); };
    export const notFound = () => { throw new Error('404'); };`,
  'next/dynamic': `import { createElement, lazy, Suspense } from 'react';
    export default function dynamic(loader) { const L = lazy(async () => { const m = await loader(); return { default: m.default || m }; });
      return (props) => createElement(Suspense, { fallback: null }, createElement(L, props)); }`,
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
  '@/lib/db': `const answer = (m) => m === 'count' ? 0 : /^findMany|groupBy$/.test(m) ? [] : m === 'aggregate' ? { _sum: {}, _count: 0, _max: {}, _min: {}, _avg: {} } : null;
    const model = () => new Proxy({}, { get: (_, m) => async () => answer(String(m)) });
    export const prisma = new Proxy({}, { get: (_, k) => k === '$transaction' ? async (x) => Array.isArray(x) ? Promise.all(x) : x(prisma) : k === '$queryRaw' || k === '$queryRawUnsafe' ? async () => [] : model() });
    export const db = prisma; export default prisma;`,
  'server-only': ``,
};
const stubs: Plugin = {
  name: 'motion-speed-stubs',
  setup(b) {
    const re = new RegExp(`^(${Object.keys(STUBS).map((k) => k.replace(/[/@-]/g, '\\$&')).join('|')})$`);
    b.onResolve({ filter: re }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ loader: 'tsx', resolveDir: ROOT, contents: STUBS[a.path] }));
    b.onResolve({ filter: /^(node:.*|crypto|fs|fs\/promises|path|os|stream|zlib|http|https|net|tls|dns|child_process|util|async_hooks|perf_hooks|worker_threads|url|buffer|events)$/ }, (a) => ({ path: a.path, namespace: 'nodestub' }));
    b.onLoad({ filter: /.*/, namespace: 'nodestub' }, () => ({ loader: 'js', contents: 'const f = function () { return p; }; const p = new Proxy(f, { get: (t, k) => k === "__esModule" ? false : k === Symbol.toPrimitive ? () => "" : p, apply: () => p, construct: () => p }); module.exports = p;' }));
  },
};

if (job === 'build') {
  mkdirSync(SITE, { recursive: true });
  await build({
    absWorkingDir: ROOT, entryPoints: { entry: resolve(import.meta.dirname, 'rig-entry.tsx') }, bundle: true, splitting: true, format: 'esm',
    minify: true, platform: 'browser', target: 'es2020', jsx: 'automatic', tsconfig: join(ROOT, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"' }, plugins: [stubs], logLevel: 'error', outdir: SITE, chunkNames: 'c/[hash]',
    banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } }; globalThis.process = process;' },
    loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty', '.glb': 'empty' },
    external: ['@mediapipe/tasks-vision'],
  });
  const tw = join(SITE, 'tw.css');
  execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', tw, '--minify'], { cwd: ROOT, stdio: 'ignore' });
  const face = (fam: string, file: string, weight: string) => `@font-face{font-family:'${fam}';src:url('/__fonts/${file}') format('woff2');font-weight:${weight};font-display:swap}`;
  const fonts = [
    ...['500', '600', '700', '800'].map((wt) => face('FEL Barlow', `barlow-condensed-latin-${wt}.woff2`, wt)),
    face('FEL Plex', 'ibm-plex-sans-latin-variable.woff2', '400 700'),
    face('FEL Mono', 'jetbrains-mono-latin-variable.woff2', '100 800'),
    ...['400', '500', '600', '700'].map((wt) => face('FEL Chakra', `chakra-petch-latin-${wt}.woff2`, wt)),
    `:root{--font-display:'FEL Barlow';--font-sans:'FEL Plex';--font-mono:'FEL Mono';--font-chakra:'FEL Chakra'}`,
  ].join('\n');
  writeFileSync(join(SITE, 'app.css'), [fonts, readFileSync(tw, 'utf8'), readFileSync(join(ROOT, 'app/theme.css'), 'utf8')].join('\n'));
  writeFileSync(join(SITE, 'index.html'), '<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><script type="module" src="/entry.js"></script></head><body class="font-sans min-h-screen bg-[#050505]"><div id="root"></div></body></html>');
  const chunks = readdirSync(join(SITE, 'c')).map((f) => statSync(join(SITE, 'c', f)).size).sort((a, b) => b - a);
  console.log(`built → ${SITE}: entry ${(statSync(join(SITE, 'entry.js')).size / 1e3).toFixed(0)} KB, ${chunks.length} chunks, largest ${(chunks[0] / 1e6).toFixed(2)} MB`);
  process.exit(0);
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.env': 'application/octet-stream' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const tries = p.startsWith('/__fonts/') ? [join(ROOT, 'app/fonts', p.slice(9))] : p.startsWith('/__fixtures/') ? [join(ROOT, 'lib/pose/__fixtures__', p.slice(12))] : [join(SITE, p === '/' ? 'index.html' : p), join(ROOT, 'public', p)];
  const f = tries.find((x) => !x.includes('..') && existsSync(x) && statSync(x).isFile());
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
const url = await new Promise<string>((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

const OBSERVE = `window.__cls = 0; window.__shifts = []; window.__events = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4)]); } }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__events.push({ name: e.name, start: Math.round(e.startTime), duration: e.duration }); }).observe({ type: 'event', buffered: true, durationThreshold: 16 }); } catch {}
  window.__name = window.__name || function (f) { return f; };`;

const runs = Number(runsArg ?? 3);
const rows: Record<string, number | null | unknown>[] = [];
for (let r = 0; r < runs; r++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(OBSERVE);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(`${url}/?body=male#page`);
  let readyMs: number | null = null;
  try {
    await page.waitForFunction(() => document.querySelector('[data-motion-player]')?.getAttribute('data-motion-state') === 'ready', undefined, { timeout: 240_000 });
    readyMs = await page.evaluate('performance.now()') as number;
  } catch (e) { errors.push(String(e).slice(0, 120)); }
  await page.waitForTimeout(2000);
  const fcp = await page.evaluate(`(performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime ?? null`) as number | null;
  const cls = await page.evaluate('window.__cls') as number;
  const shifts = await page.evaluate('window.__shifts');
  // three taps, each answered by the next painted frame (Event Timing: input → paint)
  const taps: Record<string, number | null> = {};
  for (const [label, sel] of [['lesson chip', '[data-motion-sample="max-jump"]'], ['Slow', '[data-motion-slow]'], ['phrase chip', '[data-motion-phrase="1"]']] as const) {
    if (!(await page.$(sel))) { taps[label] = null; continue; }
    if (label !== 'lesson chip') await page.waitForFunction(() => document.querySelector('[data-motion-player]')?.getAttribute('data-motion-state') === 'ready', undefined, { timeout: 120_000 }).catch(() => undefined);
    const before = await page.evaluate('window.__events.length') as number;
    const at = await page.evaluate('performance.now()') as number;
    await page.tap(sel);
    await page.waitForTimeout(1500);
    const ev = (await page.evaluate('window.__events') as { name: string; start: number; duration: number }[]).slice(before).filter((e) => e.start >= at - 5);
    taps[label] = ev.length ? Math.max(...ev.map((e) => e.duration)) : 16;   // under the 16 ms reporting floor: one frame
    if (label === 'lesson chip') await page.waitForTimeout(2500);
  }
  const row = { run: r + 1, fcpMs: fcp && Math.round(fcp), cls: +cls.toFixed(4), shifts, bodyMovingMs: readyMs && Math.round(readyMs), wallMs: Date.now() - t0, taps, errors };
  rows.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close(); server.close();
const med = (xs: (number | null)[]) => { const s = xs.filter((x): x is number => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const summary = {
  firstContentMs: med(rows.map((x) => x.fcpMs as number | null)), layoutShiftMax: Math.max(...rows.map((x) => x.cls as number)), bodyMovingMs: med(rows.map((x) => x.bodyMovingMs as number | null)),
  tapMsMax: Math.max(...rows.flatMap((x) => Object.values(x.taps as Record<string, number | null>).filter((v): v is number => v != null))),
  budgets: { firstContentMs: 2500, layoutShift: 0.02, tapMs: 200 },
};
writeFileSync(join(SITE, 'speed.json'), JSON.stringify({ rows, summary }, null, 1));
console.log(`MEDIAN of ${runs}: first content ${summary.firstContentMs} ms (budget 2500) · layout shift max ${summary.layoutShiftMax} (budget 0.02) · tap max ${summary.tapMsMax} ms (budget 200) · body moving ${summary.bodyMovingMs} ms`);
