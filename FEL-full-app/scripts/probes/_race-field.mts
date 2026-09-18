// IS THERE ACTUALLY A RACE ON SCREEN? Boot the kart, hold the throttle, and watch the position readout and
// the rival karts move. A field that exists in a unit test and not in the scene is not a field.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
await p.addInitScript(`(() => { const pad = { index:0,id:'fake',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,
  buttons: Array.from({length:17},()=>({pressed:false,touched:false,value:0})) }; window.__PAD=pad; navigator.getGamepads=()=>[pad]; })()`);
await p.goto(`http://localhost:3061/dev/mode/velocitykart?map=${process.env.MAP ?? 'stadium-oval'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(11000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }
// hold the throttle: right trigger = buttons[7]
await p.evaluate(`(() => { window.__PAD.buttons[7] = { pressed: true, touched: true, value: 1 }; window.__PAD.timestamp = performance.now(); })()`);
const rivalAt = () => p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const rs = s.transformNodes.filter((n) => n.name.startsWith('rival_'));
  return rs.map((n) => ({ n: n.name, z: +n.position.z.toFixed(1) }));
})()`);
const hud = () => p.evaluate(`(() => JSON.stringify(window.__FEL_DEV__.hud || {}))()`);
for (const step of [0, 1, 2, 3]) {
  await p.waitForTimeout(3500);
  console.log('t+' + (step * 3.5 + 3.5) + 's', 'rivals=', JSON.stringify(await rivalAt()), 'hud=', String(await hud()).slice(0, 190));
}
await p.screenshot({ path: './shots/race-field.png' });
console.log('errors:', errs.length, errs[0] ?? '');
await b.close();
