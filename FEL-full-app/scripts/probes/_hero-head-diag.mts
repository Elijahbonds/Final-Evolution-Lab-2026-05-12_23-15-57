// Headless athletes? List the hero's meshes with head/body/face/hair in the name and whether they are enabled/visible.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
for (const url of (process.env.URLS ?? 'http://localhost:3000/dev/mode/dunk,http://localhost:3000/dev/mode/dunk?location=blossom').split(',')) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000);
  const out = await p.evaluate(`(() => {
    const sc = window.__FEL_DEV__?.scene; if (!sc) return 'no scene';
    const hero = window.__FEL_DEV__.hero?.(); const heroMeshes = hero ? hero.getChildMeshes() : [];
    const rows = heroMeshes.map((m) => ({ n: m.name, on: m.isEnabled(), vis: m.isVisible, mat: m.material?.name })).slice(0, 24);
    const hidden = sc.meshes.filter((m) => !m.isEnabled() && /head|body|face|hair|skin/i.test(m.name)).map((m) => m.name).slice(0, 12);
    return JSON.stringify({ heroMeshes: heroMeshes.length, rows, hiddenNamed: hidden, clear: [sc.clearColor.r, sc.clearColor.g, sc.clearColor.b].map((v) => +v.toFixed(2)), surround: !!sc.getTransformNodeByName('meshy_venice_surround') });
  })()`);
  console.log(url.replace('http://localhost:3000', ''), out);
  await p.close();
}
await b.close();
