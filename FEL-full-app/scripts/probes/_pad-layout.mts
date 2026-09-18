// Venice DualShock pad acceptance #3 — measure the pad against the HUD plates on the phone emulation (390×844 @3x).
//   npx tsx scripts/probes/_pad-layout.mts        (URL=… W=390 H=844)
import { chromium, request } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const rc = await request.newContext({ baseURL: 'http://localhost:3000' });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const ctx = await b.newContext({ viewport: { width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addCookies((await rc.storageState()).cookies); await rc.dispose();
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
await p.goto(process.env.URL ?? 'http://localhost:3000/play/dunk', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.getByText(/START NIGHT|TAP TO START/i).first().tap().catch(() => {}); await p.waitForTimeout(1500);
await p.getByText(/TAP TO START/i).first().tap().catch(() => {}); await p.waitForTimeout(4000);
const out = await p.evaluate(`(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const leaf = (t) => Array.from(document.querySelectorAll('span,button,div')).find((e) => e.children.length === 0 && (e.textContent || '').includes(t));
  const canvas = document.querySelector('canvas');
  const hint = leaf('HOLD CHARGE') || leaf('RUN-UP') || leaf('running to the rim') || leaf('CONFER');
  return {
    viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
    frame: r(canvas && canvas.parentElement), hint: r(hint), hintWrapClass: hint && hint.parentElement ? hint.parentElement.className : null,
    charge: r(leaf('CHARGE')), slam: r(leaf('SLAM')), move: r(leaf('MOVE')), look: r(leaf('LOOK')),
    screen: document.body.innerText.slice(0, 140).split(String.fromCharCode(10)).join(' '),
  };
})()`);
console.log(JSON.stringify(out));
await b.close();
