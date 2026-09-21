// Does the hero run and dribble like a basketball player? Measured, not eyeballed.
//
// Two objective things a real runner does: the arms swing a useful amount fore-and-aft, and they swing ANTI-PHASE
// (left forward while right is back). A dribbler is ASYMMETRIC: the ball hand works low, the off arm shields.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const QS = process.env.QS ?? '';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
await p.goto(`http://localhost:${PORT}/dev/mode/dunk${QS}`, { waitUntil: 'domcontentloaded' });
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
    const L=(v)=>v?{r:+((v.x-o.x)*R[0]+(v.y-o.y)*R[1]+(v.z-o.z)*R[2]).toFixed(3),u:+((v.x-o.x)*U[0]+(v.y-o.y)*U[1]+(v.z-o.z)*U[2]).toFixed(3),f:+((v.x-o.x)*F[0]+(v.y-o.y)*F[1]+(v.z-o.z)*F[2]).toFixed(3)}:null;
    const ballMesh = scene.meshes.find(m => /ball/i.test(m.name) && !m.skeleton);
    const bp = ballMesh ? ballMesh.getAbsolutePosition() : null;
    const playing = scene.animationGroups.filter(g => g.isPlaying && g.targetedAnimations.some(ta => sk.bones.some(b => b.getTransformNode && b.getTransformNode() === ta.target))).map(g => g.name).join('+');
    return { LH:L(wp('LeftHand')), RH:L(wp('RightHand')), BALL:L(bp), ballName: ballMesh ? ballMesh.name : null, playing };
  };
})()`);
const set = async (js: string) => { await p.evaluate(`(() => { const p=window.__PAD; ${js}; p.timestamp=performance.now(); })()`).catch(()=>{}); };

await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(100);
await set('p.buttons[0].pressed=false;p.buttons[0].value=0');
await p.waitForTimeout(2200);

// HOLD THE RUN: stick forward + sprint, and sample the arms through it.
// STICK ONLY, NO SPRINT. Holding the sprint trigger also charges the gather, and dunk_charge_gather poses both arms
// back TOGETHER — which is what a gather is. Measuring that and calling the run in-phase would be measuring the wrong
// clip. `CHARGE=1` puts the trigger back to measure the gather deliberately.
if (process.env.CHARGE === '1') await set('p.axes[1]=-1;p.buttons[7].pressed=true;p.buttons[7].value=1');
else await set('p.axes[1]=-1');
type Row = { lf: number; rf: number; lu: number; ru: number; phase: string; dribble: boolean; y: number; clip: string; bu: number };
const rows: Row[] = [];
for (let i = 0; i < 110; i++) {
  const a: any = await p.evaluate('window.__ARMS()').catch(() => null);
  const s: any = await p.evaluate('window.__ST()').catch(() => null);
  if (a?.LH && a?.RH && s) rows.push({ lf: a.LH.f, rf: a.RH.f, lu: a.LH.u, ru: a.RH.u, bu: a.BALL ? a.BALL.u : NaN, phase: String(s.phase), dribble: !!s.dribble?.active, y: 0, clip: String(a.playing || '') } as Row);
  await p.waitForTimeout(40);
}
const range = (v: number[]) => v.length ? +(Math.max(...v) - Math.min(...v)).toFixed(3) : 0;
const mean = (v: number[]) => v.reduce((a, c) => a + c, 0) / (v.length || 1);
// anti-phase: the correlation between the two hands' fore/aft swing should be NEGATIVE
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? +(num / Math.sqrt(da * db)).toFixed(3) : 0;
};
const report = (label: string, rs: Row[]) => {
  if (rs.length < 8) { console.log(`\n${label}: only ${rs.length} samples — not measured`); return; }
  const lf = rs.map((r) => r.lf), rf = rs.map((r) => r.rf), lu = rs.map((r) => r.lu), ru = rs.map((r) => r.ru);
  console.log(`\n${label} (${rs.length} samples)`);
  console.log(`  fore/aft swing   left ${range(lf)} m   right ${range(rf)} m`);
  console.log(`  hand height      left mean ${mean(lu).toFixed(3)}  right mean ${mean(ru).toFixed(3)}   asymmetry ${Math.abs(mean(lu) - mean(ru)).toFixed(3)} m`);
  const bu = rs.map((r) => r.bu).filter((v) => Number.isFinite(v));
  console.log(`  VERTICAL travel  left ${range(lu)} m   right ${range(ru)} m   BALL ${range(bu)} m`);
  if (bu.length > 8) console.log(`  hand follows ball: right/ball ${(range(ru) / (range(bu) || 1)).toFixed(2)}   correlation ${corr(rs.map((r) => r.ru), rs.map((r) => r.bu))}`);
  console.log(`  arm PHASE        ${corr(lf, rf)}   (a runner is ANTI-phase: strongly negative)`);
};
const running = rows.filter((r) => !r.dribble && r.phase !== 'cinematic' && r.phase !== 'resolve');
report('RUNNING (no ball in hand)', running);
report("RUN CLIP ALONE (clip === 'run')", rows.filter((r) => r.clip === 'run' && !r.dribble));
report('DRIBBLING', rows.filter((r) => r.dribble));
console.log(`\nphases seen: ${[...new Set(rows.map((r) => r.phase))].join(', ')}`);
console.log(`clips on the arms while running: ${[...new Set(running.map((r) => r.clip))].join(' | ')}`);
await p.screenshot({ path: '/tmp/dunk-run.png' });
await b.close();
