// DUNK-VENICE-ENV-RENDER (2026-09-28) — the Venice dunk scene, framed the same way every run, plus its cost.
//
// Boots /dev/mode/dunk (no auth, no DB), waits for the venue to settle (kit props + the Venice look pass), then:
//  · `game`  — the gameplay camera as the mode leaves it on the approach (the frame a player actually sees);
//  · `wide`, `west`, `east`, `top`, `air`, `reverse` — fixed poses on a camera of the gameplay camera's own class, attached to the
//    shared `fel_pipeline` so the grade is the same as the game frame (a bare swapped camera renders ungraded);
//  · a census of every visible mesh by name family (what the eye is looking at, and how much of it there is);
//  · frame cost: frames/second with vsync and the frame-rate cap OFF (so a cheaper scene actually reads as faster),
//    and the CPU ms between onBeforeRender and onAfterRender, on the `game` and `wide` views.
//
// Env: BASE (default http://localhost:3100), OUT (default ~/Claude/outbox), TAG (file prefix, e.g. before / after),
// QUERY (extra query string, e.g. location=blossom), SECS (fps window per view, default 4).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox`;
const TAG = process.env.TAG ?? 'probe';
const SECS = Number(process.env.SECS ?? 4);
const PREFIX = process.env.PREFIX ?? 'DUNK-VENICE-ENV-RENDER';
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.log('PROBE timed out'); process.exit(2); }, 360000);

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs: string[] = [];
const errorTexts: string[] = [];
let errors = 0;
p.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') { errors++; errorTexts.push(t.slice(0, 200)); }
  if (/NEXUS|FEL-VENICE|VENICE-ENV|kit on|surround|error/i.test(t)) logs.push(`${m.type()}: ${t.slice(0, 220)}`);
});
p.on('pageerror', (e) => { errors++; errorTexts.push(`pageerror: ${String(e).slice(0, 200)}`); });

await p.goto(`${BASE}/dev/mode/dunk${process.env.QUERY ? `?${process.env.QUERY}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForFunction('!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene)', undefined, { timeout: 240000 });
// the venue settles async: kit props, the look pass, the court paint. Wait for the mode to be playing, then give the
// GLB loads a fixed margin so the before and after frames are taken at the same point.
await p.waitForFunction('/playing|countdown/.test(document.body.innerText)', undefined, { timeout: 240000 }).catch(() => {});
await p.waitForTimeout(9000);
await p.evaluate(`(() => { const c = document.querySelector('canvas'); for (const el of document.body.querySelectorAll('*')) { if (el !== c && !el.contains(c)) el.style.visibility = 'hidden'; } })()`);
// PRE=<file>: a page-side script run on the settled scene before anything is framed (a look-dev sketch on the live scene,
// `s` is the scene). Awaited, so it may load textures; its return value is printed.
if (process.env.PRE) {
  const pre = fs.readFileSync(process.env.PRE, 'utf8');
  console.log('PRE →', JSON.stringify(await p.evaluate(`(async () => { const s = window.__FEL_DEV__.scene; ${pre} })()`)));
  await p.waitForTimeout(1500);
}

const measure = async (label: string) => p.evaluate(`(async () => {
  const s = window.__FEL_DEV__.scene; let n = 0, cpu = 0, t0f = 0; const cpuSamples = [];
  const a = s.onBeforeRenderObservable.add(() => { t0f = performance.now(); });
  const z = s.onAfterRenderObservable.add(() => { const d = performance.now() - t0f; cpu += d; cpuSamples.push(d); n++; });
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, ${SECS * 1000}));
  const el = (performance.now() - t0) / 1000;
  s.onBeforeRenderObservable.remove(a); s.onAfterRenderObservable.remove(z);
  cpuSamples.sort((x, y) => x - y);
  return { view: ${JSON.stringify(label)}, fps: +(n / el).toFixed(1), frameMs: +((el * 1000) / Math.max(1, n)).toFixed(2),
    cpuMsAvg: +(cpu / Math.max(1, n)).toFixed(2), cpuMsP90: +(cpuSamples[Math.floor(cpuSamples.length * 0.9)] ?? 0).toFixed(2),
    activeMeshes: s.getActiveMeshes().length, activeTris: (s.getActiveIndices() / 3) | 0, meshes: s.meshes.length };
})()`);

const census = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene; const fam = {}; let verts = 0;
  for (const m of s.meshes) {
    if (!m.isEnabled() || !m.isVisible || !m.getTotalVertices || !m.getTotalVertices()) continue;
    let root = m, chain = [];
    for (let q = m.parent; q; q = q.parent) chain.push(q.name);
    const key = (m.name.replace(/[_.\\-]?\\d+(\\.\\d+)?$/g, '').replace(/_\\d+.*$/, '') || m.name).slice(0, 40) + ' <' + (chain.slice(0, 3).join('<') || '-') + '>';
    const bb = m.getBoundingInfo().boundingBox; const mn = bb.minimumWorld, mx = bb.maximumWorld;
    const f = fam[key] ??= { n: 0, v: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
    f.n++; f.v += m.getTotalVertices(); verts += m.getTotalVertices();
    f.min = [Math.min(f.min[0], mn.x), Math.min(f.min[1], mn.y), Math.min(f.min[2], mn.z)].map((x) => +x.toFixed(1));
    f.max = [Math.max(f.max[0], mx.x), Math.max(f.max[1], mx.y), Math.max(f.max[2], mx.z)].map((x) => +x.toFixed(1));
  }
  return { verts, families: Object.entries(fam).sort((x, y) => y[1].v - x[1].v) };
})()`);
fs.writeFileSync(`${OUT}/${PREFIX}-${TAG}-census.json`, JSON.stringify(census, null, 1));

const perf: unknown[] = [];
await p.screenshot({ path: `${OUT}/${PREFIX}-${TAG}-game.png` });
perf.push(await measure('game'));

// fixed poses: [eye, target]
const POSES: Record<string, [[number, number, number], [number, number, number]]> = {
  wide: [[0, 8.5, 21], [0, 2.2, -12]],
  west: [[7, 3.2, 2], [-40, 4, -14]],
  east: [[-7, 3.2, 2], [40, 4, -14]],
  top: [[0, 95, 2], [0, 0, -4]],
  air: [[5, 1.4, -4], [-1, 5.5, -12]],     // low, looking up past the rim: the dome above the photo band
  reverse: [[0, 4, -17], [0, 2.5, 8]],     // from behind the hoop, looking south: the half of the dome the photo does not cover
};
await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene; const old = s.activeCamera; const V = old.position.constructor;
  const Ctor = Object.getPrototypeOf(old).constructor;
  const cam = new Ctor('__envcam', new V(0, 10, 20), s);
  cam.minZ = 0.3; cam.maxZ = old.maxZ || 2000; cam.fov = 0.9;
  try { s.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('fel_pipeline', cam); } catch (e) { console.warn('envcam: no pipeline', e); }
  window.__envcam = cam;
  s.onBeforeRenderObservable.add(() => { if (s.activeCamera !== cam) s.activeCamera = cam; });
})()`);
for (const [name, [eye, tgt]] of Object.entries(POSES)) {
  await p.evaluate(`(() => { const cam = window.__envcam; const V = cam.position.constructor;
    cam.position = new V(${eye.join(',')}); if (cam.setTarget) cam.setTarget(new V(${tgt.join(',')})); })()`);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${PREFIX}-${TAG}-${name}.png` });
  if (name === 'wide') perf.push(await measure('wide'));
}

const summary = { tag: TAG, base: BASE, errors, errorTexts, perf, verts: (census as { verts: number }).verts, logs };
fs.writeFileSync(`${OUT}/${PREFIX}-${TAG}-perf.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ tag: TAG, errors, perf }, null, 1));
for (const l of logs) console.log('  ', l);
await b.close();
process.exit(0);
