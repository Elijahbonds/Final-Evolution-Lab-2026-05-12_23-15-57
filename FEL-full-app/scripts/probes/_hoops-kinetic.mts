// _hoops-kinetic — do the 1v1's kinetic verbs fire? (2026-09-18) A fake pad on the dev seam (scene.metadata.onevone):
//   PARRY: defend(), then the poke (X) the frame the driver is inside the window and closing → PARRY-VAULT.
//   DRIFT: offense(), turbo + forward for a beat, then LT + a hard sideways stick → DRIFT (and ANKLES! if he was in front).
//   DRIVE-BY: defend(), run alongside the driver at speed and poke.
//   BASE=http://127.0.0.1:3098 SECS=40 npx tsx scripts/probes/_hoops-kinetic.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/hoops-kinetic';
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[1V1-KIN\]|\[1V1-DEF\]|\[1V1-REF\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/onevone?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.onevone && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
// THE SEAM APPEARS IN load(), BEFORE THE MODE IS STARTED — the loop above can break with the mode still in READY (update
// never runs, no slot is polled: measured 2026-09-18, 0 ticks in 3 s). And the on-screen START is the PAD's START (pause),
// so never click it once the mode is loaded: the bridge's start() is the one honest handshake (it waits for 'playing').
{
  const st = await p.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; const ok = await a.start(20000); return JSON.stringify({ ok, state: a.state().state }); })()`);
  console.log('start:', st);
}
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
})()`);
const ev = (code: string) => p.evaluate(code);
const btn = (i: number, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; bt.touched = ${down}; window.__PAD.timestamp = Date.now(); })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(50); await btn(i, false); };
const seam = () => ev(`(() => { const d = window.__FEL_DEV__.scene.metadata.onevone; return JSON.stringify({ possession: d.possession(), phase: d.attackPhase(), defPhase: d.defPhase(), drive: d.driveSpeed(), kin: d.kinetic(), ended: d.ended() }); })()`).then((s) => JSON.parse(s as string));
await p.waitForTimeout(1500);

// ── THE PARRY ──
console.log('parry: defend()');
await ev('window.__FEL_DEV__.scene.metadata.onevone.defend()');
let t0 = Date.now(); let parried = false; let lastTap = 0;
while (Date.now() - t0 < 14000) {
  const st = await seam();
  if (st.kin.parries > 0) { parried = true; console.log(`  PARRY at t ${((Date.now() - t0) / 1000).toFixed(1)} dist ${st.kin.dist.toFixed(2)} closing ${st.kin.closing.toFixed(2)}`); break; }
  if ((st.phase === 'drive' || st.phase === 'blowby') && st.kin.dist >= 0.85 && st.kin.dist <= 1.85 && st.kin.closing >= 2.3 && Date.now() - lastTap > 300) { await tap(2); lastTap = Date.now(); console.log(`  poke @ dist ${st.kin.dist.toFixed(2)} closing ${st.kin.closing.toFixed(2)} phase ${st.phase}`); }
  await p.waitForTimeout(25);
}
if (!parried) console.log('  no parry');
await p.screenshot({ path: `${OUT}/parry.png` });
await p.waitForTimeout(1800);

// ── THE DRIFT ──
console.log('drift: offense()');
await ev('window.__FEL_DEV__.scene.metadata.onevone.offense()');
await p.waitForTimeout(600);
// UNDER ?agent=1 THE HERO'S MOVEMENT IS THE AGENT BRIDGE'S, not the pad's (the pad's stick moved him 0.0 m/s, measured); the
// triggers still reach onInput, so LT is the pad and the run is the bridge
const agent = (expr: string) => ev(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; return await (${expr}); })()`);
void agent("a.do('turbo', { x: 0, y: 1, ms: 520 })");   // turbo at the rim for a beat
await p.waitForTimeout(430);
await btn(6, true); await p.waitForTimeout(60);
{ const s0 = await seam(); console.log(`  LT down: ltHeld ${s0.kin.ltHeld} possession ${s0.possession} speed ${s0.kin.meSpeed.toFixed(1)} dist ${s0.kin.dist.toFixed(2)}`); }
void agent("a.do('turbo', { x: 1, y: 0.1, ms: 320 })");   // LT + a hard cut right on the turbo
await p.waitForTimeout(200);
let st = await seam(); console.log(`  after the cut: drifts ${st.kin.drifts} ankles ${st.kin.ankles} speed ${st.kin.meSpeed.toFixed(1)}`);
await p.waitForTimeout(200);
void agent("a.do('turbo', { x: -1, y: 0.1, ms: 320 })");
await p.waitForTimeout(260);
st = await seam(); console.log(`  after the cut back: drifts ${st.kin.drifts} ankles ${st.kin.ankles}`);
await btn(6, false); await btn(7, false); await setL(0, 0);
await p.screenshot({ path: `${OUT}/drift.png` });

const fin = await seam();
console.log('kinetic:', JSON.stringify(fin.kin));
console.log('logs:\n  ' + logs.join('\n  '));
await b.close();
