// _dome-pp — is a render pipeline whiting out the backdrop dome? frames with SSAO detached, then with the grade detached too.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'skateboard'; const OUT = process.env.OUT ?? '/tmp';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 90000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(3000);
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const cam = s.activeCamera; const mgr = s.postProcessRenderPipelineManager; mgr.detachCamerasFromRenderPipeline('felSsao', cam); return 'ssao detached; domes=' + s.meshes.filter(m => m.name === 'bk_dome').length + ' skies=' + s.meshes.filter(m => /sky|dome/i.test(m.name)).map(m => m.name).join(','); })()`));
await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${mode}_nossao.png` });
console.log(await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; const cam = s.activeCamera; s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('fel_pipeline', cam); return 'grade detached; camPP=' + (cam._postProcesses ?? []).filter(Boolean).length; })()`));
await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${mode}_nopp.png` }); console.log('frames'); await b.close(); process.exit(0);
