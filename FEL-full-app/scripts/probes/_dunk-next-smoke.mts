// dunk-next smoke probe (2026-10-06): the four-beat bar and originality, live in the SHIPPING host (/dev/body/dunk, no login).
//
// Two attempts, each a WINDMILL thrown ON the rise beat (the frame the strip's first pip lights, pressed in the page) and the
// SLAM on the NOW! beat. It reports what the mode logged ([DUNK-TRICK] … onbeat, [DUNK-BEATS], [DUNK-FRESH]), what the strip
// showed, and every page error. The second windmill is the night's second: it must read as the player's own repeat.
//   PORT=3190 npx tsx scripts/probes/_dunk-next-smoke.mts   (OUT_DIR= for the screenshots · ANGLE=metal|swiftshader · CHROMIUM_EXE= the browser)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3190', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-next';
mkdirSync(OUT, { recursive: true });
const lines: string[] = [];
const log = (s: string) => { console.log(s); lines.push(s); };

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; if (!p) return; ${js}; p.timestamp = performance.now(); })()`); }
async function tap(p: Page, i: number, ms = 90): Promise<void> { await padSet(p, `p.buttons[${i}].pressed = true; p.buttons[${i}].value = 1`); await p.waitForTimeout(ms); await padSet(p, `p.buttons[${i}].pressed = false; p.buttons[${i}].value = 0`); }
const text = async (p: Page) => (await p.evaluate('document.body.innerText')) as string;

/** Wait (every animation frame) for `cond` in the page; with `press`, press those pad buttons on the SAME frame it sees it. */
async function onFrame(p: Page, cond: string, timeout: number, press: number[] = []): Promise<boolean> {
  try {
    await p.waitForFunction(([c, btns]) => {
      if (!eval(c as string)) return false;
      const pad = (window as unknown as { __PAD?: { buttons: { pressed: boolean; value: number }[]; timestamp: number } }).__PAD;
      if (pad) for (const b of btns as number[]) { pad.buttons[b].pressed = true; pad.buttons[b].value = 1; pad.timestamp = performance.now(); }
      return true;
    }, [cond, press] as [string, number[]], { polling: 'raf', timeout });
    return true;
  } catch { return false; }
}
const STRIP_AT = `Number(document.querySelector('[data-fel-beats]')?.getAttribute('data-fel-beats') ?? -9)`;
const SLAM_BEAT = `document.querySelector('[data-fel-slam]')?.getAttribute('data-fel-slam')`;

async function attempt(p: Page, n: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && !/HOLD to run|FRESH TONIGHT|X — NEXT PROP|IN THE AIR/i.test(await text(p))) {
    if (/THE JUDGES CONFER|PRIME'S CARD|REPLAY/i.test(await text(p))) await tap(p, 0, 60);   // A hurries the cut and the reveal
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(600);
  await padSet(p, 'p.axes[1] = -1; p.buttons[7].pressed = true; p.buttons[7].value = 1');   // stick up + RUN: the hold-run to the line
  const strip = await onFrame(p, `${STRIP_AT} >= -1`, 15000);
  log(`attempt ${n}: strip up at the take-off: ${strip}`);
  const onRise = await onFrame(p, `${STRIP_AT} >= 0`, 6000, [12, 0]);   // the rise pip lights → D-PAD UP + A (the windmill) on that frame
  log(`attempt ${n}: windmill pressed on the rise: ${onRise}`);
  await p.waitForTimeout(110);
  await padSet(p, 'p.buttons[0].pressed = false; p.buttons[0].value = 0; p.buttons[12].pressed = false; p.buttons[12].value = 0; p.buttons[7].pressed = false; p.buttons[7].value = 0; p.axes[1] = 0');
  const onNow = await onFrame(p, `${SLAM_BEAT} === 'beat'`, 6000, [0]);
  log(`attempt ${n}: slam pressed on NOW!: ${onNow}`);
  await p.waitForTimeout(220);
  await p.screenshot({ path: `${OUT}/attempt${n}-strip.png` });
  const stripText = (await p.evaluate(`document.querySelector('[data-fel-beats]')?.innerText ?? ''`)) as string;
  log(`attempt ${n}: the strip reads: ${stripText.replace(/\s+/g, ' ')}`);
  await padSet(p, 'p.buttons[0].pressed = false; p.buttons[0].value = 0');
  // the verdict: wait for the panel's breakdown line
  const v0 = Date.now();
  while (Date.now() - v0 < 30000 && !/DIFF \d/.test(await text(p))) { if (/REPLAY \d\/3/.test(await text(p))) await tap(p, 1, 60); await p.waitForTimeout(250); }
  await p.screenshot({ path: `${OUT}/attempt${n}-verdict.png` });
  const t = await text(p);
  log(`attempt ${n}: verdict: ${(/DIFF [^\n]*/.exec(t) ?? [''])[0]} · ${(/APPROACH[^\n]*/.exec(t) ?? [''])[0].slice(0, 220)}`);
}

// ANGLE= picks the GL backend: metal on a Mac (the probes' usual), swiftshader on a Linux box with no GPU
const ANGLE = process.env.ANGLE ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const b = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', `--use-angle=${ANGLE}`, ...(ANGLE === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []), '--ignore-gpu-blocklist', '--window-size=1280,800', '--disable-dev-shm-usage'] });
const errors: string[] = [];
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
  p.on('console', (m) => {
    const s = m.text();
    if (m.type() === 'error' && !/favicon|Failed to load resource|404/.test(s)) errors.push('console.error ' + s.slice(0, 300));
    if (/^\[(DUNK-TRICK|DUNK-BEATS|DUNK-FRESH|DUNK-OFF|DUNK-SLAM\] press|FEL-DUNK)/.test(s)) log('CON ' + s.slice(0, 260));
  });
  await p.goto(`http://127.0.0.1:${PORT}/dev/body/dunk`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  await p.evaluate(`(() => { const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: window.__PAD }); window.dispatchEvent(ev); })()`);
  const s0 = Date.now();
  while (Date.now() - s0 < 240000) {
    const t = await text(p);
    if (/HOLD to run/i.test(t)) break;
    if (/TAP TO START|READY|PRESS/i.test(t)) { await tap(p, 0); const btn = p.getByRole('button', { name: /TAP TO START|START|PLAY/i }); if (await btn.count()) await btn.first().click({ force: true }).catch(() => {}); }
    await p.waitForTimeout(700);
  }
  log(`booted: ${/HOLD to run/i.test(await text(p))}`);
  await attempt(p, 1);
  await attempt(p, 2);
} finally {
  log(`page errors: ${errors.length}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
  writeFileSync(`${OUT}/smoke.log`, lines.join('\n') + '\n');
  await b.close();
}
