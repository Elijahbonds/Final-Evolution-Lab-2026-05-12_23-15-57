// _vram-diag — per-mode texture memory estimate (what the dev HUD calls "vram ~"): every scene texture's
// width×height×4 (×1.33 when mipmapped), grouped by the largest offenders.
//   URL=http://localhost:3000/dev/mode/dunk npx tsx scripts/probes/_vram-diag.mts
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
// TIER=mobile mirrors scripts/capture-mode-play.mts: a phone-shaped, touch-capable context so detectQualityTier picks 'mobile'
const p = process.env.TIER === 'mobile'
  ? await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36' })).newPage()
  : await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(Number(process.env.WAIT_MS ?? 12000));
console.log(await p.evaluate(`(() => { const d = window.__FEL_DEV__; if (!d) return 'no __FEL_DEV__'; const s = d.scene;
  const rows = []; let total = 0;
  for (const t of s.textures) { const sz = t.getSize ? t.getSize() : { width: 0, height: 0 }; const mip = t.noMipmap === false || t.generateMipMaps ? 1.33 : 1; const bytes = sz.width * sz.height * 4 * mip * (t.isCube ? 6 : 1); total += bytes; rows.push([bytes, (t.name || t.url || t.getClassName()).toString().split('/').pop().slice(0, 48), sz.width + 'x' + sz.height + (t.isCube ? ' cube' : '')]); }
  rows.sort((a, b) => b[0] - a[0]);
  return JSON.stringify({ mode: d.modeId, tier: (document.documentElement.dataset.felTier || (innerWidth < 900 ? 'mobile?' : 'desktop?')), textures: s.textures.length, totalMB: +(total / 1048576).toFixed(1), top: rows.slice(0, 8).map((r) => (r[0] / 1048576).toFixed(1) + 'MB ' + r[1] + ' ' + r[2]) }); })()`));
await b.close();
