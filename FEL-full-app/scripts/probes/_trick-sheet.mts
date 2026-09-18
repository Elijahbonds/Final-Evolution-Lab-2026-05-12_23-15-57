// _trick-sheet — the board tricks as a player sees them (TRICK POSE, 2026-09-15). Dev skate: for each named trick, crouch,
// pop, hold the trick's direction, press its button (held for grabs), and photograph the rider at 3 moments through the
// air with the gameplay camera, cropped on the rider. One labelled sheet out.
//   BASE=http://127.0.0.1:3098 TAG=v1 npx tsx scripts/probes/_trick-sheet.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const TAG = process.env.TAG ?? 'run';
const MODE = process.env.MODE ?? 'skateboard';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/moves/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const IDX: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, RT: 7 };
const AX: Record<string, [number, number]> = { none: [0, 0], up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const TRICKS: [string, string, string, number][] = (process.env.TRICKS ?? 'OLLIE:none:A:90,KICKFLIP:left:A:90,HEELFLIP:right:A:90,SHUV-IT:down:A:90,360 FLIP:down:B:90,INDY:up:B:700,MELON:left:B:700,JAPAN:up:Y:700,FRONTSIDE 360:right:Y:90,540:left:Y:90')
  .split(',').map((s) => { const [n, d, b, h] = s.split(':'); return [n, d, b, Number(h)]; });
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--window-size=1100,760'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
  (() => { const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null]; })();` });
const p = await ctx.newPage();
const errs: string[] = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(`${BASE}/dev/mode/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500); await p.keyboard.press('Space'); await p.waitForTimeout(3500);
await p.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
const pad = (js: string) => p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`);
const heroScreen = () => p.evaluate(() => {
  const W = window as any; const s = W.__FEL_DEV__.scene; const h = W.__FEL_DEV__.hero(); const eng = s.getEngine();
  const V = h.position.constructor; const M = s.getTransformMatrix().constructor;
  const at = h.getAbsolutePosition().add(new V(0, 0.9, 0));
  const vp = s.activeCamera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight());
  const q = V.Project(at, M.Identity(), s.getTransformMatrix(), vp);
  const r = eng.getRenderWidth() / (eng.getRenderingCanvas().clientWidth || 1);
  const trick = W.__FEL_DEV__.skate?.() ?? null;
  return { x: q.x / r, y: q.y / r, grounded: trick ? trick.grounded ?? null : null };
});
const rows: { name: string; shots: { file: string; x: number; y: number }[]; note: string }[] = [];
for (const [name, dir, btn, hold] of TRICKS) {
  await pad(`p.axes[0] = 0; p.axes[1] = -0.6`);            // roll forward
  await p.waitForTimeout(900);
  await pad(`p.axes[1] = 0; p.buttons[${IDX.RT}].pressed = true; p.buttons[${IDX.RT}].value = 1`);
  await p.waitForTimeout(520);
  // skate pops on the crouch's RELEASE; snow jumps on A with the tuck still held (CROUCH_HOLD=1) for the biggest air
  if (process.env.CROUCH_HOLD === '1') await pad(`p.buttons[0].pressed = true; p.buttons[0].value = 1`);
  else await pad(`p.buttons[${IDX.RT}].pressed = false; p.buttons[${IDX.RT}].value = 0; p.buttons[0].pressed = true; p.buttons[0].value = 1`);
  await p.waitForTimeout(70);
  await pad(`p.buttons[0].pressed = false; p.buttons[0].value = 0; p.buttons[${IDX.RT}].pressed = false; p.buttons[${IDX.RT}].value = 0`);
  await p.waitForTimeout(110);
  const [ax, ay] = AX[dir];
  await pad(`p.axes[0] = ${ax}; p.axes[1] = ${ay}; p.buttons[${IDX[btn]}].pressed = true; p.buttons[${IDX[btn]}].value = 1`);
  const shots: { file: string; x: number; y: number }[] = [];
  const tPress = Date.now();
  for (const at of (process.env.AT ?? '140,300,480').split(',').map(Number)) {
    while (Date.now() - tPress < at) await p.waitForTimeout(10);
    if (Date.now() - tPress > hold) await pad(`p.buttons[${IDX[btn]}].pressed = false; p.buttons[${IDX[btn]}].value = 0`);
    const hs = await heroScreen();
    const file = `${OUT}/trick-${name.replace(/\W+/g, '_')}-${at}.png`;
    await p.screenshot({ path: file });
    shots.push({ file, x: hs.x, y: hs.y });
  }
  await pad(`p.buttons[${IDX[btn]}].pressed = false; p.buttons[${IDX[btn]}].value = 0; p.axes[0] = 0; p.axes[1] = 0`);
  const hud = await p.evaluate(() => (window as any).__FEL_QA__?.hud?.()?.banner ?? '');
  rows.push({ name, shots, note: String(hud) });
  await p.waitForTimeout(1600);
}
const sheet = await ctx.newPage();
const img = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
const cell = (s: { file: string; x: number; y: number }) => `<div style="width:240px;height:240px;overflow:hidden;position:relative;background:#000"><img src="${img(s.file)}" style="position:absolute;left:${120 - s.x}px;top:${130 - s.y}px"></div>`;
for (let i = 0; i < rows.length; i += 5) {
  await sheet.setViewportSize({ width: 1100, height: Math.min(5, rows.length - i) * 248 });
  await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:15px monospace">${rows.slice(i, i + 5).map((r) => `<div style="display:flex;gap:4px;align-items:center;padding:4px">${r.shots.map(cell).join('')}<div style="padding:10px">${r.name}<br><span style="color:#888">+${process.env.AT ?? '140,300,480'} ms</span></div></div>`).join('')}</body>`);
  await sheet.screenshot({ path: `${OUT}/TRICKS-${MODE}-${Math.floor(i / 5) + 1}.png` });
}
for (const r of rows) for (const s of r.shots) fs.unlinkSync(s.file);
console.log(JSON.stringify({ errors: errs, rows: rows.map((r) => r.name) }));
await b.close();
