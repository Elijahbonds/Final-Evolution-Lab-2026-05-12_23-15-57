// DUNK-LOOK-F04 probe (2026-09-07): the ON-SCREEN LOOK stick on the GUEST /try route, dragged the way a thumb does it.
// QA's eye saw NO orbit on an overlay LOOK drag while the pad probe (axes[2] = 1 for 0.7 s) measured Δcam.ry +0.88 —
// a human drag is SHORT (≈0.5 s) and PARTIAL (the 96 px zone, a thumb moves ~30 px ≈ 0.6). This probe drives the real
// TouchOverlay AnalogStick with pointer events (no pad, no bus injection) and measures what the eye would see: the peak
// camera yaw during the drag, how long the orbit lingers after release, and that the spring-back still lands.
//   PORT=3000 ROUTE=/try npx tsx scripts/probes/_dunk-look-f04-probe.mts
//   DEFL=0.6 HOLD=500      the "human" drag (default) · DEFL=1 HOLD=700 reproduces the pad probe's push
//   SHOT=/path/to.png      screenshot mid-hold
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3000', ROUTE = process.env.ROUTE ?? '/try';
const DEFL = Number(process.env.DEFL ?? 0.6), HOLD = Number(process.env.HOLD ?? 500);
const DEV = ROUTE.startsWith('/dev/mode/');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = []; const frames: string[] = []; const lookLog: string[] = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); if (/^\[LOOK\]/.test(t)) lookLog.push(t); });
p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
await p.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 120000 });
if (DEV) await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
await p.waitForTimeout(800);

const checks: [string, boolean, string][] = [];
const chk = (name: string, ok: boolean, detail: string) => { checks.push([name, ok, detail]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

// ── start the contest the way a guest does: the READY button
const start = p.locator('button', { hasText: /TAP TO START/i }).first();
if (await start.count()) await start.click(); else await p.keyboard.press('Space');
await p.waitForFunction(() => /PROP|SLAM|RUN|CHARGE|· playing/.test(document.body.innerText), null, { timeout: 20000 });
await p.waitForTimeout(Number(process.env.WAIT ?? 3000));   // the approach opens after the round-card beat

// ── 0: the overlay draws a LIVE LOOK stick (an AnalogStick, not the dashed HollowStick socket)
const lookLabel = p.locator('span', { hasText: /^LOOK$/ });
const lookZone = lookLabel.locator('xpath=..');
const hollow = p.locator('div.border-dashed[aria-hidden="true"]');
chk('0 TouchOverlay draws the LOOK AnalogStick', (await lookLabel.count()) === 1 && (await hollow.count()) === 0, `LOOK labels=${await lookLabel.count()} hollow sockets=${await hollow.count()}`);
const hint = await p.evaluate('document.body.innerText') as string;
chk('0 approach HUD hint names LOOK', /LOOK/.test(hint.replace(/\s+/g, ' ')), (hint.match(/[^\n]*LOOK[^\n]*/) ?? ['no LOOK line'])[0].slice(0, 140));

await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; window.__smp = { rows: [] };
  const V = scene.activeCamera.position.constructor;
  setInterval(() => { const h = dev.hero(); if (!h) return; const cam = scene.activeCamera; if (!cam) return;
    const right = cam.getDirection(new V(1, 0, 0));
    window.__smp.rows.push({ t: performance.now(), x: h.position.x, z: h.position.z, cx: cam.position.x, cz: cam.position.z, cry: cam.rotation.y, crx: right.x,
      prop: (document.body.innerText.match(/(NO PROP|ALLEY-OOP|OBSTACLE)/) || ['?'])[0] });
  }, 33);
})()`);
type Row = { t: number; x: number; z: number; cx: number; cz: number; cry: number; crx: number; prop: string };
const mark = async (): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const rows = async (a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
await p.waitForTimeout(500);   // let the sampler bank its first rows before any 'before' read
const deg = (r: number): string => `${(r * 180 / Math.PI).toFixed(0)}°`;
// the camera's yaw about the HERO (atan2 of the camera offset) — the orbit the eye sees, independent of setTarget's aim
const orbit = (r: Row): number => Math.atan2(r.cx - r.x, r.cz - r.z);

/** Drag an on-screen stick like a thumb: down at the centre, out to `defl` of the zone radius over ~100 ms, hold, release. */
const drag = async (zone: typeof lookZone, dx: number, dy: number, defl: number, holdMs: number, mid?: () => Promise<void>) => {
  const box = (await zone.boundingBox())!; const cx = box.x + box.width / 2, cy = box.y + box.height / 2, R = box.width / 2;
  await p.mouse.move(cx, cy); await p.mouse.down();
  for (let i = 1; i <= 5; i++) { await p.mouse.move(cx + dx * defl * R * i / 5, cy + dy * defl * R * i / 5); await p.waitForTimeout(20); }
  if (mid) await mid();
  await p.waitForTimeout(Math.max(0, holdMs - 100));
  await p.mouse.up();
};

// ── A: LOOK drag RIGHT (a thumb's short partial drag) → a VISIBLE orbit, that springs back after release
{ const before = (await rows(await mark() - 300, await mark())).pop()!;
  const a = await mark();
  await drag(lookZone, 1, 0, DEFL, HOLD, process.env.SHOT ? async () => { await p.waitForTimeout(250); await p.screenshot({ path: process.env.SHOT! }); } : undefined);
  const rel = await mark();
  await p.waitForTimeout(1800);
  const z = await mark();
  const held = await rows(a, rel), after = await rows(rel, z);
  const peakHeld = Math.max(...held.map((r) => Math.abs(wrap(orbit(r) - orbit(before)))));
  const peakAll = Math.max(...held.concat(after).map((r) => Math.abs(wrap(orbit(r) - orbit(before)))));
  const camPeak = Math.max(...held.concat(after).map((r) => Math.abs(wrap(r.cry - before.cry))));
  const linger = after.filter((r) => Math.abs(wrap(orbit(r) - orbit(before))) > 0.26);   // > 15° still showing after the thumb lifts
  const lingerMs = linger.length ? linger[linger.length - 1].t - rel : 0;
  const settled = after[after.length - 1];
  const dAfter = wrap(orbit(settled) - orbit(before));
  const dir = Math.sign(wrap(held[held.length - 1] ? orbit(held[held.length - 1]) - orbit(before) : 0));
  chk(`A LOOK drag right (defl ${DEFL}, ${HOLD} ms) orbits the camera VISIBLY (≥ 30°)`, peakAll >= Math.PI / 6, `peak orbit about the hero ${deg(peakAll)} (held-window ${deg(peakHeld)}, cam.rotation.y Δ ${deg(camPeak)})`);
  chk('A LOOK orbit lingers after the thumb lifts (> 15° for ≥ 250 ms)', lingerMs >= 250, `${lingerMs.toFixed(0)} ms above 15° after release`);
  chk('A LOOK release springs back (< 5° after 1.8 s)', Math.abs(dAfter) < 0.09, `Δ after ${deg(dAfter)}`);
  chk('A LOOK did not move the hero', Math.hypot(settled.x - before.x, settled.z - before.z) < 0.05, `moved ${Math.hypot(settled.x - before.x, settled.z - before.z).toFixed(3)} m`);
  chk('A LOOK right yaws the VIEW right (cam.rotation.y rises)', dir !== 0 && Math.sign(wrap((held[held.length - 1]?.cry ?? 0) - before.cry)) > 0, `sign(Δcam.ry held)=${Math.sign(wrap((held[held.length - 1]?.cry ?? 0) - before.cry))}`);
  chk('A the mode logged the R stick', lookLog.length > 0, lookLog.join(' | ') || 'no [LOOK] line'); }

// ── B: LOOK drag LEFT mirrors
{ const before = (await rows(await mark() - 300, await mark())).pop()!;
  const a = await mark(); await drag(lookZone, -1, 0, DEFL, HOLD); const rel = await mark(); await p.waitForTimeout(1800);
  const held = await rows(a, rel);
  const last = held[held.length - 1];
  chk('B LOOK drag left orbits the other way', wrap(last.cry - before.cry) < -0.15, `Δcam.ry held ${deg(wrap(last.cry - before.cry))}`); }

// ── C: the MOVE stick still runs the hero at the rim (touch F01) and the hero was pulled back for the keyboard checks
const moveZone = p.locator('span', { hasText: /^MOVE$/ }).locator('xpath=..');
{ const before = (await rows(await mark() - 200, await mark())).pop()!;
  await drag(moveZone, 0, -1, 1, 700); await p.waitForTimeout(300);
  const after = (await rows(await mark() - 200, await mark())).pop()!;
  chk('C MOVE stick up runs toward the rim', after.z - before.z < -1.5, `dz=${(after.z - before.z).toFixed(2)}`); }
await drag(moveZone, 0, 1, 1, 1400); await p.waitForTimeout(300);   // back off the gather line so the keys have runway

// ── D: keyboard F01/F02 unchanged — ArrowUp and W run at the rim, ArrowUp leaves the PROP alone, ArrowLeft strafes screen-left
const key = async (k: string, ms: number) => { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); };
for (const k of ['ArrowUp', 'w'] as const) {
  await drag(moveZone, 0, 1, 1, 1200); await p.waitForTimeout(300);
  const before = (await rows(await mark() - 200, await mark())).pop()!;
  await key(k, 700); await p.waitForTimeout(250);
  const after = (await rows(await mark() - 200, await mark())).pop()!;
  chk(`D ${k} runs toward the rim`, after.z - before.z < -1, `dz=${(after.z - before.z).toFixed(2)} prop ${before.prop} → ${after.prop}`);
  if (k === 'ArrowUp') chk('D ArrowUp leaves the PROP alone', before.prop === after.prop, `${before.prop} → ${after.prop}`);
}
{ const before = (await rows(await mark() - 200, await mark())).pop()!;
  await key('ArrowLeft', 500); await p.waitForTimeout(250);
  const after = (await rows(await mark() - 200, await mark())).pop()!;
  const dx = after.x - before.x;
  chk('D ArrowLeft strafes screen-left', Math.abs(dx) > 0.8 && Math.sign(dx) === -Math.sign(before.crx), `dx=${dx.toFixed(2)} camRight.x=${before.crx.toFixed(2)}`); }

chk('E 0 console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
chk('E 0 FEL-FRAME / MISSING CLIP', frames.length === 0, frames.slice(0, 3).join(' | ') || 'none');
const pass = checks.filter((c) => c[1]).length;
console.log(`\n${ROUTE} @ :${PORT} — ${pass}/${checks.length} PASS (defl ${DEFL}, hold ${HOLD} ms)`);
await b.close();
process.exit(pass === checks.length ? 0 : 1);
