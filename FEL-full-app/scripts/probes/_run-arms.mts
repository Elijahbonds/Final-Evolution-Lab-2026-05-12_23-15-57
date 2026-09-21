// Do the hero's arms swing like a runner's? A runner's arms ALTERNATE — left forward while right is back — so the
// correlation between the two hands' fore/aft position is strongly NEGATIVE. In the dunk this could not be isolated:
// the hero dribbles the whole runway, and holding sprint also charges the gather (which correctly brings both arms
// back together). Free Run is a mode built around plain running, so it gives a clean read.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const MODE = process.env.MODE ?? 'freerun';
const QS = process.env.QS ?? '';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
await p.goto(`http://localhost:${PORT}/dev/mode/${MODE}${QS}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3000);
await p.evaluate(`(() => { const pad={index:0,id:'fake (STANDARD GAMEPAD)',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))}; window.__PAD=pad; navigator.getGamepads=()=>[pad];
  window.__ARMS = () => {
    const dev = window.__FEL_DEV__, scene = dev.scene, hero = dev.hero();
    const rootOf = (n)=>{while(n&&n.parent)n=n.parent;return n;};
    const mesh = scene.meshes.find(m => m.skeleton && rootOf(m) === hero); const sk = mesh && mesh.skeleton; if (!sk) return null;
    const bn = (n)=>sk.bones.find(b=>b.name===n||b.name.endsWith(':'+n)||b.name.endsWith('_'+n));
    const wp = (n)=>{const t=bn(n)&&bn(n).getTransformNode&&bn(n).getTransformNode(); return t?t.getAbsolutePosition():null;};
    const M = hero.getWorldMatrix().m, nz=(v)=>{const L=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/L,v[1]/L,v[2]/L];};
    const R=nz([M[0],M[1],M[2]]),U=nz([M[4],M[5],M[6]]),F=nz([M[8],M[9],M[10]]),o=hero.getAbsolutePosition();
    const L=(v)=>v?{r:+((v.x-o.x)*R[0]+(v.y-o.y)*R[1]+(v.z-o.z)*R[2]).toFixed(3),u:+((v.x-o.x)*U[0]+(v.y-o.y)*U[1]+(v.z-o.z)*U[2]).toFixed(3),f:+((v.x-o.x)*F[0]+(v.y-o.y)*F[1]+(v.z-o.z)*F[2]).toFixed(3)}:null;
    const playing = scene.animationGroups.filter(g => g.isPlaying && g.targetedAnimations.some(ta => sk.bones.some(bb => bb.getTransformNode && bb.getTransformNode() === ta.target))).map(g => g.name).join('+');
    return { LH:L(wp('LeftHand')), RH:L(wp('RightHand')), speed: +o.z.toFixed(2), playing };
  }; })()`);
const set = async (js: string) => { await p.evaluate(`(() => { const p=window.__PAD; ${js}; p.timestamp=performance.now(); })()`).catch(()=>{}); };
await set('p.buttons[0].pressed=true;p.buttons[0].value=1'); await p.waitForTimeout(110);
await set('p.buttons[0].pressed=false;p.buttons[0].value=0');
await p.waitForTimeout(2500);
await set('p.axes[1]=-1;p.buttons[7].pressed=true;p.buttons[7].value=1');   // run forward, flat out
await p.waitForTimeout(1200);

type Row = { lf: number; rf: number; clip: string };
const rows: Row[] = [];
for (let i = 0; i < 130; i++) {
  const a: any = await p.evaluate('window.__ARMS()').catch(() => null);
  if (a?.LH && a?.RH) rows.push({ lf: a.LH.f, rf: a.RH.f, clip: String(a.playing || '') });
  await p.waitForTimeout(33);
}
const mean = (v: number[]) => v.reduce((a, c) => a + c, 0) / (v.length || 1);
const range = (v: number[]) => v.length ? +(Math.max(...v) - Math.min(...v)).toFixed(3) : 0;
const corr = (a: number[], bb: number[]) => {
  const ma = mean(a), mb = mean(bb); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (bb[i] - mb); da += (a[i] - ma) ** 2; db += (bb[i] - mb) ** 2; }
  return da && db ? +(n / Math.sqrt(da * db)).toFixed(3) : 0;
};
const byClip = new Map<string, Row[]>();
for (const r of rows) { if (!byClip.has(r.clip)) byClip.set(r.clip, []); byClip.get(r.clip)!.push(r); }
console.log(`${MODE}${QS}  — ${rows.length} samples`);
for (const [clip, rs] of [...byClip].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
  if (rs.length < 12) continue;
  console.log(`  ${(clip || '(none)').padEnd(28)} n=${String(rs.length).padStart(3)}  swing L ${range(rs.map(r => r.lf))} R ${range(rs.map(r => r.rf))}  PHASE ${corr(rs.map(r => r.lf), rs.map(r => r.rf))}`);
}
await b.close();
