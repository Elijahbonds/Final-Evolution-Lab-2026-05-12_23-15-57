// _derby-park — does the parkour derby fire? (2026-09-18) A fake pad on the dev seam (scene.metadata.baseball):
//   each pitch: B in the wind-up (the BAT-FLIP VAULT → flow), the PCI steered onto the pitch's arrival, A at the plate aimed
//   at a wall target's bearing; the wall decides — target / robbed / homer / off the wall.   BASE=http://127.0.0.1:3098
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/derby-park';
const PITCHES = Number(process.env.PITCHES ?? 8);
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
p.on('console', (m) => { const t = m.text(); if (/\[PARK\]|\[DERBY-JUICE\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/derby?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.baseball && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
console.log('start:', await p.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; const ok = await a.start(20000); return JSON.stringify({ ok, state: a.state().state }); })()`));
await p.evaluate(`(() => { const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: window.__PAD }); window.dispatchEvent(ev); })()`);
const ev = (code: string) => p.evaluate(code);
const btn = (i: number, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; bt.touched = ${down}; window.__PAD.timestamp = Date.now(); })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(50); await btn(i, false); };
const seam = () => ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.baseball.state())`).then((s) => JSON.parse(s as string));
const A = 0, B = 1;
const bearings = [0, 16, -16, 32, -32, 0, 16, -16];   // the wall targets' bearings; stick x = tan(b)·vz/15 at a ~24 m/s drive
const aims = bearings.map((b) => Math.max(-1, Math.min(1, b / 26)));   // measured with the 17 m/s lateral: stick 0.5 → 12°, 1.0 → 30° (a tan, not a line)

for (let k = 0; k < PITCHES; k++) {
  // wait for the wind-up of a fresh pitch
  let st = await seam(); let t0 = Date.now();
  while (!(st.incoming && st.throwIn > 0) && Date.now() - t0 < 8000) { if (st.ended) break; await p.waitForTimeout(30); st = await seam(); }
  if (st.ended) { console.log('ended'); break; }
  await tap(B);   // the bat-flip vault
  await p.waitForTimeout(80);
  // steer the PCI onto where the pitch arrives, wait for the plate, swing aimed at a bearing
  let swung = false; t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    st = await seam();
    if (!st.incoming) break;
    if (st.throwIn <= 0) {
      const dx = st.pitchAtX - st.pciX, dy = st.pitchAtY - st.pciY;
      await setL(Math.max(-1, Math.min(1, dx * 4)), Math.max(-1, Math.min(1, -dy * 4)));
      if (st.ballZ <= 1.6 && st.ballZ > -0.5) { await setL(aims[k % aims.length], 0); await tap(A); swung = true; break; }
    }
    await p.waitForTimeout(12);
  }
  await setL(0, 0);
  // the wall decides
  t0 = Date.now(); let last: any = st;
  while (Date.now() - t0 < 5000) { const s2 = await seam(); if (s2.lastVerdict && s2.settledRound === s2.round) { last = s2; break; } await p.waitForTimeout(40); last = s2; }
  console.log(`pitch ${k + 1}: flow ${last.flowAtSwing ?? '?'} swung ${swung} aim ${aims[k % aims.length]} → ${last.lastVerdict ?? 'none'} (${last.lastDetail ?? ''}) · homers ${last.homers} outs ${last.outs} targets ${last.targetsHit} robbed ${last.robbed} mult ${last.multiplier} pts ${last.pts}`);
  if (k === 1) await p.screenshot({ path: `${OUT}/pitch2.png` });
}
const fin = await seam();
console.log('park:', JSON.stringify({ round: fin.round, homers: fin.homers, outs: fin.outs, targetsHit: fin.targetsHit, robbed: fin.robbed, batFlips: fin.batFlips, tokensYours: fin.tokensYours, tokensTheirs: fin.tokensTheirs, pts: fin.pts }));
console.log('logs:\n  ' + logs.join('\n  '));
await b.close();
