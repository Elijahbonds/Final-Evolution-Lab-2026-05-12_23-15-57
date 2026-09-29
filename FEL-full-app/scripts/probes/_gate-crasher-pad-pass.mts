// GATE-CRASHER-POLISH-2 pad pass (2026-09-28) — Gate Crasher played with a GAMEPAD through the shipping board host
// (/dev/body/snowboard_slalom: makeBoardHost, its real HUD and boost gauge, the harness, InputBus reading navigator.getGamepads()
// every frame). The pad is the Gamepad API's own object (a standard-mapping pad, as a DualSense / Xbox pad reports), so every
// press takes the road a real thumb's does: pollPads → the profile → the bus → the mode. Each press is logged with what the
// game did about it. Then the run is driven to the finish and the end result read (window.__DEV_END: the headline the card
// shows), and the headline laid out in GameShell's exact card classes on this page's CSS to count its lines (GC-11).
//
//   PORT=3100 OUT=<dir> npx tsx scripts/probes/_gate-crasher-pad-pass.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3100';
const OUT = process.env.OUT ?? '/tmp/gc2-pad';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad, null, null, null];
  });
  const logs: { t: number; s: string }[] = [];
  const t00 = Date.now();
  p.on('console', (m) => { const s = m.text(); if (/SNOW-|BOARD-LAND|\[dev\] end|REFUS|error/i.test(s) && !/401/.test(s)) logs.push({ t: (Date.now() - t00) / 1000, s: s.slice(0, 240) }); });
  p.on('pageerror', (e) => logs.push({ t: (Date.now() - t00) / 1000, s: 'PAGEERROR ' + String(e).slice(0, 200) }));
  await p.goto(`http://127.0.0.1:${PORT}/dev/body/snowboard_slalom`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => document.getElementById('fel-ready')?.dataset.state === 'loaded' && !!(window as any).__FEL_DEV__?.snow, null, { timeout: 300000, polling: 300 });
  await p.waitForTimeout(1200);
  const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, LT: 6, RT: 7, SELECT: 8, START: 9 };
  const set = (i: number, down: boolean, v = 1) => p.evaluate(([i, d, v]) => { const g = (window as any).__PAD; g.buttons[i as number] = { pressed: !!d, touched: !!d, value: d ? v : 0 }; g.timestamp = Date.now(); }, [i, down, v] as const);
  const stick = (x: number, y: number) => p.evaluate(([x, y]) => { const g = (window as any).__PAD; g.axes[0] = x; g.axes[1] = y; g.timestamp = Date.now(); }, [x, y]);
  const q = () => p.evaluate(() => { const w = window as any; const s = w.__FEL_DEV__.snow(); const hud = document.body.innerText.replace(/\s+/g, ' '); return { ...s, hudBoost: (document.querySelector('[data-testid="boost-gauge"]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') ?? null, hud: hud.slice(0, 300) }; });
  const presses: any[] = [];
  const note = async (what: string, act: () => Promise<void>, look: (a: any, b: any) => string, waitMs = 250) => {
    const a = await q(); await act(); await p.waitForTimeout(waitMs); const b = await q();
    const row = { what, did: look(a, b) }; presses.push(row); console.log(`${what} → ${row.did}`);
  };
  const tap = async (n: string, ms = 80) => { await set(BTN[n], true); await p.waitForTimeout(ms); await set(BTN[n], false); };
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const steerTo = async (s: any, tuck = true) => { const want = Math.max(-0.55, Math.min(0.55, Math.atan2(s.gate.x - s.pos.x, Math.max(1, s.gate.z - s.pos.z)))); await stick(Math.max(-1, Math.min(1, wrap(want - s.rot.y) * 2.5)), -0.6); await set(BTN.RT, tuck, 1); };
  await p.screenshot({ path: `${OUT}/pad-00-splash.png` });

  await note('START (the READY card)', () => tap('START'), (_a, b) => `playing: clock ${b.elapsed.toFixed(2)} s`, 900);
  await note('RT held 2 s (tuck)', async () => { await set(BTN.RT, true, 1); await p.waitForTimeout(2000); }, (a, b) => `speed ${a.speed.toFixed(1)} → ${b.speed.toFixed(1)} m/s, tuck ${b.tuck}`, 10);
  await note('L stick right 0.8 for 0.5 s', async () => { await stick(0.8, 0); await p.waitForTimeout(500); await stick(0, 0); }, (a, b) => `heading ${a.rot.y.toFixed(2)} → ${b.rot.y.toFixed(2)} rad, roll ${(Math.abs(a.bank) * 57.3).toFixed(0)}° → peak in carve`, 10);
  // the stick back the other way until the board points down the fall line again (a player straightens up before a trick)
  for (let i = 0; i < 80; i++) { const s = await q(); if (Math.abs(s.rot.y) < 0.06) break; await stick(Math.max(-1, Math.min(1, -s.rot.y * 2.5)), 0); await p.waitForTimeout(25); }
  await stick(0, 0);
  await set(BTN.RT, false);
  await p.waitForTimeout(600);
  await note('A (jump)', () => tap('A'), (a, b) => `grounded ${a.grounded} → ${b.grounded}, air left ${b.airLeft?.toFixed(2)} s`, 150);
  await note('X held 0.3 s in the air (grab)', async () => { await set(BTN.X, true); await p.waitForTimeout(300); }, (_a, b) => `grab shown (clip board_grab via the tree), banner in HUD: ${/INDY|METHOD|STALEFISH|TAIL/.test(b.hud) ? 'yes' : 'no'}`, 10);
  await set(BTN.X, false);
  for (let i = 0; i < 60; i++) { if ((await q()).grounded) break; await p.waitForTimeout(40); }
  await p.waitForTimeout(700);
  await note('A, then Y + stick right at once (a spin with the whole air)', async () => { await tap('A'); await p.waitForTimeout(90); await stick(0.9, 0); await tap('Y'); await stick(0, 0); }, (_a, b) => `airborne ${!b.grounded}, air left at press ~${b.airLeft?.toFixed(2)} s, note "${b.trickNote}"`, 120);
  await p.screenshot({ path: `${OUT}/pad-01-spin.png` });
  for (let i = 0; i < 80; i++) { if ((await q()).grounded) break; await p.waitForTimeout(40); }
  await p.waitForTimeout(700);
  for (let i = 0; i < 80; i++) { const s = await q(); if (Math.abs(s.rot.y) < 0.06) break; await stick(Math.max(-1, Math.min(1, -s.rot.y * 2.5)), 0); await p.waitForTimeout(25); }
  await stick(0, 0);
  await note('A, then Y + stick right LATE (≈0.3 s of air left)', async () => {
    await tap('A');
    for (let i = 0; i < 80; i++) { const s = await q(); if (s.grounded || (s.airLeft ?? 9) < 0.32) break; await p.waitForTimeout(15); }
    await stick(0.9, 0); await tap('Y'); await stick(0, 0);
  }, (_a, b) => `note "${b.trickNote}" (refused: the landing is clean, no bail)`, 100);
  for (let i = 0; i < 80; i++) { if ((await q()).grounded) break; await p.waitForTimeout(40); }
  await p.waitForTimeout(500);
  await note('R1 held 1.2 s (boost)', async () => { await set(BTN.R1, true); await p.waitForTimeout(1200); }, (a, b) => `boost gauge "${a.hudBoost}" → "${b.hudBoost}", speed ${a.speed.toFixed(1)} → ${b.speed.toFixed(1)}`, 10);
  await set(BTN.R1, false);
  await note('START mid-run (pause)', () => tap('START'), (a, b) => `clock ${a.elapsed.toFixed(1)} → ${b.elapsed.toFixed(1)} after 0.6 s (${Math.abs(b.elapsed - a.elapsed) < 0.05 ? 'paused' : 'still running'}), card: ${/PAUSED/.test(b.hud) ? 'PAUSED — TAP TO RESUME' : '—'}`, 600);
  await note('A while paused (resume)', () => tap('A'), (a, b) => `clock ${a.elapsed.toFixed(1)} → ${b.elapsed.toFixed(1)} (${b.elapsed > a.elapsed ? 'resumed' : 'still paused'})`, 600);
  // the HUD as a player sees it: the dev-only readout panels hidden for the picture (they cover the clock chip)
  await p.evaluate(() => { for (const el of Array.from(document.querySelectorAll('div, pre'))) { const t = (el as HTMLElement).innerText ?? ''; if (/^\s*\d+ fps/.test(t) && (el as HTMLElement).children.length < 12) (el as HTMLElement).style.display = 'none'; } });
  const parChip = await p.evaluate(() => Array.from(document.querySelectorAll('.fel-panel')).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).find((t) => /PAR/.test(t)) ?? null);
  console.log(`HUD clock chip → "${parChip}"`);
  presses.push({ what: 'HUD clock chip (read)', did: parChip });
  await p.screenshot({ path: `${OUT}/pad-02-hud.png` });
  // the rest of the run: steer at the gates with tuck, a jump over the next rock if one is dead ahead
  const t0 = Date.now(); let jumps = 0;
  while (Date.now() - t0 < 90000) {
    const s = await q();
    if (s.ended || !s.gate) break;
    await steerTo(s, s.gate.z - s.pos.z > 20);
    await p.waitForTimeout(30);
  }
  await set(BTN.RT, false); await stick(0, 0);
  for (let i = 0; i < 200; i++) { const s = await q(); if (s.ended) break; await set(BTN.RT, true, 1); await p.waitForTimeout(50); }
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/pad-03-end.png` });
  const end = await p.evaluate(() => (window as any).__DEV_END ?? null);
  // GC-11: the headline in GameShell's end-card markup and classes (components/games/game-shell.tsx), on this page's CSS
  const card = end ? await p.evaluate((h) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);padding:0 16px';
    wrap.innerHTML = `<div class="fel-panel w-full max-w-md rounded-2xl p-7 text-center"><h2 class="fel-heading mt-3 text-4xl font-bold text-white" id="gc-title"></h2><p class="mt-1 font-mono text-sm text-white/50">Score —</p></div>`;
    document.body.appendChild(wrap);
    const h2 = wrap.querySelector('#gc-title') as HTMLElement; h2.textContent = h;
    const lh = parseFloat(getComputedStyle(h2).lineHeight) || parseFloat(getComputedStyle(h2).fontSize) * 1.2;
    return { headline: h, height: h2.getBoundingClientRect().height, lineHeight: lh, lines: Math.round(h2.getBoundingClientRect().height / lh), font: getComputedStyle(h2).fontFamily.slice(0, 60) };
  }, end.headline) : null;
  if (card) await p.screenshot({ path: `${OUT}/pad-04-endcard-title.png` });
  // the eye's old headline, same layout, for the before
  const old = end ? await p.evaluate((st: any) => {
    const h2 = document.getElementById('gc-title') as HTMLElement;
    h2.textContent = `GATE CRASHER · ${st.gatesHit}/${st.gates} GATES · +0 TIME · ${st.tricksLanded} TRICKS · x${st.bestCombo ?? 1} BEST`;
    const lh = parseFloat(getComputedStyle(h2).lineHeight) || parseFloat(getComputedStyle(h2).fontSize) * 1.2;
    return { headline: h2.textContent, lines: Math.round(h2.getBoundingClientRect().height / lh) };
  }, end.stats) : null;
  if (old) await p.screenshot({ path: `${OUT}/pad-04b-endcard-title-OLD.png` });
  await browser.close();
  const summary = { presses, end, card, oldHeadlineLayout: old, logs: logs.slice(0, 120) };
  fs.writeFileSync(`${OUT}/summary-pad.json`, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ end: end && { headline: end.headline, score: end.score, stats: end.stats }, card, old }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
