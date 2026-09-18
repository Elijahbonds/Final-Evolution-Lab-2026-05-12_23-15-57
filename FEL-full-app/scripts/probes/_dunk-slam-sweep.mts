// WHICH PRESS MAKES THE DUNK (2026-09-14).
//
// A slam pressed 1.15 s after the jump logged as "buffered @0.54, window opens @1.11" and MISSED. The
// window is expressed in CLIP seconds and the player presses in REAL ones, and the hang slow-mo stretches
// the mapping — so this sweeps real-time press delays across attempts and records which, if any, convert.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const DELAYS = (process.env.DELAYS ?? '1.6,2.0,2.4,2.8,3.2,3.6').split(',').map(Number);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/DUNK-SLAM|CONTACT|MISSED/.test(t)) log.push(t.slice(0,100)); });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4000);
const out = await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, bus = d.input;
  const ev = (t,c,k) => window.dispatchEvent(new KeyboardEvent(t,{code:c,key:k,bubbles:true}));
  const score = () => { const m = document.body.innerText.match(/"score":\\s*(\\d+)/); return m ? +m[1] : 0; };
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 5500));
  const rows = [];
  for (const dly of ${JSON.stringify(DELAYS)}) {
    const before = score();
    bus.emit({ t:'trigger', side:'R', value:1 });
    await new Promise(r => setTimeout(r, 1000));
    bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
    await new Promise(r => setTimeout(r, dly * 1000));
    bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
    bus.emit({ t:'trigger', side:'R', value:0 });
    await new Promise(r => setTimeout(r, 6500));   // the whole resolve + reset
    rows.push({ pressAfterJumpSec: dly, scoreDelta: score() - before });
  }
  return rows;
})()`) as { pressAfterJumpSec: number; scoreDelta: number }[];
console.log('\n press after jump   score gained');
for (const r of out) console.log(`   ${String(r.pressAfterJumpSec).padStart(5)}s            ${r.scoreDelta}`);
console.log('\n--- slam log ---'); for (const l of log.slice(0,20)) console.log('  ' + l);
await b.close();
