// hoops-cam probe (lane/hoops-cam, 2026-11-21): one scripted 1v1 possession on the REAL /play/onevone page (the gameplay-clean
// rig: ../gameplay-clean/build.mjs builds the site, ../gameplay-clean/serve.mjs serves it), recording what the camera does.
// Owner 2026-11-21: "When it follows it's hard to play. When it's stationary like 2k high camera angle it's easier."
//
//   node possession.mjs <outDir> <tag>
//   env: PORT=3711 HOST=127.0.0.1 VW=1280 VH=720 TOUCH=0 THROTTLE=1 (4 = the phone tier) FEEL='hoops.oneVOneCam=0' QS='&playtest=1'
//        SHOT_AT='3.0' (game seconds of the script: a JPG of that frame, drawn) FAST=1 (draws counted, not drawn: CPU frame time)
//        DUMP=1 (the venue's tall meshes round the court, for the camera's clearance)
//
// The clock is virtual from TAP TO START (each rendered frame is 1/60 s of game time; Math.random is seeded), so a run is a
// function of frames: the same script gives the same play on any load, and the A/B differs only in the camera.
//
// The script (game seconds after the first playing frame; the ball is live about 2.3 s in): 3.0 drive (toward the rim and right,
// sprint), 4.2 crossover (R stick up-left), cut (toward the rim and left; both steered in COURT space, see installScript), 5.3
// step-back (R stick down), 5.9 hold SQUARE, 6.4 release (the jumper), watch; then the same again from 11.0.
//
// Per frame: the camera's eye, target and FOV; where the hero, the rival and the rim land on screen (in frame with a 3 % margin);
// the hero's drawn height as a share of the screen; CPU frame time; draw calls; active meshes and indices.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');

const [OUT, TAG] = process.argv.slice(2);
if (!OUT || !TAG) { console.error('usage: node possession.mjs <outDir> <tag>'); process.exit(2); }
const PORT = process.env.PORT ?? '3711', HOST = process.env.HOST ?? '127.0.0.1';
const VW = Number(process.env.VW ?? 1280), VH = Number(process.env.VH ?? 720), TOUCH = process.env.TOUCH === '1';
const THROTTLE = Number(process.env.THROTTLE ?? 1), FAST = process.env.FAST !== '0', DUMP = process.env.DUMP === '1';
const QS = process.env.QS ?? '';
const SHOT_AT = (process.env.SHOT_AT ?? '').split(',').filter(Boolean).map(Number);
const END_S = Number(process.env.END_S ?? 18.5);
const FEEL = Object.fromEntries((process.env.FEEL ?? '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; }));
fs.mkdirSync(OUT, { recursive: true });

const INIT = `(() => {
  ${Object.keys(FEEL).length ? `try { localStorage.setItem('fel.feel.overrides.v1', ${JSON.stringify(JSON.stringify(FEEL))}); } catch {}` : ''}
  const realNow = performance.now.bind(performance); window.__realNow = realNow;
  { let t = 7 >>> 0; Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  window.__name = window.__name || function (f) { return f; };
  let vt = 0; window.__vtOn = false; window.__freeze = false;
  performance.now = () => (window.__vtOn ? vt : realNow());
  window.__vtStart = () => { vt = realNow(); window.__vt0 = vt; window.__vtOn = true; };
  window.__gameS = () => (window.__vtOn ? (vt - window.__vt0) / 1000 : -1);
  const nST = window.setTimeout.bind(window), nCT = window.clearTimeout.bind(window), nSI = window.setInterval.bind(window);
  const timers = new Map(); let tid = 1e7;
  window.setTimeout = (fn, ms, ...a) => { if (!window.__vtOn || typeof fn !== 'function') return nST(fn, ms, ...a);
    const id = tid++; timers.set(id, { at: vt + Math.max(0, Number(ms) || 0), fn, a }); return id; };
  window.clearTimeout = (id) => { if (timers.has(id)) timers.delete(id); else nCT(id); };
  window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0);
    return nSI(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); };
  const runDue = () => { for (const [id, t] of [...timers]) if (t.at <= vt + 1e-6) { timers.delete(id); nST(() => t.fn(...t.a), 0); } };
  const raf = window.requestAnimationFrame.bind(window); let lastTs = -1;
  window.requestAnimationFrame = (cb) => raf((ts) => {
    if (ts !== lastTs) { lastTs = ts; if (window.__vtOn && !window.__freeze) { vt += 1000 / 60; try { window.__onVtFrame && window.__onVtFrame(); } catch (e) { window.__scriptErr = String(e); } runDue(); } }
    cb(window.__vtOn ? vt : ts);
  });
})()`;

function installRecorder(cfg) {
  const W = window, dev = W.__FEL_DEV__, scene = dev.scene, engine = scene.getEngine();
  const R = W.__rec = { frames: [], keys: new Set() };
  let draws = 0; W.__drawOn = !cfg.fast; W.__drawn = 0;
  const de = engine.drawElementsType.bind(engine), da = engine.drawArraysType.bind(engine);
  engine.drawElementsType = (...a) => { draws++; if (W.__drawOn) de(...a); };
  engine.drawArraysType = (...a) => { draws++; if (W.__drawOn) da(...a); };
  const T = W.__BABYLON_TOOLS;
  if (T && cfg.fast) { const orig = T.CreateScreenshot; T.CreateScreenshot = (eng, cam, size, cb, ...rest) => (W.__drawOn ? orig(eng, cam, size, cb, ...rest) : (cb && setTimeout(() => cb('data:,'), 0))); }
  let fb = 0; engine.onBeginFrameObservable.add(() => { fb = W.__realNow(); draws = 0; });
  const r3 = (x) => Math.round(x * 1e3) / 1e3;
  // the rival: the skinned body that is not the hero's (the nearest top node of a skeleton's bones)
  const topOf = (n) => { let x = n; while (x && x.parent) x = x.parent; return x; };
  let foe = null;
  // the rival: of the skinned bodies that are not the hero's, the one standing nearest the rival's spawn (0.9, 2) on the first
  // playing frame (the park has bystanders with skeletons of their own)
  const findFoe = () => { const hero = dev.hero && dev.hero(); if (!hero) return null; let best = null, bd = 3;
    for (const sk of scene.skeletons) { const b = sk.bones.find((bb) => bb.getTransformNode && bb.getTransformNode()); if (!b) continue;
      const t = b.getTransformNode(); if (t === hero || t.isDescendantOf(hero)) continue;
      let root = t; while (root.parent && root.parent.parent) root = root.parent;
      if (!root || root === hero || root.isDescendantOf(hero)) continue;
      const p = root.getAbsolutePosition(); const d = Math.hypot(p.x - 0.9, p.z - 2); if (d < bd) { bd = d; best = root; } }
    return best; };
  const ball = () => scene.getMeshByName('ball');
  const V3 = scene.activeCamera.position.constructor;
  const RIM = new V3(0, 3.05, -0.6);
  const proj = (p) => { const c = scene.activeCamera; const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const M = scene.getTransformMatrix(); const s = V3.Project(p, M.constructor.Identity(), M, c.viewport.toGlobal(w, h));
    return [r3(s.x / w), r3(s.y / h), s.z > 0 && s.z < 1 ? 1 : 0]; };
  scene.onAfterRenderObservable.add(() => {
    if (W.__drawOn) W.__drawn++;
    if (!W.__vtOn) return;
    const fe = W.__realNow() - fb;
    const c = scene.activeCamera; const e = c.globalPosition || c.position; let t = null; try { t = c.getTarget(); } catch { t = e; }
    const hero = dev.hero && dev.hero(); if (!foe) foe = findFoe();
    const ss = W.__sessionStore ? W.__sessionStore.view() : null;
    const f = { t: r3(W.__gameS()), ph: ss ? ss.phase : null, ms: r3(fe), d: draws, am: scene.getActiveMeshes().length, ai: scene.getActiveIndices(),
      cam: [r3(e.x), r3(e.y), r3(e.z), r3(t.x), r3(t.y), r3(t.z), r3(c.fov)], k: [...R.keys].join('') };
    if (hero) { const p = hero.getAbsolutePosition(); f.me = [r3(p.x), r3(p.z)];
      f.pMe = proj(p.add(new V3(0, 1.0, 0))); f.pMeHead = proj(p.add(new V3(0, 1.8, 0))); f.pMeFeet = proj(p); }
    if (foe) { const p = foe.getAbsolutePosition(); f.foe = [r3(p.x), r3(p.z)]; f.pFoe = proj(p.add(new V3(0, 1.0, 0))); f.pFoeHead = proj(p.add(new V3(0, 1.8, 0))); f.pFoeFeet = proj(p); }
    f.pRim = proj(RIM);
    f.cin = scene.metadata && scene.metadata.felCinematic ? 1 : 0;   // a replay on screen (ReplayDirector): not the play camera
    // CLIPPING, every 6th frame: is the eye inside a solid thing's box (a wall, a fence, a palm's crown: the box is generous, so a hit
    // is a look, not proof), and is the line from the eye to the hero, the rival or the rim blocked by one (a visible, solid, non-body
    // mesh; the floor, the sky and see-through things are not)
    if (R.frames.length % 6 === 0) {
      const NOT = /sky|dome|backdrop|horizon|ground|floor|court$|water|ocean|fog|gull|ball|shadow|decal|line|paint|glow|cloud/i;
      const solid = (m) => m.isEnabled() && m.isVisible && (m.visibility === undefined || m.visibility > 0.25) && !m.skeleton && m.getTotalVertices && m.getTotalVertices() > 0
        && !NOT.test(m.name) && !(m.material && m.material.alpha !== undefined && m.material.alpha < 0.3);
      let inside = '';
      for (const m of scene.meshes) { if (!solid(m)) continue; const bb = m.getBoundingInfo().boundingBox; const a = bb.minimumWorld, b2 = bb.maximumWorld;
        if (b2.x - a.x > 60 || b2.z - a.z > 60) continue;
        if (e.x > a.x + 0.2 && e.x < b2.x - 0.2 && e.y > a.y + 0.2 && e.y < b2.y - 0.2 && e.z > a.z + 0.2 && e.z < b2.z - 0.2) { inside = m.name.slice(0, 30); break; } }
      f.inside = inside;
      const Ray = c.getForwardRay(1).constructor; const bodies = new Set(); for (const r of [hero, foe]) if (r) for (const m of r.getChildMeshes(false)) bodies.add(m);
      const blockedBy = (p) => { const d = p.subtract(e); const len = d.length(); const hit = scene.pickWithRay(new Ray(e.clone(), d.scale(1 / len), len - 0.5), (m) => solid(m) && !bodies.has(m) && m.getBoundingInfo().boundingSphere.radiusWorld > 0.3 && !/hoop|rim|net|board/i.test(m.name)); return hit && hit.hit ? hit.pickedMesh.name.slice(0, 30) : ''; };
      f.occ = [hero ? blockedBy(hero.getAbsolutePosition().add(new V3(0, 1.2, 0))) : '', foe ? blockedBy(foe.getAbsolutePosition().add(new V3(0, 1.2, 0))) : '', blockedBy(RIM)];
    }
    const b = ball(); if (b) { const p = b.getAbsolutePosition(); f.ball = [r3(p.x), r3(p.y), r3(p.z)]; f.pBall = proj(p); }
    f.hud = (document.body.innerText || '').match(/GREEN|EARLY|LATE|PERFECT|STEP.?BACK|CROSS|BUCKET|MISS|GOOD|SWISH|AND ONE|BLOCK|STEAL/i)?.[0] ?? '';
    R.frames.push(f);
  });
}

function installScript(cfg) {
  const W = window; const R = W.__rec; const dev = W.__FEL_DEV__; const scene = dev.scene;
  const kd = (k) => { if (R.keys.has(k)) return; R.keys.add(k); W.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
  const ku = (k) => { if (!R.keys.has(k)) return; R.keys.delete(k); W.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); };
  const S = W.__S = { t0: null, done: false, taps: new Map() };
  const tap = (k, t, dur) => { kd(k); S.taps.set(k, t + dur); };
  // THE HERO IS DRIVEN THROUGH THE AGENT BRIDGE. The rig's run is an agent run (entry.tsx: setAgentRunHooksAllowed), so the 1v1
  // hero's slot reads window.__NEXUS_AGENT__'s AgentControlSource, not the keyboard (OneVOneMode: `agentCtl ?? …`); the queue runs on
  // the game's own dt, so the timing is frame-exact. The R stick (the dribble moves) is read off the bus in onInput, so its flicks
  // are the keyboard R stick (u = up-left, ',' = down). THE STICK IN COURT SPACE: 1v1's stick is camera-relative (OneVOneMode camRel),
  // so the script asks for a COURT direction and turns it into the stick through the camera's ground basis at the moment the
  // segment starts (held for the segment, as the game's StickFrame holds a held stick's frame): both cameras play the same possession.
  const A = () => W.__NEXUS_AGENT__;
  const stickOf = (dx, dz) => {
    if (dx === 0 && dz === 0) return { moveX: 0, moveY: 0 };
    const c = scene.activeCamera; const t = c.getTarget(); let fx = t.x - c.position.x, fz = t.z - c.position.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rx = fz, rz = -fx; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    return { moveX: dx * rx + dz * rz, moveY: dx * fx + dz * fz };
  };
  // one possession from `o` (game s): drive right toward the rim (sprint), crossover, cut left, step-back, the jumper. (x, z): +z is
  // away from the rim.
  const SEGS = [[0, 'drive', 1200, () => ({ ...stickOf(0.6, -0.8), sprint: true })], [1.2, 'cut', 1100, () => stickOf(-0.8, -0.6)],
    [2.3, 'still', 600, () => ({ moveX: 0, moveY: 0 })], [2.9, 'shoot', 500, () => ({ moveX: 0, moveY: 0, actionHeld: 0.6 })],
    [3.4, 'release', 90, () => ({ moveX: 0, moveY: 0, actionHeld: 0, action: true })]];
  S.agent = !!A(); S.acts = 0;
  const fired = new Set();
  const once = (id, t, fn) => { if (!fired.has(id)) { fired.add(id); fn(t); } };
  W.__onVtFrame = () => {
    const ss = W.__sessionStore ? W.__sessionStore.view() : null; const ph = ss ? ss.phase : null;
    if (S.t0 === null) { if (ph === 'playing') S.t0 = W.__gameS(); else return; }
    const t = W.__gameS() - S.t0; S.t = t;
    for (const [k, until] of [...S.taps]) if (t >= until) { ku(k); S.taps.delete(k); }
    if (t >= cfg.endS) { S.done = true; return; }
    for (const o of [3.0, 11.0]) {
      const u = t - o;
      for (const [at, name, ms, f] of SEGS) if (u >= at) once(`${name}${o}`, t, () => { if (A()) { A().act(f(), ms); S.acts++; } });
      if (u >= 1.2) once(`x${o}`, t, (tt) => tap('u', tt, 0.1));        // crossover: the R stick up-left (the ball hand's UP-AWAY)
      if (u >= 2.3) once(`s${o}`, t, (tt) => tap(',', tt, 0.1));        // step-back: the R stick down
    }
  };
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: TOUCH, hasTouch: TOUCH });
await ctx.addInitScript({ content: INIT });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).split('\n')[0].slice(0, 160)));
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 160)); if (/FEL-FRAME|FEL-CAM|1V1-CAM/.test(t)) errs.push('log: ' + t.slice(0, 160)); });
const ev = (fn, arg) => Promise.race([p.evaluate(fn, arg), sleep(120000).then(() => { throw new Error('evaluate timeout'); })]);
const row = { tag: TAG, vw: VW, vh: VH, throttle: THROTTLE, feel: FEEL, qs: QS };
try {
  const cdp = await ctx.newCDPSession(p);
  await p.goto(`http://${HOST}:${PORT}/index.html?mode=onevone&perf=off${QS}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const tB = Date.now(); let ph = null;
  while (Date.now() - tB < 180000) { ph = await ev(() => window.__sessionStore?.view().phase ?? null); if (ph === 'ready' || ph === 'playing' || ph === 'error') break; await sleep(400); }
  if (ph !== 'ready' && ph !== 'playing') throw new Error(`boot: phase ${ph}`);
  await ev(installRecorder, { fast: FAST });
  await ev(installScript, { endS: END_S });
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await ev(() => window.__vtStart());
  if (ph === 'ready') { const btn = p.locator('button', { hasText: 'TAP TO START' }).first(); if (await btn.count()) await btn.click({ timeout: 10000 }).catch(() => {}); else await ev(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))); }
  const shots = [...SHOT_AT]; const tP = Date.now();
  for (;;) {
    const s = await ev(() => ({ t: window.__S?.t ?? -1, done: window.__S?.done, ph: window.__sessionStore?.view().phase }));
    if (shots.length && s.t >= shots[0]) {
      const at = shots.shift();
      await ev(() => { window.__freeze = true; window.__drawOn = true; window.__drawn = 0; });
      const t0 = Date.now(); while (Date.now() - t0 < 60000) { if ((await ev(() => window.__drawn)) >= 2) break; await sleep(150); }
      await p.screenshot({ path: path.join(OUT, `${TAG}-at${at}.jpg`), type: 'jpeg', quality: 80, timeout: 90000 }).catch((e) => { row.shotErr = String(e.message).slice(0, 80); });
      if (DUMP && !row.dump) row.dump = await ev(() => { const sc = window.__FEL_DEV__.scene; const out = [];
        for (const m of sc.meshes) { if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0 || m.skeleton) continue; const bb = m.getBoundingInfo().boundingBox; const mn = bb.minimumWorld, mx = bb.maximumWorld;
          if (mx.y < 1.5) continue; const big = mx.x - mn.x > 60 || mx.z - mn.z > 60; out.push([m.name.slice(0, 32), +mn.x.toFixed(1), +mx.x.toFixed(1), +mn.y.toFixed(1), +mx.y.toFixed(1), +mn.z.toFixed(1), +mx.z.toFixed(1), m.isPickable ? 1 : 0, m.checkCollisions ? 1 : 0, big ? 1 : 0]); }
        return out; });
      await ev((fast) => { window.__drawOn = !fast; window.__freeze = false; }, FAST);
    }
    if (s.done) break;
    if (Date.now() - tP > 600000) { row.partial = `wall budget at game ${s.t}`; break; }
    await sleep(250);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
  row.frames = await ev(() => window.__rec.frames);
  row.scriptErr = await ev(() => window.__scriptErr ?? null);
  row.agent = await ev(() => ({ bridge: !!window.__S?.agent, acts: window.__S?.acts ?? 0 }));
} catch (e) { row.fail = String(e.message || e).slice(0, 200); }
row.errors = [...new Set(errs)].slice(0, 20);
fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(row));
console.log(`${TAG}: frames ${row.frames?.length ?? 0} errors ${row.errors.length}${row.fail ? ' FAIL ' + row.fail : ''}`);
await Promise.race([ctx.close().catch(() => {}), sleep(5000)]);
await Promise.race([b.close().catch(() => {}), sleep(5000)]);
process.exit(0);
