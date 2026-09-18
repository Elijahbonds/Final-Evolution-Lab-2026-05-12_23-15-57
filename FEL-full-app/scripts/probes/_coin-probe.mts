// COINS — after the thin-instance rewrite, do they still exist, spin, and get collected?
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'skateboard';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
let errors = 0; const errs: string[] = [];
p.on('pageerror', (e) => { errors++; if (errs.length < 3) errs.push(e.message.slice(0, 120)); });
p.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) { errors++; if (errs.length < 3) errs.push(m.text().slice(0,120)); } });
await p.addInitScript(`(() => { const pad = { index:0,id:'fake',connected:true,mapping:'standard',axes:[0,0,0,0],timestamp:0,
  buttons: Array.from({length:17},()=>({pressed:false,touched:false,value:0})) }; window.__PAD=pad; navigator.getGamepads=()=>[pad]; })()`);
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }

const shape = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const coin = s.meshes.filter(m => m.name === 'coin');
  const mats = s.materials.filter(m => /coinMat/.test(m.name));
  return { coinMeshes: coin.length, thinInstances: coin.reduce((t,m)=>t+m.thinInstanceCount,0),
           coinMaterials: mats.length, enabled: coin.map(m=>m.isEnabled()) };
})()`);
console.log('coin shape:', JSON.stringify(shape));

// the matrices must CHANGE frame to frame (the spin) — a static buffer would mean dead coins
const spins = await p.evaluate(`(async () => {
  const s = window.__FEL_DEV__.scene;
  const m = s.meshes.find(x => x.name === 'coin');
  if (!m) return null;
  const read = () => Array.from(m.thinInstanceGetWorldMatrices ? [0] : [0]).length;
  const a = m._thinInstanceDataStorage && m._thinInstanceDataStorage.matrixData ? Array.from(m._thinInstanceDataStorage.matrixData.slice(0, 16)) : null;
  await new Promise(r => setTimeout(r, 400));
  const c = m._thinInstanceDataStorage && m._thinInstanceDataStorage.matrixData ? Array.from(m._thinInstanceDataStorage.matrixData.slice(0, 16)) : null;
  void read;
  return { changed: a && c ? a.some((v, i) => Math.abs(v - c[i]) > 1e-6) : null };
})()`);
console.log('spin:', JSON.stringify(spins));

// COLLECTION, DETERMINISTICALLY. Driving in a circle may simply never touch a coin, and "0 collected" would
// then prove nothing. Put the hero ON a coin instead: read the first instance's translation straight out of
// the matrix buffer (elements 12,13,14) and teleport there.
const collect = await p.evaluate(`(async () => {
  const s = window.__FEL_DEV__.scene;
  const m = s.meshes.find(x => x.name === 'coin');
  const hero = window.__FEL_DEV__.hero ? window.__FEL_DEV__.hero() : null;
  if (!m || !hero) return { err: 'no coin or hero' };
  const d = m._thinInstanceDataStorage && m._thinInstanceDataStorage.matrixData;
  if (!d) return { err: 'no matrix data' };
  const before = document.body.innerText;
  const hits = [];
  for (let i = 0; i < 6; i++) {
    const o = i * 16;
    const at = { x: d[o + 12], y: d[o + 13], z: d[o + 14] };
    if (!Number.isFinite(at.x)) continue;
    hero.position.set(at.x, hero.position.y, at.z);
    await new Promise(r => setTimeout(r, 450));
    hits.push({ x: +at.x.toFixed(1), z: +at.z.toFixed(1) });
  }
  return { visited: hits.length, before: /"coins":\s*(\d+)/.exec(before)?.[1] ?? null };
})()`);
console.log('walked onto coins:', JSON.stringify(collect));
await p.waitForTimeout(1200);

// drive around and see the HUD coin counter move
await p.evaluate(`(() => { const pad = window.__PAD; let t=0; setInterval(()=>{ t+=0.06;
  pad.axes[0]=Math.sin(t*0.7); pad.axes[1]=-1; pad.timestamp=performance.now(); },60); })()`);
await p.waitForTimeout(22000);
const hud = await p.evaluate("(() => { const m = /\"coins\":\\s*(\\d+)/.exec(document.body.innerText); return m ? Number(m[1]) : null; })()");
console.log('coins collected per HUD:', hud);
console.log('errors', errors, errs.join(' | '));
await b.close();
