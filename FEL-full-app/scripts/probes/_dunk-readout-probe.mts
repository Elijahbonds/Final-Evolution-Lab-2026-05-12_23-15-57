// DOES THE TIMING VERDICT REACH THE SCREEN (2026-09-14).
// The review's F1 was that the game computed "117 ms early, execution 29%" and sent it to console.info.
// This checks the same attempt now puts it in the HUD, on a make AND on a miss.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1180, height: 720 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4000);
const out = await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, bus = d.input;
  const ev = (t,c,k) => window.dispatchEvent(new KeyboardEvent(t,{code:c,key:k,bubbles:true}));
  const read = (k) => { const m = document.body.innerText.match(new RegExp('"' + k + '":\\\\s*"([^"]*)"')); return m ? m[1] : null; };
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 5500));
  const rows = [];
  for (const dly of [1.6, 2.4]) {
    bus.emit({ t:'trigger', side:'R', value:1 });
    await new Promise(r => setTimeout(r, 1000));
    bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
    await new Promise(r => setTimeout(r, dly*1000));
    bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
    bus.emit({ t:'trigger', side:'R', value:0 });
    let seen = null, bd = null;
    for (let i = 0; i < 40; i++) { await new Promise(r=>setTimeout(r,150));
      const t = read('slamTiming'); const c = read('breakdown');
      if (t) { seen = t; bd = c; break; } }
    rows.push({ pressAfterJump: dly, slamTiming: seen, breakdown: bd, hint: read('hint') });
    // WAS IT CLEARED? Poll for the field going empty again before the next attempt — if it never does, the
    // last verdict is hanging over the next run, which is the bug this pass just claimed to fix.
    let cleared = false;
    for (let i = 0; i < 50; i++) { await new Promise(r=>setTimeout(r,200)); if (!read('slamTiming')) { cleared = true; break; } }
    rows[rows.length-1].clearedBeforeNext = cleared;
  }
  return rows;
})()`) as Record<string, unknown>[];
console.log('[READOUT]', JSON.stringify(out, null, 1));
await p.screenshot({ path: '/tmp/claude-501/dunkreview/08-readout.png' });
await b.close();
