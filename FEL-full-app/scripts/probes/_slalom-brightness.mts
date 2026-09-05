// _slalom-brightness — pass 5 phase 7: is the snowboard slalom a whiteout, and when? Screenshot the harness at several
// moments and report mean luminance (0–255) per frame plus the HUD text; a real run reads ~120–180, a whiteout > 235.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`http://localhost:3000/dev/mode/${process.env.MODE ?? 'snowboard_slalom'}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(6000);
await p.keyboard.press('j');
for (const at of [2000, 4000, 8000, 12000]) {
  await p.waitForTimeout(at === 2000 ? 2000 : 4000); await p.keyboard.down('w'); await p.waitForTimeout(300); await p.keyboard.up('w');
  const png = await p.screenshot({ clip: { x: 300, y: 100, width: 700, height: 600 } });   // centre of the canvas, away from HUD panels
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i]; const mean = sum / data.length;
  const cam = await p.evaluate(`(() => { const d = window.__FEL_DEV__; const c = d?.scene?.activeCamera; const h = d?.hero?.(); return c && h ? 'cam y ' + c.position.y.toFixed(1) + ' hero y ' + h.position.y.toFixed(1) + ' z ' + h.position.z.toFixed(0) + ' dist ' + Math.hypot(c.position.x - h.position.x, c.position.y - h.position.y, c.position.z - h.position.z).toFixed(1) : 'no cam/hero'; })()`);
  console.log(`t+${at / 1000}s: mean luminance ${mean.toFixed(0)} (${info.width}x${info.height}) · ${cam}`);
}
await b.close();
