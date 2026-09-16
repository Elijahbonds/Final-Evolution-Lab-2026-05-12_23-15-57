// _accprobe — read the ACCESSORY materials off a live scene.
//
// Written because I twice named a cause for a rendering fault without proving it (a "colour override" that did not
// exist, then the tint plugin, which defaults to disabled). This asks the running game instead: for every accessory
// mesh, what the material actually holds — albedo, emissive, metallic, roughness, whether its bump map is ready, and
// whether the mesh is visible and enabled.
//
//   DYLD_FALLBACK_LIBRARY_PATH=... node node_modules/tsx/dist/cli.mjs scripts/probes/_accprobe.mts
//
// NOTE: this loads /play/dunk and reads the scene WITHOUT pressing TAP TO START, so the bodies have spawned but the
// contest has not begun — the material values are live, a screenshot taken here is the menu.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = 'http://127.0.0.1:3096';
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
{ const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (/\/login/.test(lp.url())) { await lp.fill('input[type="email"]', 'playtest@fel.local'); await lp.fill('input[type="password"]', 'playtest-local-only'); await lp.click('button[type="submit"]');
    const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300); }
  await lp.close(); }
await page.goto(`${BASE}/play/dunk?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
{ const t = Date.now(); while (Date.now() - t < 180000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'playing') break; await page.waitForTimeout(400); } }
await page.waitForTimeout(6000);
const out = await page.evaluate(`(() => {
  const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
  if (!scene) return { err: 'no scene' };
  const accs = scene.meshes.filter((m) => /acc_/.test(m.name));
  return {
    count: accs.length,
    sample: accs.slice(0, 6).map((m) => {
      const mat = m.material;
      return {
        mesh: m.name, mat: mat && mat.name, cls: mat && mat.getClassName && mat.getClassName(),
        albedo: mat && mat.albedoColor ? mat.albedoColor.toHexString() : null,
        emissive: mat && mat.emissiveColor ? mat.emissiveColor.toHexString() : null,
        metallic: mat && mat.metallic, roughness: mat && mat.roughness,
        bump: mat && mat.bumpTexture ? (mat.bumpTexture.isReady ? mat.bumpTexture.isReady() : 'n/a') : 'none',
        ready: mat && mat.isReady ? mat.isReady(m) : 'n/a',
        vis: m.isVisible, enabled: m.isEnabled(),
      };
    }),
  };
})()`);
console.log(JSON.stringify(out, null, 1));
await browser.close();
