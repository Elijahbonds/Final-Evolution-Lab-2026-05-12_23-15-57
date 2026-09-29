// LINKS-PAGE live probe (2026-09-29): /elijah on a `next start` build (LINKS_BASE; this lane used :3181), signed out, in
// a fresh browser context. GET /elijah answers 200 with no Location; every button's href; /screen and /try open signed
// out; every request /elijah makes (first-party only, and whether next-auth's session fetch appears); screenshots at
// 390×844 and desktop width. The external shops are never opened: checking the hrefs is enough. With the server's
// NEXTAUTH_URL set to the production host, the web.app count in /elijah's HTML (and, for comparison, in /try's, which
// keeps the root layout's share-image tags) shows the page names no host (the FE PM amend, two hosts).
//
// Run from FEL-full-app (Node 26), with the server up:
//   LINKS_BASE=http://127.0.0.1:3181 node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/probes/_links-page-live.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

// the data file, as the other probes load app modules under tsx (a default-export fallback)
const LM = await import('../../app/elijah/links.ts');
const { ELIJAH_LINKS } = ((LM as unknown as { default?: typeof LM }).default ?? LM);
const BASE = process.env.LINKS_BASE ?? 'http://127.0.0.1:3181';
const ORIGIN = new URL(BASE).origin;
const OUT = process.env.LINKS_SHOTS ?? join(process.env.HOME ?? '.', 'Claude/outbox/LINKS-PAGE-shots');
mkdirSync(OUT, { recursive: true });
type Json = Record<string, any>;
const report: Json = { base: BASE, date: new Date().toISOString() };

// the raw answer: no redirect followed
const head = await fetch(`${BASE}/elijah`, { redirect: 'manual' });
report.get = { status: head.status, location: head.headers.get('location'), setCookie: head.headers.get('set-cookie') };
const HOST = new RegExp(['web', 'app'].join('\\.'), 'gi');
const count = async (path: string) => ((await (await fetch(`${BASE}${path}`)).text()).match(HOST) ?? []).length;
report.hostCount = { '/elijah': await count('/elijah'), '/try': await count('/try') };

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
try {
  for (const [tag, view] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1280, height: 900 } }]] as const) {
    const ctx = await browser.newContext(view);
    const reqs: Json[] = [];
    ctx.on('request', (r) => reqs.push({ url: r.url().replace(ORIGIN, ''), method: r.method(), type: r.resourceType(), firstParty: new URL(r.url()).origin === ORIGIN }));
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/elijah`);
    await page.waitForSelector('[data-links-page]');
    await page.waitForTimeout(2000);
    const links = await page.evaluate(`Array.from(document.querySelectorAll('[data-links-page] a')).map((a) => ({ label: a.getAttribute('data-link'), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), paidNote: (a.parentElement.querySelector('[data-paid-link-note]') || {}).textContent || null, height: Math.round(a.getBoundingClientRect().height) }))`);
    const storage = await page.evaluate(`({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })`);
    const shot = join(OUT, `elijah-${tag}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    report[tag] = {
      url: page.url().replace(ORIGIN, ''), title: await page.title(), links, errors, storage, cookies: (await ctx.cookies()).map((c) => c.name),
      requests: reqs, thirdParty: reqs.filter((r) => !r.firstParty), api: reqs.filter((r) => r.url.startsWith('/api/')).map((r) => `${r.method} ${r.url}`), shot,
    };
    if (tag === 'phone') {
      // the two internal buttons open signed out
      for (const label of ELIJAH_LINKS.filter((b) => !b.external).map((b) => b.label)) {
        await page.goto(`${BASE}/elijah`);
        await page.waitForSelector('[data-links-page]');
        await page.click(`[data-link="${label}"]`);
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        report[`open:${label}`] = { url: page.url().replace(ORIGIN, ''), login: /\/login/.test(page.url()), passwordInputs: await page.locator('input[type="password"]').count(), shot: join(OUT, `open-${label.replace(/\W+/g, '_')}.png`) };
        await page.screenshot({ path: report[`open:${label}`].shot });
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ get: report.get, hostCount: report.hostCount, phone: { ...report.phone, requests: report.phone.requests.length }, desktop: { title: report.desktop.title, requests: report.desktop.requests.length, api: report.desktop.api }, open: Object.fromEntries(Object.entries(report).filter(([k]) => k.startsWith('open:'))) }, null, 1));
