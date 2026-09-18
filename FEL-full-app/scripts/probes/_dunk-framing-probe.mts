// IS THE DUNKER IN FRAME AT THE FLUSH (2026-09-14, review F2).
//
// The old rim cut held a fixed point and let the dunker walk out of shot. "It looks better now" is not a
// claim — this measures it: the hero's OFF-AXIS ANGLE from the camera's forward, every frame of the
// flight. isInFrustum is a bounding-sphere test and would pass a body 40 degrees off screen (that exact
// mistake cost a pass on the surf headland), so the angle is the number that matters.
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
  const d = window.__FEL_DEV__, s = d.scene, bus = d.input, cam = s.activeCamera;
  const hero = d.hero();
  const rim = s.meshes.find(m => m.name === 'rim');
  const ev = (t,c,k) => window.dispatchEvent(new KeyboardEvent(t,{code:c,key:k,bubbles:true}));
  const offAxis = (pt) => {
    const dir = cam.getTarget().subtract(cam.position); dir.normalize();
    const to = pt.subtract(cam.position); to.normalize();
    return +(Math.acos(Math.max(-1,Math.min(1, dir.x*to.x+dir.y*to.y+dir.z*to.z))) * 180/Math.PI).toFixed(1);
  };
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 5500));
  bus.emit({ t:'trigger', side:'R', value:1 });
  await new Promise(r => setTimeout(r, 1000));
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
  const track = [];
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 70));
    const hp = hero.position.add(new BABYLON_V3(0, 1.2, 0));
    track.push({ t: +(i*0.07).toFixed(2), heroOff: offAxis(hp), rimOff: rim ? offAxis(rim.getAbsolutePosition()) : null });
  }
  bus.emit({t:'button',btn:'A',pressed:true}); bus.emit({t:'button',btn:'A',pressed:false});
  bus.emit({ t:'trigger', side:'R', value:0 });
  const worst = track.reduce((a,c) => c.heroOff > a.heroOff ? c : a, track[0]);
  const bothIn = track.filter(r => r.heroOff <= 28 && (r.rimOff === null || r.rimOff <= 28)).length;
  return { samples: track.length, worstHeroOff: worst, bothInShotFrames: bothIn, track: track.filter((_,i)=>i%4===0) };
  function BABYLON_V3(x,y,z){ return hero.position.constructor ? new (hero.position.constructor)(x,y,z) : {x,y,z}; }
})()`) as Record<string, unknown>;
console.log('[FRAMING]', JSON.stringify(out, null, 1).slice(0, 1200));
await p.screenshot({ path: '/tmp/claude-501/dunkreview/09-framed.png' });
await b.close();
