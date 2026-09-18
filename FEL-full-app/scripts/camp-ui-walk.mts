// Screenshot the Camp screens as the facilitator and the mentee.
//   OUT=<dir> BASE=http://localhost:3000 npx tsx scripts/camp-ui-walk.mts
import { chromium, request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
async function cookiesFor(email: string, password: string) {
  const ctx = await request.newContext({ baseURL: BASE });
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken as string;
  await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, json: 'true' } });
  const state = await ctx.storageState(); await ctx.dispose();
  return state.cookies;
}
const browser = await chromium.launch({ executablePath: EXE });
const errors: string[] = [];
for (const who of [{ tag: 'facilitator', email: 'playtest@fel.local' }, { tag: 'mentee', email: 'mentee@fel.local' }]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(await cookiesFor(who.email, 'playtest-local-only'));
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who.tag}: ${m.text().slice(0, 160)}`); });
  await page.goto(`${BASE}/camp`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const title = await page.textContent('h1');
  for (const tab of ['Certify', 'Plans', 'Session', 'Templates']) {
    await page.getByRole('button', { name: tab, exact: true }).click().catch(() => undefined);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/camp-${who.tag}-${tab.toLowerCase()}.png` });
  }
  const text = (await page.innerText('main')).replace(/\s+/g, ' ');
  console.log(`${who.tag}: h1="${title}" status="${/Mentorship[^.]*\. ([^]+?)(?=\s(Certify|Plans))/.exec(text)?.[1] ?? '?'}" plans=${(text.match(/You facilitate|Your plan/g) ?? []).length} templates=${(text.match(/milestone/g) ?? []).length}`);
  await context.close();
}
console.log('console errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
