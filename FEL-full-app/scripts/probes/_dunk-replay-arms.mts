// "the models arms are gone or not moving during the replay" (owner, 2026-09-20).
// Drives a real dunk, then samples the arms every 250 ms through the replay, in the body's own frame.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const hands: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[HANDS\]/.test(t)) hands.push(t.slice(0, 120)); });

await p.goto(`http://localhost:${PORT}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3000);

await p.evaluate(`(() => { const pad = { index:0, id:'fake (STANDARD GAMEPAD)', connected:true, mapping:'standard', axes:[0,0,0,0], timestamp:0, buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
const set = async (js: string) => { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); };

await p.evaluate(`(() => {
  window.__SAMPLE = () => {
    const dev = window.__FEL_DEV__, scene = dev.scene, hero = dev.hero();
    const mesh = scene.meshes.find(m => m.skeleton && (function r(n){while(n&&n.parent)n=n.parent;return n;})(m) === hero);
    const skel = mesh && mesh.skeleton; if (!skel) return null;
    const bone = (n) => skel.bones.find(b => b.name === n || b.name.endsWith(':'+n) || b.name.endsWith('_'+n));
    const wp = (n) => { const bn = bone(n); const t = bn && bn.getTransformNode && bn.getTransformNode(); return t ? t.getAbsolutePosition() : null; };
    const M = hero.getWorldMatrix().m;
    const nz = (v) => { const L = Math.hypot(v[0],v[1],v[2])||1; return [v[0]/L,v[1]/L,v[2]/L]; };
    const R = nz([M[0],M[1],M[2]]), U = nz([M[4],M[5],M[6]]), F = nz([M[8],M[9],M[10]]);
    const o = hero.getAbsolutePosition();
    const loc = (v) => v ? { r:+((v.x-o.x)*R[0]+(v.y-o.y)*R[1]+(v.z-o.z)*R[2]).toFixed(2), u:+((v.x-o.x)*U[0]+(v.y-o.y)*U[1]+(v.z-o.z)*U[2]).toFixed(2), f:+((v.x-o.x)*F[0]+(v.y-o.y)*F[1]+(v.z-o.z)*F[2]).toFixed(2) } : null;
    const d = dev.dunk ? dev.dunk() : null;
    return { rootY:+o.y.toFixed(2), L: loc(wp('LeftHand')), R: loc(wp('RightHand')), Lsh: loc(wp('LeftArm')), Rsh: loc(wp('RightArm')),
             replaying: d ? d.replaying : null, phase: d ? d.phase : null, handIkT: d ? +(d.handIkT ?? 0).toFixed(2) : null };
  };
})()`);

// START
await set('p.buttons[0].pressed = true; p.buttons[0].value = 1'); await p.waitForTimeout(90);
await set('p.buttons[0].pressed = false; p.buttons[0].value = 0');
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 }).catch(()=>{});
await p.waitForTimeout(2000);

// HOLD to run at the rim, then tap JUMP, then SLAM
await set('p.axes[1] = -1; p.buttons[7].pressed = true; p.buttons[7].value = 1');
await p.waitForTimeout(1500);
await set('p.buttons[0].pressed = true; p.buttons[0].value = 1'); await p.waitForTimeout(110);
await set('p.buttons[0].pressed = false; p.buttons[0].value = 0');
await p.waitForTimeout(420);
await set('p.buttons[0].pressed = true; p.buttons[0].value = 1'); await p.waitForTimeout(110);
await set('p.buttons[0].pressed = false; p.buttons[0].value = 0; p.axes[1] = 0; p.buttons[7].pressed = false; p.buttons[7].value = 0');

console.log('\ntime  rootY  phase       replay  ik    LEFT hand            RIGHT hand');
let sawReplay = false;
for (let i = 0; i < 44; i++) {
  await p.waitForTimeout(250);
  const s: any = await p.evaluate(`window.__SAMPLE()`);
  if (!s) continue;
  if (s.replaying) sawReplay = true;
  const f = (h: any) => h ? `r${String(h.r).padStart(5)} u${String(h.u).padStart(5)} f${String(h.f).padStart(5)}` : '   —   ';
  console.log(`${String((i+1)*0.25).padStart(5)}  ${String(s.rootY).padStart(5)}  ${String(s.phase).padEnd(10)}  ${String(s.replaying).padEnd(6)}  ${String(s.handIkT).padEnd(4)}  ${f(s.L)}   ${f(s.R)}`);
  if (sawReplay && !s.replaying && i > 12) break;
}
console.log('\n[HANDS] log:'); hands.slice(-16).forEach(h => console.log('  ' + h));
await b.close();
