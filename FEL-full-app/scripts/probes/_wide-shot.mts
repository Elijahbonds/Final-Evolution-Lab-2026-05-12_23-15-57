// _wide-shot — a scenery frame of a dev-mode harness from a far, high camera (the follow cam never shows the sideline).
//   MODE=dunk POS=0,14,34 TARGET=0,2,-8 OUT=/tmp npx tsx scripts/probes/_wide-shot.mts
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const pos = (process.env.POS ?? '0,14,34').split(',').map(Number); const tgt = (process.env.TARGET ?? '0,2,-8').split(',').map(Number);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); await p.waitForTimeout(4000);
console.log(await p.evaluate(`(() => { const d = window.__FEL_DEV__; if (!d?.scene) return 'no scene'; const s = d.scene; const cam = s.activeCamera;
  const set = () => { cam.position.set(${pos.join(',')}); if (cam.setTarget) cam.setTarget(new BABYLON.Vector3(${tgt.join(',')})); else if (cam.target) cam.target.set(${tgt.join(',')}); };
  window.BABYLON = window.BABYLON || { Vector3: cam.position.constructor }; s.onBeforeRenderObservable.add(set); set();
  return 'camera ' + cam.name + ' ' + cam.getClassName() + ' meshes ' + s.meshes.filter(m => m.isVisible && m.isEnabled()).length; })()`));
await p.waitForTimeout(1200);
await p.screenshot({ path: `${process.env.OUT ?? '/tmp'}/${mode}_wide.png` }); console.log('wide frame written'); await b.close();
