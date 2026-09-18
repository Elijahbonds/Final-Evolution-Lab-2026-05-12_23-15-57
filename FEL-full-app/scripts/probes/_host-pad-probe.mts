// HOST + PAD, two real browser pages, one WebRTC link (mission Phase B).
//
// The acceptance criterion this gets closest to without a phone: open /host, read the join code off the
// screen, open the pad page with that code in a second tab, and watch canonical binary frames arrive.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 720 } });

const host = await ctx.newPage();
const hostErr: string[] = [];
host.on('pageerror', (e) => hostErr.push(e.message.slice(0, 140)));
host.on('console', (m) => { if (m.type() === 'error' && !/401|favicon/.test(m.text())) hostErr.push(m.text().slice(0, 140)); });
await host.goto(`${BASE}/host?mode=threepoint`, { waitUntil: 'domcontentloaded' });
await host.waitForSelector('text=/START THE SCREEN/', { timeout: 120000 });
console.log('host page: START button present');
// WAIT FOR HYDRATION. The button is in the server-rendered HTML before React attaches its handler, so a
// click fired on the selector alone lands on inert markup and nothing happens — which is exactly what the
// first run of this probe saw ("START button present", then no room code).
await host.waitForTimeout(2500);
await host.click('text=START THE SCREEN');
await host.waitForTimeout(1200);
console.log('after click:', await host.evaluate(`(() => /JOIN ON YOUR PHONE/.test(document.body.innerText) ? 'started' : 'still on the start panel')()`));
// the code appears once the room is made
const DOTS = '\u00b7'.repeat(6);
await host.waitForFunction(`(() => !document.body.innerText.includes(${JSON.stringify(DOTS)}))()`, { timeout: 45000 }).catch(() => {});
const code = await host.evaluate(`(() => {
  // the code is the monospace line with letter-spacing, not any six capitals on the page — the first run of
  // this probe read "SCREEN" out of the START THE SCREEN button
  const els = Array.from(document.querySelectorAll('p'));
  for (const el of els) {
    const t = (el.textContent || '').trim();
    if (/^[A-Z0-9]{6}$/.test(t) && getComputedStyle(el).fontFamily.includes('mono')) return t;
  }
  return null;
})()`);
console.log('room code:', code);
if (!code) {
  console.log('host text after start:', (await host.evaluate("(() => document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | '))()")).slice(0, 400));
  console.log('host console errors:', hostErr.slice(0, 4).join(' | ') || 'none');
}
if (!code) { console.log('NO CODE — host could not open a room'); await b.close(); process.exit(1); }

// a phone joins, with a fake gamepad attached to IT
const pad = await ctx.newPage();
const padErr: string[] = [];
pad.on('pageerror', (e) => padErr.push(e.message.slice(0, 140)));
await pad.addInitScript(`(() => {
  const p = { index: 0, id: 'Pro Controller (Vendor: 057e Product: 2009)', connected: true, mapping: '',
    axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = p; navigator.getGamepads = () => [p];
})()`);
await pad.setViewportSize({ width: 390, height: 780 });
await pad.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded' });
await pad.waitForTimeout(2000);
const joinBtn = pad.locator('button', { hasText: /JOIN|PLAY|CONNECT/i }).first();
if (await joinBtn.count()) { await joinBtn.click(); }
await pad.waitForTimeout(9000);

// press the Switch's PHYSICAL bottom button (index 1) — it must arrive at the host as canonical A
await pad.evaluate(`(() => { const p = window.__PAD; let t = 0;
  setInterval(() => { t++; p.buttons[1].pressed = (t % 6) < 3; p.axes[0] = Math.sin(t / 8); p.timestamp = performance.now(); }, 50); })()`);
await pad.waitForTimeout(6000);

// open the host's own LINK STATS overlay and read what it says arrived
await host.click('text=LINK STATS').catch(() => {});
await host.waitForTimeout(2500);
const stats = await host.evaluate("(() => { const el = Array.from(document.querySelectorAll('div')).find(d => /round trip/i.test(d.textContent || '') && d.children.length); return el ? el.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ') : null; })()");
console.log('HOST LINK STATS:', stats);

const padState = await pad.evaluate("(() => document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0, 300))()");
console.log('pad page:', padState);
const linkState = await host.evaluate("(() => document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0, 300))()");
console.log('host page:', linkState);
console.log('host errors:', hostErr.length, hostErr.slice(0, 2).join(' | '));
console.log('pad errors:', padErr.length, padErr.slice(0, 2).join(' | '));
await host.screenshot({ path: './shots/host-stage.png' });
await pad.screenshot({ path: './shots/pad-page.png' });
await b.close();
