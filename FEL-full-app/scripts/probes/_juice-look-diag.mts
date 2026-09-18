// _juice-look-diag — Venice juice LOOK: drives a made dunk and samples the juice ring's XZ scale, the net pivot's y scale and
// the play hoop's cloned material emissive through the contact beat (MODE=dunk|dunkduel).
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'dunk';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const events: string[] = []; const t0 = Date.now();
p.on('console', (m) => { const x = m.text(); if (x.includes('[JUICE-LOOK]') || x.includes('[JUICE-SOFT]')) events.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${x.replace(/\[JUICE-\w+\] /, '')}`); });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first(); if (await start.count()) { await start.click(); await p.waitForTimeout(2500); }
await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; window.__JL = []; const it = setInterval(() => {
  const ring = s.getMeshByName('juice_rim'), pivot = s.getTransformNodeByName('juice_net_pivot'), net = s.getMeshByName('juice_net');
  const fm = s.materials.find(m => /_juice$/.test(m.name));
  window.__JL.push({ t: performance.now(), ringVis: ring?.isVisible, ringX: ring ? +ring.scaling.x.toFixed(3) : null, netVis: net?.isVisible, netY: pivot ? +pivot.scaling.y.toFixed(3) : null, emis: fm ? +fm.emissiveColor.r.toFixed(3) : null,
    meshyScale: (() => { const r = s.getTransformNodeByName('meshy_hoop_0'); return r ? +r.scaling.x.toFixed(4) : null; })() }); }, 12); window.__JLstop = () => clearInterval(it); })()`);
await p.keyboard.down('w'); await p.waitForTimeout(1500); await p.keyboard.up('w');
await p.keyboard.down(' '); await p.waitForTimeout(900); await p.keyboard.up(' ');
for (let i = 0; i < 24; i++) { await p.keyboard.press('j'); await p.waitForTimeout(80); }
await p.waitForTimeout(4000);
const r = await p.evaluate(`(() => { window.__JLstop(); const a = window.__JL; const on = a.filter(x => x.ringVis); const meshy = [...new Set(a.map(x => x.meshyScale))];
  return { samples: a.length, ringShownSamples: on.length, ringXmax: Math.max(...a.map(x => x.ringX ?? 1)), netYmin: Math.min(...a.map(x => x.netY ?? 1)), emisMax: Math.max(...a.map(x => x.emis ?? 0)), emisRest: a[a.length - 1]?.emis, meshyHoopScales: meshy,
    ringVisibleAtEnd: a[a.length - 1]?.ringVis, netVisibleAtEnd: a[a.length - 1]?.netVis, used: window.__FEL_DEV__.hoopJuiceUsed ?? null }; })()`);
console.log(JSON.stringify({ mode, events, r }));
await b.close();
