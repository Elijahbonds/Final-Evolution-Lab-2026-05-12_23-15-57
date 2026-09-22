// BOARD TRICK probe — are the NAMED tricks reachable in play?
//
// Before this, three buttons meant three fixed tricks. The claim is that the HELD DIRECTION now picks which trick a
// button throws, so fifteen skate tricks are reachable from the same three buttons. The proof is the banner: it carries
// the trick's own label, so the set of labels seen IS the set of tricks reached.
//
// env: BASE MODE (skateboard) MAXMS (80000)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'skateboard';
const MAXMS = Number(process.env.MAXMS ?? 80000);
// phase 4: BANK_GAP=1 skips every 6th press cycle (a 2.8 s quiet spell on the ground) so the combo's BANK can be seen
const BANK_GAP = process.env.BANK_GAP === '1';
// the mode's own landing / combo ledger lines, tallied (the banner hides bails by design; the log does not)
const LOG_RE = /\[(AIR-TRICK|AIR-COMBO|SKATE-LAND|SNOW-LAND|SURF-LAND)\]/;
const ledger: string[] = [];
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
let errors = 0; const errs: string[] = [];
p.on('console', (m) => { if (LOG_RE.test(m.text())) ledger.push(m.text().slice(0, 160)); if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) { errors++; if (errs.length < 4) errs.push(m.text().slice(0, 140)); } });
p.on('pageerror', (e) => { errors++; errs.push('PAGEERROR ' + e.message.slice(0, 150)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3000); }
// Ride, pop, and throw a button with each of the four held directions in turn — which is the whole grammar.
await p.evaluate(`(() => {
  const pad = window.__PAD;
  const press = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0.1, value: v }; pad.timestamp = performance.now(); };
  window.__BT = { labels: {}, frames: 0 };
  // scrape the banner every frame: the trick's own label goes there
  const scrape = () => {
    try {
      const m = document.body.innerText.match(/"banner"\\s*:\\s*"([^"]*)"/);
      if (m && m[1] && !/SKETCHY|BAIL|SAVE/.test(m[1])) window.__BT.labels[m[1]] = (window.__BT.labels[m[1]] || 0) + 1;
    } catch (e) {}
  };
  setInterval(scrape, 50);
  const DIRS = [[0,0],[0,-1],[0,1],[-1,0],[1,0]];   // none, up, down, left, right
  const BTNS = [1, 2, 3];                            // B, X, Y
  let i = 0;
  window.__BTI = setInterval(() => {
    if (${BANK_GAP} && i % 6 === 5) { i++; return; }   // the quiet cycle: nothing thrown, the open combo runs out and banks
    const dir = DIRS[(i / 3 | 0) % DIRS.length];
    const btn = BTNS[i % BTNS.length];
    i++;
    // push to build speed, then pop and throw the trick while airborne
    pad.axes[0] = dir[0]; pad.axes[1] = dir[1] === 0 ? -0.9 : dir[1];
    press(7, 1);                                     // the pump/pop trigger
    pad.timestamp = performance.now();
    setTimeout(() => { press(7, 0); press(0, 1); }, 120);     // release pop -> ollie (A)
    setTimeout(() => { press(0, 0); pad.axes[0] = dir[0]; pad.axes[1] = dir[1]; press(btn, 1); }, 320);
    setTimeout(() => { press(btn, 0); }, 430);
  }, 1400);
})()`);
await p.waitForTimeout(MAXMS);
const bt = await p.evaluate('window.__BT') as { labels: Record<string, number> };
await p.evaluate('clearInterval(window.__BTI)');
const names = Object.keys(bt.labels).filter((l) => l && l.length > 1);
console.log('mode: ' + MODE);
console.log('distinct trick labels seen (' + names.length + '): ' + JSON.stringify(names));
console.log('ledger lines: ' + ledger.length + (ledger.length ? ' :: ' + ledger.slice(-10).join(' | ') : ''));
console.log('errors: ' + errors + (errs.length ? ' :: ' + errs.join(' | ') : ''));
await b.close();
