// THE LAST FOUR, ON A LIVE CONTEST (2026-09-14).
//   1 the verdict camera frames the dunker instead of cropping him
//   2 the called dunk is priced before the run
//   3 a miss has a flavour that matches how close it was
//   4 the rival gets the broadcast cut
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = '/tmp/claude-501/dunkreview';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1180, height: 720 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/JUICE-SOFT] miss|JUICE-LOOK] punch|DUNK-CAM/.test(t)) log.push(t.slice(0,100)); });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4000);
const out = await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, s = d.scene, bus = d.input, cam = s.activeCamera;
  const hero = d.hero();
  const ev = (t,c,k) => window.dispatchEvent(new KeyboardEvent(t,{code:c,key:k,bubbles:true}));
  const banner = () => { const m = document.body.innerText.match(/"banner":\\s*"([^"]*)"/); return m ? m[1] : null; };
  const offAxis = (pt) => { const dir = cam.getTarget().subtract(cam.position); dir.normalize();
    const to = pt.subtract(cam.position); to.normalize();
    return +(Math.acos(Math.max(-1,Math.min(1, dir.x*to.x+dir.y*to.y+dir.z*to.z)))*180/Math.PI).toFixed(1); };
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 5500));

  // 2 — price the call
  const dump = [];
  dump.push('before L1: ' + (document.body.innerText.match(/"attempt":\s*"([^"]*)"/)||[])[1] + ' | phase ' + (document.body.innerText.match(/dunk · (\w+)/)||[])[1]);
  bus.emit({t:'button',btn:'L1',pressed:true}); bus.emit({t:'button',btn:'L1',pressed:false});
  await new Promise(r => setTimeout(r, 400));
  const callPrice = banner();
  dump.push('after L1: banner=' + callPrice + ' attempt=' + (document.body.innerText.match(/"attempt":\s*"([^"]*)"/)||[])[1]);

  // 3 — a deliberately-far miss, then read the flavour
  bus.emit({ t:'trigger', side:'R', value:1 });
  await new Promise(r => setTimeout(r, 1000));
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
  await new Promise(r => setTimeout(r, 3400));   // way late
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
  bus.emit({ t:'trigger', side:'R', value:0 });
  let missBanner = null;
  for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,180)); const bn = banner();
    if (bn && /MISS|IRON|IN AND OUT/.test(bn)) { missBanner = bn; break; } }

  // 1 — the verdict framing: how far off axis is the hero while the judges confer
  let verdictOff = null;
  for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,180));
    const h = document.body.innerText;
    if (/CONFER|judgeReveal/.test(h)) { verdictOff = offAxis(hero.position.add(hero.position.constructor ? new (hero.position.constructor)(0,1.0,0) : {x:0,y:1,z:0})); break; } }
  return { dump, callPrice, missBanner, verdictHeroOffAxisDeg: verdictOff };
})()`) as Record<string, unknown>;
console.log('[TEN]', JSON.stringify(out, null, 1));
console.log('--- beats ---'); for (const l of log.slice(0,10)) console.log('  ' + l);
await p.screenshot({ path: `${OUT}/10-verdict.png` });
await b.close();
