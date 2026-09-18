// Drive a full Court Carnival night: four random events from six, each a
// different verb — a single fixed input pattern cannot play them all, so
// this driver cycles the whole deck (charge-hold-release, face buttons,
// stick movement) and lets each event pick up its own verb.
//
// Proves: the night ADVANCES through the draw (eventNum 1/4 → 4/4), reaches
// a champion, and no event stalls the night (the phase watchdog is the
// tell-tale; a hang is a failure here, not a shrug).
//
//   URL=http://localhost:3001/dev/mode/carnival npx tsx scripts/carnival-drive.mts

import { chromium } from 'playwright-core';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/carnival';

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP|FEL-CARNIVAL/.test(t)) logs.push(`[${m.type()}] ${t.slice(0, 170)}`);
});
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 170)}`));

await p.goto(MODE_URL, { waitUntil: 'networkidle' });
if (/\/login/.test(p.url())) {
  await p.locator('input[type="email"]').fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await p.locator('input[type="password"]').press('Enter');
  await p.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  await p.goto(MODE_URL, { waitUntil: 'networkidle' });
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
await p.waitForTimeout(3500);

const hud = async (): Promise<Record<string, unknown>> => {
  const t = await p.evaluate<string>('document.body.innerText');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

const seen = new Set<string>();
let maxEvent = 0;
let finale = false;
let champion = '';
const t0 = Date.now();
// a full night: 4 events × (1.8s reveal + ~20s play + 2.2s result) + finale
while (Date.now() - t0 < 180_000) {
  const h = await hud();
  const ev = String(h.eventNum ?? '');
  if (ev) { seen.add(ev); maxEvent = Math.max(maxEvent, Number(ev.split('/')[0]) || 0); }
  const banner = String(h.banner ?? '');
  if (/CARNIVAL CHAMPION|RIVAL TAKES THE CARNIVAL/.test(banner)) { finale = true; champion = banner; break; }

  // play whatever is in front of us: charge-release, face buttons, move
  await p.keyboard.down(' ');
  await p.waitForTimeout(500);
  await p.keyboard.up(' ');
  await p.keyboard.press('j');
  await p.keyboard.press('k');
  await p.keyboard.down('w');
  await p.waitForTimeout(350);
  await p.keyboard.up('w');
  await p.keyboard.press('i');
  await p.waitForTimeout(120);
}
const hEnd = await hud();
console.log(`events seen: ${[...seen].sort().join(' ')} · finale: ${finale ? champion : 'NO'}`);
console.log(`scores: me ${String(hEnd.score ?? '?')} · rival ${String(hEnd.rivalScore ?? '?')}`);
const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const watch = logs.filter((l) => /FEL-CARNIVAL.*watchdog/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`carnival-drive FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | watchdogs ${watch.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...watch, ...errs])].slice(0, 5)) console.log('   ·', l);
await b.close();
if (!finale || maxEvent < 4) process.exit(1);
