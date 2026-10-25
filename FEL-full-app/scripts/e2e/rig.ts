// The static rig: real pages in real Chromium, with no Next server (QG-01/02/03, quality-gates lane, 2026-10-25).
//
// Owner, quality round 2026-10-20: "Playwright E2E of the key flows on every PR, blocking" — with playwright-core only
// (no new dependency) and never `next dev` / `next build` on a lane box. So a page is built the way the probes have
// built screens since COACH-BUSINESS: its real client components bundled by esbuild (scripts/e2e/stubs.ts stands in for
// the few next/* runtime modules), the app's real Tailwind CSS compiled by its own CLI and the app's own fonts, loaded
// into headless Chromium on a made-up origin, https://fel.test.
//
// EVERY request the page makes is answered here (BrowserContext.route), so a flow is hermetic:
//   /__rig/<bundle>.js, /__rig/app.css, /__rig/fonts/*   the build
//   a path the flow registered as a page                 an HTML shell that loads that page's bundle
//   /api/**                                              the flow's API fake (each call is recorded for the flow's asserts)
//   any other host                                       the flow's `external` fake (the Stripe test fake), else ABORTED:
//                                                        nothing leaves this box, and no key is ever needed
//   a file that exists under public/                     served from disk (models, images, audio)
//   anything else                                        a "landed" page: <body data-rig-landed="/path">, so a flow can
//                                                        assert where a real navigation went
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Browser, BrowserContext, Page, Request, Route } from 'playwright-core';
import { nextStubs } from './stubs';

export const ROOT = resolve(__dirname, '../..');
export const ORIGIN = 'https://fel.test';   // https: a secure context, as production is (navigator.clipboard, crypto.subtle)

export interface ApiRequest { method: string; path: string; query: URLSearchParams; body: unknown; raw: string | null; headers: Record<string, string> }
export interface ApiReply { status?: number; json?: unknown; body?: string; contentType?: string; headers?: Record<string, string> }
export type ApiHandler = (req: ApiRequest) => ApiReply | undefined | Promise<ApiReply | undefined>;
export interface ExternalReply { status?: number; body: string; contentType?: string; headers?: Record<string, string> }
export type ExternalHandler = (url: URL, req: Request) => ExternalReply | undefined;

export interface PageDef {
  /** the entry module, relative to the app root (tests/e2e/entries/*.tsx) */
  entry: string;
  /** values published to the page as window.__RIG (props, params) before the bundle runs */
  rig?: Record<string, unknown>;
  /** process.env the bundle sees (NEXT_PUBLIC_* flags) */
  env?: Record<string, string>;
}

export interface Call { method: string; path: string; query: string; body: unknown; status: number }

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.env': 'image/vnd.ms-dds', '.dds': 'image/vnd.ms-dds',
  '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain',
};

// ── the build ───────────────────────────────────────────────────────────────────────────────────────────────────────
const bundles = new Map<string, string>();

export async function bundle(entry: string, env: Record<string, string> = {}): Promise<string> {
  const key = entry + JSON.stringify(env);
  const hit = bundles.get(key);
  if (hit) return hit;
  const procEnv = { NODE_ENV: 'production', NEXTAUTH_URL: ORIGIN, ...env };
  const r = await build({
    entryPoints: [join(ROOT, entry)], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020',
    jsx: 'automatic', tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', minify: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: `var process = { env: ${JSON.stringify(procEnv)}, browser: true, nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)) };` },
    loader: { '.png': 'file', '.jpg': 'file', '.svg': 'file', '.woff2': 'file', '.glb': 'file', '.wav': 'file', '.mp3': 'file' },
    publicPath: '/__rig/asset', assetNames: '[name]-[hash]', outdir: join(tmpdir(), 'fel-rig-out'),
    plugins: [nextStubs(ROOT)],
  });
  const js = r.outputFiles.find((f) => f.path.endsWith('.js'));
  if (!js) throw new Error(`rig: esbuild produced no script for ${entry}`);
  for (const f of r.outputFiles) if (f !== js) assets.set('/__rig/asset/' + f.path.split('/').pop(), Buffer.from(f.contents));
  bundles.set(key, js.text);
  return js.text;
}
const assets = new Map<string, Buffer>();

let cssText: string | null = null;
/** The app's compiled Tailwind (app/globals.css through tailwind.config.ts), once per process, cached on disk by input hash. */
export function appCss(): string {
  if (cssText !== null) return cssText;
  const inputs = ['app/globals.css', 'app/theme.css', 'tailwind.config.ts'].filter((p) => existsSync(join(ROOT, p)));
  const h = createHash('sha1');
  for (const p of inputs) h.update(readFileSync(join(ROOT, p)));
  // the content scan reads every component, so the cache is per-run unless the caller pins it (CI always rebuilds)
  h.update(String(process.pid));
  const out = join(tmpdir(), `fel-rig-${h.digest('hex').slice(0, 12)}.css`);
  if (!existsSync(out)) {
    execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', out], { cwd: ROOT, stdio: 'ignore' });
  }
  cssText = readFileSync(out, 'utf8') + FONT_FACES;
  return cssText;
}

// The app's own faces (app/fonts, next/font/local in app/layout.tsx), under the CSS variables the layout sets. Text then
// draws in the same faces on every machine, which is also what makes a screenshot comparable between this box and CI.
const FONT_FACES = `
@font-face { font-family: 'FelDisplay'; src: url(/__rig/fonts/barlow-condensed-latin-700.woff2) format('woff2'); font-weight: 500 800; }
@font-face { font-family: 'FelSans'; src: url(/__rig/fonts/ibm-plex-sans-latin-variable.woff2) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'FelMono'; src: url(/__rig/fonts/jetbrains-mono-latin-variable.woff2) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'FelChakra'; src: url(/__rig/fonts/chakra-petch-latin-400.woff2) format('woff2'); font-weight: 400; }
@font-face { font-family: 'FelChakra'; src: url(/__rig/fonts/chakra-petch-latin-500.woff2) format('woff2'); font-weight: 500; }
@font-face { font-family: 'FelChakra'; src: url(/__rig/fonts/chakra-petch-latin-600.woff2) format('woff2'); font-weight: 600; }
@font-face { font-family: 'FelChakra'; src: url(/__rig/fonts/chakra-petch-latin-700.woff2) format('woff2'); font-weight: 700 900; }
@font-face { font-family: 'Inter'; src: url(/__rig/fonts/ibm-plex-sans-latin-variable.woff2) format('woff2'); font-weight: 100 900; }
:root { --font-display: 'FelDisplay'; --font-sans: 'FelSans'; --font-mono: 'FelMono'; --font-chakra: 'FelChakra'; }
html { font-family: var(--font-sans), sans-serif; }
`;

// ── the browser ─────────────────────────────────────────────────────────────────────────────────────────────────────
export async function launch(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  // the probes' resolver (scripts/probes/_chromium.mts): CHROMIUM_EXE, the playwright cache, then a system Chrome — on a
  // GitHub runner that is the image's Google Chrome. Imported by path: tsc does not resolve .mts imports.
  const resolver = (await import(join(ROOT, 'scripts/probes/_chromium.mts'))) as { chromiumExe(): string };
  return chromium.launch({
    executablePath: resolver.chromiumExe(), headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
}

export interface SessionOptions {
  pages: Record<string, PageDef>;
  api?: ApiHandler;
  external?: ExternalHandler;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  isMobile?: boolean;
  /** an init script run before any page script (seeded random, fake pads) */
  init?: string;
  /** browser permissions granted to the rig's origin (clipboard-read, clipboard-write) */
  permissions?: string[];
}

/** One flow's world: a fresh browser context (no cookies, no storage), its routes, and the record of what it called. */
export class Session {
  readonly calls: Call[] = [];
  readonly errors: string[] = [];
  readonly consoleErrors: string[] = [];
  readonly blocked: string[] = [];
  ctx!: BrowserContext;
  page!: Page;
  constructor(private browser: Browser, private o: SessionOptions) {}

  async open(path: string): Promise<Page> {
    // build first, outside any page timeout: a cold esbuild + Tailwind run takes seconds and is not the page's time
    appCss();
    for (const def of Object.values(this.o.pages)) await bundle(def.entry, def.env);
    const { width, height } = this.o.viewport ?? { width: 390, height: 844 };
    this.ctx = await this.browser.newContext({
      viewport: { width, height }, deviceScaleFactor: this.o.deviceScaleFactor ?? 1, isMobile: this.o.isMobile ?? false,
      hasTouch: this.o.isMobile ?? false, locale: 'en-US', timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce',
      serviceWorkers: 'block', ignoreHTTPSErrors: true,
    });
    if (this.o.permissions?.length) await this.ctx.grantPermissions(this.o.permissions, { origin: ORIGIN });
    if (this.o.init) await this.ctx.addInitScript({ content: this.o.init });
    await this.ctx.route('**/*', (route, req) => this.route(route, req));
    this.page = await this.ctx.newPage();
    this.page.setDefaultTimeout(20_000);
    this.page.on('pageerror', (e) => this.errors.push(String(e?.stack ?? e).slice(0, 600)));
    this.page.on('console', (m) => { if (m.type() === 'error') this.consoleErrors.push(m.text().slice(0, 300)); });
    await this.page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return this.page;
  }

  /** The calls to one API path (and method), in order. */
  called(path: string | RegExp, method?: string): Call[] {
    return this.calls.filter((c) => (typeof path === 'string' ? c.path === path : path.test(c.path)) && (!method || c.method === method));
  }

  async close(): Promise<void> { await this.ctx?.close().catch(() => {}); }

  private async route(route: Route, req: Request): Promise<void> {
    const url = new URL(req.url());
    if (url.origin !== ORIGIN) {
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
      const ext = this.o.external?.(url, req);
      if (ext) return route.fulfill({ status: ext.status ?? 200, body: ext.body, contentType: ext.contentType ?? 'text/html', headers: ext.headers });
      this.blocked.push(url.origin + url.pathname);
      return route.abort('blockedbyclient');
    }
    const p = url.pathname;
    try {
      if (p.startsWith('/__rig/fonts/')) return route.fulfill({ path: join(ROOT, 'app/fonts', p.slice('/__rig/fonts/'.length).replace(/[^\w.-]/g, '')), contentType: 'font/woff2' });
      if (p === '/__rig/app.css') return route.fulfill({ body: appCss(), contentType: 'text/css' });
      if (p.startsWith('/__rig/asset/')) { const b = assets.get(p); return b ? route.fulfill({ body: b, contentType: MIME[extname(p)] ?? 'application/octet-stream' }) : route.fulfill({ status: 404, body: '' }); }
      if (p.startsWith('/__rig/page/')) {
        const def = this.o.pages[decodeURIComponent(p.slice('/__rig/page/'.length, -3))];
        if (!def) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: await bundle(def.entry, def.env), contentType: 'text/javascript' });
      }
      const def = this.pageFor(p);
      if (def && req.resourceType() === 'document') {
        return route.fulfill({ contentType: 'text/html', body: shell(def.key, def.def) });
      }
      if (p.startsWith('/api/')) return await this.api(route, req, url);
      const file = join(ROOT, 'public', decodeURIComponent(p));
      if (file.startsWith(join(ROOT, 'public') + '/') && existsSync(file) && statSync(file).isFile()) {
        return route.fulfill({ path: file, contentType: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
      }
      if (req.resourceType() === 'document') {
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body data-rig-landed="${escapeHtml(p + url.search)}">landed on ${escapeHtml(p + url.search)}</body></html>` });
      }
      return route.fulfill({ status: 404, body: '' });
    } catch (e) {
      this.errors.push(`rig route ${p}: ${String(e)}`);
      return route.fulfill({ status: 500, body: '' }).catch(() => {});
    }
  }

  private pageFor(path: string): { key: string; def: PageDef } | null {
    if (this.o.pages[path]) return { key: path, def: this.o.pages[path] };
    // a registered pattern such as /coach/join/:token
    for (const [key, def] of Object.entries(this.o.pages)) {
      if (!key.includes(':')) continue;
      const re = new RegExp('^' + key.replace(/:[a-zA-Z]+/g, '[^/]+') + '$');
      if (re.test(path)) return { key, def };
    }
    return null;
  }

  private async api(route: Route, req: Request, url: URL): Promise<void> {
    const raw = req.postData();
    let body: unknown = raw;
    if (raw) { try { body = JSON.parse(raw); } catch { /* form or text body: kept raw */ } }
    const reply = (await this.o.api?.({ method: req.method(), path: url.pathname, query: url.searchParams, body, raw, headers: req.headers() })) ?? { status: 404, json: { error: 'rig: no fake for this route' } };
    const status = reply.status ?? 200;
    this.calls.push({ method: req.method(), path: url.pathname, query: url.search, body, status });
    if (reply.json !== undefined) return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(reply.json), headers: reply.headers });
    return route.fulfill({ status, contentType: reply.contentType ?? 'text/plain', body: reply.body ?? '', headers: reply.headers });
  }
}

function shell(key: string, def: PageDef): string {
  return `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/__rig/app.css"></head><body class="bg-[#050505] text-white antialiased"><div id="root"></div>
<script>window.__RIG = ${JSON.stringify({ page: key, ...(def.rig ?? {}) }).replace(/</g, '\\u003c')};</script>
<script src="/__rig/page/${encodeURIComponent(key)}.js"></script></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/** Wait for a condition on the node side (an API call arriving), polling. */
export async function until<T>(what: string, fn: () => T | undefined | null | false, ms = 15_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function ensureDir(dir: string): string { mkdirSync(dir, { recursive: true }); return dir; }
