// _tennis-cage — does the glass-cage rally fire? (2026-09-18) A fake pad on the dev seam (scene.metadata.tennis):
//   the body steers to the incoming landing, swings at the contact (A, the stick aimed hard sideways so the ball goes for the
//   glass), R1 on a deep lob (the back-wall smash) or a short ball (the meteor); the seam counts bounces / wall runs / aerials.
//   BASE=http://127.0.0.1:3098 POINTS=14 npx tsx scripts/probes/_tennis-cage.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/tennis-cage';
const POINTS = Number(process.env.POINTS ?? 14);
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
p.on('console', (m) => { const t = m.text(); if (/\[CAGE\]|\[NET-JUICE\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/tennis?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.tennis && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
console.log('start:', await p.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; const ok = await a.start(20000); return JSON.stringify({ ok, state: a.state().state }); })()`));
await p.evaluate(`(() => { const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: window.__PAD }); window.dispatchEvent(ev); })()`);
const ev = (code: string) => p.evaluate(code);
const btn = (i: number, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; bt.touched = ${down}; window.__PAD.timestamp = Date.now(); })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(50); await btn(i, false); };
const seam = () => ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.tennis.state())`).then((s) => JSON.parse(s as string));
const A = 0, R1 = 5;

let rallies = 0; let swings = 0; let aerials = 0; const t0 = Date.now(); let lastRallies = -1; let aimSide = 1;
while (rallies < POINTS && Date.now() - t0 < 150000) {
  const st = await seam();
  if (st.ended) { console.log('ended'); break; }
  if (st.rallies !== lastRallies) { lastRallies = st.rallies; rallies = st.rallies; console.log(`point ${st.rallies}: games ${JSON.stringify(st.games)} mult now ${st.mult} style ${st.style} · bounces ${st.bounces} liveSaves ${st.liveSaves} wallRuns ${st.wallRuns} smashes ${st.smashes} meteors ${st.meteors} energy ${st.energy.toFixed(0)}`); }
  if (st.awaitingHuman && st.shot) {
    // steer to the landing (the stick is the footwork's intent, screen-relative), then at the contact aim hard for the glass
    const dx = st.shot.toX - st.footX;
    if (st.flightT < 0.9) { await setL(Math.max(-1, Math.min(1, dx * 1.2)) * st.steerSign, 0); }
    else if (st.flightT >= 0.93) {
      if (st.aerial) { await tap(R1); aerials++; console.log(`  R1 ${st.aerial} on a ${st.shot.kind || 'ball'} landing z ${st.shot.toZ.toFixed(1)} (energy ${st.energy.toFixed(0)})`); }
      else { await setL(aimSide * 0.95, 0); await tap(A); aimSide = -aimSide; swings++; }
      await p.waitForTimeout(250); await setL(0, 0);
    }
  } else await setL(0, 0);
  await p.waitForTimeout(16);
}
await p.screenshot({ path: `${OUT}/cage.png` });
const fin = await seam();
console.log('cage:', JSON.stringify({ rallies: fin.rallies, swings, aerialsTapped: aerials, bounces: fin.bounces, liveSaves: fin.liveSaves, wallRuns: fin.wallRuns, smashes: fin.smashes, meteors: fin.meteors, style: fin.style, games: fin.games, ended: fin.ended }));
console.log('logs:\n  ' + logs.slice(0, 30).join('\n  '));
await b.close();
