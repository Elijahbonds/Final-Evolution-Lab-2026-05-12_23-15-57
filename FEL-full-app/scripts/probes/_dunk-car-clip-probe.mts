// DUNK-CAR-CLIP probe (2026-09-14): the car dunk on /dev/mode/dunk, per rendered frame off the live rig and the live car mesh.
//   C1 body  — while any part of the dunker is over the car, the WHOLE BODY is above the car's mesh: every bone, and every
//              skinned vertex of the hero (CPU-skinned off this frame's bone matrices), against a ray cast DOWN onto the car's
//              own meshes at that vertex's x/z (not the sampled profile — the mesh itself)
//   C2 read  — the "OVER THE CAR!" call fires while the car is ON SCREEN under the dunker in the game camera (projected car
//              box and hero box, the car's top below the hero's lowest point on screen)
//   C3 R2    — the make's ball goes DOWN THROUGH the ring after the CONTACT (crosses the rim plane inside the ring, falls
//              through the net), and the contact is a real press on time (the flash reads ON TIME / not EARLY)
// Pad driver (pre-boot fake DualShock); the SLAM is pressed IN THE PAGE on the flight's clip clock.
// SHOTS=1 freezes on the beats (over the car · the call · contact · through the net) after a 2×2 frame — grade a SHOTS=0 run.
//   PORT=3061 npx tsx scripts/probes/_dunk-car-clip-probe.mts      (SCEN= · OUT_DIR= · TAG= · SHOTS=1 · VERBOSE=1 · REPS=)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3061', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-car-clip', TAG = process.env.TAG ?? 'after';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE, SHOTS = !!process.env.SHOTS, REPS = Number(process.env.REPS ?? 1), DENSE = Number(process.env.DENSE ?? 0), HITCH = Number(process.env.HITCH ?? 0), HITCH_AT = Number(process.env.HITCH_AT ?? 1.04), NOGRID = !!process.env.NOGRID;
mkdirSync(OUT, { recursive: true });

type V = { x: number; y: number; z: number };
type Row = { t: number; phase: string; clipTime: number; replaying: boolean; jamContact: boolean; root: V; ball: V; parent: string; ats: number; rim: V; rb: number;
  banner: string; flash: string; ob: { label: string; nearZ: number; farZ: number; peak: number; clearance: number } | null; over: boolean; cleared: boolean; clipped: boolean; margin: number | null; cut: boolean;
  bone: { name: string; clr: number; y: number; top: number } | null; skin: { clr: number; y: number; top: number; n: number; pen: number } | null;
  scr: { car: number[] | null; hero: number[] | null; carOn: number } };
type Mark = { t: number; msg: string };
interface Scenario { name: string; prop: 'none' | 'car'; slamAt: number }
const S: Scenario[] = [
  { name: 'CAR make (slam at clip 1.22)', prop: 'car', slamAt: 1.22 },
  { name: 'CAR EARLY buffered press (clip 0.93)', prop: 'car', slamAt: 0.93 },
  { name: 'CAR LATE press (clip 1.33)', prop: 'car', slamAt: 1.33 },
  { name: 'PLAIN make (slam at clip 1.22)', prop: 'none', slamAt: 1.22 },
  { name: 'PLAIN EARLY buffered press (clip 0.93)', prop: 'none', slamAt: 0.93 },
  { name: 'PLAIN TOP-OF-THE-JUMP press (clip 0.80)', prop: 'none', slamAt: 0.80 },   // CLOTHING-SOFT-RESIDUAL R2: "SLAM at the top" was refused TOO EARLY
];

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;

async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[] }> {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|FEL-FRAME/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/dunk${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 180000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene, eng = scene.getEngine();
    const S = window.__ccp = { rows: [], marks: [], drv: { slamAt: -1, frames: 0, done: true }, shots: ${SHOTS}, shotsDone: {}, frozen: '', loops: null, grid: null, flash: '', flashT: 0 };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|DUNK-PROP|DUNK-CAM|DUNK-SLAM|HANDS|LOB)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 320) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 200) }); ow(...a); };
    // DENSE=n: a virtual clock — performance.now (Babylon's engine delta AND the animation clock) advances 1/n of the real frame
    // time while the dunker crosses the car, so every few milliseconds of the flight is a rendered, sampled frame
    // SHOTS: the same clock with each frame's step capped at 34 ms, so a freeze for a screenshot costs the game no time (a 1 s
    // frame after the thaw ran the jam into its timeout)
    if (${DENSE} > 1 || ${SHOTS}) { const realNow = performance.now.bind(performance); let vt = realNow(), last = realNow(); S.dense = false;
      const raf = window.requestAnimationFrame.bind(window);
      let ret = vt; performance.now = () => (ret = Math.max(ret, vt + (S.dense || S.frozen ? 0 : Math.min(34, realNow() - last))));   // monotonic: a freeze never runs time backward
      window.requestAnimationFrame = (cb) => raf(() => { const r = realNow(); const d = r - last; last = r; vt += S.dense ? Math.min(d, 20) / ${DENSE} : Math.min(d, 34); cb(vt); }); }
    const V = (v) => ({ x: v.x, y: v.y, z: v.z });
    const rootOf = (n) => { while (n && n.parent) n = n.parent; return n; };
    const heightAt = (pr, x, z) => { if (Math.abs(x) > pr.halfWidth) return 0; const zs = pr.z; const zMax = Math.max(zs[0], zs[zs.length - 1]), zMin = Math.min(zs[0], zs[zs.length - 1]); if (z > zMax || z < zMin) return 0; for (let i = 0; i < zs.length - 1; i++) { const a = zs[i], b = zs[i + 1]; if ((z <= a && z >= b) || (z >= a && z <= b)) { const k = a === b ? 0 : (z - a) / (b - a); return pr.h[i] + (pr.h[i + 1] - pr.h[i]) * k; } } return 0; };
    // the car's own meshes: a down-ray at (x, z) returns the mesh top there (0 = nothing)
    const carMeshes = () => { const h = scene.getTransformNodeByName('dunk_obstacle'); return h ? h.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0) : []; };
    const RayC = scene.activeCamera.getForwardRay().constructor;
    const topAt = (meshes, x, z) => { const r = new RayC(new (scene.activeCamera.position.constructor)(x, 6, z), new (scene.activeCamera.position.constructor)(0, -1, 0), 7); let top = 0; for (const m of meshes) { const was = m.isPickable; m.isPickable = true; const hit = r.intersectsMesh(m, false); m.isPickable = was; if (hit.hit && hit.pickedPoint) top = Math.max(top, hit.pickedPoint.y); } return top; };
    // the hero's skinned vertices this frame, world space (CPU skinning off the current bone matrices)
    const skinCache = new Map();
    const skinWorld = (h) => { const out = []; S.vmap = []; for (const m of h.getChildMeshes(false)) { if (!m.skeleton || !m.isEnabled() || !m.isVisible) continue;
      let c = skinCache.get(m); if (!c) { const pos = m.getVerticesData('position'), idx = m.getVerticesData('matricesIndices'), w = m.getVerticesData('matricesWeights'); if (!pos || !idx || !w) continue; c = { pos, idx, w, idxX: m.getVerticesData('matricesIndicesExtra'), wX: m.getVerticesData('matricesWeightsExtra') }; skinCache.set(m, c); }
      const M = m.skeleton.getTransformMatrices(m); m.computeWorldMatrix(true); const W = m.getWorldMatrix().m; const { pos, idx, w, idxX, wX } = c;
      const base = out.length / 3; (S.vmap = S.vmap || []).push([base, m]); for (let v = 0, n = pos.length / 3; v < n; v++) { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; let sx = 0, sy = 0, sz = 0;
        for (let k = 0; k < 8; k++) { const ww = k < 4 ? w[v * 4 + k] : wX ? wX[v * 4 + k - 4] : 0; if (!ww) continue; const b = (k < 4 ? idx[v * 4 + k] : idxX[v * 4 + k - 4]) * 16; sx += ww * (x * M[b] + y * M[b + 4] + z * M[b + 8] + M[b + 12]); sy += ww * (x * M[b + 1] + y * M[b + 5] + z * M[b + 9] + M[b + 13]); sz += ww * (x * M[b + 2] + y * M[b + 6] + z * M[b + 10] + M[b + 14]); }
        out.push(sx * W[0] + sy * W[4] + sz * W[8] + W[12], sx * W[1] + sy * W[5] + sz * W[9] + W[13], sx * W[2] + sy * W[6] + sz * W[10] + W[14]); } } return out; };
    const project = (pts) => { const cam = scene.activeCamera; const vm = scene.getTransformMatrix(); const W = eng.getRenderWidth(), H = eng.getRenderHeight(); const VP = cam.viewport; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, on = 0; const P = cam.position.constructor; for (const q of pts) { const s = P.Project(new P(q.x, q.y, q.z), window.BABYLON_ID, vm, VP.toGlobal(W, H)); const u = s.x / W, v = s.y / H; if (s.z < 0 || s.z > 1) continue; x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v); if (u >= 0 && u <= 1 && v >= 0 && v <= 1) on++; } return x1 < x0 ? null : { box: [x0, y0, x1, y1], on: on / pts.length }; };
    const MCls = scene.getTransformMatrix().constructor; window.BABYLON_ID = MCls.Identity();
    const VP = scene.activeCamera.viewport.constructor;
    const mkCam = (name, vp) => { const c = scene.activeCamera.clone(name); c.viewport = vp; c.minZ = 0.02; if (c.rotationQuaternion) c.rotationQuaternion = null; if (c.inputs) c.inputs.clear(); return c; };
    const P3 = scene.activeCamera.position.constructor;
    const placeGrid = (kind) => {
      const h = dev.hero(); const pp = dev.dunkPosture.get(); const rim = pp.rim; const ob = pp.obstacle;
      const g = S.grid; const body = h.position.clone(); body.y += 1.0;
      const cz = ob ? (ob.nearZ + ob.farZ) / 2 : body.z;
      if (kind === 'car' || kind === 'call') {
        // side-on at the car's roof line from the court's +x side, and a low 3/4 from the runway side, and the wide
        g.side.position.set(rim.x + 7.5, 1.3, cz); g.side.setTarget(new P3(rim.x, 1.4, cz));
        g.front.position.set(rim.x + 3.2, 0.7, body.z + 3.2); g.front.setTarget(new P3(rim.x, 1.5, body.z));
        g.wide.position.set(rim.x - 9, 2.2, (cz + rim.z) / 2 + 1.5); g.wide.setTarget(new P3(rim.x, 1.8, (cz + rim.z) / 2));
      } else {
        const ball = scene.getMeshByName('ball'); ball.computeWorldMatrix(true); const c = ball.getAbsolutePosition();
        g.side.position.set(rim.x + 1.6, rim.y + 0.1, rim.z); g.side.setTarget(new P3(rim.x, rim.y - 0.05, rim.z));
        g.front.position.set(rim.x + 0.3, rim.y + 1.6, rim.z + 1.0); g.front.setTarget(new P3(rim.x, rim.y, rim.z));
        g.wide.position.set(rim.x - 5, rim.y - 0.4, rim.z + 2.5); g.wide.setTarget(new P3(rim.x, (rim.y + c.y) / 2, rim.z));
      }
    };
    S.setGrid = (on, kind) => {
      if (on) {
        if (!S.grid) { S.gameCam = scene.activeCamera; S.grid = { side: mkCam('probe_side', new VP(0.5, 0.5, 0.5, 0.5)), front: mkCam('probe_front', new VP(0, 0, 0.5, 0.5)), wide: mkCam('probe_wide', new VP(0.5, 0, 0.5, 0.5)) }; }
        S.gameCam = scene.activeCamera.name.startsWith('probe_') ? S.gameCam : scene.activeCamera;
        S.gameVp = S.gameCam.viewport; S.gameCam.viewport = new VP(0, 0.5, 0.5, 0.5);
        placeGrid(kind); scene.activeCameras = [S.gameCam, S.grid.side, S.grid.front, S.grid.wide];
      } else if (S.grid) { scene.activeCameras = []; S.gameCam.viewport = S.gameVp; scene.activeCamera = S.gameCam; }
    };
    S.thaw = () => { S.setGrid(false); S.frozen = ''; const pm = eng._performanceMonitor; if (pm) { pm.sampleFrame(); pm.sampleFrame(); } if (S.loops) { for (const fn of S.loops) eng.runRenderLoop(fn); S.loops = null; } };
    let gridArmed = '', skinTick = 0;
    scene.onAfterRenderObservable.add(() => {
      if (S.frozen) return;
      if (gridArmed) { S.frozen = gridArmed; gridArmed = ''; S.loops = [...(eng._activeRenderLoops ?? [])]; eng.stopRenderLoop(); return; }
      const h = dev.hero(); if (!h) return;
      const pp = dev.dunkPosture.get(); const rim = pp.rim; const ob = pp.obstacle;
      const ball = scene.getMeshByName('ball'); ball.computeWorldMatrix(true);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const banner = String(hud.banner ?? '');
      const tim = String(hud.slamTiming ?? ''); if (tim && tim !== S.tim) S.marks.push({ t: performance.now(), msg: '[TIMING] ' + tim }); S.tim = tim;
      if (banner && banner !== S.flash) { S.flash = banner; S.marks.push({ t: performance.now(), msg: '[FLASH] ' + banner }); } else if (!banner) S.flash = '';
      const row = { t: performance.now(), phase: pp.phase, clipTime: pp.clipTime ?? 0, replaying: !!pp.replaying, jamContact: !!pp.jamContact, root: V(h.position), ball: V(ball.getAbsolutePosition()), parent: ball.parent ? ball.parent.name : '', ats: scene.animationTimeScale ?? 1, rim, rb: pp.ballRadius,
        banner, flash: S.flash, ob: ob ? { label: ob.label, nearZ: ob.nearZ, farZ: ob.farZ, peak: ob.peak, clearance: ob.clearance } : null, over: !!pp.obstacleOver, cleared: !!pp.obstacleCleared, clipped: !!pp.obstacleClipped, margin: pp.obstacleMargin, cut: !!pp.rimCamCut,
        bone: null, skin: null, scr: { car: null, hero: null, carOn: 0 } };
      if (ob && (pp.phase === 'cinematic' || pp.phase === 'resolve') && !pp.replaying) {
        const meshes = carMeshes();
        // bones: every transform node under the hero whose name reads as a skeleton bone
        let best = null;
        const nearCar = h.position.z < ob.nearZ + 1.4 && h.position.z > ob.farZ - 1.4;
        if (nearCar) {
          h.computeWorldMatrix(true);
          for (const n of h.getDescendants(false)) { if (n.getTotalVertices || !/^(mixamorig:)?(Hips|Spine|Neck|Head|Left|Right)/.test(n.name)) continue; n.computeWorldMatrix(true); const q = n.getAbsolutePosition(); const top = heightAt(ob.profile, q.x - rim.x, q.z); if (top <= 0) continue; const clr = q.y - top; if (!best || clr < best.clr) best = { name: n.name, clr, y: q.y, top }; }
          row.bone = best;
          // skin: every frame over the car (a hitch only thins the samples — the flight is on the clip clock)
          const vs = skinWorld(h); let sk = null, pen = 0, n = 0;
          if (!S.skinChecked) { S.skinChecked = true; let ref = []; for (const m of h.getChildMeshes(false)) { if (!m.skeleton || !m.isEnabled() || !m.isVisible) continue; const pd = m.getPositionData(true, true); if (!pd) continue; const W = m.getWorldMatrix().m; for (let i = 0; i < pd.length; i += 3) ref.push(pd[i] * W[0] + pd[i + 1] * W[4] + pd[i + 2] * W[8] + W[12], pd[i] * W[1] + pd[i + 1] * W[5] + pd[i + 2] * W[9] + W[13], pd[i] * W[2] + pd[i + 1] * W[6] + pd[i + 2] * W[10] + W[14]); } let d = 0; for (let i = 0; i < Math.min(ref.length, vs.length); i++) d = Math.max(d, Math.abs(ref[i] - vs[i])); S.marks.push({ t: performance.now(), msg: '[SKIN] fast skin vs getPositionData: ' + (vs.length / 3) + ' / ' + (ref.length / 3) + ' verts, max diff ' + d.toFixed(4) + ' m · fov ' + scene.activeCamera.fov.toFixed(3) }); }
          const cand = [];
          for (let i = 0; i < vs.length; i += 3) { const top = heightAt(ob.profile, vs[i] - rim.x, vs[i + 2]); if (top <= 0) continue; n++; const clr = vs[i + 1] - top; if (clr < 0.6) cand.push([clr, vs[i], vs[i + 1], vs[i + 2], i / 3]); if (!sk || clr < sk.clr) sk = { clr, y: vs[i + 1], top, n: 0, pen: 0 }; }
          // the mesh itself under the lowest candidates (the profile is three rays down the runway; the mesh is the truth)
          cand.sort((a, b) => a[0] - b[0]);
          let meshClr = null;
          const P = scene.activeCamera.position.constructor; const DIRS = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
          const enclosed = (x, y, z) => { let depth = 9; const ok = DIRS.every((d) => { const r = new RayC(new P(x, y, z), new P(d[0], d[1], d[2]), 6); let hit = false; for (const m of meshes) { const pi = r.intersectsMesh(m, false); if (pi.hit) { hit = true; depth = Math.min(depth, pi.distance); } } return hit; }); return ok ? depth : 0; };
          const boneOf = (vi) => { let e = null; for (const [b, m] of S.vmap) if (vi >= b) e = [b, m]; if (!e) return '?'; const m = e[1], li = vi - e[0]; const idx = m.getVerticesData('matricesIndices'), w = m.getVerticesData('matricesWeights'); let bi = 0, bw = -1; for (let k = 0; k < 4; k++) if (w[li * 4 + k] > bw) { bw = w[li * 4 + k]; bi = idx[li * 4 + k]; } return (m.skeleton.bones[bi]?.name ?? '?') + ':' + bw.toFixed(2); };
          let penAt = null;
          for (const c of cand.slice(0, 8)) { const top = topAt(meshes, c[1], c[3]); if (top <= 0) continue; const clr = c[2] - top; let dep = 0; if (clr < 0 && (dep = enclosed(c[1], c[2], c[3])) > 0) { pen++; penAt = penAt ?? { x: +c[1].toFixed(2), y: +c[2].toFixed(2), z: +c[3].toFixed(2), top: +top.toFixed(2), depth: +dep.toFixed(3), bone: boneOf(c[4]), root: { x: +h.position.x.toFixed(2), y: +h.position.y.toFixed(2), z: +h.position.z.toFixed(2) } }; } if (meshClr == null || clr < meshClr) meshClr = clr; }
          if (sk) { sk.n = n; sk.pen = pen; sk.mesh = meshClr; sk.penAt = penAt; }
          row.skin = sk;
          // on screen in the GAME camera
          const cam = S.gameCam && scene.activeCamera.name.startsWith('probe_') ? S.gameCam : scene.activeCamera;
          if (meshes.length) { const mn = { x: 1e9, y: 1e9, z: 1e9 }, mx = { x: -1e9, y: -1e9, z: -1e9 }; for (const m of meshes) { m.computeWorldMatrix(true); const bb = m.getBoundingInfo().boundingBox; mn.x = Math.min(mn.x, bb.minimumWorld.x); mn.y = Math.min(mn.y, bb.minimumWorld.y); mn.z = Math.min(mn.z, bb.minimumWorld.z); mx.x = Math.max(mx.x, bb.maximumWorld.x); mx.y = Math.max(mx.y, bb.maximumWorld.y); mx.z = Math.max(mx.z, bb.maximumWorld.z); }
            const corners = []; for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) corners.push({ x, y, z });
            const pc = project(corners); row.scr.car = pc ? pc.box : null; row.scr.carOn = pc ? pc.on : 0; }
          const hv = []; for (let i = 0; i < vs.length; i += 90) hv.push({ x: vs[i], y: vs[i + 1], z: vs[i + 2] });
          const ph = project(hv); row.scr.hero = ph ? ph.box : null; const pr = project([rim]); row.scr.rim = pr ? pr.on : 0;
        }
      }
      if (${HITCH} > 0 && pp.phase === 'cinematic' && row.clipTime >= ${HITCH_AT} && !S.hitched) { S.hitched = true; const e = Date.now() + ${HITCH}; while (Date.now() < e) {} S.marks.push({ t: performance.now(), msg: '[HITCH] ' + ${HITCH} + ' ms at clip ' + row.clipTime.toFixed(3) }); }
      if (${DENSE} > 1) S.dense = !!ob && pp.phase === 'cinematic' && row.clipTime < 1.12 && !pp.replaying;
      { const gc = S.gameCam && scene.activeCamera.name.startsWith('probe_') ? S.gameCam : scene.activeCamera; row.cam = V(gc.globalPosition ?? gc.position);
        if (pp.phase === 'cinematic' || pp.phase === 'resolve') { const pr = project([rim]); row.rimOn = pr ? pr.on : 0; row.rimV = pr ? pr.box[1] : -1; const hp = h.position; const pb = project([{ x: hp.x, y: hp.y + 1.0, z: hp.z }, { x: hp.x, y: hp.y + 1.7, z: hp.z }]); row.heroOn = pb ? pb.on : 0; } }
      S.rows.push(row); if (S.rows.length > 30000) S.rows.splice(0, 8000);
      const pad = window.__PAD, d = S.drv;
      if (!d.done && pp.phase === 'cinematic' && row.clipTime >= d.slamAt && d.frames === 0) { pad.buttons[0].pressed = true; pad.buttons[0].value = 1; pad.timestamp = performance.now(); d.frames = 5; }
      else if (d.frames > 0) { d.frames--; if (d.frames === 0) { pad.buttons[0].pressed = false; pad.buttons[0].value = 0; pad.timestamp = performance.now(); d.done = true; } }
      if (S.shots) {
        const R = S.rows, prev = R[R.length - 2];
        // each beat freezes twice: the GAME camera alone first (what the player sees), then the 2×2 on a later frame
        // (kind 'game' = the game camera only: a 2×2 grid frame right before the resolve left the early press's reach short in every
        // SHOTS run — 40–80 ms real hitches there do not, so it is the grid, and the call's frame is the game camera's anyway)
        const beat = (k, cond, kind) => { if (gridArmed || !cond) return; if (!S.shotsDone[k + '-game']) { S.shotsDone[k + '-game'] = row.t; gridArmed = k + '-game'; return; } if (kind !== 'game' && !${NOGRID} && !S.shotsDone[k]) { S.shotsDone[k] = row.t; S.setGrid(true, kind); gridArmed = k; } };
        const c0 = S.shotsDone['contact-game'];
        beat('car-mid', !!row.skin && !!ob && row.root.z < (ob.nearZ + ob.farZ) / 2 + 0.05, 'car');
        beat('call', /OVER THE/.test(banner), 'game');
        beat('contact', row.jamContact && prev && !prev.jamContact, 'rim');
        beat('through', !!c0 && !row.replaying && row.ball.y < rim.y - 0.3 && !row.parent, 'rim');
      }
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors };
}

const BTN_I = { A: 0, B: 1, X: 2, Y: 3 } as const, DPAD_I = { up: 12, down: 13, left: 14, right: 15 } as const;
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const stickUp = (p: Page, on: boolean) => padSet(p, `p.axes[1] = ${on ? -1 : 0}`);
const runHold = (p: Page, on: boolean) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? 1 : 0}`);
async function tap(p: Page, i: number, ms = 90): Promise<void> { await padSet(p, `p.buttons[${i}].pressed = true; p.buttons[${i}].value = 1`); await p.waitForTimeout(ms); await padSet(p, `p.buttons[${i}].pressed = false; p.buttons[${i}].value = 0`); }
const tapBtn = (p: Page, b: keyof typeof BTN_I) => tap(p, BTN_I[b]);
const now = async (p: Page) => p.evaluate('performance.now()') as Promise<number>;
const text = async (p: Page) => p.evaluate('document.body.innerText') as Promise<string>;
const hud = async (p: Page, k: string) => p.evaluate(`(() => { try { return String(JSON.parse(document.querySelector('pre').textContent)[${JSON.stringify(k)}] ?? ''); } catch { return ''; } })()`) as Promise<string>;
let slugNow = 'x';
async function shoot(p: Page): Promise<void> {
  if (!SHOTS) return;
  const fz = await p.evaluate('window.__ccp.frozen') as string;
  if (!fz) return;
  await p.evaluate(`(() => { const pre = document.querySelector('pre'); if (pre) { pre.style.visibility = 'hidden'; if (pre.parentElement && pre.parentElement !== document.body) pre.parentElement.style.visibility = 'hidden'; } for (const el of document.querySelectorAll('div')) if (/^\\d+ fps/.test(el.textContent || '') && el.children.length < 12 && (el.textContent || '').length < 200) el.style.visibility = 'hidden'; })()`);
  await p.screenshot({ path: `${OUT}/${slugNow}-${fz}.png` });
  await p.evaluate('window.__ccp.thaw()');
}
async function waitFor(p: Page, ms: number, until?: () => Promise<boolean>): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await shoot(p); if (until && await until()) return; await p.waitForTimeout(25); }
}
async function waitApproach(p: Page, ms = 40000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await shoot(p); const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t)) return true; await p.waitForTimeout(120); }
  return false;
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2), f3 = (n: number) => n.toFixed(3);

async function attempt(p: Page, sc: Scenario, idx: number): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  slugNow = `${TAG}-${idx}-${sc.prop}`;
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  await tap(p, DPAD_I.up); await p.waitForTimeout(250);
  if (sc.prop === 'car') { for (let i = 0; i < 4 && (await hud(p, 'prop')).toUpperCase() !== 'CAR'; i++) { await tap(p, DPAD_I.down); await p.waitForTimeout(300); } }
  for (let i = 0; i < 3 && !(await hud(p, 'style')).toLowerCase().startsWith('power'); i++) { await tapBtn(p, 'B'); await p.waitForTimeout(200); }
  if (sc.prop === 'car') await waitFor(p, 8000, async () => (await p.evaluate('!!window.__FEL_DEV__.dunkPosture.get().obstacle')) as boolean);
  lines.push(`      prop ${await hud(p, 'prop')} · style ${await hud(p, 'style')} · obstacle ${JSON.stringify(await p.evaluate('(() => { const o = window.__FEL_DEV__.dunkPosture.get().obstacle; return o && { label: o.label, nearZ: +o.nearZ.toFixed(2), farZ: +o.farZ.toFixed(2), peak: +o.peak.toFixed(2), hw: o.profile.halfWidth }; })()'))} · rim ${JSON.stringify(await p.evaluate('window.__FEL_DEV__.dunkPosture.get().rim'))}`);
  const m0 = (await p.evaluate('window.__ccp.marks.length')) as number, tA = await now(p);
  await p.evaluate(`(() => { const S = window.__ccp; S.drv = { slamAt: ${sc.slamAt}, frames: 0, done: false }; S.shotsDone = {}; S.hitched = false; })()`);
  await stickUp(p, true); await p.waitForTimeout(200); await runHold(p, true);
  await waitFor(p, 5000, async () => (await p.evaluate('window.__ccp.rows.at(-1)?.phase')) === 'cinematic');
  await runHold(p, false); await stickUp(p, false);
  await waitFor(p, 2600, async () => /resolve|judging/.test(String(await p.evaluate('window.__ccp.rows.at(-1)?.phase'))));
  await waitFor(p, 9000, async () => /HOLD to run|Pick your PROP|RIVAL ROUND|FINAL ROUND/.test(await text(p)) && !/CONFER/.test(await text(p)));
  const tZ = await now(p);
  const ms = ((await p.evaluate('window.__ccp.marks')) as Mark[]).slice(m0);
  const R = ((await p.evaluate('window.__ccp.rows')) as Row[]).filter((r) => r.t >= tA && r.t <= tZ);
  if (process.env.DUMP) writeFileSync(`${OUT}/rows-${slugNow}.json`, JSON.stringify({ tA, tZ, marks: ms, rows: R }));
  const mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const launch = R.find((r) => r.phase === 'cinematic'), resolve = R.find((r) => r.phase === 'resolve'), contact = R.find((r) => r.jamContact);
  const replay0 = R.find((r) => r.replaying);
  if (!launch || !resolve) { lines.push(`FAIL  never launched/resolved (launch ${!!launch} resolve ${!!resolve})`); return lines; }
  lines.push(`      ${contact ? 'MAKE' : 'MISS'} · ${ms.filter((m) => /DUNK-LAUNCH|DUNK-PROP\] (over|CLEARED|CLIPPED)|DUNK-CAM|FLASH|TIMING|SKIN|HITCH|iron contact|through the net/.test(m.msg)).map((m) => `+${f0(m.t - launch.t)} ${m.msg.slice(0, 150)}`).join(' | ')}`);
  const timing = ms.find((m) => /TIMING\] |FLASH\] .*(EARLY|LATE|ON TIME|PERFECT)/.test(m.msg));

  if (sc.prop === 'car') {
    const over = R.filter((r) => r.skin || r.bone);
    const sk = over.filter((r) => r.skin);
    const minSkin = sk.reduce((a, r) => (a == null || r.skin!.clr < a.skin!.clr ? r : a), null as Row | null);
    const minMesh = sk.filter((r) => (r.skin as unknown as { mesh: number | null }).mesh != null).reduce((a, r) => (a == null || (r.skin as unknown as { mesh: number }).mesh < (a.skin as unknown as { mesh: number }).mesh ? r : a), null as Row | null);
    const minBone = over.filter((r) => r.bone).reduce((a, r) => (a == null || r.bone!.clr < a.bone!.clr ? r : a), null as Row | null);
    const pen = sk.filter((r) => r.skin!.pen > 0);
    const clipped = R.some((r) => r.clipped), cleared = R.some((r) => r.cleared);
    const margin = R.at(-1)?.margin;
    const meshMin = minMesh ? (minMesh.skin as unknown as { mesh: number }).mesh : null;
    say(!clipped && cleared && pen.length === 0 && meshMin != null,
      `C1 body over the CAR: ${sk.length} skinned frames over the footprint — game says ${clipped ? 'CLIPPED' : cleared ? 'CLEARED' : 'neither'} (feet margin ${margin == null ? '—' : f2(margin)} m) · lowest bone ${minBone ? `${minBone.bone!.name} ${f3(minBone.bone!.clr)} m over the roof @clip ${f2(minBone.clipTime)} z ${f2(minBone.root.z)}` : '—'} · lowest SKIN vs profile ${minSkin ? `${f3(minSkin.skin!.clr)} m (vertex y ${f2(minSkin.skin!.y)} over top ${f2(minSkin.skin!.top)}) @clip ${f2(minSkin.clipTime)} root z ${f2(minSkin.root.z)} y ${f2(minSkin.root.y)}` : '—'} · lowest SKIN vs the car MESH (down-ray) ${meshMin == null ? '—' : f3(meshMin)} m · frames with a vertex INSIDE the car mesh (under its top and enclosed on all 6 axes) ${pen.length}${pen.length ? ' ' + JSON.stringify(pen.map((r) => ({ c: +r.clipTime.toFixed(2), ...(r.skin as unknown as { penAt: object }).penAt }))) : ''} · under the top but NOT enclosed (beside the body panel) ${sk.filter((r) => (r.skin as unknown as { mesh: number | null }).mesh != null && (r.skin as unknown as { mesh: number }).mesh < 0 && r.skin!.pen === 0).length}`);
    { const cutRows = R.filter((r) => r.cut && r.phase === 'cinematic' && r.scr.hero); const full = (b: number[] | null) => !!b && b[0] >= 0 && b[1] >= 0 && b[2] <= 1 && b[3] <= 1;
      say(cutRows.length > 0 && cutRows.every((r) => r.scr.carOn >= 0.75 && full(r.scr.hero) && (r.scr as unknown as { rim: number }).rim === 1),
        `C2 framing after the cut: ${cutRows.length} frames — car ≥ 6/8 corners on screen ${cutRows.filter((r) => r.scr.carOn >= 0.75).length}, hero wholly in frame ${cutRows.filter((r) => full(r.scr.hero)).length}, rim in frame ${cutRows.filter((r) => (r.scr as unknown as { rim: number }).rim === 1).length}`); }
    if (VERBOSE) lines.push(`        over: ${sk.filter((_, i) => i % 2 === 0).map((r) => `c${f2(r.clipTime)} z${f2(r.root.z)} y${f2(r.root.y)} sk${f2(r.skin!.clr)} m${(r.skin as unknown as { mesh: number | null }).mesh == null ? '-' : f2((r.skin as unknown as { mesh: number }).mesh)} b${r.bone ? f2(r.bone.clr) + r.bone.name.replace(/^mixamorig:/, '').slice(0, 9) : '-'} car${r.scr.car ? f2(r.scr.carOn) : 'X'}${r.cut ? ' CUT' : ''}`).join(' · ')}`);
    // C2: the call on screen
    const call = R.find((r) => /OVER THE CAR/.test(r.banner));
    const callVis = R.filter((r) => /OVER THE CAR/.test(r.banner) && r.scr.car);
    if (!call) say(false, 'C2 the call: OVER THE CAR! never showed');
    else {
      const c = callVis[0] ?? call;
      const carBox = c.scr.car, heroBox = c.scr.hero;
      const carOn = c.scr.carOn;
      // the car's top edge (screen v0) below the hero's feet (screen v1) — v grows downward
      const under = !!carBox && !!heroBox && carBox[1] >= heroBox[3] - 0.04;
      const carVisible = !!carBox && carOn >= 0.5;
      say(carVisible && under, `C2 the call: OVER THE CAR! first shown @clip ${f2(call.clipTime)} root z ${f2(call.root.z)} (car far edge ${f2(call.ob!.farZ)}) · car corners on screen ${f2(carOn)} · car box ${carBox ? carBox.map(f2).join(',') : 'OFF'} · hero box ${heroBox ? heroBox.map(f2).join(',') : 'OFF'} · car top under the hero ${under} · rim cut already ${call.cut}`);
    }
  }
  // C4 the flush on screen: from the launch to 400 ms past the CONTACT the game camera never cuts (a per-frame move over 1.5 m — the follow tracks a
  // 7 m/s run at 0.5–0.7 m/frame when the probe's skinning slows the page; the cuts are 7–14 m; the flight's one cut is allowed) and at the CONTACT the rim and the dunker (hips and head) are in frame
  if (contact) {
    const win = R.filter((r) => r.t >= launch.t && r.t <= contact.t + 400 && (r as unknown as { cam?: V }).cam);
    const jumps: string[] = []; for (let i = 1; i < win.length; i++) { const a = (win[i - 1] as unknown as { cam: V }).cam, b = (win[i] as unknown as { cam: V }).cam; const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); if (d > 1.5) jumps.push(`${win[i].phase}@${f2(win[i].clipTime)}:${f2(d)}m`); }
    const at = contact as unknown as { rimOn: number; heroOn: number };
    // the flight's banner rides at top-[13%] of the stage (≈ 13–19% with its panel); the old 38% band (≈ 38–44%) covered the rim
    const flushRows = R.filter((r) => r.t >= contact.t && r.t <= contact.t + 400 && (r as unknown as { rimV?: number }).rimV != null && (r as unknown as { rimV: number }).rimV >= 0);
    const rimVs = flushRows.map((r) => (r as unknown as { rimV: number }).rimV);
    const vMin = Math.min(...rimVs), vMax = Math.max(...rimVs);
    lines.push(`      rim on screen through the flush (contact → +400 ms): v ${f2(vMin)}–${f2(vMax)} of the frame · under the raised banner band (≤ 0.20) ${rimVs.filter((v) => v <= 0.20).length} · inside the old 38% band (0.36–0.46) ${rimVs.filter((v) => v >= 0.36 && v <= 0.46).length} of ${rimVs.length}`);
    say(jumps.length <= 1 && at.rimOn === 1 && at.heroOn === 1 && rimVs.every((v) => v > 0.21), `C4 the flush on screen: camera cuts > 1.5 m/frame launch → contact+400 ms ${jumps.length} [${jumps.join(' ')}] (≤ 1 = the flight's cut) · at the CONTACT rim in frame ${at.rimOn === 1} · dunker head + hips in frame ${at.heroOn === 1} (the under-rim shot crops at the shins)`);
  }
  // C3 R2 through the ring
  const rim = launch.rim, rb = launch.rb, RR = 0.225;
  const radial = (b: V) => Math.hypot(b.x - rim.x, b.z - rim.z);
  const ringD = (b: V) => Math.hypot(radial(b) - RR, b.y - rim.y);
  if (!contact) say(false, `C3 R2: no CONTACT (a miss) — timing ${timing?.msg ?? '—'}`);
  else {
    const fl = R.filter((r) => r.t >= contact.t && r.t < (replay0?.t ?? resolve.t + 1600));
    const metal = fl.filter((r) => ringD(r.ball) < rb - 0.015);
    let cross: { r: number; vy: number; dt: number } | null = null;
    for (let i = 1; i < fl.length; i++) if (fl[i - 1].ball.y >= rim.y && fl[i].ball.y < rim.y) { const k = (fl[i - 1].ball.y - rim.y) / Math.max(1e-6, fl[i - 1].ball.y - fl[i].ball.y); const bx = fl[i - 1].ball.x + (fl[i].ball.x - fl[i - 1].ball.x) * k, bz = fl[i - 1].ball.z + (fl[i].ball.z - fl[i - 1].ball.z) * k; cross = { r: Math.hypot(bx - rim.x, bz - rim.z), vy: (fl[i].ball.y - fl[i - 1].ball.y) / Math.max(1e-3, (fl[i].t - fl[i - 1].t) / 1000), dt: fl[i].t - contact.t }; break; }
    const minY = Math.min(...fl.map((r) => r.ball.y));
    // the windmill's release must not be the ball "going in" on its own away from the ring: the ball at the contact is AT the ring
    const atContact = contact.ball;
    lines.push(`      resolve @clip ${f2(resolve.clipTime)} root y ${f2(resolve.root.y)} z ${f2(resolve.root.z)} ball y ${f2(resolve.ball.y)} · contact root y ${f2(contact.root.y)} z ${f2(contact.root.z)} · ${ms.filter((m) => /DUNK-SLAM/.test(m.msg)).map((m) => m.msg).join(' | ')}`);
    const ic = mark(/iron contact (\d+) ms into the jam.*let go at ([\d.]+)/); const icm = ic ? /iron contact (\d+) ms into the jam.*let go at ([\d.]+)/.exec(ic.msg) : null;
    const jamMs = icm ? Number(icm[1]) : 999, letGo = icm ? Number(icm[2]) : 9;
    // the let-go is ON the iron (the tube within 4 cm of the ball's surface) or OVER the ring's opening (inside the ring, the ball's bottom at most 8 cm over the rim)
    // (over the opening or the lip: the centre inside the ring's radius + 2 cm; widened from the bare radius after an early press let go
    // centred on the front lip, 0.239 m out, bottom 3 cm over the iron, and dropped through clean)
    const overOpening = radial(atContact) <= RR + 0.02 && atContact.y - rim.y >= 0 && atContact.y - rim.y - rb <= 0.08;
    say(jamMs < 280 && (letGo <= 0.16 || overOpening) && metal.length <= 2 && !!cross && cross.r <= RR - rb + 0.03 && minY <= rim.y - 0.6,
      `C3 R2 through-rim: timing ${timing ? timing.msg.replace(/^\[\w+\] /, '') : '— (no timing flash)'} · the hand takes it to the iron: contact ${jamMs} ms into the jam (< 280 = not the timeout), let go ${f3(letGo)} m off the iron (≤ 0.16${overOpening ? ', or over the opening: yes' : ''}) · ball at the CONTACT ${f3(radial(atContact))} m off the axis, ${f2(atContact.y - rim.y)} m over the ring (parent ${contact.parent || 'free'}) · inside the iron ${metal.length} · crosses the rim plane ${cross ? `${f3(cross.r)} m from the axis (≤ ${f3(RR - rb + 0.03)}) ${f0(cross.dt)} ms after the contact at ${f2(cross.vy)} m/s` : 'NEVER'} · lowest ${f2(minY)} (≤ ${f2(rim.y - 0.6)})`);
  }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const runs: Scenario[] = []; for (let r = 0; r < REPS; r++) runs.push(...picked);
  const out: string[] = [`DUNK-CAR-CLIP probe · ${TAG} · port ${PORT} · shots ${SHOTS} · ${new Date().toISOString()}`];
  let errs: string[] = [];
  for (let gi = 0; gi < runs.length; gi += 3) {
    const { p, close, errors } = await boot();
    for (const [k, sc] of runs.slice(gi, gi + 3).entries()) {
      out.push(`\n## ${gi + k + 1}. ${sc.name}`);
      try { out.push(...await attempt(p, sc, gi + k)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 300)}`); }
      console.log(out.slice(-6).join('\n'));
    }
    errs = errs.concat(errors); await close();
  }
  out.push(`\nconsole errors: ${errs.length}${errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : ''}`);
  out.push(`TOTAL PASS ${out.filter((l) => l.startsWith('PASS')).length} · FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`);
  writeFileSync(`${OUT}/report-${TAG}.md`, out.join('\n'));
  console.log(out.slice(-3).join('\n'));
})();
