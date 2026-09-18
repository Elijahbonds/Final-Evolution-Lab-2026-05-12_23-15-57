// FREE RUN PARKOUR probe (2026-09-15) — /dev/mode/freerun through a FAKE Gamepad with an in-page AUTOPILOT: it runs the low
// line, steers onto each vault box, presses A at the box (VAULT), A at each gap edge, B at the bar (SLIDE), and records
// every clip the hero plays. It screenshots the frames just after a captured parkour move (pk_*) starts, so the sheet
// shows whether the vault and the underbar read as the real moves.
//   env: BASE, OUT, TAG, SECS (run length, default 16)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const OUT = process.env.OUT ?? './shots'; const TAG = process.env.TAG ?? 'fr';
const SECS = Number(process.env.SECS ?? 16);
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
p.on('console', (m) => { const t = m.text(); if (/MISSING CLIP/.test(t) || (m.type() === 'error' && !/401|FEL-FRAME/.test(t))) errs.push(t.slice(0, 160)); });
await p.goto(`${BASE}/dev/mode/freerun`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 240000 });
const ready = () => p.evaluate(() => { const s = (window as any).__FEL_DEV__?.scene; return !!s && s.meshes.some((m: any) => /^fr_vault_/.test(m.name)) && !!(window as any).__FEL_DEV__?.hero?.(); });
for (let i = 0; i < 160; i++) {
  if (await ready()) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1000);
}
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
})()`);
await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene, pad = window.__PAD;
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const under = (n, root) => { for (let c = n; c; c = c.parent) if (c === root) return true; return false; };
  const pieces = s.meshes.filter((m) => m.metadata && m.metadata.freerun).map((m) => ({ kind: m.metadata.freerun, x: m.position.x, z: m.position.z, w: m.getBoundingInfo().boundingBox.extendSize.x * 2, d: m.getBoundingInfo().boundingBox.extendSize.z * 2 }));
  const hold = {};   // btn index -> frames left
  const tapBtn = (i) => { if (hold[i] === undefined || hold[i] < -20 || (i === 1 && hold[i] === -30)) { hold[i] = 4; pad.buttons[i].pressed = true; pad.buttons[i].value = 1; window.__FR.presses.push({ t: performance.now(), btn: i }); } };
  let sgn = 1, lastX = null, lastCmd = 0, done = new Set();
  window.__FR = { rows: [], presses: [], starts: [], shotAt: [], drive: false };
  let prevTop = '';
  s.onAfterRenderObservable.add(() => {
    for (const k of Object.keys(hold)) { hold[k]--; if (hold[k] === 0) { pad.buttons[k].pressed = false; pad.buttons[k].value = 0; } }
    const h = window.__FEL_DEV__.hero(); if (!h) return; const hr = topOf(h); const q = hr.getAbsolutePosition();
    if (!window.__FR.drive) { const c = s.activeCamera; window.__FR.rows.push({ t: performance.now(), x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2), cam: [+c.position.x.toFixed(1), +c.position.y.toFixed(1), +c.position.z.toFixed(1)], pre: 1, ban: ((document.body.innerText.match(/"banner":\s*"([^"]*)"/) || [])[1] || '') }); return; }
    // steer: onto the next vault box ahead, else the centre line
    const vault = pieces.filter((v) => v.kind === 'vault' && v.z - q.z > -0.2 && v.z - q.z < 9).sort((a, b) => a.z - b.z)[0];
    const tx = vault ? Math.max(-2.5, Math.min(2.5, vault.x)) : 0;
    if (lastX !== null && Math.abs(lastCmd) > 0.2 && Math.abs(q.x - lastX) > 0.004 && Math.sign(q.x - lastX) !== Math.sign(lastCmd * sgn)) sgn = -sgn;
    const cmd = Math.max(-0.6, Math.min(0.6, (tx - q.x) * 0.5));
    pad.axes[0] = ${process.env.STEER === '0' ? 0 : 1} * cmd * sgn; pad.axes[1] = -1; lastX = q.x; lastCmd = cmd;
    // beats
    for (const [i, pc] of pieces.entries()) {
      const dz = pc.z - pc.d / 2 - q.z; const inX = Math.abs(q.x - pc.x) < pc.w / 2 - 0.2;
      if (done.has(i) && pc.z - q.z > 3) done.delete(i);
      if (done.has(i)) continue;
      if (pc.kind === 'vault' && inX && dz > 0 && dz < 1.3) { tapBtn(0); done.add(i); }
      // a gap has no mesh: it is where one ground slab ends short of the next — jump at the slab's far edge
      if (pc.kind === 'ground') { const end = pc.z + pc.d / 2 - q.z; const nextStarts = pieces.some((g) => g.kind === 'ground' && Math.abs(g.z - g.d / 2 - (pc.z + pc.d / 2)) < 0.05);
        if (!nextStarts && end > 0 && end < 0.9 && q.y > -0.3) tapBtn(0); }
      if (pc.kind === 'bar' && dz > -0.3 && dz < 1.9 && q.y < 0.2 && (hold[1] === undefined || hold[1] < -8)) { hold[1] = -30; tapBtn(1); }   // on the ground, re-pressed through the approach: SLIDE is gated on run speed
    }
    const shots = s.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && under(g.targetedAnimations[0].target, hr))
      .map((g) => { const a = g.animatables && g.animatables[0]; return [g.name, a ? +(a.weight < 0 ? 1 : a.weight).toFixed(2) : 1]; }).sort((a, b) => b[1] - a[1]);
    const pk = shots.find((x) => /^pk_/.test(x[0]) && x[1] >= 0.3);
    const top = pk ? pk[0] : (shots[0] ? shots[0][0] : '');
    if (top !== prevTop) { window.__FR.starts.push({ t: performance.now(), clip: top, x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2) }); if (pk) window.__FR.shotAt.push({ t: performance.now(), clip: pk[0], n: 0 }); }
    prevTop = top;
    { const c = s.activeCamera; const fd = c.getDirection(new c.position.constructor(0, 0, 1)); window.__FR.rows.push({ t: performance.now(), x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2), cam: [+c.position.x.toFixed(1), +c.position.y.toFixed(1), +c.position.z.toFixed(1)], fwd: [+fd.x.toFixed(2), +fd.z.toFixed(2)], ax: [pad.axes[0], pad.axes[1]], yaw: +(hr.rotation.y * 57.3).toFixed(0), aim: (() => { const a = window.__FEL_DEV__.runPosture && window.__FEL_DEV__.runPosture.aim(); return a ? [+((a.x - q.x) / 8).toFixed(2), +((a.z - q.z) / 8).toFixed(2)] : null; })() }); }
    if (window.__FR.rows.length > 20000) window.__FR.rows.shift();
  });
})()`);
// the pick screen (recorded, not driven): any face button begins the run
for (let i = 0; i < 3; i++) {
  await p.evaluate(`(() => { const bt = window.__PAD.buttons[0]; bt.pressed = true; bt.value = 1; })()`); await p.waitForTimeout(90);
  await p.evaluate(`(() => { const bt = window.__PAD.buttons[0]; bt.pressed = false; bt.value = 0; })()`); await p.waitForTimeout(900);
}
await p.evaluate(`window.__FR.drive = true`);
const T = Date.now(); let shot = 0; let lastShotN = 0;
while (Date.now() - T < SECS * 1000) {
  const n = await p.evaluate(`window.__FR.shotAt.length`) as number;
  if (n > lastShotN) {
    const clip = await p.evaluate(`window.__FR.shotAt[${n - 1}].clip`) as string;
    lastShotN = n;
    for (const ms of [120, 260, 260]) { await p.waitForTimeout(ms); await p.screenshot({ path: `${OUT}/${TAG}-${String(++shot).padStart(2, '0')}-${clip}.png` }); }
  }
  await p.waitForTimeout(30);
}
const data = await p.evaluate(`window.__FR`) as { rows: { t: number; x: number; y: number; z: number }[]; presses: { t: number; btn: number }[]; starts: { t: number; clip: string; x: number; y: number; z: number }[] };
const hud = await p.evaluate(() => document.body.innerText.slice(0, 400));
await b.close();
fs.writeFileSync(`${OUT}/${TAG}-rows.json`, JSON.stringify(data));
const T0 = data.rows[0]?.t ?? 0; const f = (t: number) => ((t - T0) / 1000).toFixed(2);
const last = data.rows[data.rows.length - 1];
console.log(`frames ${data.rows.length} · errors ${errs.length} ${errs.slice(0, 3).join(' | ')} · reached z ${last?.z}`);
console.log(`presses: ${data.presses.map((q) => `${f(q.t)} ${['A', 'B'][q.btn]}`).join(' · ')}`);
console.log(`clip changes: ${data.starts.map((s) => `${f(s.t)} ${s.clip}@z${s.z},y${s.y}`).join(' · ')}`);
console.log(`hud: ${hud.replace(/\s+/g, ' ').slice(0, 200)}`);
