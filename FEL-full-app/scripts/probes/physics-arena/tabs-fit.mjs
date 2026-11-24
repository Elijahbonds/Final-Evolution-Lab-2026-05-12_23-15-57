// lane/physics-arena, look pass (LOOK-PASS-AUDIT finding 12 c): do the arena's sport tabs fit an upright phone? A replica of the top
// row (app/play/arena/loader.tsx's back chip, stage.tsx's tabs and score) in plain CSS with Tailwind's box numbers and the app's own
// font file (IBM Plex Sans, app/fonts), measured in Chromium at 390 / 360 / 844 wide. BEFORE = the old markup (the label can wrap),
// AFTER = whitespace-nowrap, and "3PT" with px-2.5 under Tailwind's sm (640 px). The control: BEFORE must reproduce the audit's wrapped "3-Point".
//   node tabs-fit.mjs <outDir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const font = path.resolve(new URL('../../../app/fonts/ibm-plex-sans-latin-variable.woff2', import.meta.url).pathname);
const page = (after, sport) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@font-face { font-family: Plex; src: url(file://${font}) format('woff2'); font-weight: 400 700; }
* { box-sizing: border-box; } html, body { margin: 0; height: 100%; background: #333; color: #fff; font-family: Plex, sans-serif; }
.stage { position: relative; height: 100%; width: 100%; overflow: hidden; }
.chip { position: fixed; left: 12px; top: 12px; display: inline-flex; min-height: 44px; min-width: 44px; align-items: center; gap: 4px; border-radius: 9999px; background: rgba(0,0,0,.6); padding: 0 12px; font-size: 16px; line-height: 24px; font-weight: 700; }
.chip i { display: inline-block; width: 20px; height: 20px; }
.score { position: absolute; right: 12px; top: 12px; border-radius: 9999px; background: rgba(0,0,0,.6); padding: 8px 16px; font-size: 16px; line-height: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
nav { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; gap: 4px; border-radius: 9999px; background: rgba(0,0,0,.6); padding: 4px; }
nav a { display: inline-flex; min-height: 44px; align-items: center; border-radius: 9999px; padding: 0 12px; font-size: 16px; line-height: 24px; font-weight: 700; ${after ? 'white-space: nowrap;' : ''} }
nav a.on { background: #fff; color: #000; }
.short { display: inline; } .long { display: none; }
${after ? 'nav a { padding: 0 10px; }' : ''}
@media (min-width: 640px) { .short { display: none; } .long { display: inline; } ${after ? 'nav a { padding: 0 12px; }' : ''} }
</style></head><body><div class="stage">
<div class="score">${sport === 'threepoint' ? '0 · 60s' : '0–0'}</div>
<nav><a class="${sport === 'hoops' ? 'on' : ''}">1v1</a><a class="${sport === 'threes' ? 'on' : ''}">3v3</a><a class="${sport === 'threepoint' ? 'on' : ''}">${after ? '<span class="short">3PT</span><span class="long">3-Point</span>' : '3-Point'}</a></nav>
</div><a class="chip"><i></i> Play</a></body></html>`;
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const rows = [];
for (const w of [390, 360, 844]) for (const after of [false, true]) for (const sport of ['hoops', 'threepoint']) {
  const ctx = await b.newContext({ viewport: { width: w, height: w > 600 ? 390 : 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const f = path.join(out, `tabs-${w}-${after ? 'after' : 'before'}-${sport}.html`);
  fs.writeFileSync(f, page(after, sport));
  await p.goto(`file://${f}`); await p.evaluate(() => document.fonts.ready);
  const r = await p.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const nav = box(document.querySelector('nav')), chip = box(document.querySelector('.chip')), score = box(document.querySelector('.score'));
    const tabs = [...document.querySelectorAll('nav a')].map((a) => Math.round(box(a).height));
    return { navL: Math.round(nav.left), navR: Math.round(nav.right), chipR: Math.round(chip.right), scoreL: Math.round(score.left), tabs, font: document.fonts.check('700 16px Plex') };
  });
  const wrapped = r.tabs.some((h) => h > 44), overlap = r.navL < r.chipR + 4 || r.navR > r.scoreL - 4;
  rows.push({ w, side: after ? 'after' : 'before', sport, ...r, wrapped, overlap });
  await p.screenshot({ path: path.join(out, `tabs-${w}-${after ? 'after' : 'before'}-${sport}.jpg`), type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: w, height: 70 } });
  await ctx.close();
}
await b.close();
for (const r of rows) console.log(`${String(r.w).padStart(3)} ${r.side.padEnd(6)} ${r.sport.padEnd(10)} tabs ${r.tabs.join('/')} px · nav ${r.navL}..${r.navR} · chip ends ${r.chipR} · score starts ${r.scoreL} · font ${r.font} → ${r.wrapped ? 'WRAPS' : 'one line'}, ${r.overlap ? 'OVERLAPS' : 'clear'}`);
