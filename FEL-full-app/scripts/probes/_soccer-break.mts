// _soccer-break — does the breakaway shootout's parkour fire? (2026-09-18) A fake pad on the dev seam (scene.metadata.soccer):
//   kick 1 STRIKE (run, A) · kick 2 BANK (run into the right glass → wall run → R1) · kick 3 CURLER (LT then A inside 0.35 s)
//   kick 4 RAINBOW (run at the keeper, A when he is right in front) · kick 5 DAWDLE (a slow dribble: his slide-tackle or the clock)
//   Their kicks in between are left to run (no dive = you stayed home).   BASE=http://127.0.0.1:3098 npx tsx scripts/probes/_soccer-break.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/soccer-break';
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
p.on('console', (m) => { const t = m.text(); if (/\[BREAK\]|\[PEN-JUICE\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/penalty?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.soccer && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
console.log('start:', await p.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; const ok = await a.start(20000); return JSON.stringify({ ok, state: a.state().state }); })()`));
await p.evaluate(`(() => { const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: window.__PAD }); window.dispatchEvent(ev); })()`);
const ev = (code: string) => p.evaluate(code);
const btn = (i: number, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; bt.touched = ${down}; window.__PAD.timestamp = Date.now(); })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(60); await btn(i, false); };
const seam = () => ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.soccer.state())`).then((s) => JSON.parse(s as string));
const A = 0, R1 = 5, LT = 6;

async function waitBreak(label: string): Promise<any | null> {
  for (let i = 0; i < 300; i++) { const st = await seam(); if (st.ended) return null; if (st.phase === 'break' && st.clock > 8.5) return st; await p.waitForTimeout(100); }
  console.log(`  ${label}: no breakaway`); return null;
}
async function untilDecided(label: string, ms = 12000): Promise<any> {
  const t0 = Date.now(); let last: any = null;
  while (Date.now() - t0 < ms) { const st = await seam(); last = st; if (st.phase !== 'break' && st.phase !== 'flight') return st; await p.waitForTimeout(60); }
  console.log(`  ${label}: still ${last?.phase} after ${ms} ms`); return last;
}
const line = (st: any) => `goals ${st.goals}–${st.themGoals} shots ${st.shots} wallRuns ${st.wallRuns} banks ${st.banks} curlers ${st.curlers} rainbows ${st.rainbows} overdrives ${st.overdrives} kinetic ${st.kinetic} slides ${st.slides} tackled ${st.tackled} parries ${st.parries} rebounds ${st.rebounds} clocks ${st.clocks}`;

// ── kick 1: the plain strike after a run ──
let st = await waitBreak('kick 1');
if (st) {
  console.log('kick 1: run and STRIKE');
  await setL(0, -1); await p.waitForTimeout(1400);
  const s0 = await seam(); console.log(`  at the strike: z ${s0.z.toFixed(1)} vz ${s0.vz.toFixed(1)} flow ${s0.flow.toFixed(0)} keeperZ ${s0.keeperZ.toFixed(1)}`);
  await setL(0.4, -1); await tap(A); await setL(0, 0);
  st = await untilDecided('kick 1'); console.log('  ' + line(st));
  await p.screenshot({ path: `${OUT}/kick1.png` });
}
// ── kick 2: the BANK off the right glass ──
st = await waitBreak('kick 2');
if (st) {
  console.log('kick 2: into the glass, R1');
  await setL(0.85, -1);
  let t0 = Date.now(); let onWall = false;
  while (Date.now() - t0 < 4000) { const s1 = await seam(); if (s1.wall !== 0) { onWall = true; console.log(`  WALL RUN at x ${s1.x.toFixed(1)} z ${s1.z.toFixed(1)} y ${s1.y.toFixed(2)}`); break; } if (s1.phase !== 'break') break; await p.waitForTimeout(40); }
  if (onWall) { await p.waitForTimeout(150); await setL(-0.2, -1); await tap(R1); }
  else { console.log('  no wall run'); await tap(A); }
  await setL(0, 0);
  st = await untilDecided('kick 2'); console.log('  ' + line(st));
  await p.screenshot({ path: `${OUT}/kick2.png` });
}
// ── kick 3: the SLIDE-CANCEL CURLER ──
st = await waitBreak('kick 3');
if (st) {
  console.log('kick 3: run, LT, A inside the window');
  await setL(0, -1); await p.waitForTimeout(900);
  await btn(LT, true); await p.waitForTimeout(120); await tap(A); await btn(LT, false); await setL(0, 0);
  st = await untilDecided('kick 3'); console.log('  ' + line(st));
}
// ── kick 4: the RAINBOW FLICK over the keeper ──
st = await waitBreak('kick 4');
if (st) {
  console.log('kick 4: run at him, A when he is in front');
  await setL(0, -1);
  let t0 = Date.now(); let flicked = false;
  while (Date.now() - t0 < 6000) { const s1 = await seam(); if (s1.phase !== 'break') break; if (s1.rainbowReady) { await tap(A); flicked = true; console.log(`  RAINBOW at z ${s1.z.toFixed(1)} keeperZ ${s1.keeperZ.toFixed(1)}`); break; } await p.waitForTimeout(30); }
  if (!flicked) { const s1 = await seam(); console.log(`  no rainbow window (phase ${s1.phase} z ${s1.z.toFixed(1)} keeperZ ${s1.keeperZ.toFixed(1)} tackled ${s1.tackled})`); }
  await setL(0, 0);
  st = await untilDecided('kick 4'); console.log('  ' + line(st));
  await p.screenshot({ path: `${OUT}/kick4.png` });
}
// ── kick 5: dawdle — his slide-tackle, or the clock ──
st = await waitBreak('kick 5');
if (st) {
  console.log('kick 5: a slow dribble at him');
  await setL(0, -0.35);
  st = await untilDecided('kick 5', 13000); await setL(0, 0); console.log('  ' + line(st));
}
const fin = await seam();
console.log('breakaway:', JSON.stringify({ goals: fin.goals, themGoals: fin.themGoals, shots: fin.shots, wallRuns: fin.wallRuns, banks: fin.banks, curlers: fin.curlers, rainbows: fin.rainbows, overdrives: fin.overdrives, kinetic: fin.kinetic, slides: fin.slides, tackled: fin.tackled, parries: fin.parries, rebounds: fin.rebounds, clocks: fin.clocks, round: fin.round, ended: fin.ended }));
console.log('logs:\n  ' + logs.join('\n  '));
await b.close();
