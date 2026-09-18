// THE-HUNDRED-COMBAT-DYNAMICS probe (2026-09-14) — /dev/mode/karate (The Hundred) through a FAKE Gamepad, sampled on
// every rendered frame. What it measures, from the outside (so the same script reads the base and the change):
//   · PRESS → CLIP: for each button press, the ms until a strike one-shot (re)starts on the hero at weight ≥ 0.5 — a
//     press that never produced a swing inside 900 ms is EATEN.
//   · GROUND SPEED on a held stick, and the time a 180° stick reversal takes to turn the body 150°.
//   · the mode's dev telemetry (scene.metadata.karateNeo) at the end, and every change of its counters over the run.
// SCRIPT = ';' list: wait:<ms> | L:<x>,<y>:<ms> | Lset:<x>,<y> | tap:<btn> | down:<btn> | up:<btn> | mash:<btn>:<n>:<gapMs>
//                    | seq:<btn>,<btn>,..:<gapMs> | near:<m>:<ms> (wait until an agent is within m) | shot:<name> | mark:<label>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = process.env.OUT ?? './shots'; const TAG = process.env.TAG ?? 'hundred';
const SCRIPT = (process.env.SCRIPT ?? 'wait:3000').split(';').map((s) => s.trim()).filter(Boolean);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = []; const logs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
p.on('console', (m) => { const t = m.text(); if (/MISSING CLIP/.test(t) || m.type() === 'error' && !/401|FEL-FRAME/.test(t)) errs.push(t.slice(0, 160)); if (/\[KE-|\[KVS-|\[MC-/.test(t)) logs.push(t.slice(0, 160)); });
const MODE = process.env.MODE ?? 'karate';   // STORM: the same probe drives karate (Endless), karate_vs and mixedcombat
await p.goto(`${BASE}/dev/mode/${MODE}${process.env.QS ?? ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 240000 });
for (let i = 0; i < 120; i++) {
  if (await p.evaluate(() => !!((window as any).__FEL_DEV__?.scene?.metadata?.karateNeo) || (!!(window as any).__FEL_DEV__?.hero && !!(window as any).__FEL_DEV__.hero()))) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1500);
}
// the first load compiles for minutes while the mode already fights — reload once so the run starts on a fresh wave 1
await p.reload({ waitUntil: 'domcontentloaded' });
for (let i = 0; i < 120; i++) {
  if (await p.evaluate(() => !!((window as any).__FEL_DEV__?.scene?.metadata?.karateNeo) || (!!(window as any).__FEL_DEV__?.hero && !!(window as any).__FEL_DEV__.hero()))) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(500);
}
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  const s = window.__FEL_DEV__.scene;
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const under = (n, root) => { for (let c = n; c; c = c.parent) if (c === root) return true; return false; };
  const LOOP = /guard|stance|step|shuffle|run|walk|idle|block|floor|windup/;
  window.__HD = { rows: [], marks: [] };
  s.onAfterRenderObservable.add(() => {
    const h = window.__FEL_DEV__.hero(); if (!h) return; const hr = topOf(h);
    const shots = s.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && under(g.targetedAnimations[0].target, hr) && !LOOP.test(g.name))
      .map((g) => { const a = g.animatables && g.animatables[0]; return [g.name, a ? +(a.weight < 0 ? 1 : a.weight).toFixed(2) : 1, a ? +a.masterFrame.toFixed(1) : 0]; });
    const rp = hr.getAbsolutePosition(); const md = s.metadata && s.metadata.karateNeo;
    window.__HD.rows.push({ t: performance.now(), x: +rp.x.toFixed(3), z: +rp.z.toFixed(3), yaw: +(hr.rotation.y * 180 / Math.PI).toFixed(1), shots, tele: md ? JSON.parse(JSON.stringify(md)) : null, ban: ((document.body.innerText.match(/"banner":\s*"([^"]*)"/) || [])[1] || '') });
    if (window.__HD.rows.length > 20000) window.__HD.rows.shift();
  });
})()`);
const ev = (code: string) => p.evaluate(code);
const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7 };
const press = (n: string, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${BTN[n]}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const mark = (label: string) => ev(`window.__HD.marks.push({ t: performance.now(), label: ${JSON.stringify(label)} })`);
const tap = async (n: string) => { await mark(`press:${n}`); await press(n, true); await p.waitForTimeout(60); await press(n, false); };
for (const a of SCRIPT) {
  const [k, ...rest] = a.split(':');
  if (!/^(tap|mash|seq)$/.test(k)) await mark(a);
  if (k === 'wait') await p.waitForTimeout(Number(rest[0]));
  else if (k === 'L') { const [x, y] = rest[0].split(',').map(Number); await setL(x, y); await p.waitForTimeout(Number(rest[1])); await setL(0, 0); }
  else if (k === 'Lset') { const [x, y] = rest[0].split(',').map(Number); await setL(x, y); }
  else if (k === 'tap') await tap(rest[0]);
  else if (k === 'down') { await mark(`press:${rest[0]}`); await press(rest[0], true); }
  else if (k === 'up') await press(rest[0], false);
  else if (k === 'mash') { for (let i = 0; i < Number(rest[1]); i++) { await tap(rest[0]); await p.waitForTimeout(Math.max(0, Number(rest[2]) - 60)); } }
  else if (k === 'seq') { for (const btn of rest[0].split(',')) { await tap(btn); await p.waitForTimeout(Math.max(0, Number(rest[1]) - 60)); } }
  else if (k === 'near') {   // until an agent is within <m> (closing the shop with B if it is open)
    const until = Date.now() + Number(rest[1]);
    while (Date.now() < until) {
      const m = JSON.parse(await ev('JSON.stringify(window.__FEL_DEV__.scene.metadata.karateNeo || {})') as string) as { shop?: boolean; nearestM?: number; aim?: { x: number; z: number } | null; down?: boolean };
      if (m.shop) { await press('B', true); await p.waitForTimeout(60); await press('B', false); await p.waitForTimeout(300); continue; }
      let d = m.nearestM;
      if (d === undefined && m.aim) d = await ev(`(() => { const h = window.__FEL_DEV__.hero(); let c = h; while (c.parent) c = c.parent; const a = window.__FEL_DEV__.scene.metadata.karateNeo.aim; const q = c.getAbsolutePosition(); return Math.hypot(a.x - q.x, a.z - q.z); })()`) as number;
      if (!m.down && d !== undefined && d >= 0 && d <= Number(rest[0])) break;
      await p.waitForTimeout(40);
    }
  }
  else if (k === 'shot') await p.screenshot({ path: `${OUT}/${TAG}-${rest[0]}.png` });
}
type Row = { t: number; x: number; z: number; yaw: number; shots: [string, number, number][]; tele: Record<string, unknown> | null };
const data = await ev('window.__HD') as { rows: Row[]; marks: { t: number; label: string }[] };
await b.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/${TAG}-rows.json`, JSON.stringify(data));
const rows = data.rows; const T0 = rows[0].t; const f = (t: number) => ((t - T0) / 1000).toFixed(2);
// strike starts: a one-shot at weight ≥ 0.5 that is new (name change) or restarted (master frame went back)
const starts: { t: number; clip: string }[] = []; let prev: [string, number, number] | null = null;
for (const r of rows) {
  const top = [...r.shots].sort((a, b) => b[1] - a[1])[0];
  const cur = top && top[1] >= 0.5 ? top : null;
  if (cur && (!prev || prev[0] !== cur[0] || cur[2] + 2 < prev[2])) starts.push({ t: r.t, clip: cur[0] });
  prev = cur;
}
const presses = data.marks.filter((m) => m.label.startsWith('press:') && !/X|L1/.test(m.label));
let eaten = 0; const lat: number[] = []; let si = 0;
for (let i = 0; i < presses.length; i++) {
  const pm = presses[i]; const next = presses[i + 1]?.t ?? Infinity;
  while (si < starts.length && starts[si].t < pm.t) si++;
  const s = starts[si];
  if (s && s.t - pm.t <= 900 && s.t <= next + 900) { lat.push(s.t - pm.t); si++; } else eaten++;
}
console.log(`frames ${rows.length} over ${((rows[rows.length - 1].t - T0) / 1000).toFixed(1)}s · errors ${errs.length} ${errs.slice(0, 3).join(' | ')}`);
console.log(`strike presses ${presses.length} · swings started ${starts.length} · eaten ${eaten} · press→clip ms: ${lat.map((x) => x.toFixed(0)).join(',')}  (median ${lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)].toFixed(0) : '-'})`);
console.log(`swing starts: ${starts.map((s) => `${f(s.t)} ${s.clip}`).join(' · ')}`);
// speed + turn under each L segment
for (const m of data.marks.filter((m) => /^L:|^Lset:/.test(m.label))) {
  const seg = rows.filter((r) => r.t >= m.t + 250 && r.t <= m.t + 700);
  if (seg.length > 2) { const a = seg[0], z = seg[seg.length - 1]; console.log(`   ${f(m.t)} ${m.label}: ground speed ${(Math.hypot(z.x - a.x, z.z - a.z) / ((z.t - a.t) / 1000)).toFixed(2)} m/s`); }
  const y0 = rows.find((r) => r.t >= m.t)?.yaw; if (y0 === undefined) continue;
  { const seg = rows.filter((r) => r.t >= m.t && r.t <= m.t + 900); let span = 0; for (const r of seg) span = Math.max(span, Math.abs(((r.yaw - y0 + 540) % 360) - 180)); console.log(`   ${f(m.t)} ${m.label}: yaw turned up to ${span.toFixed(0)}° inside 0.9 s`); }   // FREE RUN: a fighter apart from the rival turns onto his travel
  const turned = rows.find((r) => r.t >= m.t && Math.abs(((r.yaw - y0 + 540) % 360) - 180) >= 150);
  if (turned) console.log(`   ${f(m.t)} ${m.label}: body turned 150° in ${(turned.t - m.t).toFixed(0)} ms`);
}
// STORM: the dash — the peak ground speed inside 400 ms of each X press (a tap = the dash, a double = the chakra dash)
{ const xs = data.marks.filter((m) => m.label === 'press:X'); const out: string[] = [];
  for (const m of xs) { let peak = 0; const seg = rows.filter((r) => r.t >= m.t && r.t <= m.t + 400); for (let i = 1; i < seg.length; i++) { const dt = (seg[i].t - seg[i - 1].t) / 1000; if (dt > 0) peak = Math.max(peak, Math.hypot(seg[i].x - seg[i - 1].x, seg[i].z - seg[i - 1].z) / dt); } out.push(`${f(m.t)} peak ${peak.toFixed(1)} m/s`); }
  if (out.length) console.log(`dash (X presses): ${out.join(' · ')}`); }
const tel = rows.filter((r) => r.tele);
if (tel.length) {
  const last = tel[tel.length - 1].tele!; const first = tel[0].tele!;
  const nums = Object.keys(last).filter((k) => typeof last[k] === 'number' && typeof first[k] === 'number' && !/^(hp|hpMax|chi|slowMo|timeScale|attackers|enemies|nextLandIn|nearestM|coins)$/.test(k));
  console.log('telemetry deltas:', nums.map((k) => `${k} ${first[k]}→${last[k]}`).filter((s) => !/ (\S+)→\1$/.test(s)).join(' · '));
  if (last.dyn) {
    console.log('dyn last:', JSON.stringify(last.dyn));
    const seen = new Set<string>(); let prevSeq = -1;
    for (const r of tel) { const d = r.tele!.dyn as Record<string, unknown> | undefined; if (d && d.strikeSeq !== prevSeq) { prevSeq = d.strikeSeq as number; seen.add(`${f(r.t)} ${d.lastMove}(${d.string})`); } }
    console.log('moves:', [...seen].join(' · '));
    const bans: string[] = []; let lb = ''; for (const r of rows) { const m = (r.tele && (r.tele as Record<string, unknown>).__ban) as string | undefined; if (m && m !== lb) { bans.push(m); lb = m; } }
  }
  const strs = ['lastString', 'lastMove'].filter((k) => k in last);
  const seen = new Set<string>(); for (const r of tel) for (const k of strs) { const v = String(r.tele![k] ?? ''); if (v) seen.add(`${k}=${v}`); }
  if (seen.size) console.log('moves seen:', [...seen].join(' · '));
}
{ const bl: string[] = []; let lb = ''; for (const r of rows as (Row & { ban?: string })[]) { if (r.ban && r.ban !== lb) bl.push(`${f(r.t)} ${r.ban}`); lb = r.ban ?? ''; } console.log('banners:', bl.join(' · ')); }
if (logs.length) console.log('logs:', logs.slice(-12).join('\n      '));
