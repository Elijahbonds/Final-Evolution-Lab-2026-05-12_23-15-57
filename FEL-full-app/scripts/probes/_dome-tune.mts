// _dome-tune — live variants of the backdrop dome's emissive level, v-offset and bake, one frame each.  MODE=skateboard
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'skateboard'; const OUT = process.env.OUT ?? '/tmp';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 110000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(2500);
const variants: [string, number, number, string | null][] = [['a_dim', 0.55, 0.1, null], ['b_dim_down', 0.55, -0.08, null], ['c_neon', 0.6, 0.0, '/backdrops/baked/neon.jpg']];
for (const [tag, emis, voff, url] of variants) {
  await p.evaluate(`(async () => { const s = window.__FEL_DEV__.scene; const m = s.getMeshByName('bk_dome').material; m.emissiveColor.set(${emis}, ${emis}, ${emis});
    if (${JSON.stringify(url)}) { const T = m.emissiveTexture.constructor; const t = new T(${JSON.stringify(url)}, s, false, false); t.wrapU = 1; t.wrapV = 0; m.emissiveTexture = t; await new Promise(r => { const k = () => t.isReady() ? r() : setTimeout(k, 50); k(); }); }
    m.emissiveTexture.vOffset = ${voff}; })()`);
  await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${mode}_tune_${tag}.png` }); console.log('frame', tag);
}
await b.close(); process.exit(0);
