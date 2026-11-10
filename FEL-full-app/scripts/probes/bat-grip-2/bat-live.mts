// BAT-GRIP-2 (2026-11-10): the bat in the REAL running game, frame by frame, in both baseball modes.
//
// What it answers:
//   1. From the scene's first frame, through the READY card, START and the first seconds of play: how far apart are the
//      batter's fists, is a bat drawn, is it on screen, and is the scene covered (the READY card is opaque)?
//   2. Which clips are on the batter's body on those frames (name, weight).
//   3. A swing on a real pitch, shot mid-swing: the handle in the hands, the barrel away (the GLB's thin and thick ends,
//      found from its own vertices, against the wrists).
//   4. What follows the swing: the batter coming back to the stance from another clip, the frames where the fists are a
//      free hand's width apart (is a bat drawn between them?), and the stance once it is held again.
//
// The page is the gameplay-clean rig's (scripts/probes/gameplay-clean/build.mjs + entry.tsx): the real /play/<route> page
// (GameShell, the host, the READY card) bundled for production and served as static files, no Next server. Build it and
// serve it first:
//     node scripts/probes/gameplay-clean/build.mjs <site>          (through /home/user/wt/cpu-run.sh)
//     (cd <site> && python3 -m http.server 3311 --bind 127.0.0.1)
// `--devserver` drives `next dev`'s /dev/mode/<mode> page instead (no READY card there: the scene shows under START).
//
// Software GL draws this scene at about one frame a second, and the game's clock is the engine's frame time, so in real
// time a swing (0.3 s) is over inside one drawn frame. So the game clock is pinned to 1/60 s a frame (the engine's delta
// and Babylon's animation delta): the game plays frame-exact, as a 60 fps phone plays it. Frames nobody will look at skip
// the GPU's draws; the frame that is shot is drawn in full, then the loop is frozen and the canvas photographed. Input goes
// through the game's own InputBus (__FEL_DEV__.input), the same events a pad or a key produces.
//
// Usage: npx tsx scripts/probes/bat-grip-2/bat-live.mts <port> <outdir> <tag> [derby,baseball] [--devserver] [--faststart]
//          [--noswing] [--budget=400] (seconds a mode)   --faststart: START on the first READY frame, a thumb already on
//          the button   --noswing: stop after the first two seconds of play
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from '../_chromium.mts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const PORT = args[0] ?? '3311';
const OUT = args[1] ?? '/tmp/bat-live';
const TAG = args[2] ?? 'run';
const MODES = (args[3] ?? 'derby,baseball').split(',');
const DEVSERVER = flags.has('--devserver');
const FASTSTART = flags.has('--faststart');
const SWING = !flags.has('--noswing');
const BUDGET_MS = 1000 * Number([...flags].find((f) => f.startsWith('--budget='))?.split('=')[1] ?? 400);
/** Fists further apart than this are not one grip on a handle (the brief's line); FREE_M is a free hand (rig-grip-tests). */
const APART_M = 0.15, FREE_M = 0.4;
fs.mkdirSync(OUT, { recursive: true });

// The in-page recorder. A plain string: tsx's keepNames wraps named functions in a helper the page does not have.
const IN_PAGE = String.raw`
(() => {
  const P = window.__BATP = { frames: [], arm: null, frozen: false, loops: null, wantSwing: false, swingZ: 0.6, fastStart: ${FASTSTART}, started: false,
    drawOn: false, swingFrame: -1, presses: 0, hitFrame: -1 };
  window.__name = window.__name || function (f) { return f; };
  const phaseOf = () => {
    const s = window.__sessionStore; if (s && s.view) { const ph = s.view().phase; if (ph) return ph; }
    const m = document.body && document.body.innerText.match(/DEV\s*·\s*\w+\s*·\s*(\w+)/); return m ? m[1] : '';
  };
  P.phase = phaseOf;
  let hooked = null;
  setInterval(() => { const dev = window.__FEL_DEV__; if (dev && dev.scene && hooked !== dev.scene) { hooked = dev.scene; hook(dev); } }, 5);
  P.freeze = () => { if (!hooked || P.frozen) return; const eng = hooked.getEngine(); P.loops = (eng._activeRenderLoops || []).slice(); eng.stopRenderLoop(); P.frozen = true; };
  P.unfreeze = () => { if (!hooked || !P.frozen) return; const eng = hooked.getEngine(); P.frozen = false; for (const f of P.loops || []) eng.runRenderLoop(f); };
  P.emit = (btn, pressed) => window.__FEL_DEV__.input.emit({ t: 'button', btn, pressed });
  function hook(dev) {
    const scene = dev.scene, eng = scene.getEngine();
    // the game clock: 1/60 s a frame, whatever the wall clock says
    Object.defineProperty(eng, '_deltaTime', { configurable: true, get: () => 1000 / 60, set: () => {} });
    scene.useConstantAnimationDeltaTime = true;
    // frames nobody looks at skip the GPU's draws (the gameplay-clean rig's fast mode); the render watchdog photographs the
    // canvas and would "rescue" a healthy game from the clear colour, so it is handed a grey frame while draws are off
    const de = eng.drawElementsType.bind(eng), da = eng.drawArraysType.bind(eng);
    // Every frame is drawn until 20 frames past READY: the load's one-time passes (the environment's prefilter, the shadow
    // maps) must run, or every later shot is dark (measured: the first run's frames were near-black). The gameplay-clean
    // rig skips from READY on for the same reason.
    eng.drawElementsType = (...a) => { if (P.drawOn || P.warm) de(...a); };
    eng.drawArraysType = (...a) => { if (P.drawOn || P.warm) da(...a); };
    P.warm = true; let warmLeft = -1;
    scene.onBeforeRenderObservable.add(() => { const ph = phaseOf(); if (warmLeft < 0 && (ph === 'ready' || ph === 'playing')) warmLeft = 20; if (warmLeft > 0 && --warmLeft === 0) P.warm = false; });
    const T = window.__BABYLON_TOOLS;
    if (T) { const orig = T.CreateScreenshot; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 64, 64); const gray = c.toDataURL();
      T.CreateScreenshot = (e, cam, size, cb, ...rest) => (P.drawOn || P.warm ? orig(e, cam, size, cb, ...rest) : (cb && setTimeout(() => cb(gray), 0))); }
    else P.drawOn = true;   // no handle on the watchdog (the dev page): draw every frame
    let i = 0, sk = null, skRoot = null, nodes = null, pressedDown = false, lastZ = 99, swungThisPitch = false;
    const member = new WeakMap();
    const r3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    scene.onAfterRenderObservable.add(() => {
      i++;
      const f = { i, t: Math.round(performance.now()), phase: phaseOf() };
      if (P.fastStart && !P.started && f.phase === 'ready') { P.started = true; P.emit('START', true); P.emit('START', false); f.start = 1; }
      f.cover = !!document.querySelector('[data-fel-fullbleed]');   // the READY / loading card: opaque, over the whole scene
      // Babylon does not start its animation clock while the scene still has files loading (Scene.animate returns early):
      // the clips are 'playing' and nobody moves. pend = files still loading, anim = the animation clock has started
      f.pend = (scene._pendingData || []).length; f.anim = !!scene._animationTimeLast;
      // the batter, latched: Derby hands the hero handle to the ball on a hit (the follow camera)
      if (!P.batter) { const h = dev.hero(); if (h && h.getDescendants(false).some((n) => /Hand/.test(n.name))) P.batter = h; }
      const root = P.batter;
      const carrier = scene.getMeshByName('derby_bat') || scene.getMeshByName('baseball_bat');
      if (!root || !carrier || !carrier.rotationQuaternion) { f.none = !root ? 'hero' : 'bat'; P.frames.push(f); return arm(f); }
      if (skRoot !== root) {
        const under = new Set(root.getDescendants(false));
        sk = scene.skeletons.find((s) => s.bones.some((b) => under.has(b.getTransformNode()))) || null;
        nodes = new Set(sk ? sk.bones.map((b) => b.getTransformNode()) : []); skRoot = root;
      }
      if (!sk) { f.none = 'skeleton'; P.frames.push(f); return arm(f); }
      const node = (n) => { const b = sk.bones.find((b) => b.name === n || b.name.replace(/_c\d+$/, '') === n); return b && b.getTransformNode(); };
      const V = carrier.position.constructor;
      const fist = (h, fo) => { h.computeWorldMatrix(true); fo.computeWorldMatrix(true); const hp = h.getAbsolutePosition().clone(); return hp.add(hp.subtract(fo.getAbsolutePosition()).normalize().scale(0.07)); };
      const fL = fist(node('LeftHand'), node('LeftForeArm')), fR = fist(node('RightHand'), node('RightForeArm'));
      const grip = fL.add(fR).scale(0.5);
      const wrap = scene.getTransformNodeByName(carrier.name + '_glb');
      const glbOn = !!(wrap && wrap.isEnabled() && wrap.getChildMeshes().length > 0);
      f.sep = +fL.subtract(fR).length().toFixed(3);
      f.shown = (carrier.isVisible && carrier.isEnabled()) || glbOn;
      f.look = glbOn ? 'glb' : carrier.isVisible ? 'cylinder' : 'none';
      const held = carrier.metadata && carrier.metadata.batGripHeld; if (held !== undefined) f.held = held;
      carrier.computeWorldMatrix(true);
      f.up = r3(V.TransformNormal(new V(0, 1, 0), carrier.getWorldMatrix()).normalize());
      const cam = scene.activeCamera;
      if (cam) {
        const w = eng.getRenderWidth(), h = eng.getRenderHeight();
        const p = V.Project(grip, scene.getTransformMatrix().constructor.Identity(), scene.getTransformMatrix(), cam.viewport.toGlobal(w, h));
        f.onScreen = p.z > 0 && p.z < 1 && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
      }
      f.seen = !!(f.shown && f.onScreen && !f.cover);   // a bat a player can see
      f.clips = scene.animationGroups.filter((g) => {
        if (!g.isPlaying) return false;
        let m = member.get(g); if (m === undefined) { m = g.targetedAnimations.some((t) => nodes.has(t.target)); member.set(g, m); }
        return m;
      }).map((g) => g.name + '@' + (g.weight === -1 ? 1 : g.weight).toFixed(2));
      // the pitch, for the swing: the ball coming in (Derby's 'bball', the innings' 'baseball_ball')
      const ball = scene.getMeshByName('bball') || scene.getMeshByName('baseball_ball');
      const z = ball && ball.isEnabled() ? ball.position.z : 99;
      const incoming = z < lastZ - 0.02 && z < 18 && z > -1;
      if (z > lastZ + 5 || z > 15) swungThisPitch = false;
      lastZ = z; f.bz = +z.toFixed(2);
      if (pressedDown) { P.emit('A', false); pressedDown = false; }
      if (P.wantSwing && f.phase === 'playing' && incoming && !swungThisPitch && z < P.swingZ) {
        P.emit('A', true); pressedDown = true; swungThisPitch = true; P.presses++; P.swingFrame = i; f.press = 1; P.drawOn = P.wantSwing;
      }
      if (P.swingFrame > 0) f.sw = i - P.swingFrame;
      P.frames.push(f);
      arm(f);
    });
    function arm(f) {
      const a = P.arm; if (!a) return;
      let hit = false;
      const live = f.phase === 'ready' || f.phase === 'playing';
      if (a.kind === 'apart') hit = live && f.shown && f.sep > a.m && f.onScreen;               // a bat drawn between far-apart fists
      else if (a.kind === 'apartSeen') hit = live && f.seen && f.sep > a.m;                       // … that a player can see
      else if (a.kind === 'free') hit = f.phase === 'playing' && !f.cover && f.onScreen && f.sep > a.m && P.swingFrame > 0 && f.i - P.swingFrame > 20   // after the swing:
        && (f.clips || []).some((c) => c.indexOf('baseball_stance') === 0);                                                                           // the blend into the stance, hands still free
      else if (a.kind === 'gripBack') hit = f.phase === 'playing' && f.shown && f.sep < a.m;
      else if (a.kind === 'frames') hit = --a.n <= 0;
      else if (a.kind === 'swing') hit = P.swingFrame > 0 && f.i - P.swingFrame >= a.n;
      else if (a.kind === 'phase') hit = f.phase === a.phase;
      // give up after max frames, or after liveMax frames of READY / play (the frames before READY are the load's)
      if (!hit && ((a.max !== undefined && --a.max <= 0) || (a.liveMax !== undefined && live && --a.liveMax <= 0))) { P.arm = null; P.gaveUp = true; P.freeze(); return; }
      if (!hit) return;
      // the frame that is shot is drawn in full: one more frame with the draws on, then the freeze
      if (!P.drawOn && !P.warm) { P.drawOn = true; P.restoreDraw = true; P.arm = { kind: 'frames', n: 2 }; }
      else { P.arm = null; P.hitFrame = f.i; P.freeze(); }
    }
  }
})();
`;

let T0 = Date.now();
const left = (want: number) => Math.max(1000, Math.min(want, BUDGET_MS - (Date.now() - T0)));
async function shot(p: Page, name: string): Promise<string> {
  const path = `${OUT}/${TAG}_${name}.jpg`;
  await p.screenshot({ path, type: 'jpeg', quality: 88, timeout: 120000 }).catch((e) => console.log('shot failed', name, String(e).slice(0, 80)));
  return path;
}
/** Arm a freeze condition and wait until the loop is frozen on it. `max` / `liveMax`: give up after that many frames. */
async function freezeOn(p: Page, arm: Record<string, unknown>, timeoutMs: number): Promise<boolean> {
  timeoutMs = left(timeoutMs);
  await p.evaluate((a) => {
    const P = (window as any).__BATP; P.gaveUp = false;
    if (P.restoreDraw) { P.drawOn = false; P.restoreDraw = false; }
    P.arm = a; P.unfreeze();
  }, arm);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await p.evaluate(() => { const P = (window as any).__BATP; return { frozen: P.frozen, gaveUp: P.gaveUp }; });
    if (s.frozen) return !s.gaveUp;
    await p.waitForTimeout(200);
  }
  await p.evaluate(() => { const P = (window as any).__BATP; P.arm = null; P.freeze(); });
  return false;
}
const last = (p: Page) => p.evaluate(() => { const fr = (window as any).__BATP.frames; return fr[fr.length - 1]; });

/** The GLB's thin end (handle) and thick end (barrel) from its own vertices, against the wrists. */
async function glbEnds(p: Page): Promise<any> {
  return p.evaluate(() => {
    const scene = (window as any).__FEL_DEV__.scene, root = (window as any).__BATP.batter;
    const carrier = scene.getMeshByName('derby_bat') || scene.getMeshByName('baseball_bat');
    const wrap = carrier && scene.getTransformNodeByName(`${carrier.name}_glb`);
    if (!wrap || !wrap.isEnabled() || !root) return null;
    const V = carrier.position.constructor;
    const vs: any[] = [];
    for (const m of wrap.getChildMeshes()) { const pos = m.getVerticesData('position'); if (!pos) continue; m.computeWorldMatrix(true); const W = m.getWorldMatrix(); for (let i = 0; i < pos.length; i += 21) vs.push(V.TransformCoordinates(new V(pos[i], pos[i + 1], pos[i + 2]), W)); }
    if (!vs.length) return null;
    // the GLB's own long axis: the wrapper's +Y (the wrapper is what dressBatGlb places)
    wrap.computeWorldMatrix(true); const yAxis = V.TransformNormal(new V(0, 1, 0), wrap.getWorldMatrix()).normalize();
    const c0 = vs.reduce((s: any, v: any) => s.add(v), new V(0, 0, 0)).scale(1 / vs.length);
    const ts = vs.map((v: any) => V.Dot(v.subtract(c0), yAxis)); const lo = Math.min(...ts), hi = Math.max(...ts);
    const rad = (a: number, b: number) => { let s = 0, n = 0; vs.forEach((v: any, i: number) => { const t = (ts[i] - lo) / (hi - lo); if (t < a || t > b) return; const d = v.subtract(c0); s += d.subtract(yAxis.scale(V.Dot(d, yAxis))).length(); n++; }); return n ? s / n : 0; };
    const under = new Set<any>(root.getDescendants(false));
    const sk = scene.skeletons.find((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => sk?.bones.find((b: any) => b.name === n || b.name.replace(/_c\d+$/, '') === n)?.getTransformNode();
    const hp = (n: string) => { const h = node(n); h.computeWorldMatrix(true); return h.getAbsolutePosition(); };
    const wrists = hp('LeftHand').add(hp('RightHand')).scale(0.5);
    const loEnd = c0.add(yAxis.scale(lo)), hiEnd = c0.add(yAxis.scale(hi));
    const rLo = rad(0.05, 0.3), rHi = rad(0.7, 0.95);
    const thin = rLo < rHi ? loEnd : hiEnd, thick = rLo < rHi ? hiEnd : loEnd;   // the thin end is the handle
    return {
      thinEndRadius: +Math.min(rLo, rHi).toFixed(4), thickEndRadius: +Math.max(rLo, rHi).toFixed(4),
      handleToWrists: +thin.subtract(wrists).length().toFixed(3), barrelToWrists: +thick.subtract(wrists).length().toFixed(3),
      rightWayUp: thin.subtract(wrists).length() < thick.subtract(wrists).length(),
    };
  });
}

/** By phase: the fists' range, and the frames a bat was drawn between fists more than APART_M / FREE_M apart. */
function summarise(frames: any[]): any {
  const out: any = { frames: frames.length };
  for (const ph of ['loading', 'ready', 'playing']) {
    const fs_ = frames.filter((f) => f.phase === ph && f.sep !== undefined);
    if (!fs_.length) continue;
    const seen = (m: number) => fs_.filter((f) => f.seen && f.sep > m);
    const drawn = (m: number) => fs_.filter((f) => f.shown && f.onScreen && f.sep > m);
    const s15 = seen(APART_M), s40 = seen(FREE_M);
    out[ph] = {
      frames: fs_.length, covered: fs_.filter((f) => f.cover).length,
      sepMin: Math.min(...fs_.map((f) => f.sep)), sepMax: Math.max(...fs_.map((f) => f.sep)),
      fistsOver015: fs_.filter((f) => f.sep > APART_M).length, fistsOver040: fs_.filter((f) => f.sep > FREE_M).length,
      batDrawnOver015: drawn(APART_M).length, batDrawnOver040: drawn(FREE_M).length,
      batSEENover015: s15.length, batSEENover040: s40.length,
      worstSeen: s15.length ? s15.reduce((a, b) => (b.sep > a.sep ? b : a)) : null,
      batHiddenFrames: fs_.filter((f) => !f.shown).length,
    };
  }
  return out;
}

const results: Record<string, any> = {};
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
// phone landscape at DPR 1: a quarter of DPR 2's pixels, so software GL draws the shot frames sooner
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript({ content: IN_PAGE });
await ctx.addInitScript(() => { try { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('blocked')); } catch {} });

for (const mode of MODES) {
  T0 = Date.now();
  const p = await ctx.newPage();
  const R: any = { fastStart: FASTSTART };
  const errs: string[] = []; p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  try {
    await p.goto(DEVSERVER ? `http://127.0.0.1:${PORT}/dev/mode/${mode}` : `http://127.0.0.1:${PORT}/index.html?mode=${mode}&perf=off`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    // 1. up to READY (and through it): freeze on the first frame that draws a bat between far-apart fists
    R.apartCaught = await freezeOn(p, { kind: 'apart', m: APART_M, liveMax: 90 }, 200000);
    if (R.apartCaught) { R.apart = await last(p); await shot(p, `${mode}-1-apart-${R.apart.phase}${R.apart.cover ? '-covered' : ''}`); }
    if (!FASTSTART) {
      // the READY card: let it sit for a second of game time, shoot what the player sees, then START (the bus's own press)
      await freezeOn(p, { kind: 'phase', phase: 'ready' }, 200000);
      await freezeOn(p, { kind: 'frames', n: 60 }, 60000);
      R.ready = await last(p); await shot(p, `${mode}-2-ready-card`);
      await p.evaluate(() => { const P = (window as any).__BATP; P.emit('START', true); P.emit('START', false); });
    }
    // 2. play: the first frame a player can SEE a bat between far-apart fists (2 s of game time)
    R.seenApartAtStart = await freezeOn(p, { kind: 'apartSeen', m: APART_M, max: 120 }, 90000);
    if (R.seenApartAtStart) { R.seenApart = await last(p); await shot(p, `${mode}-3-apart-seen-at-start`); }
    else { await freezeOn(p, { kind: 'frames', n: 1 }, 30000); R.firstPlay = await last(p); await shot(p, `${mode}-3-first-play`); }
    // 3. a swing on the first pitch, shot through it (frames after the press, 60 a second)
    if (SWING) {
    await p.evaluate(() => { (window as any).__BATP.wantSwing = true; });
    R.swingShots = [];
    for (const n of mode === 'derby' ? [6, 12, 18, 24] : [3, 6, 9, 12]) {
      const got = await freezeOn(p, { kind: 'swing', n }, 240000);
      if (!got) { R.swingShots.push({ n, err: 'no swing' }); break; }
      const f = await last(p);
      R.swingShots.push({ n, frame: f, glb: await glbEnds(p) });
      await shot(p, `${mode}-4-swing-f${String(n).padStart(2, '0')}`);
    }
    await p.evaluate(() => { const P = (window as any).__BATP; P.wantSwing = false; P.drawOn = false; P.restoreDraw = false; });
    // 4. after the swing: 10 s of play (the next pitches come, the batter goes back to the stance). Freeze on the first frame
    // a player can SEE a bat between hands a free hand's width apart; otherwise shoot the stance the batter is back in.
    R.freeCaught = await freezeOn(p, { kind: 'apartSeen', m: FREE_M, max: 600 }, 200000);
    if (R.freeCaught) { R.free = await last(p); await shot(p, `${mode}-5-bat-seen-hands-free`); }
    else { await freezeOn(p, { kind: 'gripBack', m: 0.1, max: 120 }, 60000); R.gripBack = await last(p); await shot(p, `${mode}-6-stance-after-10s`); }
    }
    const frames = await p.evaluate(() => (window as any).__BATP.frames);
    R.presses = await p.evaluate(() => (window as any).__BATP.presses);
    R.summary = summarise(frames);
    fs.writeFileSync(`${OUT}/${TAG}_${mode}_frames.json`, JSON.stringify(frames));
  } catch (e) { R.err = String(e).slice(0, 300); }
  if (errs.length) R.pageErrors = errs.slice(0, 5);
  R.wallS = Math.round((Date.now() - T0) / 1000);
  results[mode] = R;
  fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await p.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1).slice(0, 14000));
