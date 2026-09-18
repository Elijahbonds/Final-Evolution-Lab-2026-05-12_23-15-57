// THE START-UP SCREEN, photographed. A picker that typechecks is not a picker that renders.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
for (const route of (process.env.ROUTES ?? '').split(';').filter(Boolean)) {
  const p = await b.newPage({ viewport: { width: 1000, height: 820 } });
  await p.goto(`http://localhost:3061${route}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(20000);
  const slug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
  await p.screenshot({ path: `./shots/splash-${slug}.png` });
  const txt = await p.evaluate(`document.body.innerText.slice(0, 700)`);
  console.log(route, '->', `shots/splash-${slug}.png`);
  console.log(String(txt).replace(/\n{2,}/g, '\n').slice(0, 600));
  console.log('---');
  await p.close();
}
await b.close();
