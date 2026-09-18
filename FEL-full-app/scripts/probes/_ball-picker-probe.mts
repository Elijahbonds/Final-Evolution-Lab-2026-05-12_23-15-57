// BALL PICKER probe — is the pick on the same screen as the map, and does it reach the ball?
//
// Two claims: the BALL row renders on the boot splash next to LOCATION, and choosing a skin actually tints
// the ball the mode builds (the mode reads the pick when it dresses the ball).
//
// env: BASE (http://localhost:3061) SKIN (rainbow)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const SKIN = process.env.SKIN ?? 'rainbow';
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const skins: string[] = []; let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[FEL-BALL\]/.test(x)) skins.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 170)); });
// /dev/mode/* is a bare harness and does not mount BootSplash — the picker lives on the PLAYER route.
const ROUTE = process.env.ROUTE ?? '/play/threepoint';
await p.goto(`${BASE}${ROUTE}?ball=${SKIN}`, { waitUntil: 'domcontentloaded' });
// Do NOT wait on a canvas: the picker is SPLASH markup and the player route may gate or defer the scene.
// What matters here is whether the two picker rows render on one screen.
await p.waitForTimeout(14000);
// is the picker on the SAME screen as the map picker?
const text = await p.evaluate('document.body.innerText') as string;
console.log('splash shows LOCATION row: ' + /\bLOCATION\b/.test(text));
// \bBALL\b, not /BALL/: the landing page says STREETBALL and matched the loose test
console.log('splash shows BALL row:     ' + /(^|\s)BALL(\s|$)/m.test(text));
const labels = await p.evaluate(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /CLASSIC|RAINBOW|SUNSET|MINT|MIDNIGHT|HOOPBUS/.test(t))`) as string[];
console.log('ball buttons: ' + JSON.stringify(labels));
console.log('--- page text (first 600) ---');
console.log(text.slice(0, 600).replace(/\n+/g, ' | '));
// start the mode so the ball gets dressed
const start = p.locator('text=/^TAP TO START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(6000); }
else { const s2 = p.locator('text=/^START$/').first(); if (await s2.count()) { await s2.click(); await p.waitForTimeout(6000); } }
console.log('skin applied in scene: ' + JSON.stringify(skins));
const mat = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return null;
  const ball = s.getMeshByName('ball'); if (!ball) return null;
  const skin = ball.metadata && ball.metadata.felBallSkin;
  // read the tint off the dressed mesh, which is what a player actually sees
  let colour = null;
  for (const m of s.meshes) {
    if (!/meshy_ball/.test(m.name)) continue;
    const mm = m.material; if (!mm) continue;
    const c = mm.albedoColor || mm.diffuseColor;
    if (c) { colour = [Number(c.r.toFixed(3)), Number(c.g.toFixed(3)), Number(c.b.toFixed(3))]; break; }
  }
  return { skin: skin || null, colour };
})()`) as { skin: string | null; colour: number[] | null } | null;
console.log('ball metadata + dressed tint: ' + JSON.stringify(mat));
console.log('errors: ' + errors);
await b.close();
