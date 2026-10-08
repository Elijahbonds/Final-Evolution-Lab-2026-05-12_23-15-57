// FONT-SHARED live probe (2026-09-29): which platform font Chromium really draws each display text in, before and after
// the fix, on a `next start` build (FONT_BASE). CDP CSS.getPlatformFontsForNode, per node, with its glyph count.
//
//   READY  the boot splash on /play/skateboard, /play/snowboard, /play/velocity-kart and /play/brain-brawl (signed in:
//          FONT_EMAIL / FONT_PW_FILE, a throwaway account in the throwaway database) and /try (a guest): the title, TAP TO
//          START, a PLACE chip, PLAY WITH YOUR BODY, a header node; and a node styled with JuiceKit's banner `font`
//          declaration, inserted by the probe (a real banner needs a trick landed).
//   SCREEN /play/mirror/assess: every font file the Quick Screen downloads (owner call: none after the fix).
//
// Run from FEL-full-app (Node 26), with the server up:
//   FONT_BASE=http://127.0.0.1:3171 FONT_PHASE=after FONT_EMAIL=… FONT_PW_FILE=… node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_font-shared-live.mts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.FONT_BASE ?? 'http://127.0.0.1:3171';
const PHASE = process.env.FONT_PHASE === 'before' ? 'before' : 'after';
const OUT = process.env.FONT_SHOTS ?? join(process.env.HOME ?? '.', 'Claude/outbox/FONT-SHARED-shots', PHASE);
mkdirSync(OUT, { recursive: true });
type Json = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tag the nodes to measure (text matches on the READY card), so CDP can find them by attribute. */
const TAG = `(() => {
  const tag = (el, name) => { if (el && !el.hasAttribute('data-font-probe')) el.setAttribute('data-font-probe', name); };
  const all = Array.from(document.querySelectorAll('h1, button, p, span, a'));
  const byText = (re) => all.find((e) => re.test((e.textContent || '').trim()) && e.offsetParent !== null);
  const tap = byText(/^TAP TO START$/);
  tag(tap, 'tap');
  const splash = tap ? tap.closest('[style*="fel-font-display"]') : null;
  if (splash) tag(splash.querySelector('h1'), 'title');
  const place = all.find((e) => (e.textContent || '').trim() === 'PLACE');
  if (place) { const chip = place.parentElement && place.parentElement.querySelector('button'); tag(chip, 'chip'); }
  tag(byText(/^play with your body/i), 'body');
  const hdr = document.querySelector('header, nav, [data-rail]');
  if (hdr) { const t = Array.from(hdr.querySelectorAll('*')).find((e) => e.children.length === 0 && (e.textContent || '').trim().length > 2 && e.offsetParent !== null); tag(t, 'header'); }
  // JuiceKit's banner font, exactly as JuiceKit.ts writes it (L239), on a probe node
  const jk = document.createElement('div');
  jk.textContent = 'LIFT CABLE GRIND! +500';
  jk.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;font:900 clamp(28px,6vw,52px) var(--fel-font-display,ui-monospace);color:#22d3ee';
  jk.setAttribute('data-font-probe', 'juicekit-style');
  document.body.appendChild(jk);
  return Array.from(document.querySelectorAll('[data-font-probe]')).map((e) => e.getAttribute('data-font-probe'));
})()`;

async function fontsOf(page: Page): Promise<Json> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const out: Json = {};
  for (const name of ['title', 'tap', 'chip', 'body', 'header', 'juicekit-style']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-font-probe="${name}"]` });
    if (!nodeId) { out[name] = null; continue; }
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }) as { fonts: { familyName: string; glyphCount: number; isCustomFont: boolean }[] };
    const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId }) as { computedStyle: { name: string; value: string }[] };
    out[name] = { fonts: fonts.map((f) => `${f.familyName}${f.isCustomFont ? ' (web font)' : ''} ×${f.glyphCount}`), family: computedStyle.find((s) => s.name === 'font-family')?.value };
  }
  await cdp.detach();
  return out;
}

const report: Json = { phase: PHASE, base: BASE, date: new Date().toISOString(), pages: {} };
const browser = await chromium.launch({
  executablePath: chromiumExe(), headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const fontReqs = (ctx: BrowserContext, into: string[]) => ctx.on('request', (r) => { if (/\.(woff2?|ttf|otf)(\?|$)/.test(r.url())) into.push(r.url().replace(BASE, '')); });
/** Layout shift over the page's life (CLS, as the browser counts it), to see what the font swap costs on a first visit. */
const CLS = `window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}`;
const cls = async (p: Page) => Math.round(((await p.evaluate('window.__cls ?? null')) as number) * 10000) / 10000;

try {
  // ── signed in ──
  const email = process.env.FONT_EMAIL, pw = process.env.FONT_PW_FILE ? readFileSync(process.env.FONT_PW_FILE, 'utf8').trim() : null;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(CLS);
  const fonts: string[] = []; fontReqs(ctx, fonts);
  const page = await ctx.newPage();
  if (email && pw) {
    const csrf = await (await ctx.request.get(`${BASE}/api/auth/csrf`)).json();
    const r = await ctx.request.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf.csrfToken, email, password: pw, json: 'true' }, maxRedirects: 0 });
    const s = await (await ctx.request.get(`${BASE}/api/auth/session`)).json();
    report.signIn = { status: r.status(), signedIn: !!s?.user };
  }
  for (const path of ['/play/skateboard', '/play/snowboard', '/play/velocity-kart', '/play/brain-brawl']) {
    fonts.length = 0;
    await page.goto(`${BASE}${path}`);
    await page.getByText('TAP TO START', { exact: true }).first().waitFor({ timeout: 90_000 }).catch(() => null);
    await sleep(2500);
    const tagged = await page.evaluate(TAG);
    await page.evaluate('document.fonts.ready');
    await sleep(800);
    report.pages[path] = { url: page.url().replace(BASE, ''), tagged, cls: await cls(page), nodes: await fontsOf(page), fontFiles: [...new Set(fonts)], shot: join(OUT, `${path.replace(/\W+/g, '_')}.png`) };
    await page.screenshot({ path: report.pages[path].shot });
  }
  await ctx.close();

  // ── a guest: /try, and the Quick Screen ──
  for (const path of ['/try', '/play/mirror/assess']) {
    const g = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await g.addInitScript(CLS);
    const files: string[] = []; fontReqs(g, files);
    const p = await g.newPage();
    const html = await (await g.request.get(`${BASE}${path}`)).text();
    await p.goto(`${BASE}${path}`);
    if (path === '/try') await p.getByText('TAP TO START', { exact: true }).first().waitFor({ timeout: 90_000 }).catch(() => null);
    await sleep(3000);
    const one: Json = { preloadLinks: (html.match(/<link[^>]+rel="preload"[^>]+as="font"[^>]*>/g) ?? []).length, shot: join(OUT, `${path.replace(/\W+/g, '_')}.png`) };
    if (path === '/try') { one.tagged = await p.evaluate(TAG); await p.evaluate('document.fonts.ready'); await sleep(800); one.nodes = await fontsOf(p); }
    one.fontFiles = [...new Set(files)];
    one.cls = await cls(p);
    await p.screenshot({ path: one.shot });
    report.pages[path] = one;
    await g.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 1).slice(0, 9000));
