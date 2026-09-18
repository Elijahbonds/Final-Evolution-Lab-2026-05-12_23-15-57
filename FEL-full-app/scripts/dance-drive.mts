#!/usr/bin/env -S npx tsx
// Drive The Cypher like a dancer: tap ON the beat (96 BPM = 625ms, steps at
// difficulty 2 land on-beat — syncopation is a difficulty-3 feature), and
// watch the band build. A bot that mashes proves the judging rejects noise;
// a bot on the grid proves the stems join.
//
//   URL=http://localhost:3001/dev/mode/dance npx tsx scripts/dance-drive.mts
//
// Proves: on-beat tapping scores and raises the MIX (instruments join),
// the combo readout renders, the run ends with stars + MIX %, FEL-FRAME 0.

import { chromium } from 'playwright-core';

const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/dance';
const BEAT_MS = 625; // 96 BPM

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
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

const text = () => p.evaluate<string>('document.body.innerText');
const hud = async (): Promise<Record<string, any>> => {
  const t = await text();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

// dance by READING THE CUE — the mode publishes the next move and when it
// lands (nextStepIn, seconds). Tap as it crosses ~zero. (Grid-guessing was
// unfair by design: most beats have no step on them — the cue is the game.)
for (let i = 0; i < 120; i++) {
  const h = await hud();
  if (typeof h.nextStepIn === 'number' || String(h.banner ?? '') === 'GO') break;
  await p.waitForTimeout(50);
}
console.log('reading the cue');

const seen = { joins: new Set<string>(), maxCombo: 0, mixRose: false, mixDropped: false, stars: '' };
let lastMix = 0;
let ended = false;

// Tap on the cue crossing. The judging window is SYMMETRIC now (an early
// tap inside 0.2s counts against the upcoming step), so stale-DOM latency
// lands somewhere inside the window either way. One tap per step: the cue's
// step NAME changes per step — key on that.
let lastStepSeen = '';
let tappedThisStep = false;

for (let i = 0; i < 3200 && !ended; i++) {
  const h = await hud();
  const banner = String(h.banner ?? '');
  const stepName = String(h.nextStep ?? '');
  const inSec = typeof h.nextStepIn === 'number' ? h.nextStepIn : Infinity;

  if (stepName && stepName !== lastStepSeen) { lastStepSeen = stepName; tappedThisStep = false; }
  if (stepName && !tappedThisStep && inSec <= 0.12) {
    tappedThisStep = true;
    await p.keyboard.press('j');
  }

  const join = /(\w+) JOINS THE MIX/.exec(banner);
  if (join) seen.joins.add(join[1]);
  if (typeof h.combo === 'number') seen.maxCombo = Math.max(seen.maxCombo, h.combo);
  if (typeof h.energy === 'number') {
    if (h.energy > lastMix) seen.mixRose = true;
    if (h.energy < lastMix) seen.mixDropped = true;
    lastMix = h.energy;
  }
  if (/★|☆/.test(banner)) { seen.stars = banner; ended = true; }
  if (i % 25 === 0 && /·\s*ended/.test((await text()).split('\n')[0])) ended = true;
  await p.waitForTimeout(25);
}

// let the results land
for (let i = 0; i < 20 && !ended; i++) {
  await p.waitForTimeout(400);
  const h = await hud();
  if (/★|☆/.test(String(h.banner ?? ''))) { seen.stars = String(h.banner); ended = true; }
  if (/·\s*ended/.test((await text()).split('\n')[0])) ended = true;
}

console.log('\nfindings:', JSON.stringify({ joins: [...seen.joins], maxCombo: seen.maxCombo, mixRose: seen.mixRose, finalMix: lastMix, ended }, null, 1));
console.log('result banner:', seen.stars || '(none)');
const frames = logs.filter((l) => /FEL-FRAME/.test(l)).length;
const clips = logs.filter((l) => /MISSING CLIP/.test(l)).length;
const dogs = logs.filter((l) => /WATCHDOG/.test(l)).length;
const errs = logs.filter((l) => /\[error\]|\[pageerror\]/.test(l)).length;
console.log(`dance-drive FEL-FRAME ${frames} | MISSING CLIP ${clips} | watchdogs ${dogs} | errors ${errs}`);
for (const l of logs.slice(0, 8)) console.log(' ', l);
await b.close();

const pass = seen.joins.size >= 2 && seen.maxCombo >= 4 && seen.mixRose && ended && frames === 0 && errs === 0;
console.log(pass ? 'dance-drive: PASS' : 'dance-drive: INCOMPLETE — see findings');
process.exit(pass ? 0 : 1);
