#!/usr/bin/env -S npx tsx
// Drive Dunk Duel like two people sharing a keyboard. Scripted contest:
//   P1 dunk 1: POWER, no chair, full run-up — the baseline.
//   P2 dunk 1: POWER, no chair, full run-up — the SAME combo must NOT be
//              penalized for P2 (the memory is per player; answering a dunk
//              is a legit duel play).
//   P1 dunk 2: POWER, no chair again — P1 repeating THEMSELVES must draw
//              "THE JUDGES HAVE SEEN THAT ONE…".
//   P2 dunk 2: arm THE CHAIR but WALK the approach — feet below the top at
//              the crossing, the dunk dies at the chair.
//
//   URL=http://localhost:3001/dev/mode/dunkduel npx tsx scripts/dunkduel-drive.mts
//
// Proves live: variety memory (penalized repeat vs free answer), the chair
// being physical, the judged reveal rendering, the run-up readout, a decided
// duel, FEL-FRAME 0.

import { chromium } from 'playwright-core';

const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/dunkduel';

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP|WATCHDOG/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 170)}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 170)}`));

await p.goto(MODE_URL, { waitUntil: 'domcontentloaded' });
if (/\/login/.test(p.url())) {
  await p.locator('input[type="email"]').fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await p.locator('input[type="password"]').press('Enter');
  await p.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.goto(MODE_URL, { waitUntil: 'domcontentloaded' });
}
console.log('route :', new URL(p.url()).pathname);
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const bodyNow = await p.evaluate<string>('document.body.innerText');
if (/TAP TO START/i.test(bodyNow)) {
  await p.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
} else if (/·\s*(ready|loading)/i.test(bodyNow.split('\n')[0])) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(3200); // countdown

const text = () => p.evaluate<string>('document.body.innerText');
const hud = async (): Promise<Record<string, any>> => {
  const t = await text();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

const found = {
  revealSeen: false, p2AnswerFree: true, repeatPenalized: false,
  chairBlown: false, chairArmed: false, decided: false, judgeLines: 0,
};

/** Play one dunk attempt. `runUp` sprints the approach; `chair` arms the
 *  obstacle; `styleKey` cycles style if given. Returns the banner trail. */
async function playAttempt(tag: string, opts: { runUp: boolean; chair: boolean }): Promise<void> {
  console.log(`— ${tag}`);
  // handoff: any button skips the card
  for (let i = 0; i < 20; i++) {
    const h = await hud();
    if (/take the device/i.test(String(h.hint ?? ''))) { await p.keyboard.press('j'); break; }
    if (/HOLD CHARGE|D-PAD down arms/i.test(String(h.hint ?? ''))) break; // already in approach
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(400);
  if (opts.chair) {
    await p.keyboard.press('l'); // X = CHAIR
    await p.waitForTimeout(300);
    const h = await hud();
    if (/CHAIR/.test(String(h.prop ?? ''))) found.chairArmed = true;
  }
  // approach: sprint at the rim (or walk, for the walk-up chair kill)
  if (opts.runUp) { await p.keyboard.down('w'); }
  await p.waitForTimeout(opts.runUp ? 900 : 2400);
  if (opts.runUp) { await p.keyboard.up('w'); }
  // charge: hold SPACE (RT ramps ~1.1s), release to launch
  await p.keyboard.down(' ');
  let chargeSeen = 0;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(90);
    const h = await hud();
    if (typeof h.charge === 'number') chargeSeen = Math.max(chargeSeen, h.charge);
    if (chargeSeen >= (opts.chair ? 92 : 85)) break;
  }
  console.log(`   charge ${Math.round(chargeSeen)}%`);
  await p.keyboard.up(' ');
  // cinematic: slam on the pulse
  let slammed = false;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(50);
    const h = await hud();
    if (h.slamPulse === true && !slammed) { slammed = true; await p.keyboard.press('j'); }
    if (/CAUGHT THE CHAIR/.test(String(h.banner ?? ''))) found.chairBlown = true;
    if (/SCORES \d+|MISSED/.test(String(h.banner ?? ''))) break;
  }
  // judging: watch the reveal land
  for (let i = 0; i < 24; i++) {
    await p.waitForTimeout(200);
    const h = await hud();
    if (Array.isArray(h.judgeReveal) && h.judgeReveal.length > 0) {
      found.revealSeen = true;
      found.judgeLines = Math.max(found.judgeLines, h.judgeReveal.length);
    }
    if (/SEEN THAT ONE/.test(String(h.banner ?? ''))) found.repeatPenalized = true;
    if (/CAUGHT THE CHAIR/.test(String(h.banner ?? ''))) found.chairBlown = true;
    if (/take the device|PASS TO/.test(String(h.hint ?? '') + String(h.banner ?? ''))) break;
    if (/TAKES THE DUEL|DEAD HEAT/.test(String(h.banner ?? ''))) break;
  }
  await p.waitForTimeout(300);
}

await playAttempt('P1 dunk 1 — power, clean, full run-up', { runUp: true, chair: false });
await playAttempt('P2 dunk 1 — power, clean, full run-up (the answer)', { runUp: true, chair: false });
// P2 dunk 1 repeated P1's combo: if the variety memory leaked across
// players, repeatPenalized would already be set.
if (found.repeatPenalized) found.p2AnswerFree = false;
await playAttempt('P1 dunk 2 — SAME combo again (must be penalized)', { runUp: true, chair: false });
await playAttempt('P2 dunk 2 — THE CHAIR, walked up (must blow)', { runUp: false, chair: true });

// the decision
for (let i = 0; i < 30; i++) {
  const t = await text();
  if (/TAKES THE DUEL|DEAD HEAT/.test(t)) { found.decided = true; break; }
  if (/·\s*ended/.test(t.split('\n')[0])) { found.decided = true; break; }
  await p.waitForTimeout(400);
}

console.log('\nfindings:', JSON.stringify(found, null, 1));
const frames = logs.filter((l) => /FEL-FRAME/.test(l)).length;
const clips = logs.filter((l) => /MISSING CLIP/.test(l)).length;
const dogs = logs.filter((l) => /WATCHDOG/.test(l)).length;
const errs = logs.filter((l) => /\[error\]|\[pageerror\]/.test(l)).length;
console.log(`dunkduel-drive FEL-FRAME ${frames} | MISSING CLIP ${clips} | watchdogs ${dogs} | errors ${errs}`);
for (const l of logs.slice(0, 8)) console.log(' ', l);
await b.close();

const pass = found.revealSeen && found.p2AnswerFree && found.repeatPenalized
  && found.chairArmed && found.chairBlown && found.decided
  && frames === 0 && errs === 0;
console.log(pass ? 'dunkduel-drive: PASS' : 'dunkduel-drive: INCOMPLETE — see findings');
process.exit(pass ? 0 : 1);
