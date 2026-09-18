import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 70000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(10000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; return s.meshes.filter(m => /^Mesh_|^trunk|^Ocean|kiosk|Bleach|kroof/i.test(m.name)).map(m => ({ n: m.name.slice(0, 16), verts: m.getTotalVertices(), parent: m.parent?.name?.slice(0, 24), gp: m.parent?.parent?.name?.slice(0, 24), en: m.isEnabled(), vis: m.isVisible, c: m.getBoundingInfo().boundingBox.centerWorld.asArray().map(v => +v.toFixed(1)) })); })()`).then(JSON.stringify));
await b.close(); process.exit(0);
