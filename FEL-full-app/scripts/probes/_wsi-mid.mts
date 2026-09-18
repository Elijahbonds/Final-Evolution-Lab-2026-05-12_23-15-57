// _wsi-mid — Who Scene It mid-round: is a venue mounted behind the card, what does the sweep see? (dev runner)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const OUT = process.env.OUT ?? '/tmp';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs: string[] = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.goto(`${BASE}/dev/mode/who_scene_it`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(8000);
const start = p.locator('text=/^START$/').first(); if (await start.count()) { await start.click(); await p.waitForTimeout(4500); }
const snap = async () => p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return null; const roots = s.transformNodes.filter(n => /^nexus_venue_map_|^venue_props_|^venice_boardwalk$/.test(n.name)).map(n => n.name); return { active: s.getActiveMeshes().length, meshes: s.meshes.filter(m => m.isVisible && m.isEnabled()).length, roots, cam: s.activeCamera?.position.asArray().map(v => +v.toFixed(1)), hint: document.body.innerText.match(/"prompt": "([^"]*)"/)?.[1] }; })()`);
const a = await snap(); await p.screenshot({ path: `${OUT}/wsi-mid-1.png` });
await p.keyboard.press('j'); await p.waitForTimeout(2200); const b2 = await snap(); await p.screenshot({ path: `${OUT}/wsi-mid-2.png` });
console.log(JSON.stringify({ a, b: b2, errs: errs.slice(0, 3) }));
await b.close();
