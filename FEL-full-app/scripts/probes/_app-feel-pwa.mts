// Installable + service worker, measured on the rig (app-feel, round 7, 2026-10-25). No Next server: a small Node
// server serves the page head the root layout renders, the manifest from its real route handler, and public/ files;
// the real ServiceWorkerRegistrar and InstallPrompt are bundled with esbuild (scripts/probes/_app-feel-pwa-entry.tsx).
// Headless Chromium then runs the checks Lighthouse's PWA audit runs, by hand, through the DevTools protocol:
//   manifest   Page.getAppManifest parses /app.webmanifest with no errors, and Page.getInstallabilityErrors is empty
//   icons      every manifest icon loads and decodes at the size it claims
//   worker     with the flag on, /sw.js registers, activates and controls the page; with it off, the kill switch
//              removes it and its caches
//   offline    with the server stopped, a page load shows /offline.html, the pose model and a hashed chunk still load
//              from the cache, and /api fails (it is never cached)
//   prompt     "Install FEL" shows on a hub page, never in a game or on a TV, once, and the iPhone hint after a hop
//
//   npx tsx scripts/probes/_app-feel-pwa.mts <after|before> <outDir> [shotsDir]
// `before` serves the files and the layout as they were at the lane's base (42f7add7, `git show`), with no bundle.
// The <meta> tags Next renders from `metadata.appleWebApp` and `viewport.themeColor` are written here the way
// next/dist/lib/metadata/generate/basic.js writes them; the <link>s are copied from the layout's own <head>.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const MODE = (process.argv[2] ?? 'after') as 'after' | 'before';
const OUT = resolve(process.argv[3] ?? join(ROOT, '.pwa-rig'));
const SHOTS = process.argv[4] ? resolve(process.argv[4]) : OUT;
const BASE_REF = '42f7add7';
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// ── files, as of the working tree (after) or the base commit (before) ────────────────────────────────────────────
const gitHas = (rel: string) => { try { execFileSync('git', ['cat-file', '-e', `${BASE_REF}:FEL-full-app/${rel}`], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };
const fileAt = (rel: string): Buffer | null => {
  if (MODE === 'after') return existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel)) : null;
  return gitHas(rel) ? execFileSync('git', ['show', `${BASE_REF}:FEL-full-app/${rel}`], { cwd: ROOT, maxBuffer: 64 << 20 }) : null;
};
const layoutSrc = fileAt('app/layout.tsx')!.toString('utf8');

/** The <head> the root layout renders: its own <link>s, plus Next's metadata/viewport <meta> tags. */
async function headHtml(): Promise<string> {
  const consts: Record<string, string> = { FAVICON_HREF: '/favicon.svg' };
  if (MODE === 'after') {
    const m = await import('../../lib/pwa/manifest.ts');
    Object.assign(consts, { MANIFEST_HREF: m.MANIFEST_HREF, APPLE_TOUCH_ICON_HREF: m.APPLE_TOUCH_ICON_HREF });
  }
  const head = layoutSrc.slice(layoutSrc.indexOf('<head>') + 6, layoutSrc.indexOf('</head>'));
  const links = [...head.matchAll(/<link [^>]*\/>/g)].map((l) => l[0].replace(/\{(\w+)\}/g, (_, k) => `"${consts[k]}"`));
  const meta = ['<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">'];
  if (/themeColor:/.test(layoutSrc)) meta.push('<meta name="theme-color" content="#050505">');
  if (/applicationName:/.test(layoutSrc)) meta.push('<meta name="application-name" content="Final Evolution Lab">');
  if (/appleWebApp:/.test(layoutSrc)) {
    meta.push('<meta name="apple-mobile-web-app-capable" content="yes">', '<meta name="apple-mobile-web-app-title" content="FEL">',
      '<meta name="apple-mobile-web-app-status-bar-style" content="black">');
  }
  return [...meta, '<title>FEL rig</title>', ...links, '<link rel="stylesheet" href="/rig.css">'].join('\n');
}

// ── the bundle: the real registrar + prompt, with the flag set at bundle time ───────────────────────────────────────
const NAV_SHIM = `
import { useSyncExternalStore } from 'react';
const subs = new Set();
const fire = () => subs.forEach((f) => f());
for (const k of ['pushState', 'replaceState']) { const o = history[k]; history[k] = function (...a) { const r = o.apply(this, a); fire(); return r; }; }
addEventListener('popstate', fire);
export function usePathname() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => location.pathname, () => '/'); }
`;
async function bundle(flag: string): Promise<string> {
  const outfile = join(OUT, `rig-${flag || 'off'}.js`);
  await build({
    entryPoints: [join(ROOT, 'scripts/probes/_app-feel-pwa-entry.tsx')], bundle: true, outfile, format: 'iife', platform: 'browser',
    jsx: 'automatic', tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', minify: true,
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SW_ENABLED': JSON.stringify(flag) },
    plugins: [{ name: 'nav-shim', setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next-navigation-shim', namespace: 'shim' }));
      b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({ contents: NAV_SHIM, loader: 'js', resolveDir: ROOT }));
    } }],
  });
  return readFileSync(outfile, 'utf8');
}

// ── the server ─────────────────────────────────────────────────────────────────────────────────────────────────
const hits = new Map<string, number>();
const hit = (p: string) => hits.set(p, (hits.get(p) ?? 0) + 1);
let rigJs = '';
let head = '';
let css = '';
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html', '.task': 'application/octet-stream', '.wasm': 'application/wasm' };
async function manifestResponse(): Promise<{ body: string; type: string } | null> {
  if (MODE === 'before') return gitHas('app/app.webmanifest/route.ts') ? { body: '', type: '' } : null;
  const { GET } = await import('../../app/app.webmanifest/route.ts');
  const res = GET();
  return { body: await res.text(), type: res.headers.get('content-type') ?? '' };
}
const handler = async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;
  hit(p);
  const send = (status: number, type: string, body: string | Buffer) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'public, max-age=0' }); res.end(body); };
  if (p === '/rig.js') return send(200, 'text/javascript', rigJs);
  if (p === '/rig.css') return send(200, 'text/css', css);
  if (p === '/api/ping') return send(200, 'application/json', JSON.stringify({ at: Date.now() }));
  if (p.startsWith('/_next/static/chunks/')) return send(200, 'text/javascript', `/* chunk ${p} */ window.__chunk = ${JSON.stringify(p)};`);
  if (p === '/app.webmanifest') { const m = await manifestResponse(); return m ? send(200, m.type, m.body) : send(404, 'text/plain', 'not found'); }
  const ext = p.slice(p.lastIndexOf('.'));
  if (TYPES[ext]) { const f = fileAt(`public${p}`); return f ? send(200, TYPES[ext], f) : send(404, 'text/plain', 'not found'); }
  // every other path is "a page": the layout's head, the bundle
  return send(200, 'text/html; charset=utf-8', `<!doctype html><html class="dark"><head>${head}</head><body style="background:#050505;margin:0;min-height:100vh"><main id="page" style="color:#f2f5f9;font:16px system-ui;padding:24px">FEL rig page ${p}</main><div id="root"></div>${rigJs ? '<script src="/rig.js"></script>' : ''}</body></html>`);
};
let server: Server;
const PORT = 38000 + Math.floor(Math.random() * 2000);
const ORIGIN = `http://localhost:${PORT}`;
const startServer = () => new Promise<void>((r) => { server = createServer((q, s) => { void handler(q, s); }).listen(PORT, '127.0.0.1', () => r()); });
const stopServer = () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });

// ── checks ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function installability(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const man = await cdp.send('Page.getAppManifest') as { url: string; errors: { message: string }[]; data?: string };
  const inst = await cdp.send('Page.getInstallabilityErrors') as { installabilityErrors: { errorId: string }[] };
  const data = man.data ? JSON.parse(man.data) : null;
  const icons = data ? await page.evaluate(`Promise.all(${JSON.stringify(data.icons ?? [])}.map(async (i) => {
    const r = await fetch(i.src); if (!r.ok) return { src: i.src, status: r.status };
    const b = await createImageBitmap(await r.blob()); return { src: i.src, sizes: i.sizes, purpose: i.purpose, decoded: b.width + 'x' + b.height };
  }))`) : [];
  const appleTouch = await page.evaluate(`(async () => { const l = document.querySelector('link[rel="apple-touch-icon"]'); if (!l) return null;
    const r = await fetch(l.href); if (!r.ok) return { status: r.status }; const b = await createImageBitmap(await r.blob()); return { href: l.getAttribute('href'), decoded: b.width + 'x' + b.height }; })()`);
  const metas = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('meta[name]')].map((m) => [m.name, m.content]))`);
  return {
    manifestUrl: man.url.replace(ORIGIN, ''), manifestErrors: man.errors.map((e) => e.message), manifest: data,
    installabilityErrors: inst.installabilityErrors.map((e) => e.errorId), icons, appleTouch, metas,
  };
}

const PAGE_EVAL_SW = `(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const ready = await Promise.race([navigator.serviceWorker.ready.then((r) => ({ scope: r.scope, state: r.active && r.active.state, script: r.active && r.active.scriptURL })), new Promise((r) => setTimeout(() => r(null), 8000))]);
  return { supported: true, ready, controlled: !!navigator.serviceWorker.controller };
})()`;
const PAGE_CACHES = `(async () => { const out = {}; for (const n of await caches.keys()) { const c = await caches.open(n); out[n] = (await c.keys()).map((r) => new URL(r.url).pathname); } return out; })()`;
const fetchLen = (p: string) => `fetch(${JSON.stringify(p)}).then(async (r) => ({ status: r.status, bytes: (await r.arrayBuffer()).byteLength })).catch((e) => ({ error: String(e) }))`;

async function hop(page: Page, path: string) {
  await page.evaluate(`history.pushState({}, '', ${JSON.stringify(path)})`);
  await page.waitForTimeout(600);
}
const fakeInstallEvent = `(() => { const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = async () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); })()`;
const promptShown = (page: Page) => page.evaluate(`(() => { const d = document.querySelector('[data-install-prompt]'); return d ? d.getAttribute('data-install-prompt') : null; })()`);

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const TV = 'Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 CrKey/1.56.500000';

// ── run ────────────────────────────────────────────────────────────────────────────────────────────────────────
head = await headHtml();
if (MODE === 'after') {
  const cssFile = join(OUT, 'rig.css');
  execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', cssFile, '--minify'], { cwd: ROOT, stdio: 'ignore' });
  css = readFileSync(cssFile, 'utf8');
  rigJs = await bundle('1');
}
await startServer();
const report: Record<string, unknown> = { mode: MODE, ref: MODE === 'before' ? BASE_REF : 'working tree', origin: ORIGIN };
const profile = join(OUT, 'profile');
rmSync(profile, { recursive: true, force: true });
const ctx: BrowserContext = await chromium.launchPersistentContext(profile, {
  executablePath: chromiumExe(), headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
});
const errors: string[] = [];
try {
  const page = ctx.pages()[0] ?? await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  report.installable = await installability(page);
  report.swFile = (hits.get('/sw.js') ?? 0) > 0 || (await page.evaluate(fetchLen('/sw.js')));
  report.worker = await page.evaluate(PAGE_EVAL_SW);

  if (MODE === 'after') {
    await page.reload({ waitUntil: 'load' });
    report.workerAfterReload = await page.evaluate(PAGE_EVAL_SW);
    // FDB-2's question for the new links: does a client-side hop fetch the manifest or the icons again?
    hits.clear();
    await hop(page, '/modes'); await hop(page, '/train'); await hop(page, '/profile');
    report.requestsDuringThreeHops = Object.fromEntries([...hits].filter(([p]) => /webmanifest|icons|favicon/.test(p)));
    report.installableAfterHops = (await installability(page)).installabilityErrors;

    hits.clear();
    report.online = {
      pose: await page.evaluate(fetchLen('/pose/models/pose_landmarker_lite.task')),
      wasm: await page.evaluate(fetchLen('/pose/wasm/vision_wasm_internal.wasm')),
      chunk: await page.evaluate(fetchLen('/_next/static/chunks/0123456789abcdef.js')),
      api: [await page.evaluate(fetchLen('/api/ping')), await page.evaluate(fetchLen('/api/ping'))],
      apiServerHits: 0,
    };
    (report.online as { apiServerHits: number }).apiServerHits = hits.get('/api/ping') ?? 0;
    await page.waitForTimeout(1500);   // let stale-while-revalidate's cache writes land
    report.cachesOnline = await page.evaluate(PAGE_CACHES);

    // offline: the server is gone
    await stopServer();
    const off = await page.goto(`${ORIGIN}/play/something-new`, { waitUntil: 'load' }).catch((e) => ({ error: String(e) }));
    report.offline = {
      navigationStatus: off && 'status' in off ? off.status() : off,
      title: await page.title(),
      showsOfflinePage: (await page.content()).includes("You're offline"),
      pose: await page.evaluate(fetchLen('/pose/models/pose_landmarker_lite.task')),
      chunk: await page.evaluate(fetchLen('/_next/static/chunks/0123456789abcdef.js')),
      api: await page.evaluate(fetchLen('/api/ping')),
    };
    await page.screenshot({ path: join(SHOTS, 'offline-390.png'), fullPage: true });

    // the kill switch: the same phone, a deploy with the flag off
    rigJs = await bundle('');
    await startServer();
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    report.killSwitch = await page.evaluate(`(async () => ({ registrations: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }))()`);
    rigJs = await bundle('1');
  }
} finally {
  await ctx.close();
}

// "Install FEL", in fresh contexts so each starts never having seen it
if (MODE === 'after') {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
  const fresh = async (ua?: string) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: ua }); return c.newPage(); };
  const prompt: Record<string, unknown> = {};
  let p = await fresh();
  await p.goto(`${ORIGIN}/`, { waitUntil: 'load' }); await p.evaluate(fakeInstallEvent); await p.waitForTimeout(300);
  prompt.hubWithChromeEvent = await promptShown(p);
  await p.screenshot({ path: join(SHOTS, 'install-prompt-android-390.png') });
  await hop(p, '/play/dunk');
  prompt.afterHopIntoGame = await promptShown(p);
  await hop(p, '/');
  prompt.backOnHubSameVisit = await promptShown(p);
  await p.reload({ waitUntil: 'load' }); await p.evaluate(fakeInstallEvent); await p.waitForTimeout(300);
  prompt.nextVisit = await promptShown(p);
  await p.context().close();

  p = await fresh();
  await p.goto(`${ORIGIN}/play/dunk`, { waitUntil: 'load' }); await p.evaluate(fakeInstallEvent); await p.waitForTimeout(300);
  prompt.inGameWithChromeEvent = await promptShown(p);
  await hop(p, '/play');
  prompt.eventKeptThenShownOnHub = await promptShown(p);
  await p.context().close();

  for (const [name, path] of [['tryGuestDunk', '/try'], ['hostTv', '/host'], ['controller', '/controller/ABCD'], ['quickScreen', '/screen']] as const) {
    p = await fresh();
    await p.goto(`${ORIGIN}${path}`, { waitUntil: 'load' }); await p.evaluate(fakeInstallEvent); await p.waitForTimeout(300);
    prompt[name] = await promptShown(p);
    await p.context().close();
  }

  p = await fresh(TV);
  await p.goto(`${ORIGIN}/`, { waitUntil: 'load' }); await p.evaluate(fakeInstallEvent); await p.waitForTimeout(300);
  prompt.tvBrowserOnHub = await promptShown(p);
  await p.context().close();

  p = await fresh(IPHONE);
  await p.goto(`${ORIGIN}/`, { waitUntil: 'load' }); await p.waitForTimeout(300);
  prompt.iphoneFirstPage = await promptShown(p);
  await hop(p, '/modes');
  prompt.iphoneAfterOneHop = await promptShown(p);
  await p.screenshot({ path: join(SHOTS, 'install-prompt-iphone-390.png') });
  await p.context().close();
  report.installPrompt = prompt;
  await browser.close();
}

await stopServer().catch(() => {});
report.pageErrors = errors;
writeFileSync(join(OUT, `report-${MODE}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
rmSync(profile, { recursive: true, force: true });
