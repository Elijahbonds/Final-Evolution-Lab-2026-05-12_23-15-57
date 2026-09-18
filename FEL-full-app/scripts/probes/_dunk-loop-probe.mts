// CAN IT BE MADE, AND HOW LONG UNTIL YOU GO AGAIN (2026-09-14).
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/DUNK-LAUNCH|DUNK-SLAM|CONTACT|MISSED|JUDGE|DUNK-WIN/.test(t)) log.push(`${(Date.now()%100000)/1000}s ${t.slice(0,110)}`); });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4000);
const out = await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, bus = d.input;
  const ev = (t,c,k) => window.dispatchEvent(new KeyboardEvent(t,{code:c,key:k,bubbles:true}));
  const hudScore = () => { const m = document.body.innerText.match(/"score":\\s*(\\d+)/); return m ? +m[1] : null; };
  const hudAttempt = () => { const m = document.body.innerText.match(/"attempt":\\s*"([^"]*)"/); return m ? m[1] : null; };
  const hudHint = () => { const m = document.body.innerText.match(/"hint":\\s*"([^"]*)"/); return m ? m[1].slice(0,28) : null; };
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 5500));

  const t0 = performance.now();
  bus.emit({ t:'trigger', side:'R', value:1 });
  await new Promise(r => setTimeout(r, 1000));
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});   // jump
  const jumpAt = performance.now();
  // the slam window opens ~1.13 s of clip time after the launch; press there rather than buffering early
  await new Promise(r => setTimeout(r, 1150));
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
  const slamAt = performance.now();
  bus.emit({ t:'trigger', side:'R', value:0 });

  // watch for the score to move (a make) or the attempt chip to advance (a miss), and time the reset
  const startAttempt = hudAttempt();
  let outcome = 'timeout', settledAt = 0, scoreSeen = null;
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 200));
    const s = hudScore(), a = hudAttempt();
    if (s && s > 0) { outcome = 'MADE'; scoreSeen = s; settledAt = performance.now(); break; }
    if (a && a !== startAttempt) { outcome = 'MISSED'; settledAt = performance.now(); break; }
  }
  // then time until the runway hint is back (control returned)
  let backAt = 0;
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 200));
    if ((hudHint() || '').indexOf('Pick your PROP') === 0) { backAt = performance.now(); break; }
  }
  return { outcome, scoreSeen, startAttempt, endAttempt: hudAttempt(),
           jumpToSlamSec: +((slamAt-jumpAt)/1000).toFixed(2),
           slamToVerdictSec: settledAt ? +((settledAt-slamAt)/1000).toFixed(2) : null,
           verdictToRunwaySec: (settledAt && backAt) ? +((backAt-settledAt)/1000).toFixed(2) : null,
           slamToRunwaySec: backAt ? +((backAt-slamAt)/1000).toFixed(2) : null };
})()`) as Record<string, unknown>;
console.log('[LOOP]', JSON.stringify(out, null, 1));
console.log('--- beats ---'); for (const l of log.slice(0,18)) console.log('  ' + l);
await b.close();
