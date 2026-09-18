// _coach-shots — log in through the real /login form as the seeded client and coach and screenshot the /coach tabs.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const OUT = process.env.OUT ?? '/tmp';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
async function shot(email: string, password: string, tab: string, file: string) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await p.locator('input[type="email"], input[name="email"]').first().fill(email);
  await p.locator('input[type="password"]').fill(password);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
  await p.goto(`${BASE}/coach`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const t = p.locator(`button:has-text("${tab}")`).first(); if (await t.count()) { await t.click(); await p.waitForTimeout(1800); }
  await p.screenshot({ path: `${OUT}/${file}`, fullPage: true }); await ctx.close(); console.log('shot', file);
}
await shot(process.env.CLIENT_EMAIL ?? 'client@fel.local', process.env.CLIENT_PASSWORD ?? 'client-local-only', 'Today', 'coach-today-client.png');
await shot(process.env.COACH_EMAIL ?? 'coach@fel.local', process.env.COACH_PASSWORD ?? 'coach-local-only', 'Clients', 'coach-clients-coach.png');
await b.close();
