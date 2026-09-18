// _race-contact — do the rivals race you, and does touching them do anything? (2026-09-18)
//
// A feedback driver on a fake pad: throttle held, the stick steers at the nearest rival ahead (to bump it), the boost is
// lit when close behind one (to punt it), A fires whatever the balloons gave. Reads the mode's probe seam every tick and
// prints the event counts, the rivals' personalities and lanes, and every [RACE] line.
//
//   BASE=http://127.0.0.1:3098 MODE=velocitykart|aeroaces MAP=<course id> SECS=45 npx tsx scripts/probes/_race-contact.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODE = process.env.MODE ?? 'velocitykart';
const MAP = process.env.MAP ?? '';
const SECS = Number(process.env.SECS ?? 45);
const OUT = process.env.OUT ?? '/tmp/race-contact';
fs.mkdirSync(OUT, { recursive: true });
const SEAM = MODE === 'aeroaces' ? 'aero' : 'kart';

const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const p = await ctx.newPage();
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[RACE\]|\[FEL-KART\]|\[FEL-AERO\]/.test(t)) logs.push(t.slice(0, 160)); });
await p.goto(`${BASE}/dev/mode/${MODE}?agent=1${MAP ? `&map=${MAP}` : ''}${process.env.TIER ? `&tier=${process.env.TIER}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.${SEAM})`)) break;
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
const btn = (i: number, down: boolean, v = down ? 1 : 0) => ev(`(() => { const bt = window.__PAD.buttons[${i}]; bt.value = ${v}; bt.pressed = ${down}; bt.touched = ${down}; })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const seam = () => ev(`JSON.stringify(window.__FEL_DEV__.scene.metadata.${SEAM}.state())`).then((s) => JSON.parse(s as string));
await p.waitForTimeout(1500);
await btn(7, true);   // RT: throttle / gas
const t0 = Date.now(); let ticks = 0; let firedAt = 0; let boostOn = false; let shots = 0;
const seen = new Set<string>();
while (Date.now() - t0 < SECS * 1000) {
  const st = await seam();
  ticks++;
  // the nearest rival ahead inside 40 m: steer to its lane; light the boost inside 12 m
  const ahead = (st.rivals as { gap: number; lateral: number; name: string }[]).filter((r) => r.gap > -3 && r.gap < 40).sort((a, b) => a.gap - b.gap)[0];
  // steer to a lateral target with a heading term (the kart oscillated and left the road on a lateral-only gain)
  const wantLat = ahead ? ahead.lateral : 0;
  let x = 0;
  if (MODE === 'aeroaces') x = Math.max(-1, Math.min(1, (wantLat - st.lateral) * Number(process.env.GAIN ?? 0.2)));
  else { const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a)); const err = wrap((st.tangentYaw ?? 0) - (st.heading ?? 0)); x = Math.max(-1, Math.min(1, err * 1.4 + (wantLat - st.lateral) * Number(process.env.GAIN ?? 0.08))); }
  await setL(MODE === 'aeroaces' ? x : x, MODE === 'aeroaces' ? 0 : 0);
  const wantBoost = !!ahead && ahead.gap < 12 && ahead.gap > 1;
  if (wantBoost !== boostOn) { boostOn = wantBoost; await btn(5, boostOn); }
  if (st.item && Date.now() - firedAt > 1500) { await btn(0, true); await p.waitForTimeout(60); await btn(0, false); firedAt = Date.now(); }
  const key = JSON.stringify(st.events);
  if (!seen.has(key)) { seen.add(key); console.log(`t ${((Date.now() - t0) / 1000).toFixed(1)} place ${st.place} speed ${st.speed} events ${key}`); if (shots < 4) { shots++; await p.screenshot({ path: `${OUT}/${MODE}-${shots}.png` }); } }
  await p.waitForTimeout(90);
}
await btn(7, false); await btn(5, false); await setL(0, 0);
const fin = await seam();
console.log('rivals:', (fin.rivals as { name: string; personality: string; lateral: number; gap: number; stun: number }[]).map((r) => `${r.name}:${r.personality} lane ${r.lateral} gap ${r.gap}`).join(' | '));
console.log('events:', JSON.stringify(fin.events), 'ticks', ticks);
console.log('logs:\n  ' + logs.join('\n  '));
await p.screenshot({ path: `${OUT}/${MODE}-end.png` });
await b.close();
