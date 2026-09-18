// _pick-diag — what mesh is under a screen pixel from the wide-shot camera?  MODE=dunk POS=.. TARGET=.. PX=900,520
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const pos = (process.env.POS ?? '14,9,44').split(',').map(Number); const tgt = (process.env.TARGET ?? '0,2,16').split(',').map(Number); const pts = (process.env.PX ?? '900,520').split(';').map((s) => s.split(',').map(Number));
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 80000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(3000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const cam = s.activeCamera; cam.position.set(${pos.join(',')}); cam.setTarget(new (cam.position.constructor)(${tgt.join(',')})); s.render();
  const out = []; for (const [x, y] of ${JSON.stringify(pts)}) { const r = s.pick(x, y, (m) => m.isEnabled() && m.isVisible, false, cam); out.push({ px: [x, y], hit: r?.pickedMesh?.name, parent: r?.pickedMesh?.parent?.name?.slice(0, 26), at: r?.pickedPoint?.asArray().map(v => +v.toFixed(1)), dist: r?.distance && +r.distance.toFixed(1) }); } return JSON.stringify(out); })()`));
await p.screenshot({ path: `${process.env.OUT ?? '/tmp'}/${mode}_pick.png` }); await b.close(); process.exit(0);
