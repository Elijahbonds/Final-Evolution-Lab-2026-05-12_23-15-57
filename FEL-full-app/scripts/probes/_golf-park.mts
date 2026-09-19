// _golf-park — does the parkour golf hole fire? (2026-09-18) A fake pad on the dev seam (scene.metadata.golf):
//   the SPRINGBOARD (Y before the swing), the stick swing (pull back, drive through), a FLICK in the air (the stick snapped
//   sideways), the rings and the turbine on the line, and on the green the SLIDE PUTT (LT) into the bank.   BASE=http://127.0.0.1:3098
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/golf-park';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
await ctx.addInitScript({ content: `(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()` });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[GOLF-PARK\]|\[GOLF-JUICE\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/golf?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.golf && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
console.log('start:', await p.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; const ok = await a.start(20000); return JSON.stringify({ ok, state: a.state().state }); })()`));
await p.evaluate(`(() => { const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: window.__PAD }); window.dispatchEvent(ev); })()`);
const ev = (code: string) => p.evaluate(code);
const btn = (i: number, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; bt.touched = ${down}; window.__PAD.timestamp = Date.now(); })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(60); await btn(i, false); };
const seam = () => ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.golf.state())`).then((s) => JSON.parse(s as string));
const A = 0, B = 1, Y = 3, LT = 6;

async function waitPhase(want: string, ms = 20000): Promise<any> {
  const t0 = Date.now(); let st = await seam();
  while (st.phase !== want && Date.now() - t0 < ms) { if (st.ended) return st; await p.waitForTimeout(80); st = await seam(); }
  return st;
}
/** The stick swing: pull back, drive through (a full swing, no side error). */
async function stickSwing(pwr: number): Promise<void> { const pull = Math.max(0.66, Math.min(1, pwr));   /* the stick swing arms at ≤ −0.6: a pull of exactly −0.60 never armed (measured) */ await setL(0, -pull); await p.waitForTimeout(350); await setL(0, 1); await p.waitForTimeout(120); await setL(0, 0); }

for (let shot = 0; shot < 9; shot++) {
  let st = await waitPhase('aim');
  if (st.ended) { console.log('ended'); break; }
  const green = st.onGreen;
  if (!green && shot === 0) { await tap(Y); await p.waitForTimeout(600); st = await seam(); console.log(`shot ${shot + 1}: Y → pad ${st.pad ?? 'none'}`); }
  if (green) { await btn(LT, true); await p.waitForTimeout(150); st = await seam(); console.log(`shot ${shot + 1}: on the green, LT → slidePutt ${st.slidePutt}`); }
  // the club by the distance (B cycles the bag; the stick swing cannot go under 0.66 power, so a short shot needs a short club)
  if (!green) { for (let c = 0; c < 4; c++) { const s0 = await seam(); if (s0.carryM <= s0.distToPin * 1.3) break; await tap(B); await p.waitForTimeout(150); } st = await seam(); }
  const pwr = st.carryM > 0 ? Math.min(1, (st.distToPin / st.carryM) * (green ? 0.85 : 0.95)) : 0.7;
  console.log(`  swing: pin ${st.distToPin.toFixed(1)} m, full ${st.carryM.toFixed(1)} m → power ${pwr.toFixed(2)}`);
  await stickSwing(pwr);
  if (green) await btn(LT, false);
  st = await waitPhase('flight', 3000);
  if (st.phase !== 'flight') { console.log(`  no strike (phase ${st.phase})`); break; }
  if (!green) {
    // a flick in the air, sideways toward the line if the ball drifts
    await p.waitForTimeout(900);
    const s1 = await seam();
    if (s1.phase === 'flight') { const dir = s1.ballX < s1.holeX ? 1 : -1; await setL(0, 0); await p.waitForTimeout(40); await setL(dir, 0); await p.waitForTimeout(120); await setL(0, 0); await p.waitForTimeout(80); console.log(`  flick ${dir > 0 ? '▶' : '◀'} at y ${s1.ballY.toFixed(1)} → flicksLeft ${(await seam()).flicksLeft}`); }
  }
  const t0 = Date.now(); let last = st;
  while (Date.now() - t0 < 30000) { last = await seam(); if (last.phase === 'aim' || last.ended || (last.phase === 'preview')) break; await p.waitForTimeout(120); }
  console.log(`  → hole ${last.hole} stroke ${last.strokes} ball (${last.ballX.toFixed(1)}, ${last.ballZ.toFixed(1)}) pin (${last.holeX.toFixed(0)}, ${last.holeZ.toFixed(0)}) apex ${last.apexY.toFixed(1)} rings ${last.rings} chain ${last.ringChain} gusts ${last.gusts} bankRides ${last.bankRides} pts ${last.pts}`);
  if (shot === 0) await p.screenshot({ path: `${OUT}/drive.png` });
  if (last.ended) break;
}
const fin = await seam();
console.log('park:', JSON.stringify({ hole: fin.hole, strokes: fin.strokes, pads: fin.pads, flicks: fin.flicks, rings: fin.ringsTotal, gusts: fin.gusts, bankRides: fin.bankRides, slidePutts: fin.slidePutts, pts: fin.pts }));
console.log('logs:\n  ' + logs.join('\n  '));
await b.close();
