/**
 * AVATAR RENDER VALIDATOR — the gate the Meshy hero never passed.
 *
 *   npx tsx scripts/avatar/validate-render.mts <glb-path> [more.glb ...]
 *
 * Structural cleanliness (pipeline.mts) is necessary but NOT sufficient:
 * elijah-hero.glb was structurally loadable for months while rendering
 * frozen at bind pose. This validator is the honest gate — it loads the
 * asset into real Babylon + WebGL in a headless browser and asserts the
 * RENDER ITSELF changes when a clip plays. A T-posing asset fails here in
 * seconds, not after three sessions of GPU archaeology.
 *
 * Checks per GLB (all measured, none asserted against our own constants):
 *   1. loads via SceneLoader without error
 *   2. required AvatarSkeletonSpec bone names present on the loaded skeleton
 *   3. at least one animation group, and it actually starts
 *   4. skinned world bounds are human-scale (height ∈ [0.5m, 3m]) —
 *      catches cm/m explosions like the 94.4m vertex blowout
 *   5. RENDER pixel-diff between two clip times > threshold —
 *      catches "everything healthy but the screen shows bind pose"
 *   6. mean frame luminance above floor — catches invisible/black renders
 *
 * Self-contained: starts its own static server (no dev server needed).
 * Screenshots land in /tmp/avatar-validate-<name>-t{0,1}.png for eyeballing.
 */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const REQUIRED_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

const inputs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!inputs.length) {
  console.error('usage: npx tsx scripts/avatar/validate-render.mts <glb-path> [...]');
  process.exit(2);
}
for (const f of inputs) {
  if (!existsSync(f)) { console.error(`missing: ${f}`); process.exit(2); }
}

const MIME: Record<string, string> = { '.glb': 'model/gltf-binary', '.html': 'text/html' };

const PAGE = `<!doctype html><html><head><style>html,body{margin:0;background:#223}canvas{width:100vw;height:100vh}</style></head><body>
<canvas id="c"></canvas>
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.babylonjs.com/loaders/babylon.glTF2FileLoader.js"></script>
<script>
window.__RESULT = null;
window.__run = async function(glbUrl) {
  const canvas = document.getElementById('c');
  const engine = new BABYLON.Engine(canvas, true);
  const scene = new BABYLON.Scene(engine);
  // KTX2: Babylon's default transcoder URLs are correct — do NOT override them.
  scene.clearColor = new BABYLON.Color4(0.13, 0.13, 0.2, 1);
  const camera = new BABYLON.ArcRotateCamera('cam', Math.PI / 2, 1.2, 3.2, new BABYLON.Vector3(0, 1, 0), scene);
  camera.attachControl(canvas, true);
  new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0, 1, 0), scene);
  const dir = new BABYLON.DirectionalLight('d', new BABYLON.Vector3(-0.4, -1, -0.6), scene);
  dir.position = new BABYLON.Vector3(2, 4, 3);

  console.log('loading', glbUrl);
  const res = await BABYLON.SceneLoader.ImportMeshAsync('', '/', glbUrl, scene);
  console.log('loaded', res.meshes.length, 'meshes');
  const out = { checks: [], errors: [] };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
  try {
    const skinned = res.meshes.filter((m) => m.skeleton);
    check('loads', true, res.meshes.length + ' meshes');
    const skel = res.skeletons[0];
    check('skeleton present', !!skel, res.skeletons.length + ' skeletons');
    if (skel) {
      const names = new Set(skel.bones.map((b) => b.name));
      const missing = ${JSON.stringify(REQUIRED_BONES)}.filter((b) => !names.has(b));
      check('spec bones', missing.length === 0, missing.length ? 'missing: ' + missing.join(',') : skel.bones.length + ' bones');
    }
    const groups = res.animationGroups;
    check('has clips', groups.length > 0, groups.map((g) => g.name).join(','));
    // Motion check needs a big clip: prefer locomotion over idle (a breathing
    // idle can move less than the pixel threshold while skinning is healthy).
    const clip = groups.find((g) => /^run/i.test(g.name))
      || groups.find((g) => /walk/i.test(g.name))
      || groups.find((g) => /run|walk|idle/i.test(g.name))
      || groups[0];
    if (clip) {
      clip.start(true);
      await new Promise((r) => setTimeout(r, 400));
      check('clip playing', clip.isPlaying, clip.name);
    }
    // human-scale bounds AFTER skeleton applied (CPU truth about the pose)
    for (const m of skinned) { m.refreshBoundingInfo({ applySkeleton: true }); }
    if (skinned.length) {
      const bb = skinned[0].getBoundingInfo().boundingBox;
      const h = bb.maximumWorld.y - bb.minimumWorld.y;
      check('human-scale bounds', h > 0.5 && h < 3, 'height=' + h.toFixed(3) + 'm');
    }
    engine.runRenderLoop(() => scene.render());
    window.__SCENE = scene;
    window.__RESULT = out;
  } catch (e) {
    out.errors.push(String(e && e.stack || e));
    window.__RESULT = out;
  }
};
</script></body></html>`;

// static server: the HTML page + the GLBs under test
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const hit = inputs.find((f) => url === '/' + basename(f));
  if (hit) { res.writeHead(200, { 'content-type': MIME[extname(hit)] ?? 'application/octet-stream' }); res.end(readFileSync(hit)); return; }
  res.writeHead(404); res.end('nope');
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;

const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });

let totalChecks = 0;
let failures = 0;

for (const file of inputs) {
  const name = basename(file, '.glb');
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 200)));
  p.on('console', (m) => console.log('  [page]', m.text().slice(0, 160)));
  p.setDefaultTimeout(45_000);
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  console.log('  page up');
  await p.waitForFunction(() => (window as any).__run, { timeout: 30_000 });
  const runP = (async () => {
    await p.evaluate(`window.__run('${basename(file)}')`);
    await p.waitForFunction(() => (window as any).__RESULT, { timeout: 60_000 });
  })();
  const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('watchdog: load+run exceeded 75s (CDN/network stall?)')), 75_000));
  await Promise.race([runP, timeoutP]);
  await p.waitForTimeout(700); // let a few render frames land
  const shotA = await p.screenshot();
  await p.waitForTimeout(500); // clip advances
  const shotB = await p.screenshot();

  // pixel-diff + luminance without external deps (PNG decode via canvas in page)
  const DIFF_FN = `(async ({ aData, bData }) => {
    const decode = (data) => new Promise((res2) => {
      const img = new Image();
      img.onload = () => res2(img);
      img.src = 'data:image/png;base64,' + data;
    });
    const both = await Promise.all([decode(aData), decode(bData)]);
    const ia = both[0], ib = both[1];
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(ia, 0, 0);
    const da = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0);
    const db = ctx.getImageData(0, 0, c.width, c.height).data;
    let changed = 0, lumSum = 0;
    const n = da.length / 4;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const d = Math.abs(da[o] - db[o]) + Math.abs(da[o + 1] - db[o + 1]) + Math.abs(da[o + 2] - db[o + 2]);
      if (d > 18) changed++;
      lumSum += (da[o] + da[o + 1] + da[o + 2]) / 3;
    }
    return { diffRatio: changed / n, meanLum: lumSum / n / 255 };
  })`;
  const diff = await p.evaluate(`(${DIFF_FN})({ aData: '${shotA.toString('base64')}', bData: '${shotB.toString('base64')}' })`);

  const result = await p.evaluate('window.__RESULT');
  console.log(`\n■ ${name}`);
  for (const chk of result.checks) {
    totalChecks++;
    if (!chk.ok) failures++;
    console.log(`  ${chk.ok ? '✓' : '✗'} ${chk.name}${chk.detail ? ' — ' + chk.detail : ''}`);
  }
  for (const err of result.errors) { failures++; console.log('  ✗ error —', err.slice(0, 300)); }

  // render-motion gate
  const moved = diff.diffRatio > 0.005;
  totalChecks++;
  if (!moved) failures++;
  console.log(`  ${moved ? '✓' : '✗'} render moves with clip — ${(diff.diffRatio * 100).toFixed(2)}% pixels changed (need >0.5%)`);
  const lit = diff.meanLum > 0.04;
  totalChecks++;
  if (!lit) failures++;
  console.log(`  ${lit ? '✓' : '✗'} frame is lit — mean luminance ${diff.meanLum.toFixed(3)}`);

  const { writeFileSync } = await import('node:fs');
  writeFileSync(`/tmp/avatar-validate-${name}-t0.png`, shotA);
  writeFileSync(`/tmp/avatar-validate-${name}-t1.png`, shotB);
  await p.close();
}

await b.close();
server.close();
if (failures) {
  console.log(`\n✗ avatar-render-validate: ${failures} FAILURES across ${totalChecks} checks`);
  process.exit(1);
}
console.log(`\navatar-render-validate: ${totalChecks} checks green`);
