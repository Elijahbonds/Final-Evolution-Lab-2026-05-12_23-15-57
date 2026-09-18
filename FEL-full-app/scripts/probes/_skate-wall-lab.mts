// _skate-wall-lab — do WALL RIDES, WALLPLANTS and LIP TRICKS fire where a skater would throw them? (2026-09-18)
//
// A feedback driver on a fake pad: the stick steers the rider at a target (the wallride's face, then the spine's crest)
// by reading the root every tick; the pop and the grind button are thrown at the distances a player would throw them.
// Records the rider's path, every [SKATE-WALL] / [SKATE-LIP] line and the banners, and writes a frame at each moment.
//
//   BASE=http://127.0.0.1:3098 npx tsx scripts/probes/_skate-wall-lab.mts
//   SIGN=-1  flips the steering sign if the rider veers away (the stick is camera-relative)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/skate-wall-lab';
const SIGN = Number(process.env.SIGN ?? 1);
const BOUND = 56;   // venice-park (boardVenues)
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[SKATE-(WALL|LIP|LAND|GRIND)\]|\[SKATE-NAN\]/.test(t)) logs.push(`${Date.now()} ${t.slice(0, 160)}`); });
await p.goto(`${BASE}/dev/mode/skateboard?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero && !!(window as any).__FEL_DEV__.hero())) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  const s = window.__FEL_DEV__.scene;
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  window.__ROWS = [];
  s.onAfterRenderObservable.add(() => {
    const h = window.__FEL_DEV__.hero(); if (!h) return; const r = topOf(h).getAbsolutePosition(); const hr = topOf(h);
    window.__ROWS.push({ t: performance.now(), x: +r.x.toFixed(2), y: +r.y.toFixed(2), z: +r.z.toFixed(2), yaw: +hr.rotation.y.toFixed(3), ban: ((document.body.innerText.match(/"banner":\\s*"([^"]*)"/) || [])[1] || '') });
    if (window.__ROWS.length > 20000) window.__ROWS.shift();
  });
  window.__pos = () => { const h = window.__FEL_DEV__.hero(); const hr = topOf(h); const r = hr.getAbsolutePosition(); return { x: r.x, y: r.y, z: r.z, yaw: hr.rotation.y }; };
})()`);
const ev = (code: string) => p.evaluate(code);
const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3 };
const press = (n: string, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${BTN[n]}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const pos = () => ev('window.__pos()') as Promise<{ x: number; y: number; z: number; yaw: number }>;
const tap = async (n: string) => { await press(n, true); await p.waitForTimeout(60); await press(n, false); };
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** Steer at (tx, tz) holding forward until `until(pos)` says stop, or the time runs out. */
async function driveTo(tx: number, tz: number, until: (q: { x: number; y: number; z: number; yaw: number }) => boolean, maxMs: number, forward = -1): Promise<{ x: number; y: number; z: number; yaw: number }> {
  const t0 = Date.now(); let q = await pos(); let prev = q; let travel = q.yaw;
  while (Date.now() - t0 < maxMs) {
    q = await pos();
    if (until(q)) break;
    // the heading is the TRAVEL direction (the root faces backwards in switch stance after a plant), from the last tick's move
    const dx = q.x - prev.x, dz = q.z - prev.z; if (Math.hypot(dx, dz) > 0.05) travel = Math.atan2(dx, dz); prev = q;
    const want = Math.atan2(tx - q.x, tz - q.z);
    const err = wrap(want - travel);
    await setL(Math.max(-1, Math.min(1, SIGN * err * 1.4)), forward);
    await p.waitForTimeout(40);
  }
  return q;
}

await p.waitForTimeout(1500);
// ── THE WALL RIDE: the wallride's park-side face (skatePlaza: fx 0.2, fz 0.82, 11 m wide, 0.5 deep) ──
const faceZ = 0.82 * BOUND - 0.25, faceX = 0.2 * BOUND;
console.log(`wall face at z ${faceZ.toFixed(1)}, x ${faceX.toFixed(1)}`);
let q = await driveTo(faceX, faceZ + 2, (r) => r.z > faceZ - 3.8, 14000);
console.log(`pop at (${q.x.toFixed(1)}, ${q.z.toFixed(1)})`);
await tap('A');
await p.waitForTimeout(230);
await press('X', true);
await p.screenshot({ path: `${OUT}/wall.png` });
await p.waitForTimeout(650);
await p.screenshot({ path: `${OUT}/wall2.png` });
await tap('A');   // the plant
await p.waitForTimeout(80);
await press('X', false);
await p.waitForTimeout(250);
await p.screenshot({ path: `${OUT}/plant.png` });
await p.waitForTimeout(1500);
await setL(0, 0);
// ── THE LIP: the spine's crest from the north side (fz -0.44, x fx -0.12 ± 4.2) ──
const crestZ = -0.39 * BOUND, crestX = -0.12 * BOUND;   // the north bank's crest: the table z is the wedge's high end
console.log(`crest at z ${crestZ.toFixed(1)}, x ${crestX.toFixed(1)}`);
// first to a waypoint north of the bank (a bank is only a bank from its low side), then straight at its crest
q = await driveTo(crestX, crestZ + 14, (r) => Math.hypot(r.x - crestX, r.z - (crestZ + 14)) < 2.5, 22000);
console.log(`waypoint (${q.x.toFixed(1)}, ${q.z.toFixed(1)})`);
q = await driveTo(crestX, crestZ - 6, (r) => r.z < crestZ + 3.6 && r.z > crestZ - 0.5 && r.y > 0.45, 12000);   // up the north bank: hold the grind button from a third of the way up
console.log(`on the bank (${q.x.toFixed(1)}, ${q.y.toFixed(2)}, ${q.z.toFixed(1)})`);
await press('X', true);
q = await driveTo(crestX, crestZ - 6, (r) => r.y > 1.5 || r.z < crestZ - 0.2, 4000);
console.log(`at the lip (${q.x.toFixed(1)}, ${q.y.toFixed(2)}, ${q.z.toFixed(1)})`);
await setL(0, 0);
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/lip.png` });
await p.waitForTimeout(500);
await press('X', false);
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/dropin.png` });

const rows = await ev('window.__ROWS') as { t: number; x: number; y: number; z: number; yaw: number; ban: string }[];
const banners = [...new Set(rows.map((r) => r.ban).filter(Boolean))];
console.log('banners:', banners.join(' | '));
console.log('logs:'); for (const l of logs) console.log('  ', l.replace(/^\d+ /, ''));
fs.writeFileSync(`${OUT}/rows.json`, JSON.stringify({ rows, logs, banners }, null, 1));
await b.close();
