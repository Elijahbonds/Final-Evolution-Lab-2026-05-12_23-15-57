// SCREEN-FIX-2 probes, the shared part (2026-09-29): the Quick Screen in a real Chromium, portrait, a FRESH signed-out
// context per run, Chromium's fake camera (--use-fake-device-for-media-stream, --use-fake-ui-for-media-stream).
//
// What a run records, from the first navigation:
//   · every request: url, method, resource type, status, CDP initiator, request body size;
//   · every response's Set-Cookie (response.allHeaders() carries it), and the context's cookie jar at the end;
//   · every storage write and every send the page's JS makes (an init script wraps Storage.setItem/removeItem/clear,
//     indexedDB.open, the document.cookie setter, fetch, XMLHttpRequest.send, navigator.sendBeacon and WebSocket.send),
//     and every WebSocket frame the page sends;
//   · sessionStorage, localStorage, IndexedDB and cookies at the end.
//
// How a run reaches the results: the camera path runs for real (the fake camera, so the pose wasm and model load exactly
// as on a phone), then, where the QA feed is allowed (a `next dev` server: lib/pose/feed.ts feedHookAllowed), PR #20's
// synthetic athlete plays through window.__FEL_POSE_FEED__ to the results. Against the deployed site the feed is not
// there: a run stops at the camera check, after the model has loaded (no sign-in, no form, no POST, read-only).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

export const BASE = process.env.SCREEN_BASE ?? 'http://127.0.0.1:3221';
export const ORIGIN = new URL(BASE).origin;
export const LIVE = !/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(ORIGIN);
export const OUT = process.env.SCREEN_SHOTS ?? join(process.env.HOME ?? '.', 'Claude/outbox/SCREEN-FIX-2-shots');
mkdirSync(OUT, { recursive: true });

export type Json = Record<string, any>;
export interface Req { url: string; method: string; type: string; status: number | null; initiator: string; bodyBytes: number; at: number; phase: string; failure?: string }
export interface Probe {
  ctx: BrowserContext; page: Page; reqs: Req[]; setCookies: { url: string; names: string[] }[]; wsSent: { url: string; bytes: number }[];
  errors: string[]; phase: { v: string }; shot: (name: string) => Promise<string>;
}

export const PORTRAIT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } as const;

/** Wraps every write and send the page's JS can make; the list is window.__audit. Runs before any page script. */
export const AUDIT_INIT = `(() => {
  const A = window.__audit = { writes: [], sends: [] };
  const which = (s) => { try { return s === window.localStorage ? 'localStorage' : s === window.sessionStorage ? 'sessionStorage' : 'storage'; } catch { return 'storage'; } };
  for (const op of ['setItem', 'removeItem', 'clear']) {
    const real = Storage.prototype[op];
    Storage.prototype[op] = function (...a) { A.writes.push({ where: which(this), op, key: a[0] === undefined ? null : String(a[0]) }); return real.apply(this, a); };
  }
  try { const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function (...a) { A.writes.push({ where: 'indexedDB', op: 'open', key: String(a[0]) }); return open.apply(this, a); }; } catch {}
  try {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get() { return d.get.call(this); }, set(v) { A.writes.push({ where: 'document.cookie', op: 'set', key: String(v).split('=')[0] }); return d.set.call(this, v); } });
  } catch {}
  const size = (b) => b == null ? 0 : typeof b === 'string' ? b.length : (b.byteLength ?? b.size ?? 1);
  const realFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    const method = (init && init.method) || (input && input.method) || 'GET';
    A.sends.push({ how: 'fetch', url: String(url), method: String(method).toUpperCase(), bodyBytes: size(init && init.body) });
    return realFetch.apply(this, arguments);
  };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { A.sends.push({ how: 'xhr', url: String(this.__u), method: String(this.__m).toUpperCase(), bodyBytes: size(b) }); return xs.apply(this, arguments); };
  if (navigator.sendBeacon) { const sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => { A.sends.push({ how: 'beacon', url: String(u), method: 'POST', bodyBytes: size(d) }); return sb(u, d); }; }
  const ws = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { A.sends.push({ how: 'websocket', url: String(this.url), method: 'SEND', bodyBytes: size(d) }); return ws.apply(this, arguments); };
})();`;

export async function launch(): Promise<Browser> {
  return chromium.launch({
    executablePath: chromiumExe(), headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
}

/** A fresh signed-out portrait context with the recorders on. */
export async function open(browser: Browser, tag: string): Promise<Probe> {
  const ctx = await browser.newContext({ ...PORTRAIT });
  await ctx.addInitScript(AUDIT_INIT);
  const page = await ctx.newPage();
  const reqs: Req[] = [], setCookies: Probe['setCookies'] = [], wsSent: Probe['wsSent'] = [], errors: string[] = [];
  const phase = { v: 'load' };
  const t0 = Date.now();
  const initiators = new Map<string, string>();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e: any) => {
    const i = e.initiator ?? {};
    const top = i.stack?.callFrames?.[0];
    initiators.set(`${e.request.method} ${e.request.url}`, `${i.type ?? '?'}${i.url ? ` ${i.url}` : ''}${top ? ` ${top.url}:${top.lineNumber}` : ''}`);
  });
  const byReq = new Map<object, Req>();
  ctx.on('request', (r) => {
    const x: Req = { url: r.url(), method: r.method(), type: r.resourceType(), status: null, initiator: '', bodyBytes: r.postDataBuffer()?.length ?? 0, at: Date.now() - t0, phase: phase.v };
    byReq.set(r, x); reqs.push(x);
  });
  ctx.on('response', async (res) => {
    const x = byReq.get(res.request());
    if (x) { x.status = res.status(); x.initiator = initiators.get(`${x.method} ${x.url}`) ?? ''; }
    try {
      const sc = (await res.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value.split('=')[0].trim());
      if (sc.length) setCookies.push({ url: res.url(), names: sc });
    } catch { /* the page went away */ }
  });
  ctx.on('requestfailed', (r) => { const x = byReq.get(r); if (x) { x.status = -1; x.failure = r.failure()?.errorText ?? '?'; x.initiator ||= initiators.get(`${x.method} ${x.url}`) ?? ''; } });
  page.on('websocket', (ws) => ws.on('framesent', (f) => wsSent.push({ url: ws.url(), bytes: typeof f.payload === 'string' ? f.payload.length : f.payload.length })));
  page.on('pageerror', (e) => errors.push(String(e)));
  let n = 0;
  const shot = async (name: string) => {
    const f = join(OUT, `${tag}-${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: f });
    return f;
  };
  return { ctx, page, reqs, setCookies, wsSent, errors, phase, shot };
}

/** sessionStorage, localStorage, IndexedDB names and the cookie jar. */
export async function jar(p: Probe): Promise<{ session: Json; local: Json; idb: string[]; cookies: string[] }> {
  const s = await p.page.evaluate(`(async () => {
    const dump = (st) => Object.fromEntries(Array.from({ length: st.length }, (_, i) => st.key(i)).map((k) => [k, st.getItem(k)]));
    let idb = [];
    try { idb = ((await indexedDB.databases?.()) ?? []).map((d) => d.name ?? ''); } catch { idb = ['<unreadable>']; }
    return { session: dump(sessionStorage), local: dump(localStorage), idb };
  })()`) as { session: Json; local: Json; idb: string[] };
  return { ...s, cookies: (await p.ctx.cookies()).map((c) => c.name) };
}

/** The page's own record of its writes and sends (the init script). */
export const audit = (p: Probe) => p.page.evaluate('window.__audit ?? { writes: [], sends: [] }') as Promise<{ writes: Json[]; sends: Json[] }>;

export function save(name: string, data: Json): string {
  const f = join(OUT, `${name}.json`);
  writeFileSync(f, `${JSON.stringify(data, null, 2)}\n`);
  return f;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sign-in cookies: next-auth's, in all its prefixes, and the app's own session cookie. */
export const AUTH_COOKIE = /^(__Host-|__Secure-)?next-auth\.|^__session$/;
/** A dev-only socket (Next's hot reload), never the app's. */
export const DEV_TOOLING = (u: string) => /\/_next\/webpack-hmr/.test(u);

// ── the screen, driven ──

const R = await import('../../lib/assess/replay.ts');
const replay = ((R as unknown as { default?: typeof R }).default ?? R);
type Frame = { t: number; present: boolean; image: { x: number; y: number; z: number; v: number }[]; world?: unknown };
const strip = (fs: readonly Frame[]): Frame[] => fs.map((f) => ({ t: f.t, present: f.present, image: f.image, ...(f.world ? { world: f.world } : {}) }));
const STAND = { front: strip(replay.standFront(0.4).frames), left: strip(replay.standSide('left', 0.4).frames), right: strip(replay.standSide('right', 0.4).frames) };
export const takes = (jumpM: number): Record<string, Frame[]> => ({
  'T1-front': strip(replay.ohsFront({ kneeInL: 0.06 }).frames), 'T1-side': strip(replay.ohsSide().frames),
  'T2-left': strip(replay.kneeWall('left', { tibiaMax: 44 }).frames), 'T2-right': strip(replay.kneeWall('right', { tibiaMax: 36 }).frames),
  'T3-left': strip(replay.singleLegSquat('left').frames), 'T3-right': strip(replay.singleLegSquat('right').frames),
  T5: strip(replay.cmj([{ heightM: jumpM }, { heightM: jumpM + 0.02 }, { heightM: jumpM - 0.01 }]).frames),
});

const view = (page: Page) => page.evaluate('window.__FEL_ASSESS__ ? window.__FEL_ASSESS__.view() : null') as Promise<Json | null>;
const play = (page: Page, frames: Frame[]) => page.evaluate((fs) => (window as unknown as { __FEL_POSE_FEED__: { play(f: unknown): Promise<number> } }).__FEL_POSE_FEED__.play(fs), frames);
export const feedAllowed = (page: Page) => page.evaluate('!!window.__FEL_ASSESS__ && !!window.__FEL_POSE_FEED__') as Promise<boolean>;

/** Start (or "Run it again") → age (when asked) → the grown-up step (when asked) → pain "no" → the camera card → camera. */
export async function toCamera(p: Probe, band: string, out: Json, o: { fromStart: boolean }): Promise<void> {
  const { page } = p;
  if (o.fromStart) {
    await page.waitForSelector('[data-step="start"]');
    await page.waitForFunction('document.readyState === "complete"');
    // hydration: the start button's handler is attached (the QA handle is installed by the same page's effects)
    if (!LIVE) await page.waitForFunction('!!window.__FEL_ASSESS__', null, { timeout: 90_000 }); else await sleep(2500);
    await page.click('[data-step="start"] [data-primary]');
  }
  await page.waitForSelector('[data-step="age"], [data-step="grown-up"], [data-step="pain"]');
  if (await page.locator('[data-step="age"]').count()) { await page.click(`[data-age="${band}"]`); out.ageAsked = true; } else out.ageAsked = false;
  await page.waitForSelector('[data-step="grown-up"], [data-step="pain"]');
  if (await page.locator('[data-step="grown-up"]').count()) {
    await page.check('[data-grown-up-box]');
    await page.click('[data-step="grown-up"] [data-primary]');
  }
  await page.waitForSelector('[data-step="pain"]');
  await page.click('[data-pain="no"]');
  await page.waitForSelector('[data-step="camera-info"]');
  p.phase.v = 'camera';
  await page.click('[data-step="camera-info"] [data-primary]');
}

/**
 * The camera check, with the real (fake) camera: waits until the pose model's file has answered, then up to 20 s for
 * pose frames (headless Chromium's fake camera may deliver none: the camera check then stays at "Checking the camera").
 */
export async function cameraUp(p: Probe, out: Json): Promise<void> {
  const { page } = p;
  const t0 = Date.now();
  const models = () => p.reqs.filter((r) => /\/pose\/models\/.*\.task$/.test(r.url) && r.method === 'GET' && r.status !== null).length;
  const before = models();
  await page.waitForSelector('[data-step="camera"], [data-camera-card]', { timeout: 120_000 });
  if (await page.locator('[data-camera-card]').count()) { out.camera = { card: await page.locator('[data-camera-card]').getAttribute('data-camera-card'), text: await page.locator('[data-camera-card]').innerText() }; return; }
  for (let i = 0; i < 180 && models() === before; i++) await sleep(500);
  const modelMs = Date.now() - t0;
  await page.waitForSelector('[data-step="camera"] [data-primary]:not([disabled])', { timeout: 20_000 }).catch(() => {});
  out.camera = { modelMs, ms: Date.now() - t0, text: await page.locator('[data-step="camera"]').innerText().catch(() => null), shot: await p.shot('camera-check') };
}

/** The checks, played by the synthetic athlete (the feed takes the camera's place), to the end of the screen. */
export async function runChecks(p: Probe, out: Json, jumpM: number): Promise<void> {
  const { page } = p;
  const TAKES = takes(jumpM);
  await page.evaluate('window.__FEL_POSE_FEED__.begin()');
  for (let i = 0; i < 40; i++) {
    await play(page, STAND.front);
    if (await page.locator('[data-step="camera"] [data-primary]:not([disabled])').count()) break;
  }
  await page.click('[data-step="camera"] [data-primary]');
  p.phase.v = 'checks';
  const fed = new Set<string>();
  const t0 = Date.now();
  for (let loop = 0; loop < 6000 && Date.now() - t0 < 420_000; loop++) {
    if (await page.locator('[data-kid-results], [data-screen-results]').count()) break;
    const v = await view(page);
    if (!v) { await play(page, STAND.front); continue; }
    if (v.step === 'done' || v.step === 'stopped') { await play(page, STAND.front.slice(0, 4)); continue; }   // the end is on its way
    if (v.step === 'takeoff') { await page.getByRole('button', { name: 'Left', exact: true }).click(); await play(page, STAND.front.slice(0, 4)); continue; }
    if (v.step === 'painCheck') { await page.getByRole('button', { name: 'No', exact: true }).click(); await play(page, STAND.front.slice(0, 4)); continue; }
    if (v.step === 'active' && v.part && !fed.has(`${v.part}`)) {
      fed.add(`${v.part}`);
      const take = TAKES[v.part as string];
      for (let i = 0; i < take.length; i += 8) {
        await play(page, take.slice(i, i + 8));
        const vv = await view(page);
        if (!vv || vv.part !== v.part) break;
      }
      continue;
    }
    const side = v.part === 'T2-right' ? STAND.right : ((v.part as string | null)?.startsWith('T2') || v.part === 'T1-side' || v.step === 'calibrateSide') && v.step !== 'framing' ? STAND.left : STAND.front;
    await play(page, side.slice(0, 8));
  }
  out.checksMs = Date.now() - t0;
  await page.waitForSelector('[data-kid-results], [data-screen-results]', { timeout: 60_000 });
  p.phase.v = 'results';
}

/** What the end of the screen shows, and every link on it. */
export async function results(p: Probe): Promise<Json> {
  return p.page.evaluate(`(() => {
    const kid = document.querySelector('[data-kid-results]');
    const root = kid ?? document.querySelector('[data-screen-results]');
    return {
      kind: kid ? 'kid' : 'adult', url: location.pathname,
      text: root ? root.innerText.slice(0, 4000) : null,
      links: Array.from(document.querySelectorAll('a[href]')).map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), text: a.textContent.trim() })),
      nextSteps: Array.from(document.querySelectorAll('[data-next-step] a')).map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), text: a.textContent.trim() })),
      ctas: Array.from(document.querySelectorAll('[data-cta]')).map((e) => e.getAttribute('data-cta')),
      cards: Array.from(document.querySelectorAll('[data-check-card]')).map((c) => c.getAttribute('data-check-card')),
      bands: document.querySelectorAll('[data-band]').length,
      kidJump: document.querySelector('[data-kid-jump]') ? document.querySelector('[data-kid-jump]').textContent : null,
      kidChange: document.querySelector('[data-kid-change]') ? document.querySelector('[data-kid-change]').textContent : null,
      kidSaveLine: !!document.querySelector('[data-kid-save-line]'),
      medicalLines: ((root ? root.innerText : '').match(/medical exam/gi) || []).length,
      forms: document.querySelectorAll('form').length, emailInputs: document.querySelectorAll('input[type="email"]').length,
    };
  })()`) as Promise<Json>;
}

/** The request summary a report needs: 404s, off-site requests, requests with a body, and the pose files. */
export function requestSummary(reqs: Req[]): Json {
  return {
    total: reqs.length,
    notFound: reqs.filter((r) => r.status === 404).map((r) => ({ url: r.url, method: r.method, initiator: r.initiator, phase: r.phase })),
    failed: reqs.filter((r) => r.status === -1).map((r) => ({ url: r.url, method: r.method, initiator: r.initiator })),
    offsite: reqs.filter((r) => { try { return new URL(r.url).origin !== ORIGIN && !r.url.startsWith('data:') && !r.url.startsWith('blob:'); } catch { return false; } })
      .map((r) => ({ url: r.url, method: r.method, status: r.status, initiator: r.initiator, phase: r.phase })),
    origins: [...new Set(reqs.map((r) => { try { return new URL(r.url).origin; } catch { return r.url.slice(0, 20); } }))],
    withBody: reqs.filter((r) => r.bodyBytes > 0 || !['GET', 'HEAD'].includes(r.method)).map((r) => ({ url: r.url, method: r.method, bodyBytes: r.bodyBytes, initiator: r.initiator })),
    api: reqs.filter((r) => { try { return new URL(r.url).pathname.startsWith('/api/'); } catch { return false; } }).map((r) => `${r.method} ${r.url} ${r.status}`),
    pose: reqs.filter((r) => /\/pose\/|mediapipe|tasks-vision|pose_landmarker|jsdelivr|googleapis/.test(r.url)).map((r) => ({ url: r.url, method: r.method, status: r.status, initiator: r.initiator })),
  };
}
