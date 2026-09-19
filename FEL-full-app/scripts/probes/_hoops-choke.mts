// _hoops-choke — does the chokepoint court hold and pay? (2026-09-18) The 3v3 with ?choke=1 on the dev seam:
//   the hero turbos down a rail (RAIL RUN), through the lane behind nobody (no slip), and every body sampled through a
//   possession is checked against the rails' boxes (nobody inside one).   BASE=http://127.0.0.1:3098
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
// the rails, inlined from lib/babylon/core/Chokepoint.ts (tsx would not resolve the TS module's named export from here)
const CHOKE_RAILS = [
  { id: 'rail-l', x: -3.1, z: 6.0, halfX: 0.3, halfZ: 2.6 }, { id: 'rail-r', x: 3.1, z: 6.0, halfX: 0.3, halfZ: 2.6 },
  { id: 'wing-l', x: -6.3, z: 10.5, halfX: 1.4, halfZ: 0.3 }, { id: 'wing-r', x: 6.3, z: 10.5, halfX: 1.4, halfZ: 0.3 },
];

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[3V3-CHOKE\]|\[3V3-KIN\]/.test(t)) logs.push(t.slice(0, 120)); });
await p.goto(`${BASE}/dev/mode/threevthree?agent=1&choke=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.threevthree && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  await p.waitForTimeout(1000);
}
console.log('start:', await p.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; const ok = await a.start(20000); return JSON.stringify({ ok, state: a.state().state }); })()`));
const ev = (code: string) => p.evaluate(code);
const seam = () => ev(`(() => { const d = window.__FEL_DEV__.scene.metadata.threevthree; const k = d.kinetic(); return JSON.stringify({ choke: k.choke, railRuns: k.railRuns, railNow: k.railNow, inLane: k.inLane, carrier: k.carrier, jobs: d.jobs().map((j) => ({ id: j.id, x: j.x, z: j.z })) }); })()`).then((s) => JSON.parse(s as string));
const agent = (expr: string) => ev(`(async () => { const a = window.__NEXUS_AGENT__; return await (${expr}); })()`);
await p.waitForTimeout(1200);
let st = await seam(); console.log(`choke on: ${st.choke}`);
if (!st.choke) { console.log('the court is not on — is ?choke=1 read?'); await b.close(); process.exit(1); }

// ── the rail run: offense(), then turbo down the right rail's outer face (x ≈ 3.8, from z 9 toward the rim) ──
await ev('window.__FEL_DEV__.scene.metadata.threevthree.offense()');
await p.waitForTimeout(600);
const inside = (j: { x: number; z: number }) => CHOKE_RAILS.find((r) => Math.abs(j.x - r.x) < r.halfX + 0.3 && Math.abs(j.z - r.z) < r.halfZ + 0.3);
let violations = 0, samples = 0, laneSamples = 0;
// get beside the right rail first: the hero spawns at (0, 6) — walk right then down the face
void agent("a.act({ moveX: -1, moveY: 0.3, sprint: true, turbo: true }, 700)");   // the bridge's moveX is the camera's right = world −x here: −1 → +x
await p.waitForTimeout(720);
void agent("a.act({ moveX: 0, moveY: 1, sprint: true, turbo: true }, 900)");
const t0 = Date.now();
while (Date.now() - t0 < 900) { const s = await seam(); samples++; for (const j of s.jobs) if (inside(j)) violations++; if (s.inLane) laneSamples++; await p.waitForTimeout(40); }
st = await seam();
const me = st.jobs.find((j: { id: string }) => j.id === 'me');
console.log(`after the run: me (${me.x.toFixed(1)}, ${me.z.toFixed(1)}) railRuns ${st.railRuns} railNow ${st.railNow} · bodies inside a rail: ${violations} of ${samples * 6} samples · lane samples ${laneSamples}`);
// ── a full possession on defence: nobody ends up inside a rail ──
await ev('window.__FEL_DEV__.scene.metadata.threevthree.defend()');
const t1 = Date.now(); let v2 = 0, n2 = 0;
while (Date.now() - t1 < 6000) { const s = await seam(); n2++; for (const j of s.jobs) if (inside(j)) v2++; await p.waitForTimeout(60); }
console.log(`a defensive possession: bodies inside a rail ${v2} of ${n2 * 6} samples`);
console.log('logs:\n  ' + logs.slice(0, 12).join('\n  '));
await b.close();
