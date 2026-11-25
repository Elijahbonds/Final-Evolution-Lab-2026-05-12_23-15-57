// lane/physics-arena, the soccer 3v3's phone cost: where a mode's draws come from, per body and per everything else.
//   node census.mjs <out.json>      (PORT 3871, TAG arena: the esbuild page inside rig.sh; MODES=a,b; FEEL={"knob":v})
// On the phone profile (390x844, DPR 2, mobile tier, ?perf=off), 3 s into play: every enabled mesh with its sub-mesh count, ink
// (renderOutline), whether it is in a shadow map's render list, and the body (top ancestor) it belongs to; and the frame's draw
// counter. Prints a summary per mode and writes the rows.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [out] = process.argv.slice(2);
const PORT = process.env.PORT ?? '3871', TAG = process.env.TAG ?? 'arena';
const MODES = (process.env.MODES ?? 'physics_arena_3v3,physics_arena_soccer_3v3').split(',');
const FEEL = process.env.FEEL ?? '';
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const all = {};
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: `{ let t = 7 >>> 0; Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }` });
  const p = await ctx.newPage();
  try {
    await p.goto(`http://127.0.0.1:${PORT}/${TAG}.html?mode=${mode}&tier=mobile&perf=off${FEEL ? '&feel=' + encodeURIComponent(FEEL) : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => window.__phase === 'playing' || window.__err, null, { timeout: 300000, polling: 250 });
    await p.waitForFunction(() => { const m = (window.__marks || []).find((x) => x[0] === 'playing'); return m && performance.now() - m[1] > 3000; }, null, { timeout: 120000, polling: 200 });
    const rows = await p.evaluate(() => {
      const s = window.__FEL_DEV__.scene;
      const casters = new Set();
      for (const l of s.lights) { const g = l.getShadowGenerator?.(); const rl = g?.getShadowMap?.()?.renderList; if (rl) for (const m of rl) casters.add(m.uniqueId); }
      const active = new Set(s.getActiveMeshes().data.slice(0, s.getActiveMeshes().length).map((m) => m.uniqueId));
      const top = (m) => { let n = m; while (n.parent) n = n.parent; return n.name; };
      return s.meshes.filter((m) => m.isEnabled() && m.isVisible && m.layerMask !== 0).map((m) => ({
        name: m.name, body: top(m), skinned: !!m.skeleton, subs: m.subMeshes?.length ?? 0, ink: !!m.renderOutline, cast: casters.has(m.uniqueId), active: active.has(m.uniqueId),
        mat: m.material?.name ?? '',
      }));
    });
    const draws = await p.evaluate(() => window.__FEL_DEV__.scene.getEngine()._drawCalls?.current ?? null);
    const merge = await p.evaluate(() => { const d = window.__FEL_DEV__.scene.__felBodyMerge; return d ? { stats: d.stats(), detail: d.detail().map((x) => ({ root: x.root, stable: x.stable, built: x.built, lastChange: x.lastChange, lastBuild: String(x.lastBuild).slice(0, 160), groups: x.groups.length, ineligible: x.ineligible })) } : null; });
    console.log(`  merge ${JSON.stringify(merge?.stats)}`);
    const poll = await p.evaluate(() => new Promise((res) => { const d = window.__FEL_DEV__.scene.__felBodyMerge, out = []; let n = 0; const f = () => { const x = d?.detail()[0]; out.push(`${x?.stable}${x?.built ? 'b' : ''}`); if (++n < 40) requestAnimationFrame(f); else res(out.join(' ')); }; requestAnimationFrame(f); }));
    console.log(`  body0 stable per frame: ${poll}`);
    for (const d of merge?.detail ?? []) console.log(`    ${d.root} stable ${d.stable} built ${d.built} groups ${d.groups} change '${d.lastChange}' build '${d.lastBuild}' ${d.ineligible.length ? 'inelig ' + d.ineligible.slice(0, 4).join(',') : ''}`);
    all[mode] = { draws, rows };
    const bodies = {};
    for (const r of rows.filter((x) => x.active)) {
      const k = r.skinned || /arena_soccer3_view|arena_3v3|view/.test(r.body) ? r.body : '(scene)';
      const e = (bodies[k] ??= { meshes: 0, subs: 0, ink: 0, cast: 0, names: [] });
      e.meshes++; e.subs += r.subs; if (r.ink) e.ink += r.subs; if (r.cast) e.cast += r.subs; e.names.push(r.name);
    }
    console.log(`== ${mode}: engine draws ${draws}`);
    for (const [k, e] of Object.entries(bodies)) console.log(`  ${k.padEnd(28)} meshes ${e.meshes}  subs ${e.subs}  ink ${e.ink}  cast ${e.cast}  ${k === '(scene)' ? '' : e.names.slice(0, 14).join(' ')}`);
  } catch (e) { console.log(`${mode}: FAILED ${String(e.message).slice(0, 160)}`); }
  await ctx.close();
}
if (out) fs.writeFileSync(out, JSON.stringify(all));
await b.close();
