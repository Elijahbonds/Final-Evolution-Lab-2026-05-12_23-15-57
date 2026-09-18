// THREE SECONDS — does the rule the handbook declares actually fire?
//
// It has been wired since the Ref pass and never once observed firing, which is the state a rule should
// never be left in: either it works, or it is dead code claiming to be a rule. Camping is hard to do by
// accident, so this probe does it ON PURPOSE — walk to the rim carrying the ball, then STAND STILL.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
const ref: string[] = []; let errors = 0;
p.on('console', (m) => { const t = m.text(); if (/1V1-REF|paint/i.test(t)) ref.push(t.slice(0, 140)); if (m.type() === 'error' && !/401/.test(t)) errors++; });
p.on('pageerror', () => { errors++; });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/onevone`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3500); }

// USE THE MODE'S OWN SEAM. A blind stick drive never moved the hero at all (measured: z 7.2 for three
// rounds) — 1v1 opens on whichever possession it opens on, and a probe that assumes it has the ball is
// testing nothing. offense() puts the ball in my hands deterministically, which is what the seam is for.
const state0 = await p.evaluate(`(() => { const m = window.__FEL_DEV__.scene.metadata.onevone; return m ? { possession: m.possession(), ended: m.ended() } : null; })()`);
console.log('opening state:', JSON.stringify(state0));
await p.evaluate(`(() => { const m = window.__FEL_DEV__.scene.metadata.onevone; if (m) m.offense(); })()`);
await p.waitForTimeout(1500);

// drive at the rim, then stop dead and camp
for (let round = 0; round < 4; round++) {
  // re-assert possession: a round that ends in a turnover leaves the next one on defence, where there is no
  // ball to camp with and the rule cannot fire by definition
  await p.evaluate(`(() => { const m = window.__FEL_DEV__.scene.metadata.onevone; if (m && m.possession() !== 'mine') m.offense(); })()`);
  await p.waitForTimeout(900);
  // the dribble controller INTEGRATES from the stick, so reaching the rim takes real seconds of acceleration
  // (measured: 2.2 m in 2.6 s from a standing start)
  await p.evaluate(`(() => { const pad = window.__PAD; pad.axes[0] = 0; pad.axes[1] = -1; pad.timestamp = performance.now();
    window.__DRIVE = setInterval(() => { pad.axes[1] = -1; pad.timestamp = performance.now(); }, 60); })()`);
  await p.waitForTimeout(5200);
  await p.evaluate(`(() => { clearInterval(window.__DRIVE); const pad = window.__PAD;
    pad.axes[0] = 0; pad.axes[1] = 0; pad.timestamp = performance.now();
    // keep the pad alive but NEUTRAL — standing still is the whole test
    window.__HOLD = setInterval(() => { pad.timestamp = performance.now(); }, 100); })()`);
  await p.waitForTimeout(5200);
  await p.evaluate(`(() => clearInterval(window.__HOLD))()`);
  const where = await p.evaluate(`(() => {
    const m = window.__FEL_DEV__.scene.metadata.onevone;
    const h = window.__FEL_DEV__.hero ? window.__FEL_DEV__.hero() : null;
    const post = m && m.post ? m.post() : null;
    return { at: h ? { x: +h.position.x.toFixed(2), z: +h.position.z.toFixed(2) } : null,
             possession: m ? m.possession() : null, carrying: post ? post.carrying : null };
  })()`);
  console.log(`round ${round}: ${JSON.stringify(where)}`);
}
console.log('REF lines:', ref.length ? ref.slice(0, 6).join(' | ') : 'NONE — the rule never fired');
console.log('errors', errors);
await b.close();
