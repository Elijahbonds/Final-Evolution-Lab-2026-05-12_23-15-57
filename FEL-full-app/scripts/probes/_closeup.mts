// CLOSE-UP — park a free camera on a named node so a POSE can actually be judged.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const MODE = process.env.MODE ?? 'velocitykart';
const TARGET = process.env.TARGET ?? 'kart_body';
const DIST = Number(process.env.DIST ?? 3.2);
// AZIMUTHS: a pose is judged from the side (limb angles) and the front (hands/face), never from one angle.
const AZ = (process.env.AZ ?? '200').split(',').map(Number);
const HEIGHT = Number(process.env.HEIGHT ?? 1.2);
const OUT = process.env.OUT ?? './shots';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
await p.addInitScript(`(() => { const pad = { index:0,id:'fake',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,
  buttons: Array.from({length:17},()=>({pressed:false,touched:false,value:0})) }; window.__PAD=pad; navigator.getGamepads=()=>[pad]; })()`);
await p.goto(`http://localhost:3061/dev/mode/${MODE}${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }
await p.waitForTimeout(Number(process.env.SETTLE ?? 2500));
const place = async (azDeg: number) => p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const node = s.getMeshByName(${JSON.stringify(TARGET)}) || s.getTransformNodeByName(${JSON.stringify(TARGET)});
  if (!node) return { err: 'no node ' + ${JSON.stringify(TARGET)}, names: s.meshes.map((m) => m.name).slice(0, 30) };
  if (window.__HOLD_CAM) s.onBeforeCameraRenderObservable.remove(window.__HOLD_CAM);
  const a = ${azDeg} * Math.PI / 180;
  window.__HOLD_CAM = s.onBeforeCameraRenderObservable.add(() => {
    const at = node.getAbsolutePosition();
    const cam = s.activeCamera;
    cam.position.set(at.x + Math.sin(a) * ${DIST}, at.y + ${HEIGHT}, at.z + Math.cos(a) * ${DIST});
    if (cam.setTarget) cam.setTarget(at);
  });
  const at = node.getAbsolutePosition();
  return { at: { x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) } };
})()`);

for (const az of AZ) {
  console.log('az', az, JSON.stringify(await place(az)));
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${MODE}-closeup-${az}.png` });
  console.log('shot ->', `${OUT}/${MODE}-closeup-${az}.png`);
}
await b.close();
