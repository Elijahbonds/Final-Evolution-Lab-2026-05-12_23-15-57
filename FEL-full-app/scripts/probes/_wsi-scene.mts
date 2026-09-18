import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
const logs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/NEXUS|WSI|venue|scan|map/i.test(t)) logs.push(t.slice(0, 160)); });
await p.addInitScript(`(() => { const pad = { index:0,id:'fake',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,
  buttons: Array.from({length:17},()=>({pressed:false,touched:false,value:0})) }; window.__PAD=pad; navigator.getGamepads=()=>[pad]; })()`);
await p.goto('http://localhost:3061/dev/mode/who_scene_it', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
// the pick screen shows the STUDIO by design; answer through it so a real question's venue is mounted
await p.addInitScript(() => {});
await p.evaluate(`(() => { const pad = window.__PAD; if (!pad) return; })()`);
for (let i = 0; i < 6; i++) {
  await p.keyboard.press('j');           // A = first option
  await p.waitForTimeout(2600);
  const r = await p.evaluate(`(() => {
    const s = window.__FEL_DEV__.scene;
    const roots = s.transformNodes.filter(n => !n.parent && /^nexus_/.test(n.name)).map(n => n.name);
    const hud = window.__FEL_DEV__.hud ? window.__FEL_DEV__.hud() : null;
    return { roots, q: hud && hud.question, prompt: hud && hud.prompt };
  })()`);
  console.log('  after answer', i, JSON.stringify(r));
}
console.log(await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const named = s.meshes.filter(m => m.isEnabled()).map(m => m.name);
  const roots = s.transformNodes.filter(n => !n.parent).map(n => n.name);
  return { meshes: s.meshes.length, enabled: named.length, names: named.slice(0, 24), roots: roots.slice(0, 12) };
})()`));
console.log(logs.slice(0, 12).join('\n'));
await b.close();
