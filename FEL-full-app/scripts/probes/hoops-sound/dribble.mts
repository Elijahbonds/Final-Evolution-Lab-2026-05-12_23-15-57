// hoops-sound (phase 11a, 2026-11-12): IS THE DRIBBLE HEARD, ONCE PER BOUNCE? And do the recordings load after READY?
//
// Drives the real hoops screens (the show rig's site: scripts/probes/hoops-audit/show/build.mts → <site>/host/index.html, GameShell
// around the mode's own host) on the rig's virtual clock (1/60 s of game per drawn frame, Math.random seeded), plays the show rig's
// scripted player, and records on EVERY drawn frame the ball's height (the one 'ball' mesh) and every SoundKit cue the game asked for
// (host-entry.tsx's window.__SFX: name, game time, volume, who asked, pan). Then it counts:
//   * floor contacts of the ball, read off its height alone (a local low under 0.25 m that it rose 0.2 m out of) — the ground truth;
//   * bounce cues, by who asked (player / ai / pass), matched to those contacts (a cue within 2 frames of a contact);
//   * doubles: two bounce cues within 0.2 s (no dribble is that fast: 2 bounces a second at most);
//   * the recordings: when each /audio/hoops/ file arrived against READY, and the bytes before READY by kind.
//
//   scripts/probes/hoops-audit/show/run.sh <site> 3356 <cap> … is the show rig's; this one runs the same way:
//   /home/user/wt/gate-run.sh <cap> bash scripts/probes/hoops-sound/run.sh <site> <port> MODES=onevone,threevthree SECONDS=10 OUT=<dir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3356';
const MODES = (process.env.MODES ?? 'onevone').split(',').filter(Boolean);
const SECONDS = Number(process.env.SECONDS ?? 10);
const OUT = process.env.OUT ?? '/tmp/hoops-sound';
const SEED = Number(process.env.SEED ?? 7);
const RASTER = Number(process.env.RASTER ?? 8);
const WALL_CAP_S = Number(process.env.WALL_CAP_S ?? 900);
const QUERY = process.env.QUERY ?? '';   // e.g. '&feel=…' is not wired; knobs are tested headless

const INIT = `(() => {
  const realNow = performance.now.bind(performance); window.__realNow = realNow;
  let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  let lastTs = -1; window.__vframes = 0;
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; window.__vframes++; } cb(vt); });
  let t = ${SEED} >>> 0;
  Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 600000 : ms, ...a);
  window.__name = window.__name || function (f) { return f; };
})()`;

// the show rig's scripted player (show.mts), and the per-frame ball height
const INSTRUMENT = (mode: string) => `(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; const engine = scene.getEngine(); const bus = dev.input;
  const R = window.__REC = { t0: performance.now(), ball: [] };
  const down = {}; const btn = (b, on) => { if (!!down[b] === on) return; down[b] = on; bus.emit({ t: 'button', btn: b, pressed: on }); };
  let lastStick = ''; const stick = (x, y) => { const k = x.toFixed(2) + ',' + y.toFixed(2); if (k === lastStick) return; lastStick = k; bus.emit({ t: 'stick', side: 'L', x, y }); };
  const MODE = ${JSON.stringify(mode)};
  const play = (g) => {
    if (window.__HOLD) { stick(0, 0); for (const b of ['A', 'X', 'Y']) btn(b, false); return; }
    stick(Math.sin(g * 0.9) * 0.55, -0.85);
    const c = g % 4.2; btn('X', c > 2.9 && c < 3.38);
    btn('Y', MODE === 'onevone' && (g % 7) > 6.6 && (g % 7) < 6.75);
    btn('A', MODE === 'threevthree' && (g % 5.5) > 1.0 && (g % 5.5) < 1.08);
  };
  scene.onBeforeRenderObservable.add(() => { try { play((performance.now() - R.t0) / 1000); } catch (e) { R.err = String(e && e.message || e); } });
  const ball = scene.getMeshByName('ball');
  engine.onEndFrameObservable.add(() => {
    const y = ball ? ball.getAbsolutePosition().y : NaN;
    R.ball.push([Math.round((performance.now() - R.t0) / 16.6667), +y.toFixed(4), ball && ball.parent ? 1 : 0]);
  });
  return ball ? 'ok' : 'no ball';
})()`;

/** Floor contacts read off the ball's height alone: a local low under 0.25 m that the ball then rises 0.2 m out of. */
function contacts(ball: [number, number, number][]): number[] {
  const out: number[] = []; let lowF = -1, lowY = Infinity;
  for (const [f, y] of ball) {
    if (!Number.isFinite(y)) continue;
    if (y < lowY) { lowY = y; lowF = f; }
    else if (y > lowY + 0.2) { if (lowY < 0.25) out.push(lowF); lowY = y; lowF = f; }   // it rose out of that low: a contact if it was the floor
  }
  return out;
}

async function runMode(b: import('playwright-core').Browser, mode: string) {
  const dir = path.join(OUT, mode); fs.mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const t0 = Date.now(); const wall = () => (Date.now() - t0) / 1000;
  const res: { wall: number; kind: string; bytes: number; path: string }[] = [];
  let readyWall = Infinity;
  p.on('response', (r) => {
    try {
      const u = new URL(r.url()); const len = Number(r.headers()['content-length'] ?? 0); const ext = path.extname(u.pathname).toLowerCase();
      const kind = u.pathname.startsWith('/audio/hoops/') ? 'hoops-audio' : u.pathname.includes('/audio/') ? 'audio' : /\.(glb|gltf|bin)$/.test(ext) ? 'models' : /\.(png|jpg|jpeg|webp|ktx2|env|hdr)$/.test(ext) ? 'images' : /\.(js|mjs)$/.test(ext) ? 'js' : 'other';
      res.push({ wall: wall(), kind, bytes: len, path: u.pathname });
    } catch { /* not counted */ }
  });
  const ev = <T,>(fn: string): Promise<T> => p.evaluate(fn) as Promise<T>;
  const out: Record<string, unknown> = { mode, seed: SEED, when: new Date().toISOString() };
  try {
    await p.goto(`${BASE}/host/index.html?mode=${mode}&agent=1&perf=off${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await p.waitForFunction(() => /TAP TO START|PRESS START|START/i.test(document.body.innerText) && !!(window as unknown as { __FEL_DEV__?: unknown }).__FEL_DEV__, null, { timeout: 900000, polling: 1000 });
    readyWall = wall(); out.wallToReadyS = readyWall;
    out.sampleAtReady = await ev(`window.__SK.sampleState()`);
    await ev(`(() => { const d = window.__FEL_DEV__; d.scene.getEngine().setHardwareScalingLevel(d.scene.getEngine().getHardwareScalingLevel() * ${RASTER}); return 1; })()`);
    await ev(`window.__HOLD = 1`);
    out.instrument = await ev(INSTRUMENT(mode));
    const clicked = await p.locator('text=/TAP TO START/i').first().click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!clicked) await ev(`(() => { const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); })()`);
    const PAUSED = /PAUSED — TAP TO RESUME/;
    await p.waitForTimeout(3000);
    if (await ev<boolean>(`${PAUSED}.test(document.body.innerText)`)) await ev(`(() => { const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); })()`);
    await ev(`window.__HOLD = 0`);
    const tPlay = Date.now();
    for (;;) {
      const g = await ev<number>(`(performance.now() - window.__REC.t0) / 1000`);
      if (await ev<boolean>(`${PAUSED}.test(document.body.innerText)`)) await ev(`(() => { const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); })()`);
      if (g >= SECONDS || Date.now() - tPlay > WALL_CAP_S * 1000) { out.gameSecondsPlayed = g; break; }
      await p.waitForTimeout(1000);
    }
    const rec = await ev<{ t0: number; ball: [number, number, number][]; err?: string }>(`window.__REC`);
    const sfx = await ev<{ t: number; name: string; vol?: number; tag?: string; pan?: number }[]>(`window.__SFX`);
    out.sampleAtEnd = await ev(`window.__SK.sampleState()`);
    const fr = (t: number) => Math.round((t - rec.t0) / 16.6667);
    const bounces = sfx.filter((s) => s.name === 'bounce').map((s) => ({ f: fr(s.t), tag: s.tag ?? '?', vol: s.vol, pan: s.pan })).filter((s) => s.f >= 0);
    const floor = contacts(rec.ball);
    const matched = floor.filter((f) => bounces.some((c) => Math.abs(c.f - f) <= 2));
    const unmatchedCues = bounces.filter((c) => !floor.some((f) => Math.abs(c.f - f) <= 2));
    const doubles = bounces.filter((c, i) => i > 0 && c.f - bounces[i - 1].f < 12);
    const byTag: Record<string, number> = {}; for (const c of bounces) byTag[c.tag] = (byTag[c.tag] ?? 0) + 1;
    const cues: Record<string, number> = {}; for (const s of sfx) if (fr(s.t) >= 0) cues[s.name] = (cues[s.name] ?? 0) + 1;
    out.summary = {
      gameSeconds: +(rec.ball.length / 60).toFixed(1), framesRecorded: rec.ball.length, floorContacts: floor.length, bounceCues: bounces.length, byTag,
      contactsWithACue: matched.length, cuesWithNoContact: unmatchedCues.length, doubles: doubles.length,
      bounceVolumes: { player: bounces.filter((c) => c.tag === 'player').map((c) => c.vol), ai: bounces.filter((c) => c.tag === 'ai').map((c) => c.vol) },
      cues,
    };
    const hoops = res.filter((r) => r.kind === 'hoops-audio');
    const before: Record<string, number> = {}; for (const r of res) if (r.wall <= readyWall) before[r.kind] = (before[r.kind] ?? 0) + r.bytes;
    out.loading = {
      hoopsFiles: hoops.length, hoopsBytes: hoops.reduce((a, r) => a + r.bytes, 0), hoopsBeforeReady: hoops.filter((r) => r.wall <= readyWall).length,
      firstHoopsAfterReadyS: hoops.length ? +(Math.min(...hoops.map((r) => r.wall)) - readyWall).toFixed(2) : null,
      lastHoopsAfterReadyS: hoops.length ? +(Math.max(...hoops.map((r) => r.wall)) - readyWall).toFixed(2) : null,
      bytesBeforeReadyByKind: before,
    };
    out.trace = { floor, bounces, err: rec.err ?? null };
    out.ballY = rec.ball;
  } catch (e) {
    out.error = String((e as Error).message).slice(0, 300);
  } finally {
    out.wallTotalS = wall();
    fs.writeFileSync(path.join(dir, 'dribble.json'), JSON.stringify(out));
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
  console.log(`[hoops-sound] ${mode}: ${JSON.stringify(out.summary ?? out.error)} ${JSON.stringify(out.loading ?? {})}`);
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
for (const m of MODES) await runMode(b, m);
await b.close();
