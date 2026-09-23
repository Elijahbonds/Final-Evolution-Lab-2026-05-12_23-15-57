// _race-inputs — racing pass phase 3 (2026-09-23): does every press the racers now read actually do what it says?
//
// Per mode, on a fake pad, mid-race:
//   L3 held  → the camera turns round (camera forward · hero forward goes from ~+1 to below −0.5) and comes back on release
//   R3       → the line it says (who is around you / the lock-on), captured off the page's text as it appears
//   R1 empty → the kart / plane say what fills the boost (the meter starts empty)
//   sprint   → A, B, RT and L3 each answered with the d-pad line
//
//   PORT=3011 MODES=velocitykart,aeroaces,freerun,sprint npx tsx scripts/probes/_race-inputs.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';

const PORT = process.env.PORT ?? '3011';
const MODES = (process.env.MODES ?? 'velocitykart,aeroaces,freerun,sprint').split(',');
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();

const setBtn = (p: Page, i: number, on: boolean) => p.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = ${on}; b.value = ${on ? 1 : 0}; b.touched = ${on}; window.__PAD.timestamp = performance.now(); })()`);
const tap = async (p: Page, i: number, ms = 90) => { await setBtn(p, i, true); await p.waitForTimeout(ms); await setBtn(p, i, false); };
// camera forward · hero forward (flat) — the hero's forward is its root's facing, else the direction it moved
const facing = (p: Page) => p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene, c = s.activeCamera, h = window.__FEL_QA__.hero(); if (!c || !h) return null;
  let r = h; while (r.parent) r = r.parent;
  const cf = c.getForwardRay(1).direction; const now = r.getAbsolutePosition();
  const was = window.__RI_LAST || now.clone(); window.__RI_LAST = now.clone();
  let fx = now.x - was.x, fz = now.z - was.z; const m = Math.hypot(fx, fz);
  if (m < 0.05) { const q = r.absoluteRotationQuaternion; const y = q ? Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)) : r.rotation.y; fx = Math.sin(y); fz = Math.cos(y); }
  const cm = Math.hypot(cf.x, cf.z), hm = Math.hypot(fx, fz) || 1;
  return +((cf.x * fx + cf.z * fz) / (cm * hm)).toFixed(2);
})()`);
const said = (p: Page) => p.evaluate('(window.__RI_TEXT || []).splice(0)') as Promise<string[]>;

async function run(p: Page, mode: string): Promise<Record<string, unknown>> {
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}?agent=1${mode === 'freerun' ? '&tier=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  for (let i = 0; i < 120; i++) { const t = await p.evaluate(() => document.body.innerText); if (/playing/i.test(t)) break; if (/ready/i.test(t)) await p.keyboard.press('Space'); await p.waitForTimeout(1000); }
  // every piece of text that APPEARS on the page from here on (callouts, banners, captions)
  await p.evaluate(`(() => { window.__RI_TEXT = []; new MutationObserver((ms) => { for (const m of ms) { const t = (m.type === 'characterData' ? m.target.textContent : Array.from(m.addedNodes).map((n) => n.textContent || '').join(' ')) || ''; const s = t.trim(); if (s && s.length < 90 && /[A-Z]{3}/.test(s) && !/^\\s*[{"]/.test(s)) window.__RI_TEXT.push(s); } }).observe(document.body, { subtree: true, childList: true, characterData: true }); })()`);
  const out: Record<string, unknown> = { mode };
  if (mode === 'sprint') {
    await p.waitForTimeout(4500);
    const ans: Record<string, string[]> = {};
    for (const [name, i] of [['A', 0], ['B', 1], ['RT', 7], ['L3', 10], ['R3', 11]] as const) { await said(p); await tap(p, i, name === 'RT' ? 300 : 90); await p.waitForTimeout(600); ans[name] = [...new Set(await said(p))].slice(0, 3); }
    out.answers = ans;
    return out;
  }
  // race: throttle (kart / plane) or run (free run), then the empty-boost press straight away
  await setBtn(p, 7, true);
  if (mode === 'freerun') await p.evaluate(`(() => { window.__PAD.axes[1] = -1; window.__PAD.timestamp = performance.now(); })()`);
  await p.waitForTimeout(1500); await said(p);
  if (mode !== 'freerun') { await tap(p, 5, 200); await p.waitForTimeout(700); out.boostEmpty = [...new Set(await said(p))].slice(0, 4); }
  await p.waitForTimeout(4000);
  const before: (number | null)[] = []; for (let i = 0; i < 4; i++) { before.push(await facing(p)); await p.waitForTimeout(150); }
  await setBtn(p, 10, true); await p.waitForTimeout(700);
  const during: (number | null)[] = []; for (let i = 0; i < 4; i++) { during.push(await facing(p)); await p.waitForTimeout(150); }
  await p.screenshot({ path: `/tmp/race-inputs-${mode}-lookback.png` });
  await setBtn(p, 10, false); await p.waitForTimeout(1500);
  const after: (number | null)[] = []; for (let i = 0; i < 4; i++) { after.push(await facing(p)); await p.waitForTimeout(150); }
  out.lookBack = { before, during, after };
  await said(p); await tap(p, 11); await p.waitForTimeout(700); out.r3 = [...new Set(await said(p))].slice(0, 4);
  await setBtn(p, 7, false);
  return out;
}

const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(`(() => { const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
  const p = await ctx.newPage();
  try { console.log('ROW ' + JSON.stringify(await run(p, mode))); } catch (e) { console.log('ROW ' + JSON.stringify({ mode, crash: String(e).slice(0, 200) })); }
  await ctx.close();
}
await b.close();
