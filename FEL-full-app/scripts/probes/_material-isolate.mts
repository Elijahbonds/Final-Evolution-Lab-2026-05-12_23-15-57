// _material-isolate — separate a material from its lighting, in three frames.
//
// WHY. A headband whose albedo reads navy (`#1D3557`, measured off the live material) renders pale blue-grey on
// screen. I named three causes for that without proving any of them. This is the experiment that actually decides it,
// and it needs no camera work and no engine globals — only three renders of the same frame:
//
//   A  BASELINE     the scene as it ships.
//   B  UNLIT        `material.unlit = true` on the mesh under test. An unlit PBR material draws its albedo and
//                   nothing else — no IBL, no lights, no sheen. If the band goes NAVY here, the material is correct
//                   and something in the LIGHTING is washing it. If it stays pale here, the material is not what I
//                   think it is, or the pale thing on screen is not this mesh at all.
//   C  NO IBL       baseline again but with `scene.environmentTexture = null`. If B says lighting and C goes navy,
//                   the environment map is the specific culprit; if C stays pale, it is the direct lights.
//
// Two frames answer the question; the third says which half of the lighting did it.
//
//   MESH=headband DYLD_FALLBACK_LIBRARY_PATH=... node node_modules/tsx/dist/cli.mjs scripts/probes/_material-isolate.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const MESH = process.env.MESH ?? 'headband';
const TAG = process.env.TAG ?? 'isolate';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/dunk`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (/\[ISO\]/.test(t)) console.log(t); });

{ // login
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (/\/login/.test(lp.url())) {
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await lp.click('button[type="submit"]');
    const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300);
  }
  await lp.close();
}
await page.goto(`${BASE}/play/dunk?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
{ const t = Date.now(); while (Date.now() - t < 180000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'playing') break; await page.waitForTimeout(400); } }

// THE GAME HAS TO BE PLAYING. Read at the menu, the canvas is behind an opaque splash and every screenshot is the
// splash — which is how the first attempt at this test produced a picture of the start screen.
const start = page.locator('text=/^(TAP TO START|START|PLAY)$/').first();
if (await start.count()) await start.first().click().catch(() => {});
await page.waitForTimeout(5000);

/** Find the meshes under test and report what their materials hold. */
const found = await page.evaluate(`(() => {
  const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
  if (!scene) return { err: 'no scene' };
  const re = new RegExp(${JSON.stringify(MESH)});
  const hit = scene.meshes.filter((m) => re.test(m.name) && m.material);
  window.__ISO = hit;
  return {
    count: hit.length,
    env: !!scene.environmentTexture,
    items: hit.map((m) => ({
      mesh: m.name,
      albedo: m.material.albedoColor ? m.material.albedoColor.toHexString() : null,
      metallic: m.material.metallic, roughness: m.material.roughness,
      unlit: !!m.material.unlit,
      visible: m.isVisible && m.isEnabled(),
    })),
  };
})()`);
console.log('[ISO] found', JSON.stringify(found, null, 1));

const shot = async (name: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` }); };

await shot('A-baseline');

// B — UNLIT: the material draws its albedo and nothing else.
await page.evaluate(`(() => { for (const m of (window.__ISO || [])) m.material.unlit = true; })()`);
await shot('B-unlit');

// C — NO IBL: lit as it ships, but with the environment map taken away.
await page.evaluate(`(() => {
  for (const m of (window.__ISO || [])) m.material.unlit = false;
  const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
  if (scene) { window.__ISO_ENV = scene.environmentTexture; scene.environmentTexture = null; }
})()`);
await shot('C-no-ibl');

// D — SHADOWS BACK ON. Every accessory is created with `receiveShadows = false`, while the garments around it receive
// the scene's shadow map. An unshadowed surface in a scene where everything else is partly shadowed reads as brighter
// and flatter than it should — which is a very good description of the fault.
await page.evaluate(`(() => {
  const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
  if (scene && window.__ISO_ENV) scene.environmentTexture = window.__ISO_ENV;
  for (const m of (window.__ISO || [])) m.receiveShadows = true;
})()`);
await shot('D-shadows');

// E — SHEEN OFF. Sheen is a broad, WHITE, grazing-angle lobe, and a tube or a ring is nothing but grazing angles from
// any viewpoint: on a cylinder it is applied to most of the visible surface at once rather than to a rim.
await page.evaluate(`(() => { for (const m of (window.__ISO || [])) if (m.material.sheen) m.material.sheen.intensity = 0; })()`);
await shot('E-no-sheen');

// F — AND THE WEAVE OFF TOO, to tell the two apart.
await page.evaluate(`(() => { for (const m of (window.__ISO || [])) m.material.bumpTexture = null; })()`);
await shot('F-no-sheen-no-bump');

// G — EVERY LIGHT OFF, and the environment already back on from D. If the item still renders pale with no direct
// light at all, nothing about the LIGHTING is doing it and the answer is in the material or the post pipeline.
const lights = await page.evaluate(`(() => {
  const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
  if (!scene) return null;
  const out = scene.lights.map((l) => ({ name: l.name, cls: l.getClassName(), intensity: l.intensity,
    diffuse: l.diffuse ? l.diffuse.toHexString() : null, ground: l.groundColor ? l.groundColor.toHexString() : null }));
  for (const l of scene.lights) l.intensity = 0;
  return out;
})()`);
console.log('[ISO] lights', JSON.stringify(lights));
await shot('G-no-lights');

console.log(`[ISO] → ${OUT}/${TAG}-{A,B,C,D,E,F,G}*.png`);
await browser.close();
