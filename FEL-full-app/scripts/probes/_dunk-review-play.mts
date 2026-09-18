// PLAYING THE DUNK CONTEST, FOR REVIEW (2026-09-14).
//
// A review written from source is not a review. This drives a full attempt the way a player takes one --
// pick a prop, hold the run, jump, throw a trick, slam -- and captures what is actually on screen at each
// beat, plus the timing between them. The timings are the point: "it feels slow" is only actionable once
// you know which gap is long.

import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = process.env.OUT ?? '/tmp/claude-501/dunkreview';

const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = [];
const log: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
p.on('console', (m) => { const t = m.text(); if (/DUNK|JUICE|CUE|TRICK|HANDS/.test(t)) log.push(t.slice(0, 120)); });

const t0 = Date.now();
const mark = (s: string) => `${String((Date.now() - t0) / 1000).padStart(6)}s  ${s}`;

await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
const bootedAt = Date.now();
console.log(mark('scene exists'));

const hud = async () => p.evaluate(`(() => {
  const t = document.body.innerText;
  const g = (k) => { const m = t.match(new RegExp('"' + k + '":\\\\s*"?([^",\\n]*)')); return m ? m[1].trim() : null; };
  return { phase: (t.match(/dunk · (\\w+)/)||[])[1] ?? null, round: g('round'), dunkNum: g('dunkNum'),
           attempt: g('attempt'), score: g('score'), hint: (g('hint')||'').slice(0,60), banner: g('banner') };
})()`) as Promise<Record<string, string | null>>;

const shot = async (name: string) => { await p.screenshot({ path: `${OUT}/${name}.png` }); };

await p.waitForTimeout(3000);
console.log(mark('READY  ' + JSON.stringify(await hud())));
await shot('01-ready');

// start
await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));`);
const pressedStart = Date.now();
await p.waitForFunction(`document.body.innerText.includes('dunk · playing')`, null, { timeout: 30000 }).catch(() => {});
console.log(mark(`START -> playing took ${((Date.now() - pressedStart) / 1000).toFixed(2)}s`));
await shot('02-runway');
console.log(mark('RUNWAY ' + JSON.stringify(await hud())));

// the attempt: hold the run, then jump, then a trick, then slam
const emit = (e: string) => p.evaluate(`window.__FEL_DEV__.input.emit(${e})`);
await emit(`{ t:'trigger', side:'R', value:1 }`);
const runStart = Date.now();
await p.waitForTimeout(900);
await shot('03-runup');
await emit(`{ t:'button', btn:'A', pressed:true }`); await emit(`{ t:'button', btn:'A', pressed:false }`);
const jumpAt = Date.now();
console.log(mark(`held the run ${((jumpAt - runStart) / 1000).toFixed(2)}s, then JUMP`));
await p.waitForTimeout(260);
await shot('04-rise');
// a trick: hold UP + A is the windmill
await emit(`{ t:'dpad', dir:'up', pressed:true }`);
await emit(`{ t:'button', btn:'A', pressed:true }`); await emit(`{ t:'button', btn:'A', pressed:false }`);
await p.waitForTimeout(220);
await shot('05-trick');
await emit(`{ t:'dpad', dir:'up', pressed:false }`);
// the slam
await emit(`{ t:'button', btn:'A', pressed:true }`); await emit(`{ t:'button', btn:'A', pressed:false }`);
await emit(`{ t:'trigger', side:'R', value:0 }`);
await p.waitForTimeout(420);
await shot('06-flush');
console.log(mark('post-slam ' + JSON.stringify(await hud())));

// how long until the game gives you back control
const afterSlam = Date.now();
let sawApproach = false;
for (let i = 0; i < 80; i++) {
  await p.waitForTimeout(250);
  const h = await hud();
  if (h.phase === 'approach' && !sawApproach) {
    sawApproach = true;
    console.log(mark(`SLAM -> back on the runway: ${((Date.now() - afterSlam) / 1000).toFixed(2)}s`));
    break;
  }
}
await shot('07-after');
console.log(mark('AFTER  ' + JSON.stringify(await hud())));

console.log('\n--- mode console (dunk beats) ---');
for (const l of log.slice(0, 26)) console.log('   ' + l);
console.log(`\nerrors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log(`boot -> scene: ${((bootedAt - t0) / 1000).toFixed(2)}s`);
await b.close();
