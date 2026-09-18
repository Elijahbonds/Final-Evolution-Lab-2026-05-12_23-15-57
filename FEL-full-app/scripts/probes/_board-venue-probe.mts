// VENUE + DECK probe — does the pick reach the world and the board?
//
// env: BASE VENUE DECK MODE (skateboard)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'skateboard';
const VENUE = process.env.VENUE ?? '';
const DECK = process.env.DECK ?? '';
const OUT = process.env.OUT ?? './shots';
fs.mkdirSync(OUT, { recursive: true });
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0; const lines: string[] = [];
p.on('console', (m) => { const x = m.text(); if (/\[SKATE-VENUE\]|\[FEL-BOARD\]/.test(x)) lines.push(x); if (m.type() === 'error' && !/401/.test(x)) errors++; });
p.on('pageerror', (e) => { errors++; lines.push('PAGEERROR ' + e.message.slice(0, 120)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
const q = [VENUE ? `venue=${VENUE}` : '', DECK ? `deck=${DECK}` : ''].filter(Boolean).join('&');
await p.goto(`${BASE}/dev/mode/${MODE}${q ? '?' + q : ''}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3500); }
await p.evaluate(`(() => { const pad = window.__PAD; setInterval(() => { pad.axes[1] = -1; pad.timestamp = performance.now(); }, 60); })()`);
await p.waitForTimeout(7000);
await p.screenshot({ path: `${OUT}/${MODE}-${VENUE || 'default'}.png` });
const world = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const g = s.getMeshByName('park_floor');
  const fence = s.meshes.filter((m) => m.name === 'wall_fence');
  const deck = s.meshes.find((m) => /meshy_skateboard|meshy_snowboard|meshy_surfboard/.test(m.name));
  const col = (m) => { const c = m && m.material && (m.material.albedoColor || m.material.diffuseColor); return c ? [ +c.r.toFixed(2), +c.g.toFixed(2), +c.b.toFixed(2) ] : null; };
  const deckChild = deck ? (deck.getChildMeshes ? deck.getChildMeshes()[0] : null) : null;
  // THE LIGHT AND THE SKY, not just the palette. The Warehouse rendered under Venice's sunset until the mode
  // published its mood as a getter: these four numbers are what changed, so these four are what the probe reads.
  const sun = s.lights.find((l) => l.getClassName && /Directional/.test(l.getClassName()));
  const hemi = s.lights.find((l) => l.getClassName && /Hemispheric/.test(l.getClassName()));
  const dome = s.meshes.find((m) => m.name === 'bk_dome');
  const ring = s.meshes.find((m) => m.name === 'bk_ring');
  const texOf = (m) => { const t = m && m.material && (m.material.emissiveTexture || m.material.diffuseTexture || m.material.albedoTexture); return t ? t.name : null; };
  return {
    sun: sun ? +sun.intensity.toFixed(2) : null,
    hemi: hemi ? +hemi.intensity.toFixed(2) : null,
    clear: s.clearColor ? [+s.clearColor.r.toFixed(2), +s.clearColor.g.toFixed(2), +s.clearColor.b.toFixed(2)] : null,
    sky: dome ? texOf(dome) : null, horizon: ring ? texOf(ring) : null,
    groundWidth: g ? +(g.getBoundingInfo().boundingBox.extendSizeWorld.x * 2).toFixed(0) : null,
    fenceAt: fence.length ? +Math.max(...fence.map((f) => Math.max(Math.abs(f.position.x), Math.abs(f.position.z)))).toFixed(0) : null,
    deckTint: col(deckChild) || col(deck),
  };
})()`);
console.log(`${MODE} venue=${VENUE || 'default'} deck=${DECK || 'default'}: ${JSON.stringify(world)}`);
console.log('  ' + lines.slice(0, 4).join(' | '));
console.log('  errors ' + errors);
await b.close();
