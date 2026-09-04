import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/karate_vs', OUT = process.env.OUT_DIR ?? 'docs/shots';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(8000);
await p.getByText(/^START$/).first().click({ force: true }).catch(() => {}); await p.waitForTimeout(1500);
for (const w of [0.006, 0.003]) {
  await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; for (const m of s.meshes) if (/^Body/.test(m.name)) { m.renderOutline = true; m.outlineWidth = ${w}; } })()`);
  await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/ink-w${String(w).replace('.', '_')}.png` });
}
await b.close();
