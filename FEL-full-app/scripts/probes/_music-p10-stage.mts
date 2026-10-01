// MUSIC-SUITE P10 (2026-09-29) — CLOSE P8's MEDIUM RISK LIVE: the front-audience stage camera's tuned numbers
// (lib/babylon/dance/stageCamera.ts DEFAULT_STAGE_CAMERA) and the dance room's screen flashes, SEEN in the running room
// on the lane's :3121 (/dev/mode/dance — the dev readout, not the /play HUD; every /play route is auth-gated here).
// The P8 proof (p8/proof.json) found the server down and measured none of it.
//
// Runs (each a whole WARM UP, played by the P9 intent driver so the streak builds and an S lands at the end):
//   home-169 · neon-169 · home-phone · neon-phone   (STUDIO = the 'home' look, NEON CLUB = ?place=neon-club;
//   16:9 = 1280×720, phone = 390×844 portrait at DPR 3), and home-169-reduce (?motion=reduce: the app's "reduce
//   flashing" — lib/a11y/reducedMotion.ts motionUrlOverride, the same switch the settings screen writes).
// Every rendered frame (scene.onAfterRenderObservable, the scene from Babylon's EngineStore in the webpack cache):
//   · the camera: world position, its flat distance from the dancer's root, its height, the lateral offset across the
//     dancer→camera line (the SWAY), the aim point's height;
//   · the hero's hands / feet / head (every descendant bone node of __FEL_DEV__.hero() named Hand / Foot / Toe / Head,
//     fingers included) projected through scene.getTransformMatrix() — the frame's own extent, and whether any is cut;
//   · the stage lamps' emissive brightness (prop_lamp_* — the beat bob; reduce flashing must stop its strobe).
// Frames (PNG) at: count-in, mid-song neutral, the first freeze hold (the camera's low shot), the widest streak shot,
// results. At each: the edge sample (a pick ray at 28 points round the border — a ray that meets no mesh is VOID),
// every prop_banner_* / prop_lamp_* / prop_podium_* node's box projected (in view / wholly in view).
// Flashes: every JuiceKit flash layer (a div with `inset: 0` and an opacity transition over a gradient, JuiceKit.ts:177)
// the page adds, timestamped — the most in any 1 s window, and the total.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-stage.mts   (RUNS=home-169,…)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Page } from 'playwright-core';
import { assertDisk, launch, newPage, danceStart, hud, frameStats, markFrames, writeJson, sleep, OUT_ROOT, DESKTOP_169, PHONE, type Any } from './_p10-lib.mts';

const OUT = `${OUT_ROOT}/stage`;
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p10-stage +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
type Run = { id: string; place: string; view: Any; reduce: boolean };
const ALL: Run[] = [
  { id: 'home-169', place: 'home', view: DESKTOP_169, reduce: false },
  { id: 'neon-169', place: 'neon-club', view: DESKTOP_169, reduce: false },
  { id: 'home-phone', place: 'home', view: PHONE, reduce: false },
  { id: 'neon-phone', place: 'neon-club', view: PHONE, reduce: false },
  { id: 'home-169-reduce', place: 'home', view: DESKTOP_169, reduce: true },
];
const RUNS = process.env.RUNS ? ALL.filter((r) => process.env.RUNS!.split(',').includes(r.id)) : ALL;
const SONG = process.env.SONG ?? 'warmup';
const R: Any = { at: new Date().toISOString(), song: SONG, runs: {}, errors: [] as string[] };

/** The per-frame sampler + the flash counter, installed once the song runs. */
const SAMPLER = `(() => {
  const es = (() => { for (const m of Object.values(window.__wreq.c)) { try { const x = m && m.exports && m.exports.EngineStore; if (x && x.Instances) return x; } catch (e) {} } return null; })();
  const sc = es.Instances.flatMap((e) => e.scenes || []).filter((s) => !s.isDisposed).sort((a, b) => b.meshes.length - a.meshes.length)[0];
  const dev = window.__FEL_DEV__; const hero = dev.hero();
  const bare = (n) => n.replace(/^mixamorig:/, '').replace(/_c\\d+$/, '').replace(/_p\\d+$/, '');
  const limbs = hero.getDescendants(false).filter((n) => /Hand|Foot|Toe|Head/.test(bare(n.name || '')) && n.getAbsolutePosition);
  const lamps = sc.transformNodes.filter((n) => n.name.startsWith('prop_lamp_')).flatMap((n) => n.getChildMeshes()).filter((m) => m.material && m.material.emissiveColor);
  const eng = sc.getEngine();
  const S = window.__STAGE = { frames: 0, cut: 0, cutMargin: 0, ext: { minX: 9, maxX: -9, minY: 9, maxY: -9 }, cam: [], lamp: [], limbs: limbs.length, lampMeshes: lamps.length, heroName: hero.name, sc };
  const proj = (m, p, W, H) => { const x = p.x * m[0] + p.y * m[4] + p.z * m[8] + m[12], y = p.x * m[1] + p.y * m[5] + p.z * m[9] + m[13], w = p.x * m[3] + p.y * m[7] + p.z * m[11] + m[15]; return { u: (x / w + 1) / 2, v: (1 - y / w) / 2, front: w > 0 }; };
  window.__PROJ = proj;
  sc.onAfterRenderObservable.add(() => {
    const cam = sc.activeCamera; if (!cam) return;
    const m = sc.getTransformMatrix().m; const W = eng.getRenderWidth(), H = eng.getRenderHeight();
    let cut = false, cutM = false; let fx0 = 9, fx1 = -9, fy0 = 9, fy1 = -9;
    for (const n of limbs) {
      const q = proj(m, n.getAbsolutePosition(), W, H);
      if (!q.front) { cut = true; continue; }
      fx0 = Math.min(fx0, q.u); fx1 = Math.max(fx1, q.u); fy0 = Math.min(fy0, q.v); fy1 = Math.max(fy1, q.v);
      if (q.u < 0 || q.u > 1 || q.v < 0 || q.v > 1) cut = true;
      if (q.u < 0.02 || q.u > 0.98 || q.v < 0.02 || q.v > 0.98) cutM = true;
    }
    S.frames++; if (cut) S.cut++; if (cutM) S.cutMargin++;
    S.ext.minX = Math.min(S.ext.minX, fx0); S.ext.maxX = Math.max(S.ext.maxX, fx1); S.ext.minY = Math.min(S.ext.minY, fy0); S.ext.maxY = Math.max(S.ext.maxY, fy1);
    const cp = cam.globalPosition, hp = hero.getAbsolutePosition();
    const tgt = cam.getTarget ? cam.getTarget() : null;
    const dc = dev.danceClock; const song = dc ? dc.song() : null; const d = window.__DPERF;
    S.cam.push([Math.round(performance.now()), +cp.x.toFixed(3), +cp.y.toFixed(3), +cp.z.toFixed(3), +hp.x.toFixed(3), +hp.z.toFixed(3), tgt ? +tgt.y.toFixed(3) : null, song === null ? null : +song.toFixed(3), d ? d.combo : 0, +fx0.toFixed(3), +fx1.toFixed(3), +fy0.toFixed(3), +fy1.toFixed(3), cut ? 1 : 0]);
    if (S.cam.length > 12000) S.cam.splice(0, 2000);
    if (lamps.length) { let s = 0; for (const l of lamps) { const c = l.material.emissiveColor; s += c.r + c.g + c.b; } S.lamp.push(+(s / lamps.length).toFixed(4)); if (S.lamp.length > 12000) S.lamp.splice(0, 2000); }
  });
  // every JuiceKit flash layer the page adds
  window.__FLASH = [];
  new MutationObserver((ms) => { for (const mu of ms) for (const n of mu.addedNodes) { if (!(n instanceof HTMLElement) || n.tagName !== 'DIV') continue; const st = n.style; if ((st.inset === '0px' || n.style.cssText.includes('inset: 0')) && /opacity/.test(st.transition) && /gradient/.test(st.background || st.backgroundImage || '')) window.__FLASH.push({ t: Math.round(performance.now()), bg: (st.background || '').slice(0, 60) }); } })
    .observe(document.body, { childList: true, subtree: true });
  return { limbs: limbs.length, limbNames: [...new Set(limbs.map((n) => bare(n.name)))].slice(0, 40), lamps: lamps.length, meshes: sc.meshes.length };
})()`;

/** At a screenshot: the edge sample and the beat props in view. */
const LOOK = `(() => {
  const S = window.__STAGE; const sc = S.sc; const eng = sc.getEngine(); const cam = sc.activeCamera; const W = eng.getRenderWidth(), H = eng.getRenderHeight();
  const pts = []; const K = 7;
  for (let i = 0; i < K; i++) { const f = (i + 0.5) / K; pts.push([f, 0.005], [f, 0.995], [0.005, f], [0.995, f]); }
  const vis = (m) => m.isEnabled() && m.isVisible && m.visibility > 0 && m.getTotalVertices() > 0;
  const edge = pts.map(([u, v]) => { const hit = sc.pick(u * W, v * H, vis, false, cam); return { u: +u.toFixed(2), v: +v.toFixed(2), hit: !!(hit && hit.hit), mesh: hit && hit.pickedMesh ? hit.pickedMesh.name.slice(0, 30) : null, dist: hit && hit.hit ? +hit.distance.toFixed(1) : null }; });
  const m = sc.getTransformMatrix().m;
  const props = sc.transformNodes.filter((n) => /^prop_(banner|lamp|podium)_/.test(n.name)).map((n) => {
    const ch = n.getChildMeshes(); let inC = 0, all = 0, front = 0;
    for (const c of ch) { const bb = c.getBoundingInfo().boundingBox; for (const p of bb.vectorsWorld) { const q = window.__PROJ(m, p, W, H); all++; if (q.front) front++; if (q.front && q.u >= 0 && q.u <= 1 && q.v >= 0 && q.v <= 1) inC++; } }
    const c = n.getAbsolutePosition(); const q = window.__PROJ(m, c, W, H);
    return { name: n.name, at: [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)], centreInView: q.front && q.u >= 0 && q.u <= 1 && q.v >= 0 && q.v <= 1, cornersInView: all ? +(inC / all).toFixed(2) : 0, u: +q.u.toFixed(2), v: +q.v.toFixed(2), behindCamera: !q.front };
  });
  const cp = cam.globalPosition; const hp = window.__FEL_DEV__.hero().getAbsolutePosition();
  return { W, H, fov: +cam.fov.toFixed(3), cam: [cp.x, cp.y, cp.z].map((x) => +x.toFixed(2)), hero: [hp.x, hp.y, hp.z].map((x) => +x.toFixed(2)), flatDist: +Math.hypot(cp.x - hp.x, cp.z - hp.z).toFixed(2), clear: sc.clearColor ? [sc.clearColor.r, sc.clearColor.g, sc.clearColor.b].map((x) => +x.toFixed(3)) : null, edgeVoid: edge.filter((e) => !e.hit).length, edgeTotal: edge.length, voidPoints: edge.filter((e) => !e.hit), edgeMeshes: [...new Set(edge.map((e) => e.mesh))].slice(0, 12), props };
})()`;

/** Pixel check on a saved PNG: the share of the outer 2 % border that is pure black / near-black (max channel < 14) —
 *  the "black nothing at the edges" P8 rule (a) names. System python3's PIL reads the frame; node deps stay untouched. */
function pngBorderDark(file: string): number | null {
  try {
    const py = 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB");w,h=im.size;px=im.load();bw=max(2,int(min(w,h)*0.02))\nn=0;d=0\nfor y in range(h):\n  xs=range(w) if (y<bw or y>=h-bw) else list(range(bw))+list(range(w-bw,w))\n  for x in xs:\n    r,g,b=px[x,y];n+=1\n    if max(r,g,b)<14: d+=1\nprint(round(d/n,4))\n';
    return Number(execFileSync('/usr/bin/python3', ['-c', py, file], { encoding: 'utf8', timeout: 120000 }).trim());
  } catch { return null; }
}

async function run(r: Run): Promise<void> {
  R.runs[r.id] = { place: r.place, viewport: r.view.viewport, reduce: r.reduce, disk: assertDisk(r.id) };
  const b = await launch();
  const out: Any = R.runs[r.id];
  try {
    const ctx = await b.newContext(r.view);
    const p = await newPage(ctx, R.errors, r.id);
    const qs = `?track=${SONG}&place=${r.place}${r.reduce ? '&motion=reduce' : ''}`;
    const st = await danceStart(p, qs);
    out.load = { ms: st.loadMs, hook: st.hook, plan: st.plan };
    out.sampler = await p.evaluate(SAMPLER);
    await markFrames(p);
    log(r.id, 'running', JSON.stringify(st.plan), JSON.stringify(out.sampler).slice(0, 200));
    const shots: Any = {};
    const shoot = async (name: string) => {
      const file = `${OUT}/${r.id}-${name}.png`;
      const look = await p.evaluate(LOOK).catch((e: unknown) => ({ err: String(e).slice(0, 200) }));
      const h = await hud(p);
      await p.screenshot({ path: file });
      shots[name] = { file, look, combo: h.combo, round: h.round, banner: h.banner, borderDark: pngBorderDark(file) };
      log(r.id, 'frame', name, `edge void ${look.edgeVoid}/${look.edgeTotal}`, `dist ${look.flatDist}`, `props in view ${(look.props ?? []).filter((x: Any) => x.centreInView).map((x: Any) => x.name).join(',')}`);
    };
    await sleep(1500); await shoot('countin');
    const lenMs = (st.plan?.lengthSec ?? 100) * 1000;
    const start = Date.now();
    let got = { neutral: false, freeze: false, streak: false };
    let camBase: number | null = null;
    while (Date.now() - start < lenMs + 6000) {
      const s = await p.evaluate(() => { const S = (window as Any).__STAGE; const c = S.cam[S.cam.length - 1]; return c ? { y: c[2], combo: c[8], song: c[7] } : null; });
      const el = Date.now() - start;
      if (s) {
        if (camBase === null && el > 3000) camBase = s.y;
        if (!got.neutral && el > 9000) { got.neutral = true; await shoot('neutral'); }
        if (!got.freeze && camBase !== null && s.y < camBase - 0.35) { got.freeze = true; await sleep(250); await shoot('freeze'); }
        if (!got.streak && s.combo >= 24) { got.streak = true; await sleep(400); await shoot('streak'); }
      }
      if (await p.evaluate(() => (window as Any).__DRV?.done)) break;
      await sleep(80);
    }
    out.frameTimes = await frameStats(p);
    await sleep(3500); await shoot('results');
    const S = await p.evaluate(() => { const S = (window as Any).__STAGE; return { frames: S.frames, cut: S.cut, cutMargin: S.cutMargin, ext: S.ext, cam: S.cam, lamp: S.lamp, limbs: S.limbs, lampMeshes: S.lampMeshes }; });
    const flashes = await p.evaluate(() => (window as Any).__FLASH);
    const judge = await p.evaluate(() => { const d = (window as Any).__DPERF; return d ? { score: d.score, maxCombo: d.maxCombo, counts: d.counts, result: d.result ? d.result() : null } : null; });
    out.shots = shots; out.judge = judge;
    out.framing = { frames: S.frames, limbNodes: S.limbs, framesAnyLimbCut: S.cut, framesAnyLimbWithin2pctOfEdge: S.cutMargin, limbExtent: Object.fromEntries(Object.entries(S.ext).map(([k, v]) => [k, +(v as number).toFixed(3)])) };
    // camera: distance / height / sway / aim, overall and at the streak top
    const rows = S.cam as number[][];
    const flat = rows.map((c) => ({ t: c[0], d: Math.hypot(c[1] - c[4], c[3] - c[5]), y: c[2], aimY: c[6], song: c[7], combo: c[8], cx: c[1], cz: c[3], hx: c[4], hz: c[5] }));
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    const q = (a: number[], f: number) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null; };
    const axis = (() => { const dx = mean(flat.map((f) => f.cx - f.hx)), dz = mean(flat.map((f) => f.cz - f.hz)); const l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; })();
    const lateral = flat.map((f) => (f.cx - f.hx) * -axis.z + (f.cz - f.hz) * axis.x);
    const low = flat.filter((f) => f.combo < 4 && f.song !== null && f.song > 2);
    const high = flat.filter((f) => f.combo >= 24);
    const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);
    out.camera = {
      samples: flat.length,
      distance: { min: r3(Math.min(...flat.map((f) => f.d))), p50: r3(q(flat.map((f) => f.d), 0.5)), max: r3(Math.max(...flat.map((f) => f.d))), lowComboP50: r3(q(low.map((f) => f.d), 0.5)), streak24P50: r3(q(high.map((f) => f.d), 0.5)) },
      height: { min: r3(Math.min(...flat.map((f) => f.y))), p50: r3(q(flat.map((f) => f.y), 0.5)), max: r3(Math.max(...flat.map((f) => f.y))) },
      aimHeight: { p50: r3(q(flat.filter((f) => f.aimY !== null).map((f) => f.aimY as number), 0.5)) },
      sway: { lateralP05: r3(q(lateral, 0.05)), lateralP95: r3(q(lateral, 0.95)), peakToPeak: r3((q(lateral, 0.95) ?? 0) - (q(lateral, 0.05) ?? 0)) },
      // the push: the in-beat range of the distance at low combo (the widen is ~0 there), p95 − p05
      pushRangeLowCombo: r3((q(low.map((f) => f.d), 0.95) ?? 0) - (q(low.map((f) => f.d), 0.05) ?? 0)),
    };
    // flashes: the most in any 1 s window, the total, by colour
    const ft = (flashes as Any[]).map((f) => f.t).sort((a, b) => a - b);
    let maxIn1s = 0; for (let i = 0, j = 0; i < ft.length; i++) { while (ft[i] - ft[j] >= 1000) j++; maxIn1s = Math.max(maxIn1s, i - j + 1); }
    const byColour: Any = {}; for (const f of flashes as Any[]) { const k = (/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i.exec(f.bg)?.[0] ?? f.bg).slice(0, 30); byColour[k] = (byColour[k] ?? 0) + 1; }
    const playSec = (rows.length ? (rows[rows.length - 1][0] - rows[0][0]) / 1000 : 1);
    out.flashes = { total: ft.length, maxIn1s, perSecAvg: +(ft.length / playSec).toFixed(3), byColour, first: (flashes as Any[]).slice(0, 12) };
    // the lamps: the beat bob's frame-to-frame swing and overall range (reduce flashing must stop the strobe)
    const L = S.lamp as number[];
    const dl = L.slice(1).map((x, i) => Math.abs(x - L[i]));
    out.lamps = { meshes: S.lampMeshes, samples: L.length, min: q(L, 0), p05: q(L, 0.05), p95: q(L, 0.95), max: q(L, 1), frameDeltaP95: r3(q(dl, 0.95)), frameDeltaMax: r3(dl.length ? Math.max(...dl) : 0) };
    fs.writeFileSync(`${OUT}/${r.id}-camera-trace.json`, JSON.stringify({ cols: ['ms', 'camX', 'camY', 'camZ', 'heroX', 'heroZ', 'aimY', 'song', 'combo', 'limbMinU', 'limbMaxU', 'limbMinV', 'limbMaxV', 'cut'], rows }));
    log(r.id, 'done', JSON.stringify({ framing: out.framing, camera: out.camera, flashes: { total: out.flashes.total, maxIn1s }, lamps: out.lamps, fps: out.frameTimes, judge: judge && { score: judge.score, maxCombo: judge.maxCombo } }).slice(0, 900));
    await ctx.close();
  } catch (e) { out.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); log(r.id, 'FATAL', out.fatal.slice(0, 300)); }
  finally { await b.close(); }
  writeJson(`${OUT}/stage-proof.json`, R);
}

for (const r of RUNS) await run(r);
R.runtimeSec = Math.round((Date.now() - t0) / 1000);
writeJson(`${OUT}/stage-proof.json`, R);
log('wrote', `${OUT}/stage-proof.json`, R.errors.length ? `errors ${R.errors.length}` : 'no page errors');
