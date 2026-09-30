// MUSIC-SUITE P9 (2026-09-29), moves — the captured breaking and popping moves, LOOKED AT on the real room.
//
// /dev/mode/dance?arena=p9-moves-probe on the lane's dev server (:3121), one page — the Arena ready screen, because it never
// auto-starts (the pick screen starts its default song after 6 s, and the chart's steps then take the dancer over); START is
// never pressed, so nothing is posted. After the room reaches its pick screen, each move is danced
// through the room's own path (the dev-only seam __FEL_DEV__.danceMove: DanceMode.danceMove → resolveDanceClip → the
// BeatOwner loop → MoveRootLayer), and the front audience camera is screenshotted across the step. The registered list
// says whether each capture built on the hero's rig (a move that did not would dance its sibling — resolveDanceClip).
// One contact sheet per run: rows = moves, columns = moments of the step.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p9-moves.mts   (BASE, OUT, MOVES env override)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p9/moves';
const MOVES = (process.env.MOVES ?? 'dance_toprock_kick,dance_pop_moonwalk,dance_pop_robot,dance_freeze_side,dance_power_headstand,dance_power_helicopter,dance_toprock_basic').split(',');
const AT = [0.25, 0.7, 1.15, 1.6, 2.05, 2.5];   // seconds after the move starts (the pick screen's track is 96 BPM: a 4-beat step is 2.5 s)
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p9-moves +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), pageErrors: [] as string[], console: [] as string[], moves: {} };

const INIT = `
(() => {
  const mk = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, mk) };
  navigator.getGamepads = () => [pad];
  window.__padBtn = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0, value: v }; pad.timestamp = Date.now(); };
})();`;

async function boot(p: Page): Promise<void> {
  await p.addInitScript({ content: INIT });
  p.on('pageerror', (e) => { R.pageErrors.push(String(e).slice(0, 300)); log('PAGEERROR', String(e).slice(0, 200)); });
  p.on('console', (m) => { const s = m.text(); if (/FEL-ANIM|FEL-DANCE/.test(s)) { R.console.push(s.slice(0, 400)); log('CON', s.slice(0, 200)); } });
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (attempt === 1) await p.goto(`${BASE}/dev/mode/dance?arena=p9-moves-probe`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    else await p.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
    const ok = await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 })
      .then(() => true).catch(() => false);
    if (ok) return;
    log('not ready — reload', attempt);
  }
  throw new Error('dance never reached ready');
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  try {
    await boot(p);
    // START (pad button 9) takes the harness to playing: the room's pick screen, the dancer on the podium
    await p.evaluate(() => (window as Any).__padBtn(9, 1)); await p.waitForTimeout(120); await p.evaluate(() => (window as Any).__padBtn(9, 0));
    await p.waitForFunction(() => typeof (window as Any).__FEL_DEV__?.danceMove === 'function', undefined, { timeout: 60000 });
    await p.waitForTimeout(2500);
    R.registered = await p.evaluate(() => (window as Any).__FEL_DEV__.danceRegistered());
    log('registered', R.registered.join(','));
    await p.screenshot({ path: `${OUT}/p9-moves-room.png` });
    // the dancer's box on the front camera: found once from the hero's screen position is overkill for a fixed stage
    // camera — the frame is cropped to the middle of the canvas, where applyStageCamera keeps the dancer
    const canvas = await p.evaluate(() => { const c = document.querySelector('canvas')!.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    const clip = { x: canvas.x + canvas.w * 0.36, y: canvas.y + canvas.h * 0.22, width: canvas.w * 0.28, height: canvas.h * 0.56 };
    for (const id of MOVES) {
      const playing = await p.evaluate((m) => (window as Any).__FEL_DEV__.danceMove(m), id);
      const t = Date.now();
      const shots: string[] = [];
      for (const at of AT) {
        const wait = at * 1000 - (Date.now() - t);
        if (wait > 0) await p.waitForTimeout(wait);
        const path = `${OUT}/p9-move-${id}-${at.toFixed(2)}.png`;
        await p.screenshot({ path, clip });
        shots.push(path);
      }
      const body = await p.evaluate(() => (window as Any).__FEL_DEV__.anim?.()?.hero ?? null);
      R.moves[id] = { playing, registered: R.registered.includes(id), shots, heroPlaying: body?.playing ?? null };
      log(id, 'playing', playing, 'registered', R.moves[id].registered);
      await p.evaluate(() => (window as Any).__FEL_DEV__.danceMove('dance_bounce_shoulder'));
      await p.waitForTimeout(700);
    }
    // one contact sheet: rows = moves, columns = moments
    const rows = MOVES.map((id) => `<tr><th>${id.replace('dance_', '')}</th>${R.moves[id].shots.map((s: string) => `<td><img src="data:image/png;base64,${fs.readFileSync(s).toString('base64')}"></td>`).join('')}</tr>`).join('');
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 1400, height: 400 });
    await sheet.setContent(`<html><body style="margin:0;background:#111;color:#eee;font:12px monospace"><table style="border-spacing:2px">
      <tr><th></th>${AT.map((a) => `<th>+${a}s</th>`).join('')}</tr>${rows}</table>
      <style>img{height:300px;display:block}th{padding:2px 6px;text-align:left}</style></body></html>`);
    await sheet.screenshot({ path: `${OUT}/p9-moves-sheet.png`, fullPage: true });
    R.sheet = `${OUT}/p9-moves-sheet.png`;
    await sheet.close();
  } catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); console.error(e); }
  finally {
    await browser.close();
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/p9-moves-probe.json`, JSON.stringify(R, null, 2));
    log('wrote', `${OUT}/p9-moves-probe.json`);
  }
}
main();
