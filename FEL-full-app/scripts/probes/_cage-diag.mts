// What is the tan wireframe cage around the player under Venice? List enabled meshes whose bounds sit within 3 m of the player.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:3000/dev/mode/dunk', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000); await p.keyboard.press('j'); await p.waitForTimeout(2500);
const out = await p.evaluate(`(() => { const sc = window.__FEL_DEV__.scene; const h = window.__FEL_DEV__.hero?.(); if (!h) return 'no hero'; const hp = h.position;
  const near = sc.meshes.filter((m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && !m.isDescendantOf?.(h)).map((m) => { const bb = m.getBoundingInfo().boundingBox; const c = bb.centerWorld; const d = Math.hypot(c.x - hp.x, c.z - hp.z); return { n: m.name, d: +d.toFixed(1), y: +c.y.toFixed(1), size: [+(bb.maximumWorld.x - bb.minimumWorld.x).toFixed(1), +(bb.maximumWorld.y - bb.minimumWorld.y).toFixed(1), +(bb.maximumWorld.z - bb.minimumWorld.z).toFixed(1)], parent: m.parent?.name, mat: m.material?.name }; }).filter((r) => r.d < 4 && r.size[0] < 12).sort((a, b) => a.d - b.d).slice(0, 10);
  return JSON.stringify({ hero: [hp.x.toFixed(1), hp.z.toFixed(1)], near }); })()`);
console.log(out); await b.close();
