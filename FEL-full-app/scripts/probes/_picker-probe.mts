// THE PICKERS — does the boot splash actually offer the court, the ball, the venue and the deck?
//
// Reported unverified since they shipped: the hosts that mount BootSplash live behind an auth wall, so the
// UI was built and never watched. /dev/threepoint mounts the real host with no auth, which is the way in.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const PATH = process.env.PATH_ ?? '/dev/threepoint';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1120, height: 720 } });
let errors = 0; const errs: string[] = [];
p.on('pageerror', (e) => { errors++; if (errs.length < 3) errs.push(e.message.slice(0, 120)); });
p.on('console', (m) => { if (m.type() === 'error' && !/401|favicon/.test(m.text())) { errors++; if (errs.length < 3) errs.push(m.text().slice(0, 120)); } });
await p.goto(BASE + PATH, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(9000);

const text = await p.evaluate("(() => document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0, 500))()");
console.log('splash text:', text);

// what the pickers remember, before and after a click
const before = await p.evaluate("(() => ({ court: localStorage.getItem('fel-court-location'), ball: localStorage.getItem('fel-ball-skin'), venue: localStorage.getItem('fel-board-venue-skate'), deck: localStorage.getItem('fel-board-deck-skate') }))()");
console.log('stored before:', JSON.stringify(before));

// click every option chip the splash offers and see what sticks
const clicked: string[] = [];
for (const label of ['COURT', 'BALL', 'VENUE', 'DECK']) {
  const row = p.locator(`text=/^${label}$/`).first();
  if (!(await row.count())) { clicked.push(label + ':absent'); continue; }
  clicked.push(label + ':present');
}
console.log('picker rows:', clicked.join(' '));

const chips = await p.locator('button').allInnerTexts();
console.log('buttons:', chips.slice(0, 24).join(' / '));

// A PICK HAS TO STICK. Click a non-default court and a non-default ball, then read what was remembered —
// a picker that renders and forgets is worse than no picker, because the player thinks they chose.
// THE BALL FIRST, AND ON ITS OWN. Picking a LOCATION calls window.location.assign — the venue mounts when
// the mode loads, so a new court reloads the route with the pick in the URL. Clicking a court and then a
// ball in one pass therefore navigates away mid-sequence and eats the second click, which is what made the
// first run of this probe read "the ball picker forgets". It does not; the probe was wrong.
const ballBtn = p.locator('button', { hasText: /^RAINBOW$/ }).first();
if (await ballBtn.count()) { await ballBtn.click(); await p.waitForTimeout(600); }
const afterBall = await p.evaluate("(() => localStorage.getItem('fel-ball-skin'))()");
console.log('ball after clicking RAINBOW:', JSON.stringify(afterBall));

const courtBtn = p.locator('button', { hasText: /^ORBIT$/ }).first();
if (await courtBtn.count()) { await courtBtn.click(); await p.waitForTimeout(2500); }
const after = await p.evaluate("(() => ({ court: localStorage.getItem('fel-court-location'), ball: localStorage.getItem('fel-ball-skin'), url: location.search }))()");
console.log('stored AFTER the court pick (which reloads):', JSON.stringify(after));

// and it must survive a reload, which is the whole point of remembering it
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(7000);
const reloaded = await p.evaluate("(() => ({ court: localStorage.getItem('fel-court-location'), ball: localStorage.getItem('fel-ball-skin'), shown: document.body.innerText.includes('RAINBOW') }))()");
console.log('after RELOAD:', JSON.stringify(reloaded));
await p.screenshot({ path: './shots/picker.png' });
console.log('errors', errors, errs.join(' | '));
await b.close();
