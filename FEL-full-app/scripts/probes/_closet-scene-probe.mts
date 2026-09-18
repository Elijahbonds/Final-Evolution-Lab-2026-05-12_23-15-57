// Read the Closet preview's scene: bone node scales/positions and skinned bounds.
import { chromium, request } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const cookies = (await rc.storageState()).cookies; await rc.dispose();
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addCookies(cookies);
const page = await ctx.newPage();
const logs: string[] = []; page.on('console', (m) => { if (/FEL|rror|warn/i.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
await page.goto(`${BASE}/closet`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30_000 }); await page.waitForTimeout(3000);
const js = [
  "(() => {",
  "  const P = window.__FEL_PREVIEW__; if (!P) return 'no hook';",
  "  const { scene, spawned } = P; const sk = spawned.skeleton;",
  "  const bones = ['Hips','Spine2','Head','LeftFoot','LeftUpLeg','RightArm'].map(n => { const b = sk.bones.find(x => x.name.replace(/_c\\d+$/,'') === n); const t = b && b.getTransformNode(); if (!t) return n + ':none'; t.computeWorldMatrix(true); const p = t.getAbsolutePosition(), s = t.absoluteScaling; return n + ':' + [p.x,p.y,p.z].map(v => v.toFixed(2)).join(',') + ' s=' + [s.x,s.y,s.z].map(v => v.toFixed(2)).join(','); });",
  "  const hex = (c) => c ? '#' + [c.r,c.g,c.b].map(v => Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('') : '-';",
  "  const meshes = spawned.meshes.map(m => { m.refreshBoundingInfo(true); const bb = m.getBoundingInfo().boundingBox; const mat = m.material; return { mesh: m.name.replace(/_c\\d+$/,''), mat: mat ? mat.name : '?', color: mat ? hex(mat.albedoColor || mat.diffuseColor) : '-', vis: m.isVisible, en: m.isEnabled(), ready: mat ? mat.isReady(m, true) : null, verts: m.getTotalVertices(), morphs: m.morphTargetManager ? m.morphTargetManager.numTargets : 0, c: [bb.centerWorld.x,bb.centerWorld.y,bb.centerWorld.z].map(v => +v.toFixed(2)), sz: +bb.extendSizeWorld.scale(2).length().toFixed(2) }; });",
  "  const anims = scene.animationGroups.filter(g => g.isPlaying).map(g => g.name);",
  "  return JSON.stringify({ rootScale: [spawned.root.scaling.x, spawned.root.scaling.y, spawned.root.scaling.z], rootPos: [spawned.root.position.x, spawned.root.position.y, spawned.root.position.z], bones, meshes, playing: anims, morphMeshes: spawned.meshes.filter(m => m.morphTargetManager).length });",
  "})()",
].join(String.fromCharCode(10));
console.log(await page.evaluate(js));
// force-compile the skin material and surface the shader error, if any
const compile = [
  "(async () => {",
  "  const P = window.__FEL_PREVIEW__; if (!P) return 'no hook';",
  "  const m = P.spawned.meshes.find(x => x.material && /^skin/.test(x.material.name)); if (!m) return 'no skin mesh';",
  "  const mat = m.material;",
  "  try { await mat.forceCompilationAsync(m, { clipPlane: false, useInstances: false }); return 'compiled: ' + mat.name + ' ready=' + mat.isReady(m, true); }",
  "  catch (e) { return 'COMPILE ERROR: ' + String(e && (e.message || e)).slice(0, 700); }",
  "})()",
].join(String.fromCharCode(10));
console.log(await page.evaluate(compile));
const texState = [
  "(() => { const P = window.__FEL_PREVIEW__; const m = P.spawned.meshes.find(x => x.material && /^skin/.test(x.material.name)); const mat = m.material;",
  "  const b = mat.bumpTexture; const it = b && b.getInternalTexture(); let after = null; after = b ? b.isReady() : null;",
  "  const sameScene = b ? (b.getScene() === P.scene) : null; const sameEngine = b ? (b.getScene().getEngine() === P.scene.getEngine()) : null; const matScene = mat.getScene() === P.scene; const engDisposed = b ? b.getScene().getEngine().isDisposed : null;",
  "  return JSON.stringify({ sameScene, sameEngine, matScene, engDisposed, internal: it ? { ready: it.isReady, w: it.width } : null, readyAfterUpdate: after, bump: mat.bumpTexture ? { ready: mat.bumpTexture.isReady(), cls: mat.bumpTexture.getClassName() } : null, albedoTex: mat.albedoTexture ? mat.albedoTexture.isReady() : null, translucency: mat.subSurface.isTranslucencyEnabled, scattering: mat.subSurface.isScatteringEnabled, morphTex: m.morphTargetManager ? m.morphTargetManager.isUsingTextureForTargets : null }); })()",
].join(String.fromCharCode(10));
console.log(await page.evaluate(texState));
console.log('logs:', logs.slice(0, 8).join(' | ') || 'none');
await b.close();
