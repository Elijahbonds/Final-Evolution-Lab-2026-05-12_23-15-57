// JOIN-LAB-HIDE (2026-09-29): what `/` actually sends, in a real browser. The flyer and IG path lands on `/`, and until
// the adult waitlist asks an age question and saves safely (PRIVACY-CORE), `/` collects no email.
//
// A fresh signed-out profile opens `/`, waits for the network to go quiet, and records every request (url, method,
// status). EXPECT=hidden (the default, the switch unset) passes only with 0 requests to /api/marketing/subscribe or
// /api/signup, 0 POSTs other than /api/analytics, and no <form>, no input[type=email], no "Join the Lab" and no "Join"
// button in the page. EXPECT=shown is the control, for a server started with NEXT_PUBLIC_JOIN_LAB_ENABLED=true: the
// same DOM checks must FIND the form, which proves they would have found it with the switch off. Neither mode types
// into or submits anything.
//
//   BASE=http://127.0.0.1:3241 EXPECT=hidden npx tsx scripts/probes/_join-lab-hide.mts
//
// Writes home.png and requests.json (home-shown.png / requests-shown.json for the control) to OUT, by default
// ~/Claude/outbox/JOIN-LAB-HIDE-shots/. Exits 1 on any failed check.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3241';
const EXPECT = process.env.EXPECT === 'shown' ? 'shown' : 'hidden';
const OUT = process.env.OUT ?? join(homedir(), 'Claude', 'outbox', 'JOIN-LAB-HIDE-shots');
const suffix = EXPECT === 'shown' ? '-shown' : '';
const SIGNUP = /\/api\/marketing\/subscribe|\/api\/signup/;

interface Row { url: string; method: string; status: number | null; type: string }
const rows: Row[] = [];
const consoleErrors: string[] = [];

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });   // fresh: no cookies, no storage
  const page = await ctx.newPage();
  const byRequest = new Map<object, Row>();
  page.on('request', (r) => {
    const row: Row = { url: r.url(), method: r.method(), status: null, type: r.resourceType() };
    byRequest.set(r, row);
    rows.push(row);
  });
  page.on('requestfinished', async (r) => {
    const row = byRequest.get(r);
    const res = await r.response().catch(() => null);
    if (row && res) row.status = res.status();
  });
  page.on('requestfailed', (r) => { const row = byRequest.get(r); if (row) row.status = -1; });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });

  const nav = await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 240_000 });
  // The hero's analytics flush right after mount; give late work a moment, then wait for quiet again.
  await page.waitForTimeout(3_000);
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});

  const dom = await page.evaluate(() => ({
    forms: document.querySelectorAll('form').length,
    emailInputs: document.querySelectorAll('input[type="email"]').length,
    joinTheLab: /Join the Lab/i.test(document.body.innerText),
    joinButtons: [...document.querySelectorAll('button')].filter((b) => /^\s*Join\s*$/i.test(b.textContent ?? '')).length,
    playNow: /PLAY NOW/.test(document.body.innerText),
    path: location.pathname,
  }));
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `home${suffix}.png`), fullPage: true });

  const path = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
  const signup = rows.filter((r) => SIGNUP.test(path(r.url)));
  const otherPosts = rows.filter((r) => r.method === 'POST' && path(r.url) !== '/api/analytics');
  const analyticsPosts = rows.filter((r) => r.method === 'POST' && path(r.url) === '/api/analytics');

  const checks: Array<[string, boolean]> = [
    ['GET / answered 200 and stayed on / (signed out)', nav?.status() === 200 && dom.path === '/'],
    ['the hero rendered (PLAY NOW)', dom.playNow],
    ['0 requests to /api/marketing/subscribe or /api/signup', signup.length === 0],
    ['0 POSTs other than /api/analytics', otherPosts.length === 0],
  ];
  if (EXPECT === 'hidden') {
    checks.push(
      ['no <form>', dom.forms === 0],
      ['no input[type=email]', dom.emailInputs === 0],
      ['no "Join the Lab" text', !dom.joinTheLab],
      ['no "Join" button', dom.joinButtons === 0],
    );
  } else {
    checks.push(
      ['control: the <form> is found', dom.forms >= 1],
      ['control: the input[type=email] is found', dom.emailInputs >= 1],
      ['control: "Join the Lab" is found', dom.joinTheLab],
      ['control: the "Join" button is found', dom.joinButtons >= 1],
    );
  }

  const report = {
    base: BASE, expect: EXPECT, at: new Date().toISOString(), dom,
    counts: { requests: rows.length, signup: signup.length, otherPosts: otherPosts.length, analyticsPosts: analyticsPosts.length },
    checks: checks.map(([name, ok]) => ({ name, ok })),
    consoleErrors,
    requests: rows,
  };
  writeFileSync(join(OUT, `requests${suffix}.json`), JSON.stringify(report, null, 2));

  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`requests=${rows.length} posts=${rows.filter((r) => r.method === 'POST').length} analyticsPosts=${analyticsPosts.length} signup=${signup.length} otherPosts=${otherPosts.length}`);
  if (otherPosts.length) console.log('other POSTs:', otherPosts.map((r) => `${r.method} ${path(r.url)} ${r.status}`).join(', '));
  console.log(`wrote ${join(OUT, `home${suffix}.png`)} and ${join(OUT, `requests${suffix}.json`)}`);
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
} finally {
  await browser.close();
}
