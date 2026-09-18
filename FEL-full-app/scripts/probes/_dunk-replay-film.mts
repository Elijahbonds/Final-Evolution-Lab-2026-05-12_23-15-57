// FILMING THE REPLAY (2026-09-14). A dunk contest lives on its replay; this makes one and looks at it.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = '/tmp/claude-501/dunkreview';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1180, height: 720 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/REPLAY|CONTACT|JUDGE|DUNK-WIN/.test(t)) log.push(t.slice(0,90)); });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4000);
await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, bus = d.input;
  const ev = (t,c,k) => window.dispatchEvent(new KeyboardEvent(t,{code:c,key:k,bubbles:true}));
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 5500));
  bus.emit({ t:'trigger', side:'R', value:1 });
  await new Promise(r => setTimeout(r, 1000));
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
  await new Promise(r => setTimeout(r, 1600));
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
  bus.emit({ t:'trigger', side:'R', value:0 });
})()`);
// the make resolves then the replay runs — film across it
for (let i = 0; i < 10; i++) {
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/rep-${String(i).padStart(2,'0')}.png` });
}
console.log('--- beats ---'); for (const l of log.slice(0,16)) console.log('  ' + l);
await b.close();
