// _football-return — does the kickoff return's parkour fire? (2026-09-18) A fake pad on the dev seam (scene.metadata.football):
//   CATCH: tap A as the kick lands (k ≈ 0.97) → perfect; then run: blockers engage, HURDLE-CATAPULT (A) over a downed man,
//   CLOTHESLINE (R1) beside one, GUNSLINGER VAULT (B) on a diver, SLINGSHOT (L1) on a full gauge / a parallel blocker;
//   the RAIL (steer hard into the wall at speed), the TUNNEL (LT held into the bench footprint), the RAMP.
//   BASE=http://127.0.0.1:3098 npx tsx scripts/probes/_football-return.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? '/tmp/football-return';
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
p.on('console', (m) => { const t = m.text(); if (/\[FB-RETURN\]|\[FB-JUICE\]/.test(t)) logs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/football?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.football && window.__FEL_DEV__.hero && window.__FEL_DEV__.hero())`)) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
// the seam appears in load(), before START: the bridge's start() is the handshake (see _hoops-synergy.mts)
console.log('start:', await p.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; const ok = await a.start(20000); return JSON.stringify({ ok, state: a.state().state }); })()`));
await p.evaluate(`(() => { const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: window.__PAD }); window.dispatchEvent(ev); })()`);
const ev = (code: string) => p.evaluate(code);
const btn = (i: number, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; bt.touched = ${down}; window.__PAD.timestamp = Date.now(); })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const tap = async (i: number) => { await btn(i, true); await p.waitForTimeout(60); await btn(i, false); };
const seam = () => ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.football.state())`).then((s) => JSON.parse(s as string));
const A = 0, B = 1, L1 = 4, R1 = 5, LT = 6;

// ── THE CATCH: wait for this drive's kick and tap A as it lands ──
async function catchKick(label: string): Promise<boolean> {
  let t0 = Date.now(); let armed = false;
  while (Date.now() - t0 < 12000) {
    const st = await seam();
    if (st.ended) return false;
    if (st.kickK >= 0 && !st.kickCaught) armed = true;
    if (armed && st.kickCaught) { console.log(`  ${label}: caught — catches ${st.catches} perfect ${st.perfect} vz ${st.vz.toFixed(1)}`); return true; }
    if (armed && st.kickK >= 0.93 && st.kickK < 1) { await tap(A); await p.waitForTimeout(350); }
    await p.waitForTimeout(16);
  }
  console.log(`  ${label}: no kick`); return false;
}
/** Run until the play ends (a tackle, a touchdown, a lost fumble). `steer` picks the stick each tick. */
async function runPlay(label: string, ms: number, steer: (st: any) => [number, number], verbs: boolean): Promise<any> {
  const t0 = Date.now(); let lastTap = 0; const seen = new Set<string>();
  while (Date.now() - t0 < ms) {
    const st = await seam();
    if (st.ended || st.downed || st.preSnap || (st.kickK >= 0 && !st.kickCaught)) { console.log(`  ${label}: play over at t ${((Date.now() - t0) / 1000).toFixed(1)} z ${st.z.toFixed(1)} downed ${st.downed}`); await setL(0, 0); return st; }
    const [x, y] = steer(st); await setL(x, y);
    const now = Date.now();
    if (verbs && now - lastTap > 250) {
      if (st.gunsling && !st.vault) { await tap(B); lastTap = now; seen.add('B on diver'); }
      else if (st.hurdleReady) { await tap(A); lastTap = now; seen.add('A on downed'); }
      else if (st.stiffReady) { await tap(R1); lastTap = now; seen.add('R1 beside'); }
      else if ((st.gauge >= 100 || st.parallel) && st.slingCool === 0) { await tap(L1); lastTap = now; seen.add('L1'); }
    }
    await p.waitForTimeout(25);
  }
  await setL(0, 0);
  const st = await seam(); console.log(`  ${label}: taps ${[...seen].join(', ') || 'none'} · z ${st.z.toFixed(1)}`); return st;
}

console.log('drive 1: the catch and the gauntlet');
if (await catchKick('drive 1')) {
  const st1 = await runPlay('gauntlet', 12000, () => [0, -1], true);
  console.log(`  engages ${st1.engages} catapults ${st1.catapults} stiffs ${st1.stiffs} vaults ${st1.vaults} slings ${st1.slings} pounces ${st1.pounces} fumbles ${st1.fumbles} ramps ${st1.ramps} gauge ${st1.gauge.toFixed(0)}`);
  await p.screenshot({ path: `${OUT}/run.png` });
}
// the drive may go on (a tackle = a SET, snap it and keep running) until the next kick
for (let i = 0; i < 6; i++) { let s0 = await seam(); for (let w = 0; w < 30 && !s0.ended && s0.downed; w++) { await p.waitForTimeout(100); s0 = await seam(); } if (s0.ended || (s0.kickK >= 0 && !s0.kickCaught)) break; if (s0.preSnap) { await ev('window.__FEL_DEV__.scene.metadata.football.snapNow()'); await p.waitForTimeout(150); } await runPlay('drive 1 cont.', 9000, () => [0, -1], true); }

console.log('drive 2: the catch, then hard for the right wall (the RAIL)');
if (await catchKick('drive 2')) {
  await ev('window.__FEL_DEV__.scene.metadata.football.place(17.6, 3)');
  const st2 = await runPlay('rail', 9000, (st) => [st.rails === 0 ? 1 : 0, -1], false);
  console.log(`  rails ${st2.rails} outOfBounds ${st2.outOfBounds} lane ${st2.lane} x ${st2.x.toFixed(1)} y ${st2.y.toFixed(2)}`);
  await p.screenshot({ path: `${OUT}/rail.png` });
}
for (let i = 0; i < 6; i++) { let s0 = await seam(); for (let w = 0; w < 30 && !s0.ended && s0.downed; w++) { await p.waitForTimeout(100); s0 = await seam(); } if (s0.ended || (s0.kickK >= 0 && !s0.kickCaught)) break; if (s0.preSnap) { await ev('window.__FEL_DEV__.scene.metadata.football.snapNow()'); await p.waitForTimeout(150); } await runPlay('drive 2 cont.', 9000, () => [0, -1], false); }

console.log('drive 3: the catch, LT held, into the right bench (the TUNNEL)');
if (await catchKick('drive 3')) {
  await btn(LT, true);
  await ev('window.__FEL_DEV__.scene.metadata.football.place(16.5, 14)');
  const st3 = await runPlay('tunnel', 11000, (st) => [Math.max(-1, Math.min(1, (16.5 - st.x) / 3)), -1], false);
  console.log(`  tunnels ${st3.tunnels} bonks ${st3.bonks} lane ${st3.lane} x ${st3.x.toFixed(1)} z ${st3.z.toFixed(1)}`);
  await p.screenshot({ path: `${OUT}/tunnel.png` }); await btn(LT, false);
}

const stEnd = await seam(); const st = stEnd;
console.log('return:', JSON.stringify({ catches: st.catches, perfect: st.perfect, engages: st.engages, catapults: st.catapults, vaults: st.vaults, slings: st.slings, stiffs: st.stiffs, rails: st.rails, ramps: st.ramps, tunnels: st.tunnels, bonks: st.bonks, pounces: st.pounces, fumbles: st.fumbles, recovered: st.recovered, outOfBounds: st.outOfBounds, score: st.score }));
console.log('logs:\n  ' + logs.join('\n  '));
await b.close();
