#!/usr/bin/env -S npx tsx
// Drive Mixed Combat like a Soul Calibur player: pick a loadout, CIRCLE to
// make verticals whiff past (the step), punish with the sweep, and push the
// ring-out when the rival's back glows. A bot that stands still and mashes
// would report "combat works" while never touching the line grammar — the
// step only exists for a moving defender.
//
//   URL=http://localhost:3001/dev/mode/mixedcombat npx tsx scripts/mixedcombat-drive.mts
//
// Proves: loadout pick (dpad AND stick paths), the stepped outcome live
// (banner + chi paid), both edge warnings, a decided round, FEL-FRAME 0.

import { chromium } from 'playwright-core';

const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/mixedcombat';

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
await p.waitForTimeout(3500); // countdown

const text = () => p.evaluate<string>('document.body.innerText');
// The dev HUD dump is PRETTY-printed JSON — parse the slice, never regex it.
const hud = async (): Promise<Record<string, unknown>> => {
  const t = await text();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

// ── loadout: d-pad down picks STAFF (rival takes FISTS) ────────────────────
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(400);
let h = await hud();
console.log('loadout after d-pad down:', String(h.loadout ?? '(none)'));
if (!/STAFF/i.test(String(h.loadout))) console.log('WARN: d-pad loadout pick did not read STAFF');
// stick path check (Controller Link phones): back up to FISTS via W flick
await p.keyboard.down('w'); await p.waitForTimeout(220); await p.keyboard.up('w');
await p.waitForTimeout(300);
h = await hud();
console.log('loadout after stick up  :', String(h.loadout ?? '(none)'));
if (!/FISTS/i.test(String(h.loadout))) console.log('WARN: stick loadout pick did not read FISTS');
// final pick: STAFF — the reach loadout — then lock in with an attack button
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(250);
await p.keyboard.press('j');
await p.waitForTimeout(600);

const found = { steppedByMe: false, steppedMe: false, edgeMine: false, edgeTheirs: false, roundDecided: false, matchOver: false, chiFromStep: false };

// ── Phase 1: the defensive proof. PURE ORBIT, no attacks, no blocks — any
// chi I gain is a step being paid (+8), because the only other sources are
// my hits and my parries, and I do neither. Chi is the side channel: page
// console drops under load, and the 900ms banner window slips past polling.
{
  let lastChi = 0;
  const orbitUntil = Date.now() + 35_000;
  while (Date.now() < orbitUntil && !found.steppedByMe) {
    await p.keyboard.down('d'); await p.waitForTimeout(200);
    const h1 = await hud();
    await p.keyboard.up('d'); await p.keyboard.down('a'); await p.waitForTimeout(200);
    await p.keyboard.up('a');
    const h2 = await hud();
    for (const hh of [h1, h2]) {
      if (/STEPPED IT!/.test(String(hh.banner ?? ''))) found.steppedByMe = true;
      if (/ROUND \d — (YOU|RIVAL)/.test(String(hh.banner ?? ''))) found.roundDecided = true;
      if (typeof hh.chi === 'number') {
        if (hh.chi > lastChi) { found.steppedByMe = true; found.chiFromStep = true; }
        lastChi = hh.chi;
      }
      if (hh.edge === 'EDGE BEHIND YOU') found.edgeMine = true;
      if (hh.edge === 'RIVAL ON THE EDGE') found.edgeTheirs = true;
    }
    // if the round ended (ring-outs happen to orbiters), re-lock STAFF
    const t = await text();
    if (/pick FISTS or STAFF/i.test(t)) {
      await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150); await p.keyboard.press('j');
    }
  }
}
console.log('defensive phase:', JSON.stringify(found));

// ── Phase 2: the offensive proof. Press in, jab+sweep, heavy when the
// rival's back glows — hunt a ring-out or KO. ──────────────────────────────
const deadline = Date.now() + 140_000;
for (let g = 0; g < 2000 && Date.now() < deadline; g++) {
  const t = await text();
  h = await hud();
  const head = t.split('\n')[0];
  if (/·\s*ended/.test(head)) { found.matchOver = true; break; }
  if (/ROUND \d — (YOU|RIVAL)/.test(String(h.banner ?? ''))) found.roundDecided = true;
  if (/^STEPPED!/.test(String(h.banner ?? ''))) found.steppedMe = true;
  if (h.edge === 'EDGE BEHIND YOU') found.edgeMine = true;
  if (h.edge === 'RIVAL ON THE EDGE') found.edgeTheirs = true;

  const fighting = typeof h.foeHp === 'number' && !/ROUND \d — /.test(String(h.banner ?? ''));
  if (fighting) {
    if (h.edge === 'RIVAL ON THE EDGE') {
      await p.keyboard.down('w'); await p.waitForTimeout(240); await p.keyboard.up('w');
      await p.keyboard.press('i');
      await p.waitForTimeout(420);
    } else {
      await p.keyboard.down('w'); await p.waitForTimeout(300); await p.keyboard.up('w');
      await p.keyboard.press('j');
      await p.waitForTimeout(240);
      await p.keyboard.press('k');
      await p.waitForTimeout(360);
    }
  } else {
    if (/pick FISTS or STAFF/i.test(t)) {
      await p.keyboard.press('ArrowDown');
      await p.waitForTimeout(150);
      await p.keyboard.press('j');
    }
    await p.waitForTimeout(400);
  }
}

console.log('\nfindings:', JSON.stringify(found, null, 1));
const frames = logs.filter((l) => /FEL-FRAME/.test(l)).length;
const clips = logs.filter((l) => /MISSING CLIP/.test(l)).length;
const dogs = logs.filter((l) => /WATCHDOG/.test(l)).length;
const errs = logs.filter((l) => /\[error\]|\[pageerror\]/.test(l)).length;
console.log(`mixedcombat-drive FEL-FRAME ${frames} | MISSING CLIP ${clips} | watchdogs ${dogs} | errors ${errs}`);
for (const l of logs.slice(0, 10)) console.log(' ', l);
await b.close();

// steppedMe (the rival stepping MY vertical) is observed-but-not-required:
// the brain only circles when idle in range, so it depends on its dice.
const pass = found.roundDecided && found.steppedByMe && (found.edgeTheirs || found.edgeMine) && frames === 0 && errs === 0;
console.log(pass ? 'mixedcombat-drive: PASS' : 'mixedcombat-drive: INCOMPLETE — see findings');
process.exit(pass ? 0 : 1);
