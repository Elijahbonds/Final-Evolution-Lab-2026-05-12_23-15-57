// DUNK-LOOK-F04 probe (2026-09-07): a HUMAN-sized touch LOOK flick on the overlay must visibly orbit the camera on the
// live /try guest route — the ACTUAL camera yaw is sampled every frame (not the desired orbit), peak and settle reported.
// Also re-runs the keyboard F01–F04 checks (arrows + WASD), the pad R stick, the pad d-pad prop pick and a full attempt.
//   ROUTE=/try|/dev/mode/dunk|/dev/mode/dunkduel PORT=3020 npx tsx scripts/probes/_dunk-look-f04-flick-probe.mts
import { chromium } from 'playwright-core';
const ROUTE = process.env.ROUTE ?? '/try', PORT = process.env.PORT ?? '3020', DUEL = /dunkduel/.test(ROUTE);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const p = await ctx.newPage();
const errors: string[] = []; const frames: string[] = []; const infos: string[] = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); if (/\[LOOK\]/.test(t)) infos.push(t); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
await p.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForFunction(() => /TAP TO START|· ready/.test(document.body.innerText), null, { timeout: 120000 });
await p.keyboard.press('j');
if (ROUTE.startsWith('/dev/')) await p.waitForFunction(() => /· playing/.test(document.body.innerText), null, { timeout: 60000 });
else await p.waitForFunction(() => /HOLD to run|STYLE to cycle|Pick your PROP/.test(document.body.innerText), null, { timeout: 60000 });
await p.waitForTimeout(Number(process.env.SETTLE ?? 800));
if (DUEL) { await p.keyboard.press('j'); await p.waitForTimeout(400); }
await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; window.__smp = { rows: [] };
  const V = scene.activeCamera.position.constructor;
  scene.onAfterRenderObservable.add(() => { const h = dev.hero(); if (!h) return; const cam = scene.activeCamera; if (!cam) return;
    const playing = scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name);
    const right = cam.getDirection(new V(1, 0, 0)), fwd = cam.getDirection(new V(0, 0, 1));
    window.__smp.rows.push({ t: performance.now(), x: h.position.x, y: h.position.y, z: h.position.z, ry: h.rotation.y, rq: !!h.rotationQuaternion,
      run: playing.includes('run'), cx: cam.position.x, cz: cam.position.z, cry: cam.rotation.y, crx: right.x, cfz: fwd.z });
  });
})()`);
await p.waitForFunction(() => (window as any).__smp.rows.length > 30, null, { timeout: 30000 });   // the sampler needs a live hero + camera (first frames after a recompile can lag)
type Row = { t: number; x: number; y: number; z: number; ry: number; rq: boolean; run: boolean; cx: number; cz: number; cry: number; crx: number; cfz: number };
const mark = async (): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const rows = async (a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r: number): string => (r * 180 / Math.PI).toFixed(0) + '°';
const propText = async (): Promise<string> => p.evaluate(`(() => { const t = document.body.innerText; const m = t.match(/NO PROP|ALLEY-OOP|ALLEY OOP|OBSTACLE|CHAIR|PROP: [A-Z -]+/i); return m ? m[0] : '(no prop label)'; })()`) as Promise<string>;
const checks: [string, boolean, string][] = [];
const chk = (name: string, ok: boolean, detail: string) => { checks.push([name, ok, detail]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };
const move = async (key: string, ms: number) => { const a = await mark(); await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); const z = await mark(); await p.waitForTimeout(350); return rows(a, z); };

// ── LOOK: a drag on the overlay's LOOK stick, sampled per frame → peak ACTUAL camera yaw, time to peak, settle
const lookStick = p.locator('span', { hasText: /^LOOK$/ }).first();
const lookBox = await lookStick.boundingBox();
chk('LOOK stick drawn on the overlay (AnalogStick R, not hollow)', !!lookBox, lookBox ? `${lookBox.width.toFixed(0)}×${lookBox.height.toFixed(0)} px at (${lookBox.x.toFixed(0)},${lookBox.y.toFixed(0)})` : 'no LOOK label');
async function dragLook(label: string, px: number, holdMs: number, minPeak: number, touch: boolean): Promise<void> {
  if (!lookBox) return;
  const cx = lookBox.x + lookBox.width / 2, cy = lookBox.y + lookBox.height / 2;
  const t0 = await mark();
  const before = (await rows(t0 - 600, t0)).pop() ?? (await rows(0, t0)).pop()!;
  if (touch) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    for (let i = 1; i <= 4; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + px * i / 4, y: cy }] }); await p.waitForTimeout(25); }
    await p.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + px, cy, { steps: 4 }); await p.waitForTimeout(holdMs); await p.mouse.up();
  }
  const tUp = await mark();
  await p.waitForTimeout(1800);
  const tEnd = await mark();
  const R = await rows(t0, tEnd);
  let peak = 0, tPeak = t0;
  for (const r of R) { const d = wrap(r.cry - before.cry); if (d > peak) { peak = d; tPeak = r.t; } }
  const atUp = wrap((R.filter((r) => r.t <= tUp).pop() ?? before).cry - before.cry);
  const after = wrap(R[R.length - 1].cry - before.cry);
  const at300 = wrap((R.filter((r) => r.t <= tUp + 300).pop() ?? before).cry - before.cry);
  const moved = Math.max(...R.map((r) => Math.hypot(r.x - before.x, r.z - before.z)));
  chk(`${label}: view yaws RIGHT, peak ≥ ${deg(minPeak)}`, peak >= minPeak, `peak Δcam.ry ${peak.toFixed(2)} (${deg(peak)}) at +${(tPeak - t0).toFixed(0)} ms · at release ${deg(atUp)} · +300 ms after release ${deg(at300)} · fps ${(R.length / ((tEnd - t0) / 1000)).toFixed(0)}`);
  chk(`${label}: springs back`, Math.abs(after) < 0.08, `Δcam.ry after 1.8 s = ${after.toFixed(3)} (${deg(after)})`);
  chk(`${label}: hero unmoved`, moved < 0.05, `moved ${moved.toFixed(3)} m`);
}
await dragLook('LOOK human flick (touch, 24 px, 400 ms)', 24, 400, 0.5, true);
await dragLook('LOOK human flick (mouse, 24 px, 400 ms)', 24, 400, 0.5, false);
await dragLook('LOOK full hold (touch, 44 px, 700 ms)', 44, 700, 0.9, true);
// ── A: ArrowUp → toward the rim (−z), run clip, facing π, prop untouched  (keyboard F01/F02)
let prop0 = await propText();
let R = await move('ArrowUp', 800); let first = R[0], last = R[R.length - 1];
chk('A ArrowUp moves toward the rim', last.z - first.z < -2, `dz=${(last.z - first.z).toFixed(2)} (cam fwd.z=${first.cfz.toFixed(2)})`);
chk('A ArrowUp: run clip + facing π', R.slice(-6).every((r) => r.run && Math.abs(wrap(r.ry - Math.PI)) < 0.2), `run=${R.slice(-6).map((r) => r.run ? 1 : 0).join('')} ry=${R.slice(-3).map((r) => r.ry.toFixed(2)).join(',')}`);
chk('A ArrowUp did not cycle the PROP', (await propText()) === prop0, `prop ${prop0} → ${await propText()}`);
R = await move('ArrowDown', 500); first = R[0]; last = R[R.length - 1];
chk('B ArrowDown backs off the rim', last.z - first.z > 0.8, `dz=${(last.z - first.z).toFixed(2)}`);
for (const [key, sign, label] of [['ArrowRight', 1, 'right'], ['ArrowLeft', -1, 'left']] as const) {
  R = await move(key, 500); first = R[0]; last = R[R.length - 1];
  const dx = last.x - first.x;
  chk(`B ${key} strafes screen-${label}`, Math.abs(dx) > 1 && Math.sign(dx) === Math.sign(first.crx * sign), `dx=${dx.toFixed(2)} camRight.x=${first.crx.toFixed(2)}`);
}
R = await move('w', 700); first = R[0]; last = R[R.length - 1];
chk('C W moves toward the rim (unchanged)', last.z - first.z < -2, `dz=${(last.z - first.z).toFixed(2)}`);
R = await move('d', 500); first = R[0]; last = R[R.length - 1];
chk('C D strafes screen-right (unchanged)', Math.abs(last.x - first.x) > 1 && Math.sign(last.x - first.x) === Math.sign(first.crx), `dx=${(last.x - first.x).toFixed(2)} camRight.x=${first.crx.toFixed(2)}`);
await p.keyboard.press('s'); await p.waitForTimeout(200);
// ── LOOK again after moving (the L stick's basis is live, the look must still orbit from wherever the hero stands)
await dragLook('LOOK human flick after a run (touch, 24 px, 400 ms)', 24, 400, 0.5, true);
// ── E: fake Gamepad — R stick right orbits, d-pad still picks the prop, L stick up runs at the rim
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'FEL fake DualShock', connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
})()`);
await p.waitForTimeout(300);
{
  const t0 = await mark();
  const before = (await rows(t0 - 300, t0)).pop()!;
  await p.evaluate('window.__pad.axes[2] = 1'); await p.waitForTimeout(700);
  const held = (await rows(await mark() - 100, await mark())).pop()!;
  await p.evaluate('window.__pad.axes[2] = 0'); await p.waitForTimeout(1800);
  const after = (await rows(await mark() - 100, await mark())).pop()!;
  const dHeld = wrap(held.cry - before.cry), dAfter = wrap(after.cry - before.cry);
  chk('E pad R stick right (full, 700 ms): view yaws right', dHeld > 0.9, `Δcam.ry held=${dHeld.toFixed(2)} (${deg(dHeld)})`);
  chk('E pad R release: springs back', Math.abs(dAfter) < 0.08, `Δcam.ry after=${dAfter.toFixed(2)}`);
  const propBefore = await propText();
  await p.evaluate(`window.__pad.buttons[${DUEL ? 13 : 15}].pressed = true`); await p.waitForTimeout(150);
  await p.evaluate(`window.__pad.buttons[${DUEL ? 13 : 15}].pressed = false`); await p.waitForTimeout(400);
  const propAfter = await propText();
  chk('E pad d-pad still picks the PROP', propAfter !== propBefore, `prop ${propBefore} → ${propAfter}`);
  await p.evaluate(`window.__pad.buttons[12].pressed = true`); await p.waitForTimeout(150);
  await p.evaluate(`window.__pad.buttons[12].pressed = false`); await p.waitForTimeout(400);
  chk('E pad d-pad up clears the PROP', (await propText()) === propBefore, `prop → ${await propText()}`);
  await p.evaluate('window.__pad.axes[1] = 1'); await p.waitForTimeout(900); await p.evaluate('window.__pad.axes[1] = 0'); await p.waitForTimeout(300);
  const a = await mark(); await p.evaluate('window.__pad.axes[1] = -1'); await p.waitForTimeout(600); await p.evaluate('window.__pad.axes[1] = 0'); const z = await mark();
  R = await rows(a, z); first = R[0]; last = R[R.length - 1];
  chk('E pad L stick up runs at the rim', last.z - first.z < -1.5, `dz=${(last.z - first.z).toFixed(2)}`);
  await p.waitForTimeout(300);
}
chk('[LOOK] R stick live logged', infos.length > 0, infos[0] ?? 'never logged');
// ── F: a full attempt on the ARROWS; the look must be dropped at the takeoff (rimCamCut framing untouched)
{
  const a = await mark();
  await p.keyboard.down('ArrowUp'); await p.waitForTimeout(700); await p.keyboard.up('ArrowUp');
  await p.keyboard.down(' '); await p.waitForTimeout(1100); await p.keyboard.up(' ');
  await p.waitForTimeout(650); await p.keyboard.press('j'); await p.waitForTimeout(900); await p.keyboard.press('j');
  await p.waitForTimeout(DUEL ? 7000 : 12000); const z = await mark();
  R = await rows(a, z); last = R[R.length - 1];
  const maxY = Math.max(...R.map((r) => r.y));
  chk('F attempt on the arrows flew', maxY > 0.8, `max y=${maxY.toFixed(2)}`);
  chk('F end: feet down, Euler yaw owns the root', last.y <= 0.05 && !last.rq, `y=${last.y.toFixed(3)} rq=${last.rq}`);
}
const text = await p.evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 220)`);
console.log('HUD:', text);
chk('no console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');
chk('no FEL-FRAME / MISSING CLIP', frames.length === 0, frames.slice(0, 3).join(' | ') || 'clean');
await p.screenshot({ path: `${process.env.SHOT ?? '.'}/${ROUTE.replace(/\W+/g, '-').replace(/^-/, '')}-look-f04.png` });
console.log(`\n${ROUTE} DUNK-LOOK-F04 probe: ${checks.filter((c) => c[1]).length}/${checks.length} checks pass`);
await b.close();
