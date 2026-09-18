// _dome-red — tint the backdrop dome red and screenshot: is the dome what the camera sees?
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'skateboard';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 70000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(3000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const d = s.getMeshByName('bk_dome'); if (!d) return 'no dome'; const m = d.material; m.emissiveTexture = null; m.emissiveColor.set(1, 0, 0); return 'dome red; hidden meshes with >100 ext: ' + s.meshes.filter(x => !x.isVisible && x.getBoundingInfo().boundingBox.extendSizeWorld.length() > 100).map(x => x.name).join(','); })()`));
await p.waitForTimeout(800); await p.screenshot({ path: `${process.env.OUT ?? '/tmp'}/${mode}_domered.png` }); console.log('frame'); await b.close(); process.exit(0);
