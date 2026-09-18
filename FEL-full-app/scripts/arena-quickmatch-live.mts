#!/usr/bin/env -S npx tsx
// Live economy check for Arena Quick Match, against a running dev server.
//
// Drives the REAL routes with the playtest account's session cookie:
//   1. POST /api/arena/quick-match  → duel is ACTIVE instantly, a House
//      Rival holds p2, both fees locked (balance drops by the fee).
//   2. POST /api/arena/submit-score → the ghost score is drawn from the
//      seed (logged via GHOST_SCORED), the duel settles, and the wallet
//      reflects win (payout) or loss (nothing back).
//   3. GET  /api/arena/list         → the duel shows with the HOUSE flag.
//
// Run: URL=http://localhost:3001 npx tsx scripts/arena-quickmatch-live.mts

import { chromium, type Browser } from 'playwright-core';

const BASE = process.env.URL ?? 'http://localhost:3001';
const CHROME = process.env.CHROME_PATH
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const fail = (msg: string): never => { console.error(`LIVE CHECK FAILED: ${msg}`); process.exit(1); };

let browser: Browser | null = null;
try {
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();

  // Login (networkidle is safe on /login — no long-polling hosts there).
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await page.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  const api = async (path: string, body?: unknown) =>
    page.evaluate(
      `fetch('${path}', { method: ${body ? "'POST'" : "'GET'"}, headers: { 'Content-Type': 'application/json' }${body ? `, body: '${JSON.stringify(body).replace(/'/g, "\\'")}'` : ''} }).then(r => r.json())`,
    );

  const cfgBefore = (await api('/api/arena/config')) as any;
  const balBefore: number = cfgBefore.balance;
  console.log(`balance before: ${balBefore} LC · arena modes: ${cfgBefore.modes.length}`);
  if (cfgBefore.modes.length < 25) fail(`expected full-roster coverage, got ${cfgBefore.modes.length} modes`);
  if (cfgBefore.modes.some((m: any) => m.key === 'sprint')) fail('retired sprint is still stakeable');

  const FEE = 25;
  const qm = (await api('/api/arena/quick-match', { mode: 'threePoint', feeLc: FEE })) as any;
  console.log('quick-match:', JSON.stringify(qm));
  if (!qm.ok) fail(`quick-match rejected: ${qm.error} ${qm.detail ?? ''}`);
  if (qm.status !== 'ACTIVE') fail(`expected ACTIVE from birth, got ${qm.status}`);
  if (!qm.rival?.house) fail('no house rival seated');
  if (!qm.href?.includes('/play/')) fail(`no venue href (got ${qm.href})`);

  const cfgMid = (await api('/api/arena/config')) as any;
  if (cfgMid.balance !== balBefore - FEE) fail(`stake not locked: ${balBefore} → ${cfgMid.balance} (fee ${FEE})`);
  console.log(`stake locked: ${balBefore} → ${cfgMid.balance}`);

  // Submit a score — the ghost draws and the duel settles in one call.
  const MY_SCORE = 16;
  const sub = (await api('/api/arena/submit-score', { matchId: qm.matchId, score: MY_SCORE })) as any;
  console.log('submit:', JSON.stringify(sub));
  if (!sub.ok) fail(`submit rejected: ${sub.error} ${sub.detail ?? ''}`);
  if (!sub.settled) fail('ghost duel did not settle on submission');
  const ghost = sub.p2Score;
  if (typeof ghost !== 'number') fail(`no ghost score in the settlement (${JSON.stringify(sub)})`);
  const tie = sub.result === 'tie';
  console.log(`settled: me ${MY_SCORE} · ${qm.rival.name} ${ghost} → ${tie ? 'TIE — refunded' : sub.iWon ? `WON +${sub.payout}` : 'LOST'}`);

  // Determinism: a second submission must not change the result.
  const again = (await api('/api/arena/submit-score', { matchId: qm.matchId, score: 99 })) as any;
  if (again.ok && (again.p1Score !== MY_SCORE || again.p2Score !== ghost)) {
    fail('re-submission mutated the recorded scores');
  }

  const cfgAfter = (await api('/api/arena/config')) as any;
  const expected = tie ? balBefore : sub.iWon ? balBefore - FEE + sub.payout : balBefore - FEE;
  if (cfgAfter.balance !== expected) fail(`wallet out of book: expected ${expected}, got ${cfgAfter.balance}`);
  console.log(`wallet in book: ${cfgAfter.balance} LC (${tie ? 'stake refunded' : sub.iWon ? 'stake back + winnings' : 'stake lost'})`);

  const list = (await api('/api/arena/list')) as any;
  const mine = (list.mine as any[]).find((m) => m.id === qm.matchId);
  if (!mine) fail('the settled duel is missing from my list');
  if (!mine.ghost) fail('the duel is not labelled as a house duel');
  if (mine.opponent !== qm.rival.name) fail(`opponent label mismatch: ${mine.opponent} vs ${qm.rival.name}`);
  console.log(`lobby label: vs ${mine.opponent} [HOUSE] · ${mine.status} · iWon=${mine.iWon}`);

  console.log('\narena-quickmatch-live: ALL CHECKS GREEN');
} finally {
  await browser?.close();
}
