// _freerun-flow — do the parkour racer's verbs fire where a runner would throw them? (2026-09-18)
//
// A feedback driver on a fake pad reading the mode's seam (scene.metadata.freerun.state()): it runs ONE LANE of a track
// with RT held (sprint), steers at the lane's pieces and presses the verb at the distance a player would — A on a vault
// box at the graded lead, LT under a bar, X on a hazard, A onto a rail, A at a wall approached at an angle (the vector
// rebound), LB at an anchor. Prints the meters, the stats and every [FR-FLOW] line.
//
//   BASE=http://127.0.0.1:3098 TRACK=neon-rooftop LANE=low|mid|high SECS=40 npx tsx scripts/probes/_freerun-flow.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const TRACK = process.env.TRACK ?? 'neon-rooftop';
const LANE = (process.env.LANE ?? 'low') as 'low' | 'mid' | 'high';
const SECS = Number(process.env.SECS ?? 40);
const OUT = process.env.OUT ?? '/tmp/freerun-flow';
fs.mkdirSync(OUT, { recursive: true });
const LANE_X: Record<string, number> = { low: -6, mid: 0, high: 6 };

const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[FR-FLOW\]|\[FR-JUICE\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/freerun?agent=1&track=${TRACK}&tier=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.freerun && window.__FEL_DEV__.scene.metadata.freerun.state().phase === 'run')`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
})()`);
const ev = (code: string) => p.evaluate(code);
const btn = (i: number, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; bt.touched = ${down}; })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(50); await btn(i, false); };
const seam = () => ev('JSON.stringify(window.__FEL_DEV__.scene.metadata.freerun.state())').then((s) => JSON.parse(s as string));
await p.waitForTimeout(800);
const st0 = await seam();
type Pc = { kind: string; x: number; y: number; z: number; w: number; d: number; route?: string; face?: number };
const pieces: Pc[] = st0.pieces;
console.log(`track ${st0.track} lane ${LANE} pieces ${pieces.length} finish ${pieces.find((q) => q.kind === 'finish')?.z}`);
await btn(7, true);   // RT: sprint
const t0 = Date.now(); let lastTap = 0; let ltDown = false; let shots = 0; let lastStats = ''; let sign = 1; let wallSideT = 0;
while (Date.now() - t0 < SECS * 1000) {
  const st = await seam();
  if (st.phase !== 'run') break;
  const z = st.z, x = st.x;
  const now = Date.now();
  // the next piece ahead in the lane (by route, or a wall pair on the high lane)
  const ahead = pieces.filter((q) => q.z + q.d / 2 > z - 0.5 && q.z - q.d / 2 < z + 14 && (q.route === LANE || (LANE === 'high' && q.kind === 'wall') || (LANE === 'mid' && q.kind === 'anchor')));
  let tx = LANE_X[LANE];
  const vault = ahead.find((q) => q.kind === 'vault' && q.z > z);
  const bar = ahead.find((q) => q.kind === 'bar' && q.z > z - 0.5);
  const rail = ahead.find((q) => q.kind === 'rail' && q.z + q.d / 2 > z);
  const spring = ahead.find((q) => q.kind === 'spring' && q.z > z);
  const walls = ahead.filter((q) => q.kind === 'wall' && Math.abs(q.z - z) < q.d / 2 + 2);
  if (vault) tx = vault.x; if (rail) tx = rail.x; if (spring && !rail) tx = spring.x;
  if (LANE === 'high' && walls.length >= 2) {
    // the shaft: run at the far wall at an angle; on a rebound (stats.rebounds ticks) the heading flips, so flip the aim
    if (st.stats.rebounds !== wallSideT) { wallSideT = st.stats.rebounds; sign = -sign; }
    tx = sign > 0 ? 8.3 : 3.7;
  }
  const dx = tx - x;
  // in the shaft the approach must stay OBLIQUE: a proportional steer flattens to head-on as the wall nears (measured: no rebound in 3 runs)
  const inShaft = LANE === 'high' && walls.length >= 2;
  const sx = inShaft ? sign * 0.75 : Math.max(-1, Math.min(1, dx * 0.35));
  await setL(sx, -1);
  // the verbs
  const gap = pieces.find((q) => q.kind === 'gap' && q.d > 0 && q.z - q.d / 2 - z > -0.2 && q.z - q.d / 2 - z < 1.3);
  if (st.state === 'ground' && gap && now - lastTap > 250) { await tap(0); lastTap = now; }
  if (st.state === 'ground') {
    if (LANE === 'high' && walls.length >= 2 && st.wallDeg >= 18 && st.wallDeg <= 72 && st.wallDist < 1.4 && now - lastTap > 250) { await tap(0); lastTap = now; }
    else if (vault && st.vaultDist < 90 && st.vaultDist / Math.max(0.5, st.speed) <= 0.19 && now - lastTap > 400) { await tap(0); lastTap = now; }
    else if (rail && !vault && rail.z - rail.d / 2 - z < 1.6 && rail.z - rail.d / 2 - z > -0.2 && now - lastTap > 500) { await tap(0); lastTap = now; }
    const hz = pieces.find((q) => q.kind === 'hazard' && q.z - z > -0.3 && q.z - z < 1.5 && Math.abs(q.x - x) < 1.2);
    if (hz && now - lastTap > 300) { await tap(2); lastTap = now; }
    if (st.kinetic >= 50 && now - lastTap > 300 && !vault && !rail) { await tap(3); lastTap = now; }
  }
  if (st.anchor && (st.state === 'ground' || st.state === 'air') && now - lastTap > 200) { await tap(4); lastTap = now; }   // the grapple: from the ground or mid-jump
  const nearBar = !!bar && bar.z - z < 2.2 && bar.z - z > -0.6;
  if (nearBar !== ltDown) { ltDown = nearBar; await ev(`(() => { const bt = window.__PAD.buttons[6]; bt.value = ${ltDown ? 1 : 0}; bt.pressed = ${ltDown}; bt.touched = ${ltDown}; })()`); }
  if (st.state === 'air' && now - lastTap > 300 && st.speed > 4 && Math.random() < 0.3) { await ev('(() => { window.__PAD.axes[3] = -1; })()'); await p.waitForTimeout(60); await ev('(() => { window.__PAD.axes[3] = 0; })()'); lastTap = now; }   // a right-stick flick: a front flip
  const key = JSON.stringify({ ...st.stats, bails: st.bails });
  if (key !== lastStats) { lastStats = key; console.log(`t ${((now - t0) / 1000).toFixed(1)} z ${z} x ${x} y ${st.y} v ${st.speed} ${st.state} flow T${st.flow} ${st.flowValue} kin ${st.kinetic} ${key}`); if (shots < 5) { shots++; await p.screenshot({ path: `${OUT}/${TRACK}-${LANE}-${shots}.png` }); } }
  await p.waitForTimeout(40);
}
await btn(7, false); await setL(0, 0);
const fin = await seam();
console.log('end:', JSON.stringify({ z: fin.z, x: fin.x, speed: fin.speed, flow: fin.flow, flowValue: fin.flowValue, kinetic: fin.kinetic, lane: fin.lane, stats: fin.stats }));
console.log('logs:\n  ' + logs.join('\n  '));
await p.screenshot({ path: `${OUT}/${TRACK}-${LANE}-end.png` });
await b.close();
