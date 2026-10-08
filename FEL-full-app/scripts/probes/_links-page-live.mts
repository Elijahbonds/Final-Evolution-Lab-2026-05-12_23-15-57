// Live probe for the one bio page: /links on a `next start` build (LINKS_BASE), signed out.
// GET /elijah is a permanent redirect to /links. External shops are never opened.
//
// Run from FEL-full-app, with the server up:
//   LINKS_BASE=http://127.0.0.1:3181 node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_links-page-live.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const LM = await import('../../lib/links/hub.ts');
const hub = ((LM as unknown as { default?: typeof LM }).default ?? LM);
const { HUB_ITEMS } = hub;
const BASE = process.env.LINKS_BASE ?? 'http://127.0.0.1:3181';
const ORIGIN = new URL(BASE).origin;
const OUT = process.env.LINKS_SHOTS ?? join(process.env.HOME ?? '.', 'Claude/outbox/LINKS-PAGE-shots');
mkdirSync(OUT, { recursive: true });
type Json = Record<string, any>;
const report: Json = { base: BASE, date: new Date().toISOString() };

const head = await fetch(`${BASE}/elijah`, { redirect: 'manual' });
report.get = { status: head.status, location: head.headers.get('location'), setCookie: head.headers.get('set-cookie') };

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
try {
  for (const [tag, view] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1280, height: 900 } }]] as const) {
    const ctx = await browser.newContext(view);
    const reqs: Json[] = [];
    ctx.on('request', (r) => reqs.push({ url: r.url().replace(ORIGIN, ''), method: r.method(), type: r.resourceType(), firstParty: new URL(r.url()).origin === ORIGIN }));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/links`);
    await page.waitForSelector('[data-links-hub]');
    await page.waitForTimeout(2000);
    const links = await page.evaluate(`Array.from(document.querySelectorAll('[data-links-hub] a')).map((a) => ({ id: a.getAttribute('data-link'), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), height: Math.round(a.getBoundingClientRect().height) }))`);
    const storage = await page.evaluate(`({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })`);
    const shot = join(OUT, `links-${tag}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    report[tag] = {
      url: page.url().replace(ORIGIN, ''), title: await page.title(), links, errors, storage, cookies: (await ctx.cookies()).map((c) => c.name),
      requests: reqs, thirdParty: reqs.filter((r) => !r.firstParty), api: reqs.filter((r) => r.url.startsWith('/api/')).map((r) => `${r.method} ${r.url}`), shot,
    };
    if (tag === 'phone') {
      for (const item of HUB_ITEMS.filter((b) => b.kind === 'internal' && b.url)) {
        await page.goto(`${BASE}/links`);
        await page.waitForSelector('[data-links-hub]');
        await page.click(`[data-link="${item.id}"]`);
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        report[`open:${item.id}`] = { url: page.url().replace(ORIGIN, ''), login: /\/login/.test(page.url()), passwordInputs: await page.locator('input[type="password"]').count(), shot: join(OUT, `open-${item.id}.png`) };
        await page.screenshot({ path: report[`open:${item.id}`].shot });
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ get: report.get, phone: { ...report.phone, requests: report.phone.requests.length }, desktop: { title: report.desktop.title, requests: report.desktop.requests.length, api: report.desktop.api }, open: Object.fromEntries(Object.entries(report).filter(([k]) => k.startsWith('open:'))) }, null, 1));
