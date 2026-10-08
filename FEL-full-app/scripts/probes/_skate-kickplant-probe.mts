// _skate-kickplant-probe — does JUMP at a wall kick off it, and does a shallow line onto a wall ride it? (asset-polish, 2026-10-05)
//
// Owner: "On the skating game can we put a kick plant with the same button as the jump button when you press it off a wall.
// Add wall rides." A fake pad steers the rider at the plaza's street wall (skatePlaza: fx 0.28, fz -0.6, 9 m × 0.4 m) and:
//   P1 GROUND POP  — rolls at the face and pops 1.3 m short of it: the pop arms the plant, which fires on reaching the face
//   P2 AIR PRESS   — pops 3.5 m short, then presses JUMP in the air 0.8 m from the face: a kick plant, not an air trick
//   P3 SHALLOW RIDE — comes along the face at a shallow angle, pops, holds GRIND: a wall ride (refused at the old 1.2 m/s)
// VIRTUAL TIME: every animation frame is 1/60 s of game time however slow the GL is (software GL on a cloud box draws
// ~5 fps), so the run is the same run on any machine; all waits below are in GAME seconds.
//   PORT=3150 CHROMIUM_EXE=/opt/pw-browsers/chromium npx tsx scripts/probes/_skate-kickplant-probe.mts   (SWIFT=1 on a box without a GPU)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3150', OUT = process.env.OUT ?? '/tmp/skate-kickplant';
const SIGN = Number(process.env.SIGN ?? 1);
const BOUND = 56;   // venice-park (boardVenues)
fs.mkdirSync(OUT, { recursive: true });
const GL = process.env.SWIFT ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: chromiumExe(), args: GL });
const ctx = await b.newContext({ viewport: { width: 720, height: 450 } });
await ctx.addInitScript({ content: `(() => {
  let vt = performance.now(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => raf(() => { vt += 1000 / 60; cb(vt); });
  window.__name = window.__name || function (f) { return f; };
})()` });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[SKATE-(WALL|LIP|LAND|GRIND)\]/.test(t)) logs.push(t.slice(0, 160)); });
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message.slice(0, 160)));
await p.goto(`http://localhost:${PORT}/dev/mode/skateboard`, { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 240; i++) {
  if (await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero?.() && /· playing/.test(document.body.innerText))) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  window.__pos = () => { const hr = topOf(window.__FEL_DEV__.hero()); const r = hr.getAbsolutePosition(); return { x: r.x, y: r.y, z: r.z, yaw: hr.rotation.y, t: performance.now() }; };
  window.__cue = () => (document.body.innerText.match(/"wallCue":\\s*"([^"]*)"/) || [])[1] || '';
  window.__wall = []; const oi = console.info.bind(console);
  console.info = (...a) => { const m = String(a[0]); if (/\\[SKATE-WALL\\]/.test(m)) window.__wall.push({ t: performance.now(), m }); oi(...a); };
})()`);
type Q = { x: number; y: number; z: number; yaw: number; t: number };
const ev = (code: string) => p.evaluate(code);
const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3 };
const press = (n: string, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${BTN[n]}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; window.__PAD.timestamp = performance.now(); })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; window.__PAD.timestamp = performance.now(); })()`);
const pos = () => ev('window.__pos()') as Promise<Q>;
/** Wait `sec` of GAME time. */
async function game(sec: number): Promise<void> { const t0 = (await pos()).t; while ((await pos()).t - t0 < sec * 1000) await p.waitForTimeout(30); }
const tap = async (n: string) => { await press(n, true); await game(0.1); await press(n, false); };
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
async function driveTo(tx: number, tz: number, until: (q: Q) => boolean, maxSec: number): Promise<Q> {
  let q = await pos(); const t0 = q.t; let prev = q; let travel = q.yaw;
  while (q.t - t0 < maxSec * 1000) {
    q = await pos();
    if (until(q)) break;
    const dx = q.x - prev.x, dz = q.z - prev.z; if (Math.hypot(dx, dz) > 0.05) travel = Math.atan2(dx, dz); prev = q;
    const err = wrap(Math.atan2(tx - q.x, tz - q.z) - travel);
    await setL(Math.max(-1, Math.min(1, SIGN * err * 1.4)), -1);
    await p.waitForTimeout(30);
  }
  return q;
}

const cx = 0.28 * BOUND, cz = -0.6 * BOUND, northZ = cz + 0.2;   // the street wall, its north (park-centre) face
const out: string[] = [`skate kick plant probe · ${new Date().toISOString()} · street wall north face z ${northZ.toFixed(1)}, x ${(cx - 4.5).toFixed(1)}..${(cx + 4.5).toFixed(1)}`];
const say = (ok: boolean, s: string) => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${s}`); console.log(out.at(-1)); };
const since = (n: number) => logs.slice(n);
await game(1.0);

// P1 — GROUND POP at the face
await driveTo(cx, northZ + 14, (q) => Math.hypot(q.x - cx, q.z - (northZ + 14)) < 2.5, 40);
let n0 = logs.length;
let q = await driveTo(cx, northZ - 3, (q) => q.z < northZ + 1.3, 12);
const popAt1 = q.z - northZ;
await tap('A');
await game(0.7);
await p.screenshot({ path: `${OUT}/p1-ground-pop.png` });
let got = since(n0);
say(got.some((l) => /kick plant off the wallride \(north face\)/.test(l)), `P1 ground pop ${popAt1.toFixed(2)} m from the face → ${got.join(' | ') || 'nothing'}`);
await setL(0, 0); await game(1.5);

// P2 — POP EARLY, JUMP IN THE AIR AT THE FACE
await driveTo(cx + 1, northZ + 16, (q) => Math.hypot(q.x - (cx + 1), q.z - (northZ + 16)) < 2.5, 40);
n0 = logs.length;
q = await driveTo(cx + 1, northZ - 3, (q) => q.z < northZ + 3.5, 12);
const popAt2 = q.z - northZ;
await tap('A');
let cueSeen = '';
q = await driveTo(cx + 1, northZ - 3, (q) => q.z < northZ + 0.8 || q.y < 0.02 && q.z < northZ + 2.6, 3);
cueSeen = String(await ev('window.__cue()'));
const airAt = { d: q.z - northZ, y: q.y };
await tap('A');
await game(0.5);
await p.screenshot({ path: `${OUT}/p2-air-press.png` });
got = since(n0);
say(got.some((l) => /kick plant off the wallride \(north face\)/.test(l)) && airAt.y > 0.05,
  `P2 pop ${popAt2.toFixed(2)} m out, JUMP in the air ${airAt.d.toFixed(2)} m out at y ${airAt.y.toFixed(2)} (cue "${cueSeen}") → ${got.join(' | ') || 'nothing'}`);
await setL(0, 0); await game(1.5);

// P3 — SHALLOW LINE, GRIND HELD
// from well short of the wall's west end, on a line that meets the face a third of the way along, so the ride has room
await driveTo(cx - 12, northZ + 6, (q) => Math.hypot(q.x - (cx - 12), q.z - (northZ + 6)) < 3, 60);
n0 = logs.length;
const qa = await pos();
q = await driveTo(cx + 3, northZ - 0.4, (q) => q.x > cx - 8 && q.z > northZ + 0.5 && q.z < northZ + 2.2, 12);
const ang = q;
const pre = await pos(); await game(0.05); const post = await pos();
const travelDeg = Math.abs(Math.atan2(post.z - pre.z, post.x - pre.x) * 180 / Math.PI);
out.push(`      P3 from (${qa.x.toFixed(1)}, ${(qa.z - northZ).toFixed(1)}): travelling ${Math.min(travelDeg, 180 - travelDeg).toFixed(0)}° off the face's line at the pop`);
await tap('A'); await game(0.18); await press('X', true);
await game(0.9);
await p.screenshot({ path: `${OUT}/p3-shallow-ride.png` });
await press('X', false); await game(0.6);
got = since(n0);
const wl = (await ev('window.__wall')) as { t: number; m: string }[];
const r0 = wl.filter((w) => w.t >= ang.t && /\] ride /.test(w.m)), off = wl.find((w) => r0[0] && w.t > r0[0].t && /off the wall|wallplant/.test(w.m));
const rideSec = r0[0] && off ? (off.t - r0[0].t) / 1000 : 0;
say(r0.length === 1 && /ride the wallride \(north face\)/.test(r0[0].m) && rideSec >= 0.3,
  `P3 shallow line from (${ang.x.toFixed(1)}, ${(ang.z - northZ).toFixed(2)} m off): ${r0.length} ride(s), the first ${rideSec.toFixed(2)} s on the wall → ${got.slice(0, 6).join(' | ') || 'nothing'}`);

out.push(`PAGE ERRORS ${logs.filter((l) => l.startsWith('PAGEERROR')).length}`);
out.push(`TOTAL PASS ${out.filter((l) => l.startsWith('PASS')).length} · FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`);
fs.writeFileSync(`${OUT}/report.md`, out.join('\n'));
console.log(out.slice(-2).join('\n'));
await b.close();
