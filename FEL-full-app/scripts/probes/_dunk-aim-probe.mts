// DOES A CLEAN ATTEMPT REACH THE RIM (2026-09-14).
//
// The review play sailed past the hoop on a full-charge run-up with the trick on cue and the slam
// buffered. Either the driver did something wrong or the flight does not aim. This measures the hero's
// position against the rim through the whole flight, with NO stick input at all, so drift can only be the
// mode's.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/DUNK-LAUNCH|DUNK-SLAM|CONTACT|MISS|RESOLVE/.test(t)) log.push(t.slice(0, 150)); });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4000);

const out = await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, s = d.scene, bus = d.input;
  const hero = d.hero();
  const rim = s.meshes.find(m => /rim|hoop_ring|ring/i.test(m.name));
  const rimPos = rim ? rim.getAbsolutePosition() : null;
  const ev = (t,c,k) => window.dispatchEvent(new KeyboardEvent(t,{code:c,key:k,bubbles:true}));
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 5500));

  const start = { x:+hero.position.x.toFixed(2), y:+hero.position.y.toFixed(2), z:+hero.position.z.toFixed(2) };
  bus.emit({ t:'trigger', side:'R', value:1 });
  const track = [];
  let jumped = false;
  for (let i = 0; i < 46; i++) {
    await new Promise(r => setTimeout(r, 80));
    // jump once the run has had time to build
    if (!jumped && i === 12) { bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false}); jumped = true; }
    track.push({ t: +(i*0.08).toFixed(2), x:+hero.position.x.toFixed(2), y:+hero.position.y.toFixed(2), z:+hero.position.z.toFixed(2) });
  }
  bus.emit({ t:'trigger', side:'R', value:0 });
  const peak = track.reduce((a,c) => c.y > a.y ? c : a, track[0]);
  const rimXZ = rimPos ? { x:+rimPos.x.toFixed(2), y:+rimPos.y.toFixed(2), z:+rimPos.z.toFixed(2) } : null;
  const closest = rimPos ? track.reduce((a,c) => {
    const dc = Math.hypot(c.x-rimPos.x, c.z-rimPos.z); const da = Math.hypot(a.x-rimPos.x, a.z-rimPos.z);
    return dc < da ? c : a; }, track[0]) : null;
  return { rimName: rim ? rim.name : null, rimXZ, start, peak,
           closest, closestDistXZ: rimPos && closest ? +Math.hypot(closest.x-rimPos.x, closest.z-rimPos.z).toFixed(2) : null,
           end: track[track.length-1] };
})()`) as Record<string, unknown>;

console.log('[AIM]', JSON.stringify(out, null, 1));
console.log('--- launch/resolve ---'); for (const l of log.slice(0,10)) console.log('  ' + l);
await b.close();
