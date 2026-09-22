// what does the mode publish on scene.metadata after boot? (the horde's karateNeo telemetry read empty in one Phase 6 run)
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://localhost:3011'; const MODE = process.env.MODE ?? 'karate';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
await p.goto(`${BASE}/dev/mode/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForSelector('canvas', { timeout: 240000 });
for (let i = 0; i < 40; i++) { const st = p.locator('text=/^START$/').first(); if (await st.count()) await st.click().catch(() => {}); const ok = await p.evaluate(() => !!(window as any).__FEL_DEV__?.hero?.()); if (ok) break; await p.waitForTimeout(500); }
await p.waitForTimeout(4000);
const r = await p.evaluate(() => { const md = (window as any).__FEL_DEV__?.scene?.metadata || {}; const kn = md.karateNeo; return { keys: Object.keys(md), karateNeoKeys: kn ? Object.keys(kn).slice(0, 30) : null, nextLandIn: kn ? kn.nextLandIn : 'n/a', typeofNext: kn ? typeof kn.nextLandIn : 'n/a' }; });
console.log(JSON.stringify(r)); await b.close();
