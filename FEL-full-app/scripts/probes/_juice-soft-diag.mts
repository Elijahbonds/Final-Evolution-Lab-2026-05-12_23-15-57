// _juice-soft-diag — Venice juice soft #2–#5: drives a made attempt then a missed one on dunk / dunkduel and reports the
// [JUICE-SOFT] beats in order, the camera fov's dip during the hang, and the ball trail's emit rate per phase.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const events: string[] = []; const t0 = Date.now();
p.on('console', (m) => { const x = m.text(); if (x.includes('[JUICE-')) events.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${x.replace(/\[JUICE-(SOFT|LOOK)\] /, '').replace('[JUICE-SFX] ', 'SFX:')}`); });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first(); if (await start.count()) { await start.click(); await p.waitForTimeout(2500); }
await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; window.__JS = []; const ps = s.particleSystems.find(x => x.name === 'fx_ball_trail'); const it = setInterval(() => { const h = document.body.innerText.match(/"hint": "([^"]*)"/); window.__JS.push({ t: performance.now(), fov: +s.activeCamera.fov.toFixed(4), emit: ps ? ps.emitRate : -1, hint: (h?.[1] ?? '').slice(0, 24) }); }, 100); window.__JSstop = () => clearInterval(it); })()`);
const attempt = async (slam: boolean) => {
  await p.keyboard.down('w'); await p.waitForTimeout(1500); await p.keyboard.up('w');
  await p.keyboard.down(' '); await p.waitForTimeout(900); await p.keyboard.up(' ');
  if (slam) for (let i = 0; i < 24; i++) { await p.keyboard.press('j'); await p.waitForTimeout(80); }   // presses through the whole slam window
  await p.waitForTimeout(5500);
};
const only = process.env.ONLY;   // 'make' | 'miss' | unset (both)
if (only !== 'miss') { events.push('--- attempt 1 (slam)'); await attempt(true); }
if (only !== 'make') { events.push('--- attempt 2 (no slam → miss)'); await attempt(false); }
const samples = await p.evaluate(`(() => { window.__JSstop(); const a = window.__JS; const fovs = a.map(x => x.fov); const emits = [...new Set(a.map(x => x.emit))]; return { n: a.length, fovMax: Math.max(...fovs), fovMin: Math.min(...fovs), emitLevels: emits }; })()`);
console.log(JSON.stringify({ mode, events, samples }));
await b.close();
