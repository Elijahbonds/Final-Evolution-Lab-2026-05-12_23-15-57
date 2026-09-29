// SCREEN-SHIP Screening Squad probes — the shared part (2026-09-29).
//
// Portrait = Playwright 390×844, deviceScaleFactor 3, isMobile, hasTouch. Every request is logged from the first
// navigation (page.on('request')), every visited URL is kept, and the storage (localStorage, sessionStorage, IndexedDB,
// cookies) can be read at any step. The camera is never granted: the full-flow probes drive the screen with PR #20's
// synthetic athlete through window.__FEL_POSE_FEED__ (a production build on this machine with ?agent=1 only), and the
// camera probes stub getUserMedia.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

export const BASE = process.env.SCREEN_BASE ?? 'http://127.0.0.1:3141';
export const ORIGIN = new URL(BASE).origin;
export const OUT = process.env.SCREEN_SHOTS ?? join(process.env.HOME ?? '.', 'Claude/outbox/SCREEN-SHIP-shots/squad');
mkdirSync(OUT, { recursive: true });

export type Json = Record<string, any>;
export interface Req { url: string; method: string; type: string; body: number; at: number; phase: string }

export const PORTRAIT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } as const;

export async function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: chromiumExe(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
}

export interface Probe { ctx: BrowserContext; page: Page; reqs: Req[]; urls: string[]; errors: string[]; consoleErrors: string[]; phase: { v: string }; shot: (name: string) => Promise<string> }

/** A portrait context with request logging, URL tracking and error capture. */
export async function portrait(browser: Browser, tag: string, o: { init?: string } = {}): Promise<Probe> {
  const ctx = await browser.newContext({ ...PORTRAIT });
  if (o.init) await ctx.addInitScript(o.init);
  const page = await ctx.newPage();
  const reqs: Req[] = [], urls: string[] = [], errors: string[] = [], consoleErrors: string[] = [];
  const phase = { v: 'load' };
  const t0 = Date.now();
  ctx.on('request', (r) => reqs.push({ url: r.url(), method: r.method(), type: r.resourceType(), body: (r.postDataBuffer()?.length ?? 0), at: Date.now() - t0, phase: phase.v }));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  let n = 0;
  const shot = async (name: string) => {
    const f = join(OUT, `${tag}-${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: f });
    return f;
  };
  return { ctx, page, reqs, urls, errors, consoleErrors, phase, shot };
}

/** Every storage the page can see, and the cookies. */
export async function storage(p: Probe): Promise<{ local: Json; session: Json; idb: string[]; cookies: string[] }> {
  // a string, not a function: tsx's keepNames would wrap a named helper in __name(), which the page does not have
  const s = await p.page.evaluate(`(async () => {
    const dump = (st) => Object.fromEntries(Array.from({ length: st.length }, (_, i) => st.key(i)).map((k) => [k, st.getItem(k)]));
    let idb = [];
    try { idb = ((await indexedDB.databases?.()) ?? []).map((d) => d.name ?? ''); } catch { idb = ['<unreadable>']; }
    return { local: dump(localStorage), session: dump(sessionStorage), idb };
  })()`) as { local: Json; session: Json; idb: string[] };
  const cookies = (await p.ctx.cookies()).map((c) => c.name);
  return { ...s, cookies };
}

/** The keys that are screen data. */
export const screenKeys = (o: Json) => Object.keys(o).filter((k) => k.startsWith('fel.screen.') || k.startsWith('fel.assess.'));

/** A request the privacy gate allows: a same-origin GET of a document, a Next static asset, a font, an image or the pose assets. */
export function classify(r: Req): 'document' | 'static' | 'rsc' | 'api' | 'third-party' | 'write' | 'other' {
  const u = new URL(r.url);
  if (u.origin !== ORIGIN && !u.protocol.startsWith('data')) return 'third-party';
  if (r.method !== 'GET' && r.method !== 'HEAD') return 'write';
  if (u.pathname.startsWith('/api/')) return 'api';
  if (r.type === 'document') return 'document';
  if (u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/pose/') || /\.(woff2?|ttf|otf|png|svg|ico|jpg|webp|css|js)$/.test(u.pathname)) return 'static';
  if (u.searchParams.has('_rsc') || r.type === 'fetch') return 'rsc';
  return 'other';
}

/** Is the element's box inside the first screen? */
export async function inViewport(page: Page, sel: string): Promise<{ sel: string; inView: boolean; box: Json | null }> {
  const el = page.locator(sel).first();
  const box = await el.boundingBox();
  const vp = page.viewportSize()!;
  return { sel, inView: !!box && box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width, box };
}

/** The platform fonts Chromium actually used for an element (CDP CSS.getPlatformFontsForNode). */
export async function platformFonts(page: Page, sel: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
  if (!nodeId) return [];
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }) as { fonts: { familyName: string }[] };
  await cdp.detach();
  return fonts.map((f) => f.familyName);
}

export function save(name: string, data: Json): void {
  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
