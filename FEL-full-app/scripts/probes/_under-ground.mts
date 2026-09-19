// _under-ground — WHO IS SUNK? (owner, 2026-09-19: "no more models going under the ground")
//
// Boots a mode, lets it play itself for a few seconds, and samples every VISIBLE mesh's lowest world point at 10 Hz.
// A mesh whose bottom sits below the floor plane by more than a tolerance is sunk, and the report names it, says how
// deep, and for how many of the samples — so a one-frame dip during a dunk landing reads differently from a prop that
// was parked in the dirt at load.
//
//   BASE=http://127.0.0.1:3098 MODE=dunk SECS=12 npx tsx scripts/probes/_under-ground.mts
//   MODE=onevone,derby,karate npx tsx scripts/probes/_under-ground.mts     # several in one run
//
// FLOOR defaults to y 0, which is the convention every mode here builds on. TOL is how far under is "sunk" — 6 cm,
// which is under a shoe sole and well over float noise.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODES = (process.env.MODE ?? 'dunk').split(',').map((s) => s.trim()).filter(Boolean);
const SECS = Number(process.env.SECS ?? 12);
const FLOOR = Number(process.env.FLOOR ?? 0);
const TOL = Number(process.env.TOL ?? 0.06);
const QS = process.env.QS ?? 'agent=1';

const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--window-size=1200,760'] });
let anySunk = false;

for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 720 } });
  await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/dev/mode/${mode}?${QS}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  let up = false;
  for (let i = 0; i < 90; i++) {
    // two accessors in this codebase: __FEL_QA__.scene() is a function, __FEL_DEV__.scene is a property
    up = await p.evaluate("(() => { const q = window.__FEL_QA__; const s = (q && q.scene && q.scene()) || (window.__FEL_DEV__ && window.__FEL_DEV__.scene); return !!(s && s.meshes && s.meshes.length > 20); })()")
      .catch(() => false) as boolean;
    if (up) break;
    await p.waitForTimeout(1000);
  }
  if (!up) { console.log(`${mode}: never booted`); await ctx.close(); continue; }
  await p.evaluate("(async () => { const a = window.__NEXUS_AGENT__; if (a) await a.start(20000); })()").catch(() => {});
  await p.waitForTimeout(1500);

  await p.evaluate(`(() => { window.__SUNK = {}; window.__N = 0;
    const q = window.__FEL_QA__; const s = (q && q.scene && q.scene()) || window.__FEL_DEV__.scene;
    setInterval(() => {
      window.__N++;
      for (const m of s.meshes) {
        if (!m.isEnabled() || !m.isVisible || m.visibility <= 0.01) continue;
        if (m.getTotalVertices() === 0) continue;
        if (/^(ground|floor|court|pitch|field|water|ocean|sky|backdrop|shadow|grid|bk_|nexus_sky)/i.test(m.name)) continue;   // the floor and the sky are allowed to be themselves
        let low;
        if (m.skeleton) {
          // A SKINNED MESH'S BOUNDING BOX IS ITS BIND POSE, not where the body is now — every character in this codebase
          // reports a box a metre under the floor while standing correctly on it. Judge a character by its ROOT instead.
          let r = m; while (r.parent) r = r.parent;
          low = r.getAbsolutePosition().y;
        } else {
          let bb; try { bb = m.getBoundingInfo().boundingBox; } catch { continue; }
          if (bb.extendSizeWorld && Math.max(bb.extendSizeWorld.x, bb.extendSizeWorld.z) > 80) continue;   // a dome is not a sunk prop
          low = bb.minimumWorld.y;
        }
        if (!isFinite(low) || low >= ${FLOOR} - ${TOL}) continue;
        const e = (window.__SUNK[m.name] ||= { n: 0, worst: 0, skinned: !!m.skeleton });
        e.n++; e.worst = Math.min(e.worst, +(low - ${FLOOR}).toFixed(3));
      }
    }, 100); })()`);
  await p.waitForTimeout(SECS * 1000);
  const res = await p.evaluate("JSON.stringify({ n: window.__N, sunk: window.__SUNK })") as string;
  const { n, sunk } = JSON.parse(res) as { n: number; sunk: Record<string, { n: number; worst: number; skinned?: boolean }> };
  const rows = Object.entries(sunk).sort((a, c) => a[1].worst - c[1].worst);
  if (!rows.length) console.log(`${mode}: nothing under the floor across ${n} samples`);
  else {
    anySunk = true;
    console.log(`${mode}: ${rows.length} sunk across ${n} samples`);
    for (const [name, e] of rows.slice(0, 12)) {
      console.log(`   ${name.padEnd(40)} ${e.worst.toFixed(2)} m under, ${((e.n / n) * 100).toFixed(0)}% of samples${e.skinned ? ' [character root]' : ''}`);
    }
  }
  await ctx.close();
}
await b.close();
process.exitCode = anySunk ? 1 : 0;
