// DOES THE NEW TRICK HAVE A BODY ON A RUNNING RIG (2026-09-14).
//
// `dunk_between_legs` is registered, authored and tested against a headless skeleton. The remaining
// question is whether the LIVE rig resolves it — a clip that is missing at runtime falls back silently and
// the trick plays as whatever the animator had last, which is exactly the failure this change is fixing.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
p.on('console', (m) => { const t = m.text(); if (/MISSING CLIP|FEL-FRAME/.test(t)) errs.push(t.slice(0, 140)); });
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(6000);
const out = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const want = ['dunk_between_legs','dunk_360_eastbay','dunk_scorpion','dunk_lost_found','dunk_hide_seek','dunk_360_spin','dunk_finish_windmill','dunk_finish_tomahawk'];
  const groups = s.animationGroups.map(g => g.name);
  const found = {};
  for (const w of want) found[w] = groups.indexOf(w) >= 0;
  const btl = s.animationGroups.find(g => g.name === 'dunk_between_legs');
  const eb  = s.animationGroups.find(g => g.name === 'dunk_360_eastbay');
  return { found, totalGroups: groups.length,
           btlTargets: btl ? btl.targetedAnimations.length : 0,
           ebTargets:  eb  ? eb.targetedAnimations.length  : 0,
           btlSec: btl ? +(btl.to / 60).toFixed(2) : null };
})()`) as Record<string, unknown>;
console.log('[CLIP]', JSON.stringify(out, null, 1));
console.log(`[CLIP] errors/missing: ${errs.length}${errs.length ? ' :: ' + errs.slice(0,2).join(' | ') : ''}`);
await b.close();
