// _dunk-trick-sheet — the named dunks as a player sees them (owner 2026-09-15: "The animations need to be recognizable on
// sight", extended to dunking). Built on the DUNK-SOFTS-NAMED probe's driver: for each of the ten named air dunks, run,
// launch, hold the trick's d-pad direction and tap its button at +430 ms, slam from +950 ms, and photograph the dunker at
// four moments of the flight with the game camera, cropped on the body. One labelled sheet per five dunks.
//   BASE=http://127.0.0.1:3098 TAG=v1 npx tsx scripts/probes/_dunk-trick-sheet.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const SRC = 'pad' as 'pad' | 'key';
const TAG = process.env.TAG ?? 'run';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/moves/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
type Row = Record<string, unknown>;
type Scenario = { prop: 'none' | 'alleyoop' | 'selflob' | 'car' | 'barrier' | 'crate' };
const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[]; frames: string[] }> {
  const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  if (SRC === 'pad') await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`${BASE}/dev/mode/dunk${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__smp = { rows: [], marks: [] };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|DUNK-CAM|LOB|DUNK-PROP|DUNK-TRICK|HANDS|JUICE-SOFT|FEL-DUNK|PAD)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 160) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 160) }); ow(...a); };
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    let hand = null, lhand = null, shoulder = null, forearm = null, feetL = null, feetR = null, heroSeen = null, ballRef = null;
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); hand = d.find((n) => /^RightHand/.test(n.name)) ?? null; lhand = d.find((n) => /^LeftHand/.test(n.name)) ?? null; shoulder = d.find((n) => /^RightArm/.test(n.name)) ?? null; forearm = d.find((n) => /^RightForeArm/.test(n.name)) ?? null; feetL = d.find((n) => /^LeftFoot/.test(n.name)) ?? null; feetR = d.find((n) => /^RightFoot/.test(n.name)) ?? null; }
      // the game's ball: by name in the live scene, else the 'ball' parented to a hand (a dev double-mount can leave the mode's
      // singleton ball in the disposed scene — gameplay still moves it, the scene list no longer has it); cached once seen
      if (!ballRef || ballRef.isDisposed?.() && !ballRef.parent) { const byName = scene.meshes.find((m) => m.name === 'ball'); ballRef = byName ?? [hand, lhand].filter(Boolean).flatMap((n) => n.getChildren()).find((n) => n.name === 'ball') ?? ballRef; }
      const ball = ballRef;
      const bp = ball ? ball.getAbsolutePosition() : null, hp = hand ? hand.getAbsolutePosition() : null, sp = shoulder ? shoulder.getAbsolutePosition() : null, fp = forearm ? forearm.getAbsolutePosition() : null, cp = scene.activeCamera ? scene.activeCamera.globalPosition : null;
      const fy = Math.min(feetL ? feetL.getAbsolutePosition().y : 9, feetR ? feetR.getAbsolutePosition().y : 9);
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const owner = ball && ball.parent ? (rootOf(ball.parent) === h ? 'hero' : 'other:' + rootOf(ball.parent).name) : '';
      S.rows.push({ t: performance.now(), dt: scene.getEngine().getDeltaTime(), x: h.position.x, y: h.position.y, z: h.position.z, clips, bx: bp ? bp.x : 0, by: bp ? bp.y : 0, bz: bp ? bp.z : 0, hx: hp ? hp.x : 0, hy: hp ? hp.y : 0, hz: hp ? hp.z : 0, sx: sp ? sp.x : 0, sy: sp ? sp.y : 0, sz: sp ? sp.z : 0, fx: fp ? fp.x : 0, fy: fp ? fp.y : 0, fz: fp ? fp.z : 0, cx: cp ? cp.x : 0, cy: cp ? cp.y : 0, cz: cp ? cp.z : 0, feet: fy, parent: ball && ball.parent ? ball.parent.name : '', owner, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), prop: String(hud.prop ?? ''), score: Number(hud.score ?? 0) });
      if (S.rows.length > 30000) S.rows.splice(0, 8000);
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors, frames };
}

// ── the driver: one vocabulary, two sources ──
const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
const BTN_K: Record<Btn, string> = { A: 'j', B: 'k', X: 'l', Y: 'i' }, DPAD_K: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
async function stickUp(p: Page, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.axes[1] = ${on ? -1 : 0}`); else { if (on) await p.keyboard.down('w'); else await p.keyboard.up('w'); } }
async function runHold(p: Page, on: boolean, v = 1): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`); else { if (on) await p.keyboard.down(' '); else await p.keyboard.up(' '); } }
async function btn(p: Page, b: Btn, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`); else { if (on) await p.keyboard.down(BTN_K[b]); else await p.keyboard.up(BTN_K[b]); } }
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
async function dpad(p: Page, d: Dir, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`); else { if (on) await p.keyboard.down(DPAD_K[d]); else await p.keyboard.up(DPAD_K[d]); } }
async function tapDpad(p: Page, d: Dir, ms = 90): Promise<void> { await dpad(p, d, true); await p.waitForTimeout(ms); await dpad(p, d, false); }

const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;
const hudProp = async (p: Page): Promise<string> => p.evaluate(`(() => { try { return JSON.parse(document.querySelector('pre').textContent).prop || ''; } catch { return ''; } })()`) as Promise<string>;
async function waitApproach(p: Page, ms = 30000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await text(p);
    if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t)) return true;
    if (/CONTEST|result/.test(t) && !/· playing/.test(t)) return false;
    await p.waitForTimeout(120);
  }
  return false;
}
const RING = ['none', 'alleyoop', 'selflob', 'car', 'barrier', 'crate'] as const;
let curProp: Scenario['prop'] = 'none', curStyle: 'power' | 'flashy' | 'sig' = 'power';
async function setProp(p: Page, want: Scenario['prop'], lines: string[]): Promise<void> {
  if (SRC === 'pad') {
    // the d-pad ring: up = none, right = alley-oop, left = self-lob, down = the next obstacle (car → barrier → crate)
    if (want === 'none') await tapDpad(p, 'up'); else if (want === 'alleyoop') await tapDpad(p, 'right'); else if (want === 'selflob') await tapDpad(p, 'left');
    else { const order = ['car', 'barrier', 'crate']; const cur = order.indexOf(curProp); const n = ((order.indexOf(want) - (cur < 0 ? -1 : cur)) + 3) % 3 || (cur === order.indexOf(want) ? 0 : 3); for (let i = 0; i < n; i++) { await tapDpad(p, 'down'); await p.waitForTimeout(140); } }
  } else {
    const n = (RING.indexOf(want) - RING.indexOf(curProp) + RING.length) % RING.length;
    for (let i = 0; i < n; i++) { await tapBtn(p, 'X'); await p.waitForTimeout(140); }
  }
  curProp = want;
  await p.waitForTimeout(want === 'none' ? 250 : 1300);   // the obstacle mesh / the passer loads
  const shown = await hudProp(p);
  const label = { none: 'NO PROP', alleyoop: 'ALLEY-OOP', selflob: 'SELF-LOB', car: 'CAR', barrier: 'BARRIER', crate: 'CRATE' }[want];
  lines.push(`${shown === label ? 'PASS' : 'FAIL'}  prop ${want} → HUD "${shown}"`);
}


const DUNKS: [string, Dir, Btn][] = (process.env.DUNKS ?? 'WINDMILL:up:A,360:right:B,EASTBAY:down:Y,TOMAHAWK:up:Y,BETWEEN THE LEGS:down:B,SCORPION:right:Y,LOST & FOUND:left:B,HIDE & SEEK:left:A,ROCK THE CRADLE:right:A,DOUBLE CLUTCH:down:A')
  .split(',').map((s) => s.split(':') as [string, Dir, Btn]);
const SHOTS = (process.env.AT ?? '520,720,920,1150').split(',').map(Number);
let { p, close, errors } = await boot();
let inContest = 0;
const heroScreen = () => (p as Page).evaluate(() => {
  const W = window as any; const s = W.__FEL_DEV__.scene; const h = W.__FEL_DEV__.hero(); const eng = s.getEngine();
  const V = h.position.constructor; const M = s.getTransformMatrix().constructor;
  const hips = h.getDescendants(false).find((n: any) => /^Hips/.test(n.name)) ?? h;
  const at = hips.getAbsolutePosition().add(new V(0, 0.35, 0));
  const vp = s.activeCamera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight());
  const q = V.Project(at, M.Identity(), s.getTransformMatrix(), vp);
  const r = eng.getRenderWidth() / (eng.getRenderingCanvas().clientWidth || 1);
  return { x: q.x / r, y: q.y / r };
});
const clean = (on: boolean) => p.evaluate((on) => {
  let st = document.getElementById('__sheet_clean') as HTMLStyleElement | null;
  if (!st) { st = document.createElement('style'); st.id = '__sheet_clean'; document.head.appendChild(st); }
  st.textContent = on ? 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' : '';
}, on);
const rowsOut: { name: string; shots: { file: string; x: number; y: number }[]; banner: string }[] = [];
for (const [name, dir, button] of DUNKS) {
  // a contest is four attempts: a fresh page for every fifth dunk
  if (inContest >= 4) { await close(); ({ p, close, errors } = await boot()); inContest = 0; }
  inContest++;
  if (!(await waitApproach(p))) { console.log(`no approach for ${name}`); continue; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length;
  await stickUp(p, true); await runHold(p, true, 1);
  const holdStart = Date.now(); let launched = false, launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  while (!launched && Date.now() - holdStart < 3200) { await p.waitForTimeout(30); await launchedYet(); }
  await runHold(p, false); await stickUp(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { console.log(`${name}: never launched`); continue; }
  const pageNow = await now(p);
  const since = () => Date.now() - (r0 - (pageNow - launchPage));
  let pressed = false, nextSlam = 950; const shots: { file: string; x: number; y: number }[] = []; const todo = [...SHOTS];
  let banner = '';
  while (since() < 1700) {
    const el = since();
    if (!pressed && el >= 430) { pressed = true; await dpad(p, dir, true); await p.waitForTimeout(20); await tapBtn(p, button); await dpad(p, dir, false); }
    if (todo.length && el >= todo[0]) { const at = todo.shift()!; const hs = await heroScreen(); const file = `${OUT}/dunk-${name.replace(/\W+/g, '_')}-${at}.png`; await clean(true); await p.screenshot({ path: file }); await clean(false); shots.push({ file, x: hs.x, y: hs.y }); }
    if (el >= nextSlam && el <= 1500) { await tapBtn(p, 'A', 60); nextSlam = el + 85; }
    await p.waitForTimeout(20);
  }
  banner = (await marks(p)).slice(m0).map((m) => m.msg).filter((m) => /DUNK-TRICK/.test(m)).join(' | ').slice(0, 140);
  rowsOut.push({ name, shots, banner });
  console.log(`${name}: ${shots.length} shots · ${banner}`);
  await p.waitForTimeout(1500);
}
const sheetBrowser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const sheet = await sheetBrowser.newPage();
const img = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
const cell = (s: { file: string; x: number; y: number }) => `<img src="${img(s.file)}" style="width:300px;height:188px;object-fit:cover;background:#000">`;
for (let i = 0; i < rowsOut.length; i += 5) {
  await sheet.setViewportSize({ width: 1500, height: Math.min(5, rowsOut.length - i) * 196 });
  await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:15px monospace">${rowsOut.slice(i, i + 5).map((r) => `<div style="display:flex;gap:4px;align-items:center;padding:4px">${r.shots.map(cell).join('')}<div style="padding:10px;width:280px">${r.name}<br><span style="color:#888;font-size:12px">+${SHOTS.join(' / ')} ms</span></div></div>`).join('')}</body>`);
  await sheet.screenshot({ path: `${OUT}/DUNKS-${Math.floor(i / 5) + 1}.png` });
}
for (const r of rowsOut) for (const s of r.shots) fs.unlinkSync(s.file);
console.log(JSON.stringify({ errors: errors.slice(0, 4) }));
await close(); await sheetBrowser.close();
