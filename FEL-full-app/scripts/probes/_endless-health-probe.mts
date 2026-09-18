// DO MOOKS ABSORB, AND DOES A BAR APPEAR (2026-09-14).
//
// The mode shipped dropping a body on one touch. The unit tests prove the curve; only a running horde can
// show that the wiring reaches it — that a wave-1 body survives two hits and falls on the third, and that
// a bar mesh exists over a damaged one and not over an untouched one.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
p.on('console', (m) => { const t = m.text(); if (/MISSING CLIP/.test(t)) errs.push(t.slice(0, 140)); });

await p.goto(`${BASE}/dev/mode/karate`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4500);

const out = await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, s = d.scene;
  const f0 = s.getFrameId(); await new Promise(r => setTimeout(r, 800));
  const frames = s.getFrameId() - f0;
  const ev = (t, code, key) => window.dispatchEvent(new KeyboardEvent(t, { code, key, bubbles: true }));
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 6000));

  const bars = () => s.meshes.filter(m => m.name.indexOf('mook_bar') === 0).length;
  const barsAtStart = bars();
  // THE HORDE HAS TO BE IN RANGE FIRST. A standing driver jabbing at air proves nothing -- the first run of
  // this probe reported 0 hits and 0 bars for exactly that reason. The agents pursue, so waiting is the
  // reliable way to be adjacent; the distance readout below is the evidence that it worked.
  const hero = d.hero && d.hero();
  const nearest = () => {
    let best = Infinity;
    for (const m of s.transformNodes.concat(s.meshes)) {
      if (!/agent|mob|enemy/i.test(m.name) || !hero) continue;
      const dd = Math.hypot(m.position.x - hero.position.x, m.position.z - hero.position.z);
      if (dd > 0.01) best = Math.min(best, dd);
    }
    return Number.isFinite(best) ? +best.toFixed(2) : null;   // null = the name match failed, NOT 'nothing nearby'
  };
  let waited = 0;
  while (waited < 9000 && (nearest() ?? 99) > 1.4) { await new Promise(r => setTimeout(r, 300)); waited += 300; }
  const closedTo = nearest();

  // jab repeatedly and watch how many swings it takes before the first KO, and when bars appear
  const trace = [];
  for (let i = 0; i < 14; i++) {
    ev('keydown','KeyJ','j'); await new Promise(r=>setTimeout(r,40)); ev('keyup','KeyJ','j');
    await new Promise(r => setTimeout(r, 480));
    const hud = document.body.innerText;
    const hits = (hud.match(/"hits":\\s*(\\d+)/) || [])[1];
    trace.push({ swing: i + 1, bars: bars(), hits: hits ? +hits : null });
  }
  return { frames, barsAtStart, closedTo, waited, trace, jumpClip: s.animationGroups.some(g => g.name === 'karate_jump') };
})()`) as Record<string, unknown>;

console.log('[HEALTH]', JSON.stringify(out, null, 1).slice(0, 1400));
console.log(`[HEALTH] errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0,2).join(' | ') : ''}`);
await b.close();
