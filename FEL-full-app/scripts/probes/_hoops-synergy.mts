// _hoops-synergy — do the 3v3's kinetic verbs fire? (2026-09-18) A fake pad on the dev seam (scene.metadata.threevthree):
//   PARRY: defend(), then the poke (X) the frame the driver is inside the window and closing → PARRY-VAULT.
//   SLING: offense(), turbo forward for a beat, then the pass (A) at speed → SLING-PASS; the catch → the mate's burst.
//   SLIPSTREAM: with the mate carrying, run in his wake → slipping + the gauge climbing.
//   OVERDRIVE: synergyAdd(100) → the overdrive, the turbo pinned at 100.
//   BASE=http://127.0.0.1:3098 npx tsx scripts/probes/_hoops-synergy.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/hoops-synergy';
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[3V3-KIN\]|\[3V3-DEF\]|\[3V3-REF\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/threevthree?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.threevthree && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
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
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(50); await btn(i, false); };
const seam = () => ev(`(() => { const d = window.__FEL_DEV__.scene.metadata.threevthree; return JSON.stringify({ carrier: d.carrier(), phase: d.attackPhase(), kin: d.kinetic(), ended: d.ended(), flightK: d.flightK(), hud: (window.__FEL_DEV__.hud ? window.__FEL_DEV__.hud() : null) }); })()`).then((s) => JSON.parse(s as string));
const agent = (expr: string) => ev(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; return await (${expr}); })()`);
await p.waitForTimeout(1500);

// ── THE PARRY: defend(), run INTO the driver's path, poke inside the window ──
// the driver is a clocked path to the rim; standing at the spawn he passes 4+ m away (measured), so the body runs at him
let t0 = Date.now(); let parried = false; let lastTap = 0; let minDist = 99, maxClosing = -99, inBandClosing = -99; let lastRun = 0; const timeline: string[] = [];
for (let round = 0; round < 3 && !parried; round++) {
console.log(`parry: defend() (round ${round + 1})`);
await ev('window.__FEL_DEV__.scene.metadata.threevthree.defend()');
t0 = Date.now();
while (Date.now() - t0 < 11000) {
  const st = await seam();
  if (st.kin.parries > 0 || st.kin.driveBys > 0) { parried = true; console.log(`  ${st.kin.parries ? 'PARRY' : 'DRIVE-BY'} at t ${((Date.now() - t0) / 1000).toFixed(1)} dist ${st.kin.dist.toFixed(2)} closing ${st.kin.closing.toFixed(2)}`); break; }
  if (st.kin.dist > 0 && st.kin.dist < 3 && timeline.length < 40) timeline.push(`${((Date.now() - t0) / 1000).toFixed(2)}s d${st.kin.dist.toFixed(2)} c${st.kin.closing.toFixed(1)} k${st.kin.driveK.toFixed(2)} f${st.flightK.toFixed(2)}`);
  if (st.kin.dist > 0) {
    minDist = Math.min(minDist, st.kin.dist); maxClosing = Math.max(maxClosing, st.kin.closing);
    if (st.kin.dist >= 0.85 && st.kin.dist <= 1.85) inBandClosing = Math.max(inBandClosing, st.kin.closing);
    if (st.kin.dist >= 0.85 && st.kin.dist <= 1.85 && st.kin.closing >= 2.2 && Date.now() - lastTap > 300) { await tap(2); lastTap = Date.now(); console.log(`  poke @ dist ${st.kin.dist.toFixed(2)} closing ${st.kin.closing.toFixed(2)} driveK ${st.kin.driveK.toFixed(2)}`); }
    else if (Date.now() - lastRun > 180) {   // hold the intercept point
      // the intercept: 1.6 m in front of the driver on his line to the rim (0, −0.6) — he arrives AT me (closing > 0)
      const dr = await ev(`(() => { const r = window.__FEL_DEV__.scene.metadata.threevthree.driverRoot(); const me = window.__FEL_DEV__.scene.metadata.threevthree.jobs().find((j) => j.id === 'me'); if (!r || !me) return null; const tx = 0 - r.position.x, tz = -0.6 - r.position.z, tn = Math.hypot(tx, tz) || 1; const px = r.position.x + (tx / tn) * 1.6, pz = r.position.z + (tz / tn) * 1.6; return JSON.stringify({ dx: px - me.x, dz: pz - me.z }); })()`).then((v) => v ? JSON.parse(v as string) : null) as { dx: number; dz: number } | null;
      if (dr) { const n = Math.hypot(dr.dx, dr.dz) || 1; void agent(`a.act({ moveX: ${(-dr.dx / n).toFixed(2)}, moveY: ${(-dr.dz / n).toFixed(2)}, sprint: true, turbo: true }, 200)`); lastRun = Date.now(); }
    }
  }
  await p.waitForTimeout(25);
}
}
if (!parried) console.log(`  no parry — minDist ${minDist.toFixed(2)} maxClosing ${maxClosing.toFixed(2)} closing-in-band ${inBandClosing.toFixed(2)}`);
console.log('  timeline (d dist, c closing, k driveK, f his flight): ' + timeline.join(' | '));
await p.screenshot({ path: `${OUT}/parry.png` });
await p.waitForTimeout(1500);

// ── THE SLING: offense(), turbo, then the pass through the bridge (queued behind the turbo so the edge fires at speed),
// aimed at the mate farther from the rivals; up to 3 tries (a blind pass up the middle gets picked, measured) ──
let caught = false;
for (let attempt = 0; attempt < 6 && !caught; attempt++) {
  console.log(`sling: offense() (try ${attempt + 1})`);
  await ev('window.__FEL_DEV__.scene.metadata.threevthree.offense()');
  await p.waitForTimeout(700);
  const js = await ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.threevthree.jobs().map((j) => ({ id: j.id, x: j.x, z: j.z, speed: j.speed })))`).then((v) => JSON.parse(v as string)) as { id: string; x: number; z: number; speed: number }[];
  const meJ = js.find((j) => j.id === 'me')!; const foesJ = js.filter((j) => j.id.startsWith('foe'));
  const open = js.filter((j) => j.id.startsWith('mate')).map((m) => ({ m, gap: Math.min(...foesJ.map((f) => Math.hypot(f.x - m.x, f.z - m.z))) })).sort((p, q) => q.gap - p.gap)[0].m;
  const dx = open.x - meJ.x, dz = open.z - meJ.z, n = Math.hypot(dx, dz) || 1;
  void agent("a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true }, 550)");
  void agent("a.act({ moveX: 0, moveY: 0, sprint: true, turbo: true, pass: true }, 150)");   // UNAIMED at a sprint: the lane picks the type (a bounce under a mark)
  await p.waitForTimeout(520);
  { const s0 = await seam(); console.log(`  at the pass: speed ${s0.kin.meSpeed.toFixed(1)} carrier ${s0.carrier} → ${open.id} (gap ${Math.min(...foesJ.map((f) => Math.hypot(f.x - open.x, f.z - open.z))).toFixed(1)} m)`); }
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(80); const s1 = await seam(); if (s1.carrier.startsWith('mate') && Math.max(...s1.kin.mateBurst) > 0) { caught = true; console.log(`  CAUGHT by ${s1.carrier}: burst ${Math.max(...s1.kin.mateBurst).toFixed(2)} s left, slings ${s1.kin.slings}`); break; } }
  if (!caught) { const s2 = await seam(); console.log(`  not caught: slings ${s2.kin.slings} carrier ${s2.carrier}`); }
}

// ── THE SLIPSTREAM: run in the mate carrier's wake ──
// (the bridge's moveX is the camera's RIGHT, which is −x here: the camera sits behind the hero looking down −z)
console.log('slipstream: chase the carrier');
let slipT = 0; t0 = Date.now(); let mateSpeedMax = 0; const slipSamples: string[] = [];
while (Date.now() - t0 < 7000) {
  const s = await seam();
  if (!s.carrier.startsWith('mate')) break;
  const js = await ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.threevthree.jobs().map((j) => ({ id: j.id, x: j.x, z: j.z, speed: j.speed })))`).then((v) => JSON.parse(v as string)) as { id: string; x: number; z: number; speed: number }[];
  const meJ = js.find((j) => j.id === 'me')!, mate = js.find((j) => j.id === s.carrier)!;
  mateSpeedMax = Math.max(mateSpeedMax, mate.speed);
  if (slipSamples.length < 30) { const jm = js.find((j) => j.id === s.carrier)!; slipSamples.push(`${((Date.now() - t0) / 1000).toFixed(1)}s me(${meJ.x.toFixed(1)},${meJ.z.toFixed(1)}) mate(${jm.x.toFixed(1)},${jm.z.toFixed(1)}) v${jm.speed.toFixed(1)} ${s.kin.slipping ? 'SLIP' : ''}`); }
  const dx = mate.x - meJ.x, dz = mate.z - meJ.z, n = Math.hypot(dx, dz) || 1;
  void agent(`a.act({ moveX: ${(-dx / n).toFixed(2)}, moveY: ${(-dz / n).toFixed(2)}, sprint: true, turbo: true }, 200)`);
  await p.waitForTimeout(190);
  if (s.kin.slipping) slipT += 0.19;
}
let st = await seam(); console.log(`  slipSec ${st.kin.slipSec.toFixed(2)} (chased ${slipT.toFixed(1)} s in the wake, mate top speed ${mateSpeedMax.toFixed(1)}) synergy ${st.kin.synergy.toFixed(0)} carrier ${st.carrier}`);
console.log('  samples: ' + slipSamples.join(' | '));
await p.screenshot({ path: `${OUT}/slip.png` });

// ── THE OVERDRIVE ──
console.log('overdrive: synergyAdd(100)');
await ev('window.__FEL_DEV__.scene.metadata.threevthree.synergyAdd(100)');
await p.waitForTimeout(400);
st = await seam(); console.log(`  ignitions ${st.kin.ignitions} overdrive ${st.kin.overdrive.toFixed(1)} s`);
console.log(`  turbo ${st.kin.turbo.toFixed(2)} (pinned at 1 while the overdrive runs)`);
await p.screenshot({ path: `${OUT}/overdrive.png` });

const fin = await seam();
console.log('kinetic:', JSON.stringify(fin.kin));
console.log('logs:\n  ' + logs.join('\n  '));
await b.close();
