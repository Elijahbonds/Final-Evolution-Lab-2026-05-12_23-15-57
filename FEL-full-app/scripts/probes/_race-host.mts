// _race-host — the racers through their SHIPPING hosts (/dev/race/<key>, racing pass phase 5, 2026-09-23). What a player
// reads (the host HUD, photographed at the countdown, mid-race and the finish) and what the results screen is handed
// (the host's GameResult: won, headline, outcome), under the mode's intent driver.
//
//   PORT=3011 MODES=velocitykart,aeroaces,freerun,sprint MAXMS=240000 OUT=<dir> [WRONGWAY=1] npx tsx scripts/probes/_race-host.mts
//
// WRONGWAY=1 (kart only): after the start, turn the kart round and drive it back down the line for a few seconds.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { INTENT_DRIVERS } from './_intent-drivers.mts';

const PORT = process.env.PORT ?? '3011';
const MODES = (process.env.MODES ?? 'velocitykart,aeroaces,freerun,sprint').split(',');
const MAXMS = Number(process.env.MAXMS ?? 240000);
const OUT = process.env.OUT ?? '/tmp/race-host';
fs.mkdirSync(OUT, { recursive: true });
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();

async function run(p: Page, mode: string): Promise<Record<string, unknown>> {
  const errs: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${PORT}/dev/race/${mode}?agent=1${mode === 'freerun' ? '&tier=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  await p.waitForFunction(() => !!(window as any).__FEL_QA__, null, { timeout: 240000 });
  // the boot splash: wait for READY, then any key wakes it
  for (let i = 0; i < 120; i++) { const t = await p.evaluate(() => document.body.innerText); if (/tap to start|press any|ready|start/i.test(t)) break; await p.waitForTimeout(1000); }
  await p.waitForTimeout(1500);
  await p.keyboard.press('Space');
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${OUT}/${mode}-1-start.png` });
  // the words on the page over time: the HUD text a player reads
  await p.evaluate(`(() => { window.__RH = []; setInterval(() => { try { const t = Array.from(document.querySelectorAll('.fel-panel, .fel-heading')).map((n) => n.textContent.trim()).filter(Boolean).join(' | '); window.__RH.push(t); } catch (e) {} }, 1000); })()`);
  if (process.env.WRONGWAY === '1' && mode === 'velocitykart') {
    await p.waitForTimeout(4000);
    await p.evaluate(`(() => { const P = window.__PAD; P.buttons[7].pressed = true; P.buttons[7].value = 1; P.axes[0] = -1; P.timestamp = performance.now(); })()`);
    await p.waitForTimeout(2600);
    await p.evaluate(`(() => { const P = window.__PAD; P.axes[0] = 0; P.timestamp = performance.now(); })()`);
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${OUT}/${mode}-wrongway.png` });
    const hud = await p.evaluate('window.__RH.slice(-6)');
    return { mode, wrongWay: hud, errors: errs.slice(0, 4) };
  }
  await p.evaluate(INTENT_DRIVERS[mode]);
  const t0 = Date.now(); let end: unknown = null; let shot = 0;
  while (Date.now() - t0 < MAXMS) {
    end = await p.evaluate('window.__DEV_END || null');
    if (end) break;
    if (shot === 0 && Date.now() - t0 > 20000) { await p.screenshot({ path: `${OUT}/${mode}-2-mid.png` }); shot++; }
    await p.waitForTimeout(500);
  }
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${mode}-3-end.png` });
  const words = await p.evaluate('window.__RH') as string[];
  return { mode, secs: Math.round((Date.now() - t0) / 1000), result: end, hudSamples: [words[2], words[Math.floor(words.length / 2)], words[words.length - 1]], errors: errs.slice(0, 4) };
}

const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(`(() => { const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
  const p = await ctx.newPage();
  try { console.log('ROW ' + JSON.stringify(await run(p, mode))); } catch (e) { console.log('ROW ' + JSON.stringify({ mode, crash: String(e).slice(0, 200) })); }
  await ctx.close();
}
await b.close();
