// Drive a mode through the dev runner and report what the HUD and console say.
//
//   URL=http://localhost:3000/dev/mode/onevone HOLD=390 npx tsx scripts/capture-mode-play.mts
//
// HOLD is the shoot-charge hold in ms. Modes with a release window (basketball's
// ShotMeter greens at t=0.62 over ~0.72s) need it aimed, or every shot misses.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:3000/dev/mode/onevone';
const HOLD = Number(process.env.HOLD ?? 390);
const REPS = Number(process.env.REPS ?? 10);
const OUT = process.env.OUT_DIR ?? 'docs/shots/play';
const NAME = process.env.NAME ?? 'play';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 170)}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 170)}`));

await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForSelector('canvas');
await p.waitForTimeout(2500);
const head = async () => (await p.evaluate<string>('document.body.innerText')).split('\n')[0];
// Clear a real READY gate only. START is a TOGGLE — pressing it while playing
// PAUSES the mode, which silently ruined an entire investigation once.
if (/·\s*(ready|loading)/i.test(await head())) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
await p.waitForTimeout(2500);
const hud = async () => {
  const t = await p.evaluate<string>('document.body.innerText');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return {}; }
};
console.log(`${NAME} start :`, JSON.stringify(await hud()));

for (let i = 0; i < REPS; i++) {
  await p.keyboard.down('w'); await p.waitForTimeout(900); await p.keyboard.up('w');
  await p.keyboard.down(' '); await p.waitForTimeout(HOLD); await p.keyboard.up(' ');
  await p.waitForTimeout(1400);
  if (i === Math.floor(REPS / 3)) await p.screenshot({ path: `${OUT}/${NAME}.png` });
}
console.log(`${NAME} end   :`, JSON.stringify(await hud()));
console.log(`${NAME} phase :`, await head());
const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`${NAME} FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
await b.close();
