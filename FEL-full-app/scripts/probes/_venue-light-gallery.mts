// _venue-light-gallery — one frame and one light census per venue mode.
//
// THE CHANGE THIS PROVES. `ModeHarness` mounts a light rig for EVERY mode (`fel_hemi` + `fel_sun` + a cascaded shadow
// map). `buildNexusScene` then built a second pair of its own (`nexus_fill` + `nexus_sun`) plus another shadow map, so
// every one of the sixteen mode files that mounts a venue has been lit twice — measured on the live dunk scene at 3.66
// of directional and 1.35 of hemispheric, roughly double what the materials are balanced against.
//
// `mountVenue` now drops the venue's pair when the scene already carries a mode rig. That is a visual change to most
// of the game, so it does not get asserted — it gets photographed, with the light census printed beside each frame:
//
//   BASE=http://127.0.0.1:3096 TAG=after node node_modules/tsx/dist/cli.mjs scripts/probes/_venue-light-gallery.mts
//
// `/dev/mode/<key>` renders a mode with no auth, which is what makes a sixteen-mode sweep cheap.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const TAG = process.env.TAG ?? 'lights';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/venue-lights`;
fs.mkdirSync(OUT, { recursive: true });

/**
 * Every mode whose file calls mountVenue, by its /play ROUTE.
 *
 * Not `/dev/mode/<key>`: that route only exists under `next dev` and 404s under `next start`, which is what a
 * production build serves — a trap already recorded in this repo and walked into again here.
 */
const VENUE_MODES = [
  'onevone', 'threevthree', 'dunk', 'dunkduel', 'threepoint',
  'karate', 'karate-vs', 'showdown', 'duel',
  'football', 'golf', 'dance', 'carnival', 'brain-brawl', 'who-scene-it',
];
const modes = ONLY ?? VENUE_MODES;

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
{ // /play needs a session
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
await ctx.addInitScript({ content: `(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()` });

type Row = { mode: string; lights: { name: string; cls: string; intensity: number }[]; directional: number; hemi: number; shadowMaps: number; err?: string };
const rows: Row[] = [];

for (const mode of modes) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/play/${mode}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('canvas', { timeout: 120000 });
    { const t = Date.now(); while (Date.now() - t < 120000) { const st = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (st === 'loaded' || st === 'playing') break; await page.waitForTimeout(400); } }
    // the canvas is behind an opaque splash until the game starts, so a frame taken before this is a picture of a menu
    const startBtn = page.locator('text=/^(TAP TO START|START|PLAY)$/').first();
    if (await startBtn.count()) await startBtn.first().click().catch(() => {});
    await page.waitForTimeout(9000);   // the venue, the bodies and the first frames
    const census = await page.evaluate(`(() => {
      const q = window.__FEL_QA__;
      const scene = (q && q.scene && q.scene()) || (window.BABYLON && window.BABYLON.Engine && window.BABYLON.Engine.LastCreatedScene);
      if (!scene) return { err: 'no scene' };
      let shadowMaps = 0;
      for (const l of scene.lights) { const g = l.getShadowGenerators && l.getShadowGenerators(); if (g) shadowMaps += g.size ?? 0; }
      return {
        lights: scene.lights.map((l) => ({ name: l.name, cls: l.getClassName(), intensity: +l.intensity.toFixed(2) })),
        directional: +scene.lights.filter((l) => l.getClassName() === 'DirectionalLight').reduce((a, l) => a + l.intensity, 0).toFixed(2),
        hemi: +scene.lights.filter((l) => l.getClassName() === 'HemisphericLight').reduce((a, l) => a + l.intensity, 0).toFixed(2),
        shadowMaps,
      };
    })()`) as Omit<Row, 'mode'>;
    await page.screenshot({ path: `${OUT}/${TAG}-${mode}.png` });
    rows.push({ mode, ...census });
    const c = census as Row;
    console.log(`${mode.padEnd(14)} dir ${String(c.directional ?? '?').padStart(5)} · hemi ${String(c.hemi ?? '?').padStart(5)} · shadow maps ${c.shadowMaps ?? '?'} · ${(c.lights ?? []).map((l) => l.name).join(', ')}`);
  } catch (e) {
    rows.push({ mode, lights: [], directional: -1, hemi: -1, shadowMaps: -1, err: String((e as Error)?.message ?? e).slice(0, 120) });
    console.log(`${mode.padEnd(14)} FAILED: ${String((e as Error)?.message ?? e).slice(0, 100)}`);
  }
  await page.close();
}

fs.writeFileSync(`${OUT}/census-${TAG}.json`, JSON.stringify(rows, null, 1));
console.log(`\n→ ${OUT}/census-${TAG}.json and ${TAG}-<mode>.png`);
await browser.close();
