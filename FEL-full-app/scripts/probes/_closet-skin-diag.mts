// One-off: in the Closet, does the skinned mesh follow the animated bone nodes? (dev-only ?hero=)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000', HERO = process.env.HERO ?? '';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const rc = ctx.request; const csrf = (await (await rc.get(`${BASE}/api/auth/csrf`)).json()).csrfToken as string;
await rc.post(`${BASE}/api/auth/callback/credentials`, { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await ctx.newPage();
await p.goto(`${BASE}/closet${HERO ? `?hero=${HERO}` : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(4000);
const info = await p.evaluate(`(() => {
  const s = window.__FEL_PREVIEW__?.spawned; if (!s) return 'no preview';
  const out = { skeletons: [], meshes: [] };
  const seen = new Set();
  for (const m of s.meshes) {
    const sk = m.skeleton; if (!sk) { out.meshes.push({ mesh: m.name, skeleton: null }); continue; }
    const rh = sk.bones.find((b) => /RightHand/.test(b.name));
    let nodePos = null, bonePos = null;
    if (rh) { const t = rh.getTransformNode(); if (t) { t.computeWorldMatrix(true); const v = t.getAbsolutePosition(); nodePos = [v.x, v.y, v.z].map((x) => +x.toFixed(2)); } const bp = rh.getAbsolutePosition(m); bonePos = [bp.x, bp.y, bp.z].map((x) => +x.toFixed(2)); }
    out.meshes.push({ mesh: m.name, skeleton: sk.name, sameAsSpawn: sk === s.skeleton, verts: m.getTotalVertices(), influencers: m.numBoneInfluencers, shaders: m.computeBonesUsingShaders, rightHandNode: nodePos, rightHandSkin: bonePos, linked: !!(rh && rh.getTransformNode()) });
    if (!seen.has(sk)) { seen.add(sk); out.skeletons.push({ name: sk.name, bones: sk.bones.length, needInitialSkinMatrix: sk.needInitialSkinMatrix, useTextureToStoreBoneMatrices: sk.useTextureToStoreBoneMatrices }); }
  }
  out.spawnSkeleton = s.skeleton && s.skeleton.name; out.morphs = s.meshes.map((m) => m.morphTargetManager ? m.morphTargetManager.numTargets : 0);
  return JSON.stringify(out);
})()`);
console.log(info);
await b.close();
