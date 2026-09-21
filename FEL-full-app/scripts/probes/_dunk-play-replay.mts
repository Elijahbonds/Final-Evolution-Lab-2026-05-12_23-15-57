// JUST PLAY IT (owner, 2026-09-20). Drives the dunk until one actually SCORES, then watches every frame of the
// replay — arms in the body's own frame, the IK weight, and what the clips are doing.
//
// The replay only starts inside the scoring path, so a probe that misses the rim never sees one. This one keeps
// trying, varying the slam beat, until the HUD says it scored.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
const hands: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[HANDS\]|\[DUNK-SLAM\]|BLOWN|MISS/.test(t)) hands.push(t.slice(0, 130)); });

await p.goto(`http://localhost:${PORT}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3000);

await p.evaluate(`(() => { const pad={index:0,id:'fake (STANDARD GAMEPAD)',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))}; window.__PAD=pad; navigator.getGamepads=()=>[pad];
  window.__ST = () => { const d = window.__FEL_DEV__?.dunkPosture; return d ? d.get() : null; };
  window.__ARMS = () => {
    const dev = window.__FEL_DEV__, scene = dev.scene, hero = dev.hero();
    const rootOf = (n)=>{while(n&&n.parent)n=n.parent;return n;};
    const mesh = scene.meshes.find(m => m.skeleton && rootOf(m) === hero); const sk = mesh && mesh.skeleton; if (!sk) return null;
    const bn = (n)=>sk.bones.find(b=>b.name===n||b.name.endsWith(':'+n)||b.name.endsWith('_'+n));
    const wp = (n)=>{const t=bn(n)&&bn(n).getTransformNode&&bn(n).getTransformNode(); return t?t.getAbsolutePosition():null;};
    const M = hero.getWorldMatrix().m, nz=(v)=>{const L=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/L,v[1]/L,v[2]/L];};
    const R=nz([M[0],M[1],M[2]]),U=nz([M[4],M[5],M[6]]),F=nz([M[8],M[9],M[10]]),o=hero.getAbsolutePosition();
    const L=(v)=>v?{r:+((v.x-o.x)*R[0]+(v.y-o.y)*R[1]+(v.z-o.z)*R[2]).toFixed(2),u:+((v.x-o.x)*U[0]+(v.y-o.y)*U[1]+(v.z-o.z)*U[2]).toFixed(2),f:+((v.x-o.x)*F[0]+(v.y-o.y)*F[1]+(v.z-o.z)*F[2]).toFixed(2)}:null;
    return { rootY:+o.y.toFixed(2), LH:L(wp('LeftHand')), RH:L(wp('RightHand')), LS:L(wp('LeftArm')), RS:L(wp('RightArm')) };
  };
})()`);
const set = async (js: string) => { await p.evaluate(`(() => { const p=window.__PAD; ${js}; p.timestamp=performance.now(); })()`).catch(()=>{}); };
const st = async (): Promise<any> => p.evaluate(`window.__ST()`).catch(() => null);
const hud = async (): Promise<string> => p.evaluate(`document.body.innerText.replace(/\\s+/g,' ')`).catch(() => '');

// START
await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(90);
await set('p.buttons[0].pressed=false;p.buttons[0].value=0');
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 }).catch(()=>{});
await p.waitForTimeout(1800);

let scored = false;
for (let attempt = 1; attempt <= 10 && !scored; attempt++) {
  await set('p.axes[1]=-1;p.buttons[7].pressed=true;p.buttons[7].value=1');
  await p.waitForTimeout(1400);
  // JUMP
  await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(110);
  await set('p.buttons[0].pressed=false;p.buttons[0].value=0');
  // release everything: a held direction eats the slam press
  await set('p.axes[1]=0;p.buttons[7].pressed=false;p.buttons[7].value=0');

  // THE SLAM RIDES THE CLIP, NOT THE WALL CLOCK. The mode reports its own clipTime, and the window is a beat
  // in that clip — walking a millisecond delay across attempts was aiming at the wrong axis entirely.
  const aim = 0.30 + attempt * 0.06;
  let pressedAt: number | null = null;
  for (let k = 0; k < 90; k++) {
    const s = await st();
    if (s && s.phase === 'cinematic' && typeof s.clipTime === 'number' && s.clipTime >= aim) { pressedAt = s.clipTime; break; }
    if (s && s.phase !== 'cinematic' && k > 6) break;
    await p.waitForTimeout(16);
  }
  await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(90);
  await set('p.buttons[0].pressed=false;p.buttons[0].value=0');
  if (pressedAt !== null) console.log(`     slam at clipTime ${pressedAt.toFixed(2)} (aim ${aim.toFixed(2)})`);

  // watch for the replay. The flight, the flush beat, resolve and the finish all run before the replay starts,
  // so a short window closes before it ever opens — the first version of this probe polled 4 s and concluded
  // "no replay" while the score was going up behind it.
  let phasesSeen = new Set<string>();
  for (let i = 0; i < 140; i++) {
    await p.waitForTimeout(90);
    const s = await st();
    if (s?.phase) phasesSeen.add(s.phase);
    if (s?.replaying) { scored = true; console.log(`\n>>> SCORED on attempt ${attempt} (clip aim) — replay running after ${(i*0.09).toFixed(1)}s\n`); break; }
    if (phasesSeen.has('judging') && i > 30) break;   // judged without ever replaying
  }
  if (!scored) console.log(`     phases seen: ${[...phasesSeen].join(' → ')}`);
  if (!scored) { const h = await hud(); const m = /"score": (\d+)/.exec(h); console.log(`  attempt ${attempt} (clip aim): no replay, score ${m?.[1] ?? '?'}`); await p.waitForTimeout(2600); }
}

if (!scored) { console.log('\nnever scored in 8 attempts — the slam beat is not where this probe is looking'); }
else {
  console.log('  t    rootY  phase       repl  ikT   LEFT hand              RIGHT hand            LEFT shoulder');
  for (let i = 0; i < 90; i++) {
    const s = await st(); const a: any = await p.evaluate(`window.__ARMS()`).catch(()=>null);
    if (s && a) {
      const f = (h:any)=>h?`r${String(h.r).padStart(5)} u${String(h.u).padStart(5)} f${String(h.f).padStart(5)}`:'      —      ';
      console.log(`${String((i*0.10).toFixed(2)).padStart(5)}  ${String(a.rootY).padStart(5)}  ${String(s.phase).padEnd(10)}  ${String(s.replaying).padEnd(5)} ${String((s.handIkT??0).toFixed(2)).padStart(5)}  ${f(a.LH)}  ${f(a.RH)}  |LS ${f(a.LS)}`);
    }
    if (s && !s.replaying && i > 8) { console.log('  (replay ended)'); break; }
    await p.waitForTimeout(100);
  }
}
console.log('\n[HANDS]:'); hands.slice(-30).forEach(h => console.log('  ' + h));
await p.screenshot({ path: '/tmp/dunk-replay.png' });
await b.close();
