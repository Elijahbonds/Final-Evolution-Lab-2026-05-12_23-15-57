// A registry mode on the static rig, on a clock the test controls (shared by the visual and perf gates, 2026-10-25).
//
// The page is scripts/visual/entries/mode.tsx (the real DevModeRunner: runMode, the harness, the venue). The clock is
// the perf probe's (scripts/probes/_perf-sweep.mts, PHONE-PERF 2026-10-14), carried here so a gate can run without a
// Next server: once the mode is playing, every display frame advances game time exactly 1/60 s however slow software GL
// is, setInterval runs on that clock, and Math.random is seeded from the first script — so two runs of one mode draw the
// same venue and the same frames. (The load itself runs on real time: see clockInit.) The harness's
// 20 s load watchdog (a phone-on-a-network guard) is given 5 minutes: software GL on a shared runner parses venues slowly.
import type { Page } from 'playwright-core';
import type { FlowContext } from './flow';
import type { Session } from './rig';

export const MODE_ENTRY = 'scripts/visual/entries/mode.tsx';

export function clockInit(seed: number): string {
  return `(() => {
  const realNow = performance.now.bind(performance);
  window.__realNow = realNow;
  // the clock runs on real time until __vclockOn() (called once the mode is playing): the load path has waits capped in
  // real time (the shader pre-warm's 8 s cap polls performance.now with no frame drawn), which a frame clock would freeze
  let virtual = false, vt = 0; window.__frames = 0;
  performance.now = () => (virtual ? vt : realNow());
  window.__vclockOn = () => { if (!virtual) { vt = realNow(); virtual = true; } };
  const raf = window.requestAnimationFrame.bind(window);
  let lastTs = -1;
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; if (virtual) vt += 1000 / 60; window.__frames++; } cb(virtual ? vt : ts); });
  const si = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0); return si(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); };
  let t = ${seed >>> 0};
  Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  window.__name = window.__name || function (f) { return f; };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a);
})()`;
}

export interface ModeOptions {
  mode: string;
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
  mobile?: boolean;
  /** query string on the page URL, e.g. '?perf=off' (the content without the perf governor) */
  query?: string;
  seed?: number;
}

/** Mount the mode and press START; resolves once the harness says `playing`. */
export async function openMode(ctx: FlowContext, o: ModeOptions, loadTimeoutMs = 240_000): Promise<{ session: Session; page: Page; loadS: number }> {
  const session = ctx.session({
    viewport: o.viewport, deviceScaleFactor: o.deviceScaleFactor ?? 1, isMobile: o.mobile ?? false,
    init: clockInit(o.seed ?? 7),
    pages: { '/dev/mode': { entry: MODE_ENTRY, rig: { mode: o.mode }, env: { NODE_ENV: 'development' } } },
    api: () => ({ json: {} }),
  });
  const t0 = Date.now();
  const page = await session.open(`/dev/mode${o.query ?? ''}`);
  page.setDefaultTimeout(120_000);
  const phase = () => page.evaluate(() => (/DEV · \S+ · (\w+)/.exec(document.body.innerText) ?? [])[1] ?? '').catch(() => '');
  let p = '';
  for (;;) {
    p = await phase();
    if (p === 'playing' || p === 'error') break;
    if (p === 'ready' || p === 'countdown') await page.getByRole('button', { name: 'START', exact: true }).click({ timeout: 30_000 }).catch(() => {});
    if (Date.now() - t0 > loadTimeoutMs) break;
    await page.waitForTimeout(1000);
  }
  if (p !== 'playing') {
    const why = await page.evaluate(() => (/DEV · \S+ · \w+ · ([^\n]*)/.exec(document.body.innerText) ?? [])[1] ?? '').catch(() => '');
    throw new Error(`${o.mode} never reached playing (phase "${p || 'none'}" after ${((Date.now() - t0) / 1000).toFixed(0)} s) ${why}`);
  }
  await page.evaluate(() => (window as unknown as { __vclockOn(): void }).__vclockOn());
  return { session, page, loadS: (Date.now() - t0) / 1000 };
}

/** Let the game run `n` more display frames (n/60 s of game time). */
export async function advanceFrames(page: Page, n: number, capMs = 300_000): Promise<void> {
  const start = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  await page.waitForFunction((want) => (window as unknown as { __frames: number }).__frames >= want, start + n, { timeout: capMs, polling: 250 });
}
