import { chromium } from 'playwright-core';
import fs from 'node:fs';
const MODE = process.env.MODE ?? 'tennis';
const OUT = process.env.OUT ?? './shots/ball';
fs.mkdirSync(OUT, { recursive: true });
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(`(() => { const pad = { index:0,id:'fake',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,
  buttons: Array.from({length:17},()=>({pressed:false,touched:false,value:0})) }; window.__PAD=pad; navigator.getGamepads=()=>[pad]; })()`);
await p.goto(`http://localhost:3061/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
await p.evaluate(`(() => { const pad = window.__PAD; let t=0; setInterval(()=>{ t+=0.06;
  pad.axes[0]=Math.sin(t*1.1); pad.buttons[0].pressed=(Math.floor(t*3)%7)===0; pad.buttons[7].value=(Math.floor(t*3)%5)===0?1:0;
  pad.timestamp=performance.now(); },60); })()`);
await p.waitForTimeout(Number(process.env.SECS ?? 9) * 1000);
await p.screenshot({ path: `${OUT}/${MODE}.png` });
await b.close();
