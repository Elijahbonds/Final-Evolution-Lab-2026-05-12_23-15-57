// TWO PHONES, ONE SHOOTER — does the host actually consult the turn order?
//
// The unit tests prove the RULE; this proves the host is asking it. Two controller pages join the 3PT host
// and the TV should name whose turn it is.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
const host = await ctx.newPage();
let hostErrors = 0;
host.on('pageerror', () => { hostErrors++; });
await host.goto(`${BASE}/dev/threepoint`, { waitUntil: 'domcontentloaded' });
await host.waitForTimeout(9000);
const code = await host.evaluate("(() => { const m = /CONTROLLER LINK . ([A-Z0-9]{6})/.exec(document.body.innerText); return m ? m[1] : null; })()");
console.log('room code:', code);
if (!code) { console.log('no code'); await b.close(); process.exit(1); }

// ONE CONTEXT PER PHONE. getOrCreatePeerId() persists the device id in localStorage — deliberately, so a
// phone that drops WiFi reclaims its own slot instead of appearing as a second ghost player. Two TABS in one
// context therefore share a peer id, and the host correctly reads the second tab's hello as the FIRST one
// reconnecting: it closes the original link and re-offers. That looked exactly like "a second phone cannot
// join and breaks the first", and it was the probe being one device wearing two hats.
const phones = [];
for (let i = 0; i < 2; i++) {
  const phoneCtx = await b.newContext({ viewport: { width: 390, height: 780 } });
  const ph = await phoneCtx.newPage();
  await ph.setViewportSize({ width: 390, height: 780 });
  await ph.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded' });
  await ph.waitForTimeout(1800);
  const join = ph.locator('button', { hasText: /JOIN|PLAY|CONNECT/i }).first();
  if (await join.count()) await join.click();
  // the second peer's handshake takes longer than the first (the host is already serving one link), so give
  // it real time before calling it stuck
  await ph.waitForTimeout(14000);
  phones.push(ph);
  console.log(`phone ${i + 1}:`, (await ph.evaluate("(() => document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0,140))()")));
}
await host.waitForTimeout(6000);
for (let i = 0; i < phones.length; i++) {
  console.log(`phone ${i + 1} FINAL:`, (await phones[i].evaluate("(() => document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0,90))()")));
}
const tv = await host.evaluate("(() => document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0, 300))()");
console.log('TV:', tv);
const banner = await host.evaluate("(() => /YOU'RE UP|WINS|SHOOTING/.test(document.body.innerText))()");
console.log('turn banner present:', banner, ' host errors:', hostErrors);
await host.screenshot({ path: './shots/two-phone.png' });
await b.close();
