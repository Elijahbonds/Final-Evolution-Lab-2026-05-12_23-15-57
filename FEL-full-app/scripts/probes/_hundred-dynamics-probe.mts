// THE-HUNDRED-COMBAT-DYNAMICS probe (2026-09-14) — /dev/mode/karate (The Hundred) through a FAKE Gamepad, sampled on
// every rendered frame. What it measures, from the outside (so the same script reads the base and the change):
//   · PRESS → CLIP: for each button press, the ms until a strike one-shot (re)starts on the hero at weight ≥ 0.5 — a
//     press that never produced a swing inside 900 ms is EATEN.
//   · GROUND SPEED on a held stick, and the time a 180° stick reversal takes to turn the body 150°.
//   · the mode's dev telemetry (scene.metadata.karateNeo) at the end, and every change of its counters over the run.
// SCRIPT = ';' list: wait:<ms> | L:<x>,<y>:<ms> | Lset:<x>,<y> | tap:<btn> | down:<btn> | up:<btn> | mash:<btn>:<n>:<gapMs>
//                    | seq:<btn>,<btn>,..:<gapMs> | near:<m>:<ms> (wait until an agent is within m) | shot:<name> | mark:<label>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = process.env.OUT ?? './shots'; const TAG = process.env.TAG ?? 'hundred';
const SCRIPT = (process.env.SCRIPT ?? 'wait:3000').split(';').map((s) => s.trim()).filter(Boolean);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = []; const logs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
p.on('console', (m) => { const t = m.text(); if (/MISSING CLIP/.test(t) || m.type() === 'error' && !/401|FEL-FRAME/.test(t)) errs.push(t.slice(0, 160)); if (/\[KE-|\[KVS-|\[MC-|\[MATRIX\]|\[SKATE-|\[ARENA\]|\[NEXUS\]/.test(t)) logs.push(t.slice(0, 160)); });
const MODE = process.env.MODE ?? 'karate';   // STORM: the same probe drives karate (Endless), karate_vs and mixedcombat
await p.goto(`${BASE}/dev/mode/${MODE}${process.env.QS ?? ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 240000 });
for (let i = 0; i < 120; i++) {
  if (await p.evaluate(() => !!((window as any).__FEL_DEV__?.scene?.metadata?.karateNeo) || (!!(window as any).__FEL_DEV__?.hero && !!(window as any).__FEL_DEV__.hero()))) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(1500);
}
// the first load compiles for minutes while the mode already fights — reload once so the run starts on a fresh wave 1
await p.reload({ waitUntil: 'domcontentloaded' });
for (let i = 0; i < 120; i++) {
  if (await p.evaluate(() => !!((window as any).__FEL_DEV__?.scene?.metadata?.karateNeo) || (!!(window as any).__FEL_DEV__?.hero && !!(window as any).__FEL_DEV__.hero()))) break;
  const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
  await p.waitForTimeout(500);
}
await p.evaluate(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  const s = window.__FEL_DEV__.scene;
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const under = (n, root) => { for (let c = n; c; c = c.parent) if (c === root) return true; return false; };
  const LOOP = /guard|stance|step|shuffle|run|walk|idle|block|floor|windup/;
  window.__HD = { rows: [], marks: [] };
  s.onAfterRenderObservable.add(() => {
    const h = window.__FEL_DEV__.hero(); if (!h) return; const hr = topOf(h);
    const shots = s.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && under(g.targetedAnimations[0].target, hr) && !LOOP.test(g.name))
      .map((g) => { const a = g.animatables && g.animatables[0]; return [g.name, a ? +(a.weight < 0 ? 1 : a.weight).toFixed(2) : 1, a ? +a.masterFrame.toFixed(1) : 0]; });
    const rp = hr.getAbsolutePosition(); const md = s.metadata && s.metadata.karateNeo;
    window.__HD.rows.push({ t: performance.now(), x: +rp.x.toFixed(3), z: +rp.z.toFixed(3), yaw: +(hr.rotation.y * 180 / Math.PI).toFixed(1), shots, tele: md ? JSON.parse(JSON.stringify(md)) : null, ban: ((document.body.innerText.match(/"banner":\s*"([^"]*)"/) || [])[1] || '') });
    if (window.__HD.rows.length > 20000) window.__HD.rows.shift();
  });
})()`);
const ev = (code: string) => p.evaluate(code);
const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7 };
const press = (n: string, down: boolean) => ev(`(() => { const bt = window.__PAD.buttons[${BTN[n]}]; bt.value = ${down ? 1 : 0}; bt.pressed = ${down}; })()`);
const setL = (x: number, y: number) => ev(`(() => { window.__PAD.axes[0] = ${x}; window.__PAD.axes[1] = ${y}; })()`);
const mark = (label: string) => ev(`window.__HD.marks.push({ t: performance.now(), label: ${JSON.stringify(label)} })`);
const tap = async (n: string) => { await mark(`press:${n}`); await press(n, true); await p.waitForTimeout(60); await press(n, false); };
for (const a of SCRIPT) {
  const [k, ...rest] = a.split(':');
  if (!/^(tap|mash|seq)$/.test(k)) await mark(a);
  if (k === 'wait') await p.waitForTimeout(Number(rest[0]));
  else if (k === 'L') { const [x, y] = rest[0].split(',').map(Number); await setL(x, y); await p.waitForTimeout(Number(rest[1])); await setL(0, 0); }
  else if (k === 'Lset') { const [x, y] = rest[0].split(',').map(Number); await setL(x, y); }
  else if (k === 'tap') await tap(rest[0]);
  else if (k === 'down') { await mark(`press:${rest[0]}`); await press(rest[0], true); }
  else if (k === 'up') await press(rest[0], false);
  else if (k === 'mash') { for (let i = 0; i < Number(rest[1]); i++) { await tap(rest[0]); await p.waitForTimeout(Math.max(0, Number(rest[2]) - 60)); } }
  else if (k === 'seq') { for (const btn of rest[0].split(',')) { await tap(btn); await p.waitForTimeout(Math.max(0, Number(rest[1]) - 60)); } }
  else if (k === 'near') {   // until an agent is within <m> (closing the shop with B if it is open)
    const until = Date.now() + Number(rest[1]);
    while (Date.now() < until) {
      const m = JSON.parse(await ev('JSON.stringify(window.__FEL_DEV__.scene.metadata.karateNeo || {})') as string) as { shop?: boolean; nearestM?: number; aim?: { x: number; z: number } | null; down?: boolean };
      if (m.shop) { await press('B', true); await p.waitForTimeout(60); await press('B', false); await p.waitForTimeout(300); continue; }
      let d = m.nearestM;
      if (d === undefined && m.aim) d = await ev(`(() => { const h = window.__FEL_DEV__.hero(); let c = h; while (c.parent) c = c.parent; const a = window.__FEL_DEV__.scene.metadata.karateNeo.aim; const q = c.getAbsolutePosition(); return Math.hypot(a.x - q.x, a.z - q.z); })()`) as number;
      if (!m.down && d !== undefined && d >= 0 && d <= Number(rest[0])) break;
      await p.waitForTimeout(40);
    }
  }
  else if (k === 'start') { const st = p.locator('text=/^START$/').first(); if (await st.count()) await st.click().catch(() => {}); await p.waitForTimeout(300); }   // the mode's START overlay
  else if (k === 'shot') await p.screenshot({ path: `${OUT}/${TAG}-${rest[0]}.png` });
  else if (k === 'cam') {   // EYE SORES: park the active camera for a close-up — cam:x,y,z:tx,ty,tz (held by a per-frame override until the next cam:off)
    const [px, py, pz] = rest[0].split(',').map(Number); const [tx, ty, tz] = (rest[1] ?? '0,1,0').split(',').map(Number);
    await ev(`(() => { const s = window.__FEL_DEV__.scene; if (window.__camObs) s.onBeforeRenderObservable.remove(window.__camObs); if (${rest[0] === 'off'}) return; window.__camObs = s.onBeforeRenderObservable.add(() => { const c = s.activeCamera; if (!c) return; c.position.set(${px}, ${py}, ${pz}); const tg = c.position.clone(); tg.set(${tx}, ${ty}, ${tz}); if (c.target && c.target.set) c.target.set(${tx}, ${ty}, ${tz}); else if (c.setTarget) c.setTarget(tg); }); })()`);
    await p.waitForTimeout(120);
  }
  else if (k === 'groundy') {   // RACING RELIEF: the ground under the camera and the hero (down rays from y 200), the ground mesh's bounds
    const r = await ev(`(() => { const s = window.__FEL_DEV__.scene; const c = s.activeCamera; const cp = c.globalPosition || c.position; const h = window.__FEL_DEV__.hero ? window.__FEL_DEV__.hero() : null; let hr = h; while (hr && hr.parent) hr = hr.parent; const hp = hr ? hr.getAbsolutePosition() : cp; const g = s.getMeshByName('race_world_ground'); const bb = g ? g.getBoundingInfo().boundingBox : null; const R0 = c.getForwardRay(1); const RayC = R0.constructor, V3 = R0.origin.constructor; const down = (x, z) => { const ray = new RayC(new V3(x, 200, z), new V3(0, -1, 0), 400); const hits = s.multiPickWithRay(ray, (m) => m.name === 'race_world_ground' || m.name.startsWith('kart_road') || m.name.startsWith('road')) || []; return hits.map((q) => q.pickedMesh.name + '@y' + q.pickedPoint.y.toFixed(2)).join('|') || 'none'; }; return 'cam ' + [cp.x, cp.y, cp.z].map((v) => v.toFixed(2)).join(',') + ' under-cam ' + down(cp.x, cp.z) + ' :: hero ' + [hp.x, hp.y, hp.z].map((v) => v.toFixed(2)).join(',') + ' under-hero ' + down(hp.x, hp.z) + ' :: ground bbox y ' + (bb ? bb.minimumWorld.y.toFixed(1) + '..' + bb.maximumWorld.y.toFixed(1) + ' x ' + bb.minimumWorld.x.toFixed(0) + '..' + bb.maximumWorld.x.toFixed(0) : 'none') + ' verts ' + (g ? g.getTotalVertices() : 0); })()`);
    console.log(`groundy ${rest[0] ?? ''}: ${r}`);
  }
  else if (k === 'pick') {   // EYE SORES: what is in front of the camera — the first hits along its forward ray, with distances
    const r = await ev(`(() => { const s = window.__FEL_DEV__.scene; const c = s.activeCamera; if (!c) return 'no camera'; const ray = c.getForwardRay(60); const hits = s.multiPickWithRay(ray) || []; const gp = c.globalPosition || c.position; const p = ray.origin; return 'cam ' + [gp.x, gp.y, gp.z].map((v) => v.toFixed(2)).join(',') + ' origin ' + [p.x, p.y, p.z].map((v) => v.toFixed(2)).join(',') + ' dir ' + [ray.direction.x, ray.direction.y, ray.direction.z].map((v) => v.toFixed(2)).join(',') + ' :: ' + hits.slice(0, 6).map((h) => (h.pickedMesh ? h.pickedMesh.name : '?') + '@' + h.distance.toFixed(2)).join(' | ') + ' | camera parent ' + (c.parent ? c.parent.name : 'none') + ' ' + c.getClassName() + ' minZ ' + c.minZ + ' maxZ ' + c.maxZ + ' fov ' + c.fov.toFixed(2) + ' clear ' + s.clearColor.toHexString() + ' :: ' + ['nexus_sky', 'bk_dome'].map((n) => { const m = s.getMeshByName(n); if (!m) return n + ' missing'; const t = m.material && m.material.emissiveTexture; return n + ' vis ' + m.isVisible + ' en ' + m.isEnabled() + ' tex ' + (t ? t.name + (t.isReady ? (t.isReady() ? ' ready' : ' NOT ready') : '') : 'none'); }).join(' ; '); })()`);
    console.log(`pick ${rest[0] ?? ''}: ${r}`);
  }
  else if (k === 'nearcam') {   // EYE SORES: the hero's root vs the camera, and the closest meshes to the camera (pickable or not)
    const r = await ev(`(() => { const s = window.__FEL_DEV__.scene; const c = s.activeCamera; const cp = c.globalPosition || c.position; const h = window.__FEL_DEV__.hero(); let hr = h; while (hr && hr.parent) hr = hr.parent; const hp = hr ? hr.getAbsolutePosition() : null; const rows = []; for (const m of s.meshes) { if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0) continue; const bi = m.getBoundingInfo(); const ctr = bi.boundingBox.centerWorld; const e = bi.boundingBox.extendSizeWorld; const d = Math.hypot(ctr.x - cp.x, ctr.y - cp.y, ctr.z - cp.z); rows.push([d, m.name, m.isPickable, +(e.x * 2).toFixed(2), +(e.y * 2).toFixed(2), +(e.z * 2).toFixed(2), m.material ? m.material.name : '']); } rows.sort((a, b) => a[0] - b[0]); return 'cam ' + [cp.x, cp.y, cp.z].map((v) => v.toFixed(2)).join(',') + ' hero ' + (hp ? [hp.x, hp.y, hp.z].map((v) => v.toFixed(2)).join(',') + ' (' + hr.name + ')' : 'none') + ' :: ' + rows.slice(0, 8).map((r) => r[1] + ' d' + r[0].toFixed(2) + (r[2] ? '' : ' unpickable') + ' ' + r[3] + 'x' + r[4] + 'x' + r[5] + ' ' + r[6]).join(' | '); })()`);
    console.log(`nearcam ${rest[0] ?? ''}: ${r}`);
  }
  else if (k === 'cams') {   // EYE SORES: the active camera vs the cameras the post-process pipeline renders through
    const r = await ev(`(() => { const s = window.__FEL_DEV__.scene; const names = (a) => (a || []).map((c) => c.name).join(','); const pps = s.postProcessRenderPipelineManager.supportedPipelines.map((pp) => pp.name + ' cams[' + names(pp.cameras) + ']'); return 'active ' + (s.activeCamera ? s.activeCamera.name : 'none') + ' activeCameras[' + names(s.activeCameras) + '] all[' + names(s.cameras) + '] pipelines ' + pps.join(' ; ') + ' :: postProcesses on active ' + (s.activeCamera ? (s.activeCamera._postProcesses || []).filter(Boolean).map((p) => p.name).join(',') : ''); })()`);
    console.log(`cams ${rest[0] ?? ''}: ${r}`);
  }
  else if (k === 'detach') {   // EYE SORES experiment: pull a post-process pipeline off the active camera
    console.log('detach ' + rest[0] + ': ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; try { s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(${JSON.stringify(rest[0])}, s.activeCamera); return 'ok'; } catch (e) { return String(e); } })()`));
    await p.waitForTimeout(150);
  }
  else if (k === 'nofog') { console.log('nofog: ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const r = 'mode ' + s.fogMode + ' density ' + s.fogDensity + ' color ' + s.fogColor.toHexString(); s.fogMode = 0; return r; })()`)); await p.waitForTimeout(150); }
  else if (k === 'hide') {   // EYE SORES bisect: hide every mesh whose name contains the substring, report what was hidden
    console.log('hide ' + rest[0] + ': ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const hit = []; for (const m of s.meshes) if (m.name.includes(${JSON.stringify(rest[0])}) && m.isVisible) { m.isVisible = false; hit.push(m.name); } return hit.length + ' hidden: ' + hit.slice(0, 6).join(','); })()`));
    await p.waitForTimeout(150);
  }
  else if (k === 'pickscreen') {   // EYE SORES: what mesh is under five screen points, INCLUDING unpickable meshes (a custom predicate)
    console.log('pickscreen ' + (rest[0] ?? '') + ': ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const e = s.getEngine(); const W = e.getRenderWidth(), H = e.getRenderHeight(); const pts = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.3, 0.8], [0.8, 0.8]]; return pts.map(([u, v]) => { const r = s.pick(W * u, H * v, (m) => m.isVisible && m.isEnabled() && m.name !== 'bk_dome' && m.name !== 'nexus_sky'); const r2 = s.pick(W * u, H * v, (m) => m.isVisible && m.isEnabled()); return '(' + u + ',' + v + ') ' + (r && r.pickedMesh ? r.pickedMesh.name + '@' + r.distance.toFixed(1) + ' mat ' + (r.pickedMesh.material ? r.pickedMesh.material.name : '-') : 'nothing') + ' [any: ' + (r2 && r2.pickedMesh ? r2.pickedMesh.name + '@' + r2.distance.toFixed(1) : '-') + ']'; }).join(' | '); })()`));
  }
  else if (k === 'noshadow') {   // EYE SORES experiment: drop every shadow generator
    console.log('noshadow: ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const out = []; for (const l of s.lights) { const gens = l.getShadowGenerators ? l.getShadowGenerators() : null; if (gens) for (const g of gens.values()) { out.push(l.name + ':' + (g.useExponentialShadowMap ? 'ESM' : g.usePercentageCloserFiltering ? 'PCF' : 'basic') + ' size ' + g.getShadowMap().getRenderSize() + ' list ' + (g.getShadowMap().renderList || []).length); g.dispose(); } } return out.join(' | ') || 'none'; })()`));
    await p.waitForTimeout(200);
  }
  else if (k === 'layers') {   // EYE SORES: full-screen layers, effect layers (glow / highlight), particle systems, sprites
    console.log('layers: ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const L = (s.layers || []).map((l) => 'layer ' + l.name + ' bg ' + l.isBackground + ' tex ' + (l.texture ? l.texture.name : '-') + ' col ' + l.color.toString()); const E = (s.effectLayers || []).map((l) => l.getClassName() + ' ' + l.name + ' int ' + (l.intensity !== undefined ? l.intensity : '-') + ' blur ' + (l.blurKernelSize !== undefined ? l.blurKernelSize : '-') + ' enabled ' + l.isEnabled); const P = (s.particleSystems || []).map((p) => p.name + ' alive ' + p.getActiveCount()); const SP = (s.spriteManagers || []).map((m) => m.name); return L.concat(E).concat(['particles: ' + P.join(',')]).concat(['sprites: ' + SP.join(',')]).join(' || '); })()`));
  }
  else if (k === 'nolayers') {
    console.log('nolayers: ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const n = (s.layers || []).length + (s.effectLayers || []).length; for (const l of [...(s.layers || [])]) l.dispose(); for (const l of [...(s.effectLayers || [])]) l.dispose(); return n + ' disposed'; })()`));
    await p.waitForTimeout(200);
  }
  else if (k === 'noparticles') { console.log('noparticles: ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const n = s.particleSystems.length; for (const p of [...s.particleSystems]) p.dispose(); return n + ' disposed'; })()`)); await p.waitForTimeout(200); }
  else if (k === 'clock') {   // EYE SORES: the scene clock, the viewport and the render size
    console.log('clock: ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const e = s.getEngine(); const c = s.activeCamera; const cv = e.getRenderingCanvas(); return 'animTimeScale ' + s.animationTimeScale + ' dt ' + e.getDeltaTime().toFixed(1) + ' ratio ' + s.getAnimationRatio().toFixed(2) + ' render ' + e.getRenderWidth() + 'x' + e.getRenderHeight() + ' canvas ' + cv.width + 'x' + cv.height + ' css ' + cv.clientWidth + 'x' + cv.clientHeight + ' viewport ' + JSON.stringify(c.viewport) + ' layerMask ' + c.layerMask + ' mode ' + c.mode + ' fovMode ' + c.fovMode + ' hardwareScaling ' + e.getHardwareScalingLevel() + ' frozen ' + s.isDisposed; })()`));
  }
  else if (k === 'explode') {   // EYE SORES: NaN / huge world matrices, and the POSED vertex extent of skinned meshes (an exploded skin never moves its bounding box)
    console.log('explode: ' + await ev(`(() => { const s = window.__FEL_DEV__.scene; const bad = []; const big = []; for (const m of s.meshes) { if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0) continue; const wm = m.getWorldMatrix().m; let nan = false; for (let i = 0; i < 16; i++) if (!Number.isFinite(wm[i])) nan = true; if (nan) { bad.push(m.name + ' NaN matrix'); continue; } const p = m.getAbsolutePosition(); if (Math.abs(p.x) > 500 || Math.abs(p.y) > 500 || Math.abs(p.z) > 500) bad.push(m.name + ' far ' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + ',' + p.z.toFixed(0)); if (m.skeleton) { const data = m.getPositionData(true, true); if (!data) continue; let maxd = 0, nanv = 0; const n = data.length / 3; const step = Math.max(1, Math.floor(n / 400)); for (let i = 0; i < n; i += step) { const x = data[i * 3], y = data[i * 3 + 1], z = data[i * 3 + 2]; if (!Number.isFinite(x + y + z)) { nanv++; continue; } const d = Math.hypot(x - p.x, y - p.y, z - p.z); if (d > maxd) maxd = d; } if (maxd > 3 || nanv) big.push(m.name + ' posed extent ' + maxd.toFixed(1) + ' m' + (nanv ? ' NaN verts ' + nanv : '')); } } return 'bad[' + bad.join(' ; ') + '] exploded[' + big.join(' ; ') + ']'; })()`));
  }
  else if (k === 'mesh') {   // any mesh by substring: visibility, world position, scaling, bounding radius, material
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; const f = (v) => v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2);
      return s.meshes.filter((m) => m.name.includes(${JSON.stringify(rest[0])})).slice(0, 12).map((m) => m.name + ' vis ' + m.isVisible + ' en ' + m.isEnabled() + ' @' + f(m.getAbsolutePosition()) + ' sc ' + f(m.scaling) + ' r' + m.getBoundingInfo().boundingSphere.radiusWorld.toFixed(2) + ' mat ' + (m.material ? m.material.name + ' a' + m.material.alpha : '-') + ' parent ' + (m.parent ? m.parent.name : '-')).join(String.fromCharCode(10)); })()`) as string;
    console.log('mesh ' + rest[0] + ':' + String.fromCharCode(10) + out);
  }
  else if (k === 'particles') {   // every particle system: alive count, emit rate, emitter position, started
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; return s.particleSystems.map((p) => { const e = p.emitter; const at = e && e.position ? e.position.x.toFixed(1) + ',' + e.position.y.toFixed(1) + ',' + e.position.z.toFixed(1) : (e ? e.x.toFixed(1) + ',' + e.y.toFixed(1) + ',' + e.z.toFixed(1) : '-'); return p.name + ' alive ' + p.getActiveCount() + ' rate ' + p.emitRate.toFixed(0) + ' started ' + p.isStarted() + ' emitter@' + at + ' tex ' + (p.particleTexture ? p.particleTexture.name : '-'); }).join(String.fromCharCode(10)); })()`) as string;
    console.log('particles ' + rest[0] + ':' + String.fromCharCode(10) + out);
  }
  else if (k === 'pinfo') {   // particle systems in depth: rendering group, layer mask, readiness, the camera's mask, fog, particlesEnabled
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; const cam = s.activeCamera; const f = (v) => v ? v.x.toFixed(1) + ',' + v.y.toFixed(1) + ',' + v.z.toFixed(1) : '-';
      const rows = ['particlesEnabled ' + s.particlesEnabled + ' cam ' + (cam ? cam.name + ' mask ' + cam.layerMask.toString(16) + ' @' + f(cam.globalPosition) + ' minZ ' + cam.minZ : '-') + ' fog ' + s.fogMode + '/' + s.fogDensity.toFixed(4)];
      for (const p of s.particleSystems) rows.push(p.name + ' alive ' + p.getActiveCount() + ' rg ' + p.renderingGroupId + ' mask ' + p.layerMask.toString(16) + ' ready ' + p.isReady() + ' started ' + p.isStarted() + ' blend ' + p.blendMode + ' size ' + p.minSize + '-' + p.maxSize + ' scale ' + p.minScaleX + '-' + p.maxScaleX + ' emitter@' + f(p.emitter && p.emitter.position ? p.emitter.position : p.emitter) + ' box ' + f(p.minEmitBox) + '..' + f(p.maxEmitBox) + ' texReady ' + (p.particleTexture ? p.particleTexture.isReady() : '-'));
      const g = s.meshes.filter((m) => /ground|gridiron|field|turf/i.test(m.name) && m.isVisible).map((m) => m.name + ' y' + m.getAbsolutePosition().y.toFixed(3) + ' top' + m.getBoundingInfo().boundingBox.maximumWorld.y.toFixed(3));
      rows.push('grounds: ' + g.join(' | '));
      const h = window.__FEL_DEV__.hero ? window.__FEL_DEV__.hero() : null; rows.push('hero y ' + (h ? h.getAbsolutePosition().y.toFixed(3) : '-'));
      return rows.join(String.fromCharCode(10)); })()`) as string;
    console.log('pinfo ' + rest[0] + ':' + String.fromCharCode(10) + out);
  }
  else if (k === 'hudkeys') {   // the dev page's HUD dump, filtered to the keys named (comma list)
    const keys = rest[0].split('|');
    const out = await ev(`(() => { const t = document.body.innerText; const m = t.match(/\\{[\\s\\S]*\\}/); if (!m) return 'no hud'; try { const h = JSON.parse(m[0]); return ${JSON.stringify(keys)}.map((k) => k + '=' + JSON.stringify(h[k])).join(' '); } catch (e) { return 'unparsed: ' + m[0].slice(0, 200); } })()`) as string;
    console.log('hudkeys ' + rest[1] + ': ' + out);
  }
  else if (k === 'ringinfo') {   // PLAYER RING: where the ring / puck sit against the hero root
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; const r = s.getMeshByName('player_ring'), t = s.getMeshByName('player_tag'); const h = window.__FEL_DEV__.hero ? window.__FEL_DEV__.hero() : null; const f = (v) => v ? v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2) : '-';
      const under = h ? s.pickWithRay(new (r ? r.constructor : Object)(), () => false) : null; void under;
      const hits = h ? (s.multiPick(s.getEngine().getRenderWidth() / 2, s.getEngine().getRenderHeight() / 2, (m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0) || []).sort((a, b) => a.distance - b.distance).slice(0, 4).map((x) => x.pickedMesh.name + '@' + x.distance.toFixed(2) + ' rg' + x.pickedMesh.renderingGroupId + (x.pickedMesh.isPickable ? '' : '(nopick)')).join(' | ') : '';
      const body = h ? h.getChildMeshes(false).find((m) => m.skeleton && /^Body/.test(m.name)) : null; const bodyAt = body ? (() => { body.refreshBoundingInfo(true, true); return f(body.getBoundingInfo().boundingSphere.centerWorld); })() : '-';
      const kids = 'bodyAt ' + bodyAt + ' ' + (h ? h.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0).map((m) => m.name + ':' + m.getBoundingInfo().boundingSphere.radiusWorld.toFixed(2)).slice(0, 12).join(',') : '');
      return 'centre ' + hits + ' | ringRG ' + (r ? r.renderingGroupId : '-') + ' rootScale ' + (h ? f(h.scaling) : '-') + ' kids ' + kids + ' || hero ' + (h ? h.name + '@' + f(h.getAbsolutePosition()) : '-') + ' ring ' + (r ? f(r.getAbsolutePosition()) + ' r' + r.getBoundingInfo().boundingSphere.radiusWorld.toFixed(2) + ' parent ' + (r.parent ? r.parent.name : '-') + ' vis ' + r.isVisible : '-') + ' tag ' + (t ? f(t.getAbsolutePosition()) : '-'); })()`) as string;
    console.log('ringinfo ' + rest[0] + ': ' + out);
  }
  else if (k === 'feet') {   // EYE SORES: shoe / sole meshes' posed world extent + Foot/Toe bone scales, per character
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; const rows = []; const seen = new Set();
      for (const m of s.meshes) { if (!/^(Kit_shoes|KitSole|Body_c)/.test(m.name) || !m.isEnabled() || m.getTotalVertices() === 0) continue;
        const rootN = m.parent ? m.parent.name : '-'; const key = rootN + '|' + m.name.replace(/_c\\d+$/, ''); if (seen.has(key)) continue; seen.add(key);
        m.computeWorldMatrix(true); const pos = m.getPositionData(true, true); const wm = m.getWorldMatrix(); let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9; let bad = 0;
        if (pos) for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1], z = pos[i + 2]; if (!isFinite(x + y + z)) { bad++; continue; } const wx = x * wm.m[0] + y * wm.m[4] + z * wm.m[8] + wm.m[12], wy = x * wm.m[1] + y * wm.m[5] + z * wm.m[9] + wm.m[13], wz = x * wm.m[2] + y * wm.m[6] + z * wm.m[10] + wm.m[14]; minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minY = Math.min(minY, wy); maxY = Math.max(maxY, wy); minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz); }
        const sk = m.skeleton; let boneInfo = '';
        if (sk) { const feet = sk.bones.filter(b => /Foot|Toe/.test(b.name)); boneInfo = feet.map(b => { const am = b.getAbsoluteMatrix ? b.getAbsoluteMatrix() : b.getAbsoluteTransform(); const a = am.m; const sc = [Math.hypot(a[0], a[1], a[2]), Math.hypot(a[4], a[5], a[6]), Math.hypot(a[8], a[9], a[10])]; const lm = b.getLocalMatrix().m; const ls = [Math.hypot(lm[0], lm[1], lm[2]), Math.hypot(lm[4], lm[5], lm[6]), Math.hypot(lm[8], lm[9], lm[10])]; return b.name + ' abs(' + a[12].toFixed(2) + ',' + a[13].toFixed(2) + ',' + a[14].toFixed(2) + ') s' + sc.map(v => v.toFixed(2)).join('/') + ' ls' + ls.map(v => v.toFixed(2)).join('/'); }).join(' ; '); }
        rows.push(m.name + ' fix[' + ((m.metadata && m.metadata.felGarmentFix) || '-') + '] flare ' + ((m.metadata && m.metadata.felEdgeFlare) || 0) + ' p:' + rootN + ' skel ' + (sk ? sk.name + '#' + sk.uniqueId : '-') + ' infl ' + m.numBoneInfluencers + ' gpu ' + m.computeBonesUsingShaders + ' bad ' + bad + ' ext ' + (maxX - minX).toFixed(2) + 'x' + (maxY - minY).toFixed(2) + 'x' + (maxZ - minZ).toFixed(2) + ' @' + ((minX + maxX) / 2).toFixed(1) + ',' + ((minY + maxY) / 2).toFixed(1) + ',' + ((minZ + maxZ) / 2).toFixed(1) + (boneInfo && m.name.startsWith('Kit_shoes') ? ' | ' + boneInfo : '')); }
      return rows.join(String.fromCharCode(10)); })()`) as string;
    console.log('feet ' + rest[0] + ':' + String.fromCharCode(10) + out);
  }
  else if (k === 'ipc') {   // EYE SORES: image-processing config (vignette/exposure/curves) + lights, the two things that can paint a whole frame
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; const c = s.imageProcessingConfiguration; const rows = [];
      rows.push('ipc exposure ' + c.exposure.toFixed(2) + ' contrast ' + c.contrast.toFixed(2) + ' tonemap ' + c.toneMappingEnabled + ' vignette ' + c.vignetteEnabled + ' vw ' + c.vignetteWeight + ' vc ' + c.vignetteColor.r.toFixed(2) + ',' + c.vignetteColor.g.toFixed(2) + ',' + c.vignetteColor.b.toFixed(2) + ',' + c.vignetteColor.a + ' vstretch ' + c.vignetteStretch + ' vcx ' + c.vignetteCenterX + ' vcy ' + c.vignetteCenterY + ' vcam ' + c.vignetteCameraFov + ' vmode ' + c.vignetteBlendMode + ' curves ' + c.colorCurvesEnabled + ' grading ' + c.colorGradingEnabled + ' dither ' + c.ditheringEnabled + ' applyByPP ' + c.applyByPostProcess + ' enabled ' + c.isEnabled);
      rows.push('clear ' + s.clearColor.r.toFixed(2) + ',' + s.clearColor.g.toFixed(2) + ',' + s.clearColor.b.toFixed(2) + ' ambient ' + s.ambientColor.r.toFixed(2) + ',' + s.ambientColor.g.toFixed(2) + ',' + s.ambientColor.b.toFixed(2) + ' fog ' + s.fogMode + ' env ' + (s.environmentTexture ? s.environmentTexture.name : '-') + ' envInt ' + s.environmentIntensity);
      for (const l of s.lights) rows.push('light ' + l.name + ' ' + l.getClassName() + ' on ' + l.isEnabled() + ' int ' + l.intensity.toFixed(2) + ' diff ' + l.diffuse.r.toFixed(2) + ',' + l.diffuse.g.toFixed(2) + ',' + l.diffuse.b.toFixed(2) + ' spec ' + l.specular.r.toFixed(2) + ',' + l.specular.g.toFixed(2) + ',' + l.specular.b.toFixed(2) + (l.direction ? ' dir ' + l.direction.x.toFixed(2) + ',' + l.direction.y.toFixed(2) + ',' + l.direction.z.toFixed(2) : '') + (l.position ? ' pos ' + l.position.x.toFixed(1) + ',' + l.position.y.toFixed(1) + ',' + l.position.z.toFixed(1) : '') + ' range ' + (l.range === undefined ? '-' : l.range) + ' incl ' + l.includedOnlyMeshes.length + ' excl ' + l.excludedMeshes.length + (l.groundColor ? ' ground ' + l.groundColor.r.toFixed(2) + ',' + l.groundColor.g.toFixed(2) + ',' + l.groundColor.b.toFixed(2) : ''));
      const cam = s.activeCamera; rows.push('cam pp ' + cam._postProcesses.filter(Boolean).map(p => p.name + (p.isEnabled ? '' : '(off)')).join(',') + ' up ' + cam.upVector.x.toFixed(2) + ',' + cam.upVector.y.toFixed(2) + ',' + cam.upVector.z.toFixed(2) + ' rot ' + (cam.rotation ? cam.rotation.x.toFixed(2) + ',' + cam.rotation.y.toFixed(2) + ',' + cam.rotation.z.toFixed(2) : '-') + ' target ' + (cam.getTarget ? cam.getTarget().x.toFixed(1) + ',' + cam.getTarget().y.toFixed(1) + ',' + cam.getTarget().z.toFixed(1) : '-'));
      return rows.join(String.fromCharCode(10)); })()`) as string;
    console.log('ipc ' + rest[0] + ':' + String.fromCharCode(10) + out);
  }
  else if (k === 'pickall') {   // EYE SORES: nearest mesh under 9 screen points, ignoring isPickable (skinned meshes included)
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; const cam = s.activeCamera; const e = s.getEngine(); const W = e.getRenderWidth(), H = e.getRenderHeight(); const rows = ['cam minZ ' + cam.minZ + ' maxZ ' + cam.maxZ + ' parent ' + (cam.parent ? cam.parent.name : '-') + ' fov ' + cam.fov.toFixed(2) + ' pos ' + cam.position.x.toFixed(2) + ',' + cam.position.y.toFixed(2) + ',' + cam.position.z.toFixed(2) + ' glob ' + cam.globalPosition.x.toFixed(2) + ',' + cam.globalPosition.y.toFixed(2) + ',' + cam.globalPosition.z.toFixed(2)];
      for (const [fx, fy] of [[0.5,0.5],[0.2,0.2],[0.8,0.2],[0.2,0.8],[0.8,0.8],[0.5,0.1],[0.5,0.9],[0.1,0.5],[0.9,0.5]]) {
        const hits = s.multiPick(fx * W, fy * H, (m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0, cam) || [];
        hits.sort((a, b) => a.distance - b.distance);
        rows.push(fx + ',' + fy + ': ' + hits.slice(0, 4).map(h => h.pickedMesh.name + '@' + h.distance.toFixed(2) + (h.pickedMesh.isPickable ? '' : '(nopick)') + (h.pickedMesh.material ? ' ' + h.pickedMesh.material.name : '')).join(' | ')); }
      return rows.join(String.fromCharCode(10)); })()`) as string;
    console.log('pickall ' + rest[0] + ':' + String.fromCharCode(10) + out);
  }
  else if (k === 'big') {   // EYE SORES: which visible meshes are huge or enclose the camera (pickable or not), with material colour
    const out = await ev(`(() => { const s = window.__FEL_DEV__.scene; const cam = s.activeCamera; const cp = cam.globalPosition.clone(); const rows = [];
      for (const m of s.meshes) { if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0) continue; m.computeWorldMatrix(true); const bi = m.getBoundingInfo(); const r = bi.boundingSphere.radiusWorld; const bb = bi.boundingBox; const inside = bb.minimumWorld.x <= cp.x && cp.x <= bb.maximumWorld.x && bb.minimumWorld.y <= cp.y && cp.y <= bb.maximumWorld.y && bb.minimumWorld.z <= cp.z && cp.z <= bb.maximumWorld.z; const near = bi.boundingSphere.centerWorld.subtract(cp).length();
        if (r > 3 || inside) { const mat = m.material; const col = mat ? (mat.albedoColor || mat.diffuseColor || mat.emissiveColor) : null; const ws = m.getWorldMatrix().m; const sc = { x: Math.hypot(ws[0], ws[1], ws[2]), y: Math.hypot(ws[4], ws[5], ws[6]), z: Math.hypot(ws[8], ws[9], ws[10]) };
          rows.push([m.name, 'r' + r.toFixed(1), inside ? 'INSIDE' : 'd' + near.toFixed(1), m.isPickable ? 'pick' : 'nopick', mat ? mat.name + '/' + mat.getClassName() : '-', col ? col.toHexString() : '-', 'sc' + sc.x.toFixed(2) + ',' + sc.y.toFixed(2) + ',' + sc.z.toFixed(2), m.parent ? 'p:' + m.parent.name : '', m.skeleton ? 'skel' : '', 'layer' + m.layerMask.toString(16), 'rg' + m.renderingGroupId].join(' ')); } }
      return 'cam ' + cp.x.toFixed(1) + ',' + cp.y.toFixed(1) + ',' + cp.z.toFixed(1) + ' mask' + cam.layerMask.toString(16) + String.fromCharCode(10) + rows.join(String.fromCharCode(10)); })()`) as string;
    console.log('big ' + rest[0] + ':\n' + out);
  }
  else if (k === 'grab') {   // EYE SORES: the canvas from INSIDE the page right after a forced render (independent of the screenshot path)
    const data = await ev(`(() => { const s = window.__FEL_DEV__.scene; s.render(); const cv = s.getEngine().getRenderingCanvas(); return cv.toDataURL('image/jpeg', 0.8); })()`) as string;
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${TAG}-${rest[0]}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
    console.log('grab ' + rest[0] + ': ' + data.length + ' bytes');
  }
  else if (k === 'grade') {   // EYE SORES: the image-processing grade (a stuck impact vignette paints the whole frame its colour)
    const r = await ev(`(() => { const s = window.__FEL_DEV__.scene; const ip = s.imageProcessingConfiguration; const out = ['scene ip: vig ' + ip.vignetteEnabled + ' w ' + ip.vignetteWeight.toFixed(2) + ' col ' + ip.vignetteColor.toHexString() + ' exp ' + ip.exposure.toFixed(2) + ' contrast ' + ip.contrast.toFixed(2)]; for (const pp of s.postProcessRenderPipelineManager.supportedPipelines) { const q = pp.imageProcessing && pp.imageProcessing.imageProcessingConfiguration; if (q) out.push(pp.name + ': vig ' + q.vignetteEnabled + ' w ' + q.vignetteWeight.toFixed(2) + ' col ' + q.vignetteColor.toHexString() + ' exp ' + q.exposure.toFixed(2)); } return out.join(' || '); })()`);
    console.log(`grade ${rest[0] ?? ''}: ${r}`);
  }
  else if (k === 'dom') {   // EYE SORES: what DOM sits over the canvas at the frame's centre (a stuck flash / vignette overlay)
    const r = await ev(`(() => { const els = document.elementsFromPoint(window.innerWidth * 0.5, window.innerHeight * 0.55).slice(0, 6); return els.map((e) => { const cs = getComputedStyle(e); return (e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0, 2).join('.') : '')) + ' bg ' + cs.backgroundColor + ' img ' + (cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 60) : '-') + ' op ' + cs.opacity + ' z ' + cs.zIndex + ' pe ' + cs.pointerEvents; }).join(' || '); })()`);
    console.log(`dom ${rest[0] ?? ''}: ${r}`);
  }
  else if (k === 'dump') {   // EYE SORES: every enabled mesh — name, world centre, size, material + texture names (to name what floats)
    const dump = await ev(`(() => { const s = window.__FEL_DEV__.scene; const cp = s.activeCamera ? s.activeCamera.globalPosition || s.activeCamera.position : null; const out = [{ n: '__camera__', top: '', x: cp ? +cp.x.toFixed(2) : 0, y: cp ? +cp.y.toFixed(2) : 0, z: cp ? +cp.z.toFixed(2) : 0, sx: 0, sy: 0, sz: 0, mat: '', tex: '', skel: false }]; for (const m of s.meshes) { if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0) continue; const bi = m.getBoundingInfo(); const c = bi.boundingBox.centerWorld, e = bi.boundingBox.extendSizeWorld; const mat = m.material; const tex = mat && mat.getActiveTextures ? mat.getActiveTextures().map((t) => t.name).join('|') : ''; let top = m; while (top.parent) top = top.parent; out.push({ n: m.name, top: top.name, x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), sx: +(e.x * 2).toFixed(2), sy: +(e.y * 2).toFixed(2), sz: +(e.z * 2).toFixed(2), mat: mat ? mat.name : '', tex, skel: !!m.skeleton }); } return JSON.stringify(out); })()`);
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${TAG}-${rest[0]}.json`, dump as string);
  }
}
type Row = { t: number; x: number; z: number; yaw: number; shots: [string, number, number][]; tele: Record<string, unknown> | null };
const data = await ev('window.__HD') as { rows: Row[]; marks: { t: number; label: string }[] };
await b.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/${TAG}-rows.json`, JSON.stringify(data));
const rows = data.rows; const T0 = rows[0].t; const f = (t: number) => ((t - T0) / 1000).toFixed(2);
// strike starts: a one-shot at weight ≥ 0.5 that is new (name change) or restarted (master frame went back)
const starts: { t: number; clip: string }[] = []; let prev: [string, number, number] | null = null;
for (const r of rows) {
  const top = [...r.shots].sort((a, b) => b[1] - a[1])[0];
  const cur = top && top[1] >= 0.5 ? top : null;
  if (cur && (!prev || prev[0] !== cur[0] || cur[2] + 2 < prev[2])) starts.push({ t: r.t, clip: cur[0] });
  prev = cur;
}
const presses = data.marks.filter((m) => m.label.startsWith('press:') && !/X|L1/.test(m.label));
let eaten = 0; const lat: number[] = []; let si = 0;
for (let i = 0; i < presses.length; i++) {
  const pm = presses[i]; const next = presses[i + 1]?.t ?? Infinity;
  while (si < starts.length && starts[si].t < pm.t) si++;
  const s = starts[si];
  if (s && s.t - pm.t <= 900 && s.t <= next + 900) { lat.push(s.t - pm.t); si++; } else eaten++;
}
console.log(`frames ${rows.length} over ${((rows[rows.length - 1].t - T0) / 1000).toFixed(1)}s · errors ${errs.length} ${errs.slice(0, 3).join(' | ')}`);
console.log(`strike presses ${presses.length} · swings started ${starts.length} · eaten ${eaten} · press→clip ms: ${lat.map((x) => x.toFixed(0)).join(',')}  (median ${lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)].toFixed(0) : '-'})`);
console.log(`swing starts: ${starts.map((s) => `${f(s.t)} ${s.clip}`).join(' · ')}`);
// speed + turn under each L segment
for (const m of data.marks.filter((m) => /^L:|^Lset:/.test(m.label))) {
  const seg = rows.filter((r) => r.t >= m.t + 250 && r.t <= m.t + 700);
  if (seg.length > 2) { const a = seg[0], z = seg[seg.length - 1]; console.log(`   ${f(m.t)} ${m.label}: ground speed ${(Math.hypot(z.x - a.x, z.z - a.z) / ((z.t - a.t) / 1000)).toFixed(2)} m/s`); }
  const y0 = rows.find((r) => r.t >= m.t)?.yaw; if (y0 === undefined) continue;
  { const seg = rows.filter((r) => r.t >= m.t && r.t <= m.t + 900); let span = 0; for (const r of seg) span = Math.max(span, Math.abs(((r.yaw - y0 + 540) % 360) - 180)); console.log(`   ${f(m.t)} ${m.label}: yaw turned up to ${span.toFixed(0)}° inside 0.9 s`); }   // FREE RUN: a fighter apart from the rival turns onto his travel
  const turned = rows.find((r) => r.t >= m.t && Math.abs(((r.yaw - y0 + 540) % 360) - 180) >= 150);
  if (turned) console.log(`   ${f(m.t)} ${m.label}: body turned 150° in ${(turned.t - m.t).toFixed(0)} ms`);
}
// STORM: the dash — the peak ground speed inside 400 ms of each X press (a tap = the dash, a double = the chakra dash)
{ const xs = data.marks.filter((m) => m.label === 'press:X'); const out: string[] = [];
  for (const m of xs) { let peak = 0; const seg = rows.filter((r) => r.t >= m.t && r.t <= m.t + 400); for (let i = 1; i < seg.length; i++) { const dt = (seg[i].t - seg[i - 1].t) / 1000; if (dt > 0) peak = Math.max(peak, Math.hypot(seg[i].x - seg[i - 1].x, seg[i].z - seg[i - 1].z) / dt); } out.push(`${f(m.t)} peak ${peak.toFixed(1)} m/s`); }
  if (out.length) console.log(`dash (X presses): ${out.join(' · ')}`); }
const tel = rows.filter((r) => r.tele);
if (tel.length) {
  const last = tel[tel.length - 1].tele!; const first = tel[0].tele!;
  const nums = Object.keys(last).filter((k) => typeof last[k] === 'number' && typeof first[k] === 'number' && !/^(hp|hpMax|chi|slowMo|timeScale|attackers|enemies|nextLandIn|nearestM|coins)$/.test(k));
  console.log('telemetry deltas:', nums.map((k) => `${k} ${first[k]}→${last[k]}`).filter((s) => !/ (\S+)→\1$/.test(s)).join(' · '));
  if (last.dyn) {
    console.log('dyn last:', JSON.stringify(last.dyn));
    const seen = new Set<string>(); let prevSeq = -1;
    for (const r of tel) { const d = r.tele!.dyn as Record<string, unknown> | undefined; if (d && d.strikeSeq !== prevSeq) { prevSeq = d.strikeSeq as number; seen.add(`${f(r.t)} ${d.lastMove}(${d.string})`); } }
    console.log('moves:', [...seen].join(' · '));
    const bans: string[] = []; let lb = ''; for (const r of rows) { const m = (r.tele && (r.tele as Record<string, unknown>).__ban) as string | undefined; if (m && m !== lb) { bans.push(m); lb = m; } }
  }
  const strs = ['lastString', 'lastMove'].filter((k) => k in last);
  const seen = new Set<string>(); for (const r of tel) for (const k of strs) { const v = String(r.tele![k] ?? ''); if (v) seen.add(`${k}=${v}`); }
  if (seen.size) console.log('moves seen:', [...seen].join(' · '));
}
{ const bl: string[] = []; let lb = ''; for (const r of rows as (Row & { ban?: string })[]) { if (r.ban && r.ban !== lb) bl.push(`${f(r.t)} ${r.ban}`); lb = r.ban ?? ''; } console.log('banners:', bl.join(' · ')); }
if (logs.length) console.log('logs:', logs.slice(-12).join('\n      '));
const arenaLogs = logs.filter((l) => /\[MATRIX\]|\[ARENA\]/.test(l)); if (arenaLogs.length) console.log('matrix/arena:', arenaLogs.join('\n      '));
