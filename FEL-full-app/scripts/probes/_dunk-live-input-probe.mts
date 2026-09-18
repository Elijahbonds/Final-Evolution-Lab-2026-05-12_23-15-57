// DUNK-LIVE-INPUT probe (2026-09-07): an ALREADY-CONNECTED DualShock on the GUEST /try route.
// The fake pad is installed in navigator.getGamepads() slot 0 by an init script BEFORE the page loads and NEVER
// dispatches `gamepadconnected` — exactly the live root cause (the pad was plugged in before /try loaded). A probe
// that connects its pad after start() would pass on the old code; this one cannot.
//   PORT=3020 ROUTE=/try npx tsx scripts/probes/_dunk-live-input-probe.mts
//   PORT=3020 ROUTE=/dev/mode/dunkduel npx tsx scripts/probes/_dunk-live-input-probe.mts   (shared InputBus mirror)
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3020', ROUTE = process.env.ROUTE ?? '/try';
const DEV = ROUTE.startsWith('/dev/mode/');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = []; const frames: string[] = []; const padLog: string[] = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); if (/^\[PAD\]/.test(t)) padLog.push(t); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
// The pad exists before any script of the page runs. No connect event, ever.
await p.addInitScript(`(() => {
  const btn = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0, connected: true, mapping: 'standard',
    timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn), vibrationActuator: null };
  window.__pad = pad; window.__padReads = 0;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { window.__padReads++; return [pad, null, null, null]; } });
})()`);
await p.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 120000 });
if (DEV) await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
await p.waitForTimeout(800);

const checks: [string, boolean, string][] = [];
const chk = (name: string, ok: boolean, detail: string) => { checks.push([name, ok, detail]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };
const setPad = (axes: number[], pressed: number[] = []) => p.evaluate(`(() => { const pad = window.__pad; pad.axes = ${JSON.stringify(axes)};
  pad.buttons.forEach((b, i) => { const on = ${JSON.stringify(pressed)}.includes(i); b.pressed = on; b.touched = on; b.value = on ? 1 : 0; }); pad.timestamp = performance.now(); })()`);

// ── 0: adopted with NO gamepadconnected event
chk('0 pad adopted from getGamepads() with no connect event', padLog.some((l) => /adopted slot 0/.test(l)), padLog.join(' | ') || 'no [PAD] log');

// ── start the contest from the pad itself (A on ready → countdown → playing)
await setPad([0, 0, 0, 0], [0]); await p.waitForTimeout(120); await setPad([0, 0, 0, 0]);
await p.waitForFunction(() => /PROP|SLAM|RUN|CHARGE|· playing/.test(document.body.innerText), null, { timeout: 20000 });
await p.waitForTimeout(Number(process.env.WAIT ?? 3000));   // the approach opens after the round-card beat — a stick pushed inside it is (rightly) ignored
if (ROUTE.includes('dunkduel')) { await setPad([0, 0, 0, 0], [0]); await p.waitForTimeout(120); await setPad([0, 0, 0, 0]); await p.waitForTimeout(400); }
chk('1 contest started from the pad (A)', true, (await p.evaluate('document.body.innerText.replace(/\\s+/g, " ").slice(0, 120)')) as string);

await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; window.__smp = { rows: [] };
  const V = scene.activeCamera.position.constructor;
  // the HERO's nodes only — the rival on the same court has the same bone names (and stands idle); the hero's nodes carry a clone suffix (RightHand_c236)
  const root = dev.hero();
  const all = scene.transformNodes.concat(scene.meshes);   // the hero's body parts are MESHES (RightHand_c236), not transform nodes
  const armNode = (re) => all.find((n) => re.test(n.name) && n.isDescendantOf(root))
    || all.find((n) => re.test(n.name)) || (scene.skeletons[0] && scene.skeletons[0].bones.find((b) => re.test(b.name)));
  const rArm = armNode(/^(mixamorig:?)?RightHand(_c\\d+)?$/i) || armNode(/right.*hand/i), lArm = armNode(/^(mixamorig:?)?LeftHand(_c\\d+)?$/i) || armNode(/left.*hand/i);
  window.__arms = { r: rArm ? rArm.name : null, l: lArm ? lArm.name : null };
  // the hand's swing: its world offset from the HIPS (same skeleton, same frame — the root's position is a frame
  // ahead of the skin's world matrices while running, so root-relative leaks the whole run) along the hero's facing
  const hips = armNode(/^(mixamorig:?)?(Hips|Pelvis)(_c\\d+)?$/i) || armNode(/hips|pelvis/i);
  window.__arms.hips = hips ? hips.name : null;
  const abs = (n) => (n.getAbsolutePosition ? n.getAbsolutePosition() : (n.getTransformNode && n.getTransformNode() ? n.getTransformNode().getAbsolutePosition() : null));
  const q = (n) => { const h = dev.hero(); if (!n || !h || !hips) return 0; const ap = abs(n), hp = abs(hips); if (!ap || !hp) return 0;
    const dx = ap.x - hp.x, dz = ap.z - hp.z; return dx * Math.sin(h.rotation.y) + dz * Math.cos(h.rotation.y); };
  setInterval(() => { const h = dev.hero(); if (!h) return; const cam = scene.activeCamera; if (!cam) return;
    const playing = scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name);
    const right = cam.getDirection(new V(1, 0, 0)), fwd = cam.getDirection(new V(0, 0, 1));
    window.__smp.rows.push({ t: performance.now(), x: h.position.x, y: h.position.y, z: h.position.z, ry: h.rotation.y, rq: !!h.rotationQuaternion,
      run: playing.includes('run'), clips: playing.join(','), cx: cam.position.x, cz: cam.position.z, cry: cam.rotation.y, crx: right.x, cfz: fwd.z, ra: q(rArm), la: q(lArm) });
  }, 50);
})()`);
type Row = { t: number; x: number; y: number; z: number; ry: number; rq: boolean; run: boolean; clips: string; cx: number; cz: number; cry: number; crx: number; cfz: number; ra: number; la: number };
const mark = async (): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const rows = async (a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const amp = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
console.log('arm nodes:', await p.evaluate('JSON.stringify(window.__arms)'));

// ── A: pad L stick UP (axes[1] = −1) → toward the rim, run clip, facing π, arms swing; centre → stops
let a = await mark(); await setPad([0, -1, 0, 0]); await p.waitForTimeout(900); await setPad([0, 0, 0, 0]); let z = await mark();
let R = await rows(a, z); let first = R[0], last = R[R.length - 1];
chk('A pad L-up moves toward the rim', last.z - first.z < -2, `dz=${(last.z - first.z).toFixed(2)} (cam fwd.z=${first.cfz.toFixed(2)})`);
let tail = R.slice(-6);
chk('A facing = velocity (π) while running', tail.every((r) => Math.abs(wrap(r.ry - Math.PI)) < 0.25), `ry=${tail.map((r) => r.ry.toFixed(2)).join(',')}`);
chk('A run clip on the move', tail.every((r) => r.run), `clips=${tail[tail.length - 1]?.clips}`);
const moving = R.filter((r) => r.run);
chk('A arms swing while running (hand fore-aft swing)', amp(moving.map((r) => r.ra)) > 0.15 && amp(moving.map((r) => r.la)) > 0.15, `right amp=${amp(moving.map((r) => r.ra)).toFixed(3)} m left amp=${amp(moving.map((r) => r.la)).toFixed(3)} m (${moving.length} rows)`);
a = await mark(); await p.waitForTimeout(700); z = await mark(); R = await rows(a + 200, z); first = R[0]; last = R[R.length - 1];
chk('A centre: no drift', Math.hypot(last.x - first.x, last.z - first.z) < 0.05, `moved ${Math.hypot(last.x - first.x, last.z - first.z).toFixed(3)} m`);

// ── B: pad L stick RIGHT → screen-right (the camera's right in world x)
a = await mark(); await setPad([1, 0, 0, 0]); await p.waitForTimeout(500); await setPad([0, 0, 0, 0]); z = await mark();
R = await rows(a, z); first = R[0]; last = R[R.length - 1];
{ const dx = last.x - first.x; chk('B pad L-right strafes screen-right', Math.abs(dx) > 1 && Math.sign(dx) === Math.sign(first.crx), `dx=${dx.toFixed(2)} camRight.x=${first.crx.toFixed(2)}`); }
await p.waitForTimeout(400);

// ── C: pad R stick RIGHT → the camera orbits (rotation.y up), springs back on release, hero stays put
{ const before = (await rows(await mark() - 300, await mark())).pop()!;
  await setPad([0, 0, 1, 0]); await p.waitForTimeout(700);
  const held = (await rows(await mark() - 200, await mark())).pop()!;
  await setPad([0, 0, 0, 0]); await p.waitForTimeout(1500);
  const after = (await rows(await mark() - 200, await mark())).pop()!;
  const dHeld = wrap(held.cry - before.cry), dAfter = wrap(after.cry - before.cry);
  chk('C pad R-right: camera orbits', dHeld > 0.15, `Δcam.ry held=${dHeld.toFixed(2)}`);
  chk('C pad R release: springs back', Math.abs(dAfter) < 0.08, `Δcam.ry after=${dAfter.toFixed(2)}`);
  chk('C R look did not move the hero', Math.hypot(held.x - before.x, held.z - before.z) < 0.05, `moved ${Math.hypot(held.x - before.x, held.z - before.z).toFixed(3)} m`); }

// ── D: keyboard still drives with the (centred) pad plugged in — ArrowUp and W toward the rim; arrows don't touch the PROP
const hudText = async () => (await p.evaluate('document.body.innerText.replace(/\\s+/g, " ")')) as string;
for (const key of ['ArrowUp', 'w']) {
  await setPad([0, 1, 0, 0]); await p.waitForTimeout(1200); await setPad([0, 0, 0, 0]); await p.waitForTimeout(400);   // pull back to the start line first (the gather-line clamp would mask the key)
  const propBefore = (await hudText()).match(/NO PROP|ALLEY-OOP|CHAIR|OBSTACLE|CAR|MASCOT/)?.[0] ?? '?';
  a = await mark(); await p.keyboard.down(key); await p.waitForTimeout(700); await p.keyboard.up(key); z = await mark();
  R = await rows(a, z); first = R[0]; last = R[R.length - 1];
  const propAfter = (await hudText()).match(/NO PROP|ALLEY-OOP|CHAIR|OBSTACLE|CAR|MASCOT/)?.[0] ?? '?';
  chk(`D ${key} toward the rim with the pad in`, last.z - first.z < -2, `dz=${(last.z - first.z).toFixed(2)} run=${R.slice(-4).every((r) => r.run)}`);
  if (key === 'ArrowUp') chk('D ArrowUp did not cycle the PROP', propBefore === propAfter, `${propBefore} → ${propAfter}`);
  await p.waitForTimeout(500);
}
// ── E: the pad's real d-pad (button 15 = right) still picks the PROP
{ await setPad([0, 1, 0, 0]); await p.waitForTimeout(1200); await setPad([0, 0, 0, 0]); await p.waitForTimeout(400);   // back on the start line (approach)
  const before = (await hudText()).match(/NO PROP|ALLEY-OOP|CHAIR|OBSTACLE|CAR|MASCOT/)?.[0] ?? '?';
  const duel = ROUTE.includes('dunkduel');   // the duel's d-pad: down = chair, up = clear (no alley-oop); dunk: right = alley-oop
  await setPad([0, 0, 0, 0], [duel ? 13 : 15]); await p.waitForTimeout(150); await setPad([0, 0, 0, 0]); await p.waitForTimeout(300);
  const after = (await hudText()).match(/NO PROP|ALLEY-OOP|CHAIR|OBSTACLE|CAR|MASCOT/)?.[0] ?? '?';
  chk(`E pad d-pad ${duel ? 'down' : 'right'} still picks the PROP`, before !== after && (duel ? /CHAIR|OBSTACLE/.test(after) : /ALLEY/.test(after)), `${before} → ${after}`); }

// ── F: hot-unplug (slot goes null, no event) drops the pad and clears a held stick; re-plug is re-adopted
{ await setPad([0, -1, 0, 0]); await p.waitForTimeout(300);
  await p.evaluate(`Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null, null, null, null] })`);
  await p.waitForTimeout(400); a = await mark(); await p.waitForTimeout(500); z = await mark(); R = await rows(a, z); first = R[0]; last = R[R.length - 1];
  chk('F unplug (no event): pad dropped, stick released, no drift', padLog.some((l) => /dropped slot 0/.test(l)) && Math.hypot(last.x - first.x, last.z - first.z) < 0.05, `moved ${Math.hypot(last.x - first.x, last.z - first.z).toFixed(3)} m; ${padLog.slice(-1)[0]}`);
  await p.evaluate(`(() => { const pad = window.__pad; pad.axes = [0,0,0,0]; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] }); })()`);
  await p.waitForTimeout(300);
  chk('F re-plug (no event): re-adopted', padLog.filter((l) => /adopted slot 0/.test(l)).length >= 2, padLog.join(' | ')); }

chk('no console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');
chk('no FEL-FRAME / MISSING CLIP', frames.length === 0, frames.slice(0, 3).join(' | ') || 'clean');
const shot = `${process.env.SHOT ?? '.'}/dunk-live-input-${ROUTE.replace(/\W+/g, '-')}.png`;
await p.screenshot({ path: shot });
console.log(`\nDUNK-LIVE-INPUT ${ROUTE}: ${checks.filter((c) => c[1]).length}/${checks.length} checks pass — ${shot}`);
await b.close();
process.exit(checks.every((c) => c[1]) ? 0 : 1);
