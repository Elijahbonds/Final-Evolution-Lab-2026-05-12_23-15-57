// First run on the rig (FIRST-RUN, round 8, 2026-10-25): every path, from the path choice to "You did it", timed on a
// phone profile in headless Chromium. No Next server: scripts/probes/_first-run-entry.tsx is bundled with esbuild (the
// real AuthForm, FirstWin, PathPicker, AttributionCapture), the app's Tailwind CSS compiled with its own CLI, and served
// by a small Node server so the sign-up's full navigation (window.location.replace) really loads the next page.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_first-run-probe.mts <shotsDir>
//
// Two clocks, both from the path tap (Node's clock, so a navigation does not reset it):
//   signup   the whole new-account chain: open /signup?utm_source=x&ref=CODE, tap the path, the age step, the
//            credentials typed at a phone pace (TYPE_MS per key), submit, land, then do the win. "You did it" ends it.
//   welcome  the win alone: on /welcome, tap the path in the picker, do the win.
// Play and create hand off to a 3D page (the game, the Closet) the rig does not run: their clock stops at the door, and
// the report says so. Profile: 390×844, DPR 3, touch, 4× CPU. Exit 0 = every measured win under 60 s and no page error.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.first-run-shots'));
mkdirSync(OUT, { recursive: true });
const BUILD = join(OUT, '.build');
mkdirSync(BUILD, { recursive: true });
const TYPE_MS = Number(process.env.TYPE_MS ?? 250);   // a phone keyboard, about 4 keys a second
const CAP_S = 60;

const SHIMS: Record<string, string> = {
  'next/link': `import { createElement } from 'react'; export default function Link({ href, children, prefetch, replace, scroll, ...p }) { return createElement('a', { href: typeof href === 'string' ? href : String(href?.pathname ?? '/'), ...p }, children); }`,
  'next/image': `import { createElement } from 'react'; export default function Image({ src, alt, priority, fill, quality, placeholder, ...p }) { return createElement('img', { src: typeof src === 'string' ? src : '', alt: alt ?? '', ...p }); }`,
  'next-auth/react': `export async function signIn() { return { error: undefined, ok: true }; } export async function signOut() { return {}; } export function useSession() { return { data: null, status: 'unauthenticated' }; }`,
};
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_first-run-entry.tsx')], bundle: true, outfile: join(BUILD, 'rig.js'), format: 'iife', platform: 'browser',
  jsx: 'automatic', tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error', minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty' },
  plugins: [{ name: 'next-shims', setup(b) {
    b.onResolve({ filter: /^(next\/link|next\/image|next-auth\/react)$/ }, (a) => ({ path: a.path, namespace: 'shim' }));
    b.onLoad({ filter: /.*/, namespace: 'shim' }, (a) => ({ contents: SHIMS[a.path], loader: 'js', resolveDir: ROOT }));
  } }],
});
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', join(BUILD, 'rig.css'), '--minify'], { cwd: ROOT, stdio: 'ignore' });
const js = readFileSync(join(BUILD, 'rig.js'), 'utf8');
const css = readFileSync(join(BUILD, 'rig.css'), 'utf8');

// ── the server ──────────────────────────────────────────────────────────────────────────────────────────────────
let adult = true;
const beacons: unknown[] = [];
const handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/rig.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  if (url.pathname === '/api/analytics') {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { try { beacons.push(...(JSON.parse(body).events ?? [])); } catch { /* */ } res.writeHead(204); res.end(); });
    return;
  }
  if (/\.(png|jpg|svg|ico|woff2?)$/.test(url.pathname) || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="background:#050505;color:#fff;margin:0"><div id="root"></div><script>window.__ADULT__=${adult}</script><script src="/rig.js"></script></body></html>`);
};
const PORT = 41000 + Math.floor(Math.random() * 2000);
const ORIGIN = `http://localhost:${PORT}`;
const server: Server = await new Promise((r) => { const s = createServer(handler).listen(PORT, '127.0.0.1', () => r(s)); });

// ── the runs ────────────────────────────────────────────────────────────────────────────────────────────────────
const browser: Browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const fails: string[] = [];
const report: Record<string, unknown> = {};

async function phone(): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { page, errors };
}
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
const sec = (t0: number) => Math.round((Date.now() - t0) / 100) / 10;
const overflow = (page: Page) => page.evaluate('document.documentElement.scrollWidth') as Promise<number>;

/** Do the win on /welcome, for a path; resolves at "You did it" (or the door, for create/play). */
async function doWin(page: Page, path: string, tag: string): Promise<'did-it' | 'door'> {
  await page.waitForSelector(`[data-first-win="${path}"]`);
  if (path === 'train') {
    await page.tap('[data-breath-start]');
    await page.waitForSelector('[data-breath="in"]');
    await shot(page, `${tag}-train-breathing`);
    await page.waitForSelector('[data-you-did-it]', { timeout: 90_000 });
  } else if (path === 'learn') {
    await page.waitForSelector('[data-card-got-it]:not([disabled])', { timeout: 30_000 });
    await shot(page, `${tag}-learn-card`);
    await page.tap('[data-card-got-it]');
    await page.waitForSelector('[data-you-did-it]');
  } else if (path === 'teach') {
    await page.tap('[data-invite-make]');
    await page.waitForSelector('[data-invite-ready]');
    await shot(page, `${tag}-teach-link`);
    await page.tap('[data-invite-copy]');
    await page.waitForSelector('[data-you-did-it]');
  } else if (path === 'create') {
    await shot(page, `${tag}-create-steps`);
    await Promise.all([page.waitForURL('**/closet'), page.tap('[data-first-win-next]')]);
    await page.waitForSelector('[data-door="/closet"]');
    return 'door';
  } else if (path === 'play') {
    await Promise.all([page.waitForURL('**/play/dunk'), page.tap('[data-first-win-next]')]);
    return 'door';
  }
  return 'did-it';
}

// 1. THE WIN ALONE: /welcome, the path tapped in the picker (the welcome page opens on play, so each tap is a choice)
const welcome: Record<string, number> = {};
for (const path of ['train', 'learn', 'teach', 'create']) {
  adult = true;
  const { page, errors } = await phone();
  await page.goto(`${ORIGIN}/welcome?path=play`);
  await page.waitForSelector('[data-path-picker]');
  const t0 = Date.now();
  await page.tap(`[data-path="${path}"]`);
  const end = await doWin(page, path, `welcome-${path}`);
  welcome[path] = sec(t0);
  if (end === 'did-it') await shot(page, `welcome-${path}-did-it`);
  if (welcome[path] > CAP_S) fails.push(`welcome ${path}: ${welcome[path]} s > ${CAP_S}`);
  if (errors.length) fails.push(`welcome ${path}: page errors ${errors.join(' | ')}`);
  if (end === 'did-it') {
    const queued = await page.evaluate(`localStorage.getItem('fel:analytics:queue') ?? '[]'`) as string;
    if (!/"first_win"/.test(queued) && !beacons.some((b) => (b as { name?: string }).name === 'first_win')) fails.push(`welcome ${path}: no first_win event`);
  }
  await page.context().close();
}
report.welcome = welcome;

// 2. THE WHOLE CHAIN: a tagged visit, sign up, land, win
const signup: Record<string, { total: number; toLanding: number; landedOn: string; utm: unknown }> = {};
for (const path of ['play', 'train', 'learn', 'teach', 'create']) {
  adult = true;
  const { page, errors } = await phone();
  await page.goto(`${ORIGIN}/signup?utm_source=x&utm_campaign=rig&ref=CODE`);
  await page.waitForSelector('[data-path-picker]');
  if (path === 'train') await shot(page, 'signup-paths');
  const t0 = Date.now();
  // the path first, as a person would; teach waits for the age step (it is held until then), so it is tapped after
  if (path !== 'teach') await page.tap(`[data-path="${path}"]`);
  await page.selectOption('select', String(new Date().getFullYear() - 30));
  await page.fill('input[aria-label="Month"]', '5');
  await page.fill('input[aria-label="Day"]', '1');
  await page.tap('button:has-text("Continue")');
  await page.waitForSelector('input[type="email"]');
  if (path === 'teach') await page.tap('[data-path="teach"]');
  await page.type('input[placeholder="Athlete name"]', 'Rig', { delay: TYPE_MS });
  await page.type('input[type="email"]', 'new@fel.test', { delay: TYPE_MS });
  await page.type('input[type="password"]', 'secret-rig', { delay: TYPE_MS });
  await page.tap('label span');
  if (path === 'teach') await shot(page, 'signup-teach-adult');
  await Promise.all([page.waitForURL((u) => u.pathname !== '/signup', { timeout: 30_000 }), page.tap('button[type="submit"]')]);
  const toLanding = sec(t0);
  const landedOn = new URL(page.url()).pathname + new URL(page.url()).search;
  const sent = JSON.parse(await page.evaluate(`sessionStorage.getItem('rig:sent') ?? '[]'`) as string) as { url: string; body: string }[];
  const body = JSON.parse(sent.find((s) => s.url === '/api/signup')?.body ?? '{}');
  if (path === 'play') {
    await page.waitForSelector('[data-door="/play/dunk"]');
  } else {
    await doWin(page, path, `signup-${path}`);
  }
  const total = sec(t0);
  signup[path] = { total, toLanding, landedOn, utm: body.utm ?? null };
  if (total > CAP_S) fails.push(`signup ${path}: ${total} s > ${CAP_S}`);
  if (JSON.stringify(body.utm) !== JSON.stringify({ source: 'x', medium: null, campaign: 'rig', ref: 'CODE' })) fails.push(`signup ${path}: utm not posted (${JSON.stringify(body.utm)})`);
  if (errors.length) fails.push(`signup ${path}: page errors ${errors.join(' | ')}`);
  await page.context().close();
}
report.signup = signup;

// 3. A TEEN: teach is held on the sign-up, and /welcome?path=teach shows train
{
  adult = false;
  const { page, errors } = await phone();
  await page.goto(`${ORIGIN}/signup`);
  await page.selectOption('select', String(new Date().getFullYear() - 16));
  await page.fill('input[aria-label="Month"]', '5');
  await page.fill('input[aria-label="Day"]', '1');
  await page.tap('button:has-text("Continue")');
  await page.waitForSelector('input[type="email"]');
  const held = await page.getAttribute('[data-path="teach"]', 'data-held');
  await shot(page, 'teen-signup-teach-held');
  await page.goto(`${ORIGIN}/welcome?path=teach`);
  await page.waitForSelector('[data-first-win]');
  const shown = await page.getAttribute('[data-first-win]', 'data-first-win');
  report.teen = { teachHeld: held === 'true', welcomeTeachShows: shown };
  if (held !== 'true') fails.push('teen: teach not held on sign-up');
  if (shown !== 'train') fails.push(`teen: /welcome?path=teach showed ${shown}`);
  if (errors.length) fails.push(`teen: page errors ${errors.join(' | ')}`);
  await page.context().close();
}

// 4. THE COACH FIRST RUN: the sample combine opens in the real report, labelled
{
  adult = true;
  const { page, errors } = await phone();
  await page.goto(`${ORIGIN}/welcome?path=teach`);
  await page.tap('[data-sample-open]');
  await page.waitForSelector('[data-combine-report]');
  report.coach = { sampleRows: await page.locator('[data-combine-report] tbody tr').count(), overflowPx: (await overflow(page)) - 390 };
  await shot(page, 'coach-sample-combine');
  if (errors.length) fails.push(`coach: page errors ${errors.join(' | ')}`);
  await page.context().close();
}

await browser.close();
server.close();
report.fails = fails;
writeFileSync(join(OUT, 'first-run-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
