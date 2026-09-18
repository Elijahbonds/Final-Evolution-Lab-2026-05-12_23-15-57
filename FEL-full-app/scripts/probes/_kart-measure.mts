// WHERE THE BONES ACTUALLY ARE, in the kart's own space. A pose you can only judge by eye is a pose you
// retune by guessing; these are the numbers the cockpit was built around, read back off the live rig.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto('http://localhost:3061/dev/mode/velocitykart', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(11000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
const out = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const kart = s.getTransformNodeByName('kart');
  const sk = s.skeletons[0];
  if (!kart || !sk) return { err: 'no kart/skeleton', sk: s.skeletons.length };
  const inv = kart.getWorldMatrix().clone(); inv.invert();
  const V = window.BABYLON ? window.BABYLON.Vector3 : null;
  const local = (v) => {
    const m = kart.getWorldMatrix().clone(); m.invert();
    const r = { x: 0, y: 0, z: 0 };
    // manual transform so we do not depend on a BABYLON global
    const d = m.m;
    const w = d[3]*v.x + d[7]*v.y + d[11]*v.z + d[15] || 1;
    r.x = (d[0]*v.x + d[4]*v.y + d[8]*v.z + d[12]) / w;
    r.y = (d[1]*v.x + d[5]*v.y + d[9]*v.z + d[13]) / w;
    r.z = (d[2]*v.x + d[6]*v.y + d[10]*v.z + d[14]) / w;
    return { x: +r.x.toFixed(3), y: +r.y.toFixed(3), z: +r.z.toFixed(3) };
  };
  // a Bone's getAbsolutePosition() with NO mesh is in SKELETON space, not world — the first run of this
  // probe read 150.0 for every z and briefly looked like the driver was not parented at all. Pass the mesh.
  const mesh = s.meshes.find((m) => m.skeleton === sk && m.getTotalVertices() > 0);
  const want = ['Hips','Spine2','Neck','Head','LeftUpLeg','LeftLeg','LeftFoot','RightFoot',
                'LeftArm','LeftForeArm','LeftHand','RightHand','LeftShoulder'];
  const bones = {};
  for (const n of want) {
    const bone = sk.bones.find((x) => x.name === n || x.name.endsWith(':' + n) || x.name.endsWith('_' + n));
    if (bone) bones[n] = local(bone.getAbsolutePosition(mesh));
  }
  const ring = s.getMeshByName('kart_wheel_steer');
  void inv; void V;
  return {
    bones,
    wheel: ring ? local(ring.getAbsolutePosition()) : null,
    groups: s.animationGroups.filter((g) => g.isPlaying).map((g) => g.name),
    boneNames: sk.bones.slice(0, 6).map((x) => x.name),
  };
})()`);
console.log(JSON.stringify(out, null, 1));
await b.close();
