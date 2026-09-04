// Sample hero + camera right after the touch start on the SHIPPING route, on a
// portrait phone viewport (the mobile skateboard start-of-run frame-guard flake).
//   npx tsx scripts/_mobile-start-probe.mts   (URL=… to change the route)
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/play/skateboard?agent=1';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const frames: string[] = [];
page.on('console', (m) => { const t = m.text(); if (t.includes('[FEL-FRAME]')) frames.push(t.slice(0, 230)); });
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const email = page.locator('input[type="email"]');
if (await email.count()) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await email.fill('playtest@fel.local');
  await page.locator('input[type="password"]').fill('playtest-local-only');
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  await page.goto(URL_, { waitUntil: 'load' });
}
await page.waitForSelector('canvas', { timeout: 30_000 });
await page.waitForTimeout(1500);
const js = [
  "(() => {",
  "  const a = window.__NEXUS_AGENT__; const s = a && a.host && a.host.scene; if (!s) return 'no scene';",
  "  const h = (a.state && a.state().hero) || null; const c = s.activeCamera;",
  "  const hp = h && h.position ? h.position : null; const f = c.getForwardRay().direction;",
  "  return JSON.stringify({ hero: hp ? [hp.x, hp.y, hp.z].map(v => +v.toFixed(2)) : null, cam: [c.position.x, c.position.y, c.position.z].map(v => +v.toFixed(2)), fwd: [f.x, f.y, f.z].map(v => +v.toFixed(2)), mode: (a.state && a.state().phase) || null });",
  "})()",
].join(String.fromCharCode(10));
console.log('before start', await page.evaluate(js));
await page.getByText(/TAP TO START/i).first().tap().catch(async () => { await page.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {}); });
const t0 = Date.now();
for (const at of [60, 150, 300, 500, 800, 1200, 2000]) {
  const wait = at - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
  console.log(`t+${at}ms`, await page.evaluate(js));
}
console.log('frame-guard lines:', frames.length, frames.slice(0, 2).join(' | '));
await b.close();
