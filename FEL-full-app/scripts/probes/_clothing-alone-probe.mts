// CLOTHING-ALONE probe (2026-09-14): the dunk hero's kit + closet garments stay skinned to the athlete through
// gather → hang → CONTACT → land (and the replay). Page side: _clothing-alone-page.js (the per-frame measurement).
//   C1 bind    every sampled frame, every visible garment: skinned (weights), its 22 bones linked to the body skeleton's own
//              transform nodes, same parent + skeleton as at spawn, still visible
//   C2 clip    tops/shorts: ≤ 8 skin vertices that were UNDER the garment standing stand > 6 mm proud of it (none > 15 mm), on
//              bones the garment rides; shoes: ≤ 8 foot-skin vertices still drawn on triangles wholly inside the shoe; all: ≤ 8
//              hidden (bodyMask) skin vertices slid out past the garment's edge
//   C3 detach  the garment's gap to the nearest skin grows ≤ 2 cm at p95 and ≤ 6 cm at any vertex; never culled while the body draws
//   C4 stretch garment slide vs its paired skin ≤ 4 cm per 60 fps frame; limb segments within 3 % of standing; no bone turns > 45°
//              in a 60 fps frame (info: garment edges stretched past their weight-paired skin — pairs across the armpit, eye-check)
// Bodies / kits by boot (BOOTS=): the dunk default kit and the Closet starters, on the male and female kit bodies.
//   PORT=3071 npx tsx scripts/probes/_clothing-alone-probe.mts      (BOOTS= regex · SCEN= regex · SHOTS=1 AIM=<bone> AIM_DIST= · DIAG=1 · OUT_DIR= · TAG= · DUMP=1)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3061', OUT = process.env.OUT_DIR ?? 'docs/shots/clothing-alone', TAG = process.env.TAG ?? 'run';
const SCEN = process.env.SCEN ?? '', BOOTS = process.env.BOOTS ?? '', SHOTS = !!process.env.SHOTS;
mkdirSync(OUT, { recursive: true });
const PAGE = readFileSync(new URL('./_clothing-alone-page.js', import.meta.url), 'utf8');

interface Boot { name: string; qs: string }
const BOOT_LIST: Boot[] = [
  { name: 'male · dunk kit (top_bonds/shorts_court/shoes_evo)', qs: 'body=male' },
  { name: 'male · Closet starters (top_lab/shorts_court/shoes_flight)', qs: 'body=male&tops=top_lab&shorts=shorts_court&shoes=shoes_flight' },
  { name: 'female · dunk kit', qs: 'body=female' },
  { name: 'female · Closet starters', qs: 'body=female&tops=top_lab&shorts=shorts_court&shoes=shoes_flight' },
  { name: 'male heavy tall long-reach · dunk kit + windmill finish', qs: 'body=male&height=108&build=115&reach=106&finish=windmill' },
];
interface Scenario { name: string; prop: 'none' | 'car'; slamAt: number }
const SCENS: Scenario[] = [
  { name: 'PLAIN power make (slam at clip 1.22)', prop: 'none', slamAt: 1.22 },
  { name: 'CAR power make (slam at clip 1.22)', prop: 'car', slamAt: 1.22 },
];

const PAD_INIT = `(() => { const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`;
type G = { name: string; gap95: number; gapMax: number; gapBone: string; active: boolean; vis: boolean; sameParent: boolean; sameSkel: boolean; linked: number; p95: number; dMax: number; spikes: number; jumps: number; elong: number; rMax: number; rMin: number; rBone: string; jump: number; jBone: string; pop: number; popBone: string };
type Sl = { slot: string; pokes: number; poke10: number; pokeMax: number; pokeBone: string; pokeBones: Record<string, number>; exposed: number; exposedBones: Record<string, number> };
type Row = { t: number; phase: string; clipTime: number; replaying: boolean; jamContact: boolean; garments: G[]; slots: Sl[]; body: { spikes: number; jumps: number; rMax: number; rBone: string; jump: number; jBone: string }; meshCount: number; bodyActive: boolean; limb: { dev: number; seg: string }; snap: { deg: number; bone: string }; dt?: number };

async function boot(qs: string): Promise<{ p: Page; close: () => Promise<void>; errors: string[] }> {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|FEL-FRAME/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/dunk?${qs}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 180000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(PAGE);
  await p.evaluate(`window.__cla.shots = ${SHOTS}; window.__cla.aim = ${JSON.stringify(process.env.AIM ?? 'Spine1')}; window.__cla.aimDist = ${Number(process.env.AIM_DIST ?? 1.9)}`);
  await tap(p, 0);
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors };
}
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
async function tap(p: Page, i: number, ms = 90): Promise<void> { await padSet(p, `p.buttons[${i}].pressed = true; p.buttons[${i}].value = 1`); await p.waitForTimeout(ms); await padSet(p, `p.buttons[${i}].pressed = false; p.buttons[${i}].value = 0`); }
const text = async (p: Page) => p.evaluate('document.body.innerText') as Promise<string>;
const hud = async (p: Page, k: string) => p.evaluate(`(() => { try { return String(JSON.parse(document.querySelector('pre').textContent)[${JSON.stringify(k)}] ?? ''); } catch { return ''; } })()`) as Promise<string>;
let slug = 'x';
async function shoot(p: Page): Promise<void> {
  if (!SHOTS) return;
  const fz = await p.evaluate('window.__cla.frozen') as string; if (!fz) return;
  await p.evaluate(`(() => { const pre = document.querySelector('pre'); if (pre) pre.style.visibility = 'hidden'; })()`);
  await p.screenshot({ path: `${OUT}/${slug}-${fz}.png` });
  if (process.env.DIAG) {
    // A/B on the frozen frame: each variant re-renders the same pose once
    const VARIANTS: Record<string, string> = {
      nocull: `for (const m of h.getChildMeshes(false)) if (/^Kit/.test(m.name)) { m.__was = m.alwaysSelectAsActiveMesh; m.alwaysSelectAsActiveMesh = true; }`,
      nobody: `for (const m of h.getChildMeshes(false)) if (/^Body/.test(m.name)) { m.__vis = m.isVisible; m.isVisible = false; } for (const m of h.getChildMeshes(false)) if (/^Kit/.test(m.name)) m.alwaysSelectAsActiveMesh = true;`,
      notex: `for (const m of h.getChildMeshes(false)) if (/^Kit_/.test(m.name) && m.isVisible && m.material) { m.__mat = m.material; const c = m.material.clone(m.material.name + '_diag'); c.albedoTexture = null; c.opacityTexture = null; c.bumpTexture = null; m.material = c; }`,
    };
    const UNDO = `for (const m of h.getChildMeshes(false)) { if ('__was' in m) { m.alwaysSelectAsActiveMesh = m.__was; delete m.__was; } else if (/^Kit/.test(m.name)) m.alwaysSelectAsActiveMesh = false; if ('__vis' in m) { m.isVisible = m.__vis; delete m.__vis; } if (m.__mat) { const c = m.material; m.material = m.__mat; delete m.__mat; c.dispose(); } }`;
    for (const [k, js] of Object.entries(VARIANTS)) {
      await p.evaluate(`(() => { const h = window.__FEL_DEV__.hero(); ${js}; window.__FEL_DEV__.scene.render(); })()`);
      await p.screenshot({ path: `${OUT}/${slug}-${fz}-${k}.png` });
      await p.evaluate(`(() => { const h = window.__FEL_DEV__.hero(); ${UNDO} })()`);
    }
    const bb = await p.evaluate(`(() => { const h = window.__FEL_DEV__.hero(); const S = window.__cla; return h.getChildMeshes(false).filter((m) => /^(Kit|Body)/.test(m.name) && m.isVisible).map((m) => { const b = m.getBoundingInfo().boundingBox; let minY = 1e9, maxY = -1e9; const G = S.refd.Gs.find((g) => g.m === m); const P = G ? G.cur.P : null; if (P) for (let i = 1; i < P.length; i += 3) { minY = Math.min(minY, P[i]); maxY = Math.max(maxY, P[i]); } return m.name.replace(/_c\d+$/, '') + ' bbox y ' + b.minimumWorld.y.toFixed(2) + '..' + b.maximumWorld.y.toFixed(2) + (P ? ' · skinned y ' + minY.toFixed(2) + '..' + maxY.toFixed(2) : ''); }).join(' | '); })()`);
    console.log(`  [diag ${fz}] ${bb}`);
    for (const sl of ['shorts', 'tops', 'shoes']) console.log(`  [diag ${fz} ${sl}] ${JSON.stringify(await p.evaluate(`window.__cla.debugSlot(${JSON.stringify(sl)})`))}`);
  }
  await p.evaluate('window.__cla.thaw()');
}
async function waitFor(p: Page, ms: number, until?: () => Promise<boolean>): Promise<void> { const t0 = Date.now(); while (Date.now() - t0 < ms) { await shoot(p); if (until && await until()) return; await p.waitForTimeout(25); } }
async function waitApproach(p: Page, ms = 40000): Promise<boolean> { const t0 = Date.now(); while (Date.now() - t0 < ms) { await shoot(p); const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t)) return true; await p.waitForTimeout(120); } return false; }
const f2 = (n: number) => n.toFixed(2), f3 = (n: number) => n.toFixed(3), mm = (n: number) => `${(n * 1000).toFixed(1)} mm`, cm = (n: number) => `${(n * 100).toFixed(1)} cm`;

async function attempt(p: Page, sc: Scenario, idx: number, bootName: string): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  slug = `${TAG}-${idx}-${sc.prop}`;
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(600);
  await tap(p, 12); await p.waitForTimeout(250);
  if (sc.prop === 'car') { for (let i = 0; i < 4 && (await hud(p, 'prop')).toUpperCase() !== 'CAR'; i++) { await tap(p, 13); await p.waitForTimeout(300); } }
  for (let i = 0; i < 3 && !(await hud(p, 'style')).toLowerCase().startsWith('power'); i++) { await tap(p, 1); await p.waitForTimeout(200); }
  if (sc.prop === 'car') await waitFor(p, 8000, async () => (await p.evaluate('!!window.__FEL_DEV__.dunkPosture.get().obstacle')) as boolean);
  await p.waitForTimeout(500);
  const info = await p.evaluate('window.__cla.ref()') as { error?: string; mask: Record<string, number> | null; body: string; verts: number; garments: { name: string; verts: number; tris: number; linked: string; sameSkeleton: boolean; weighted: boolean; paired: number; fix: string | null }[]; slots: { slot: string; meshes: string[]; covered: number; hidden: number; proudAtRef: number }[] };
  if (info.error) { lines.push(`FAIL  reference: ${info.error}`); return lines; }
  lines.push(`      prop ${await hud(p, 'prop')} · style ${await hud(p, 'style')} · body ${info.body} ${info.verts} v · body mask ${info.mask ? JSON.stringify(info.mask) : 'NONE'} · garments ${info.garments.map((g) => `${g.name} (${g.verts} v, bones linked ${g.linked}${g.sameSkeleton ? ' same Skeleton' : ' own Skeleton'}, ${g.weighted ? 'weighted' : 'NO WEIGHTS'}, ${g.paired} paired${g.fix ? ', fix ' + g.fix : ''})`).join(' · ')} · C2 coverage ${info.slots.map((x) => `${x.slot} [${x.meshes.join('+')}] covers ${x.covered} drawn body v (${x.hidden} hidden by the mask), ${x.proudAtRef} proud standing`).join(' · ')}`);
  const m0 = (await p.evaluate('window.__cla.marks.length')) as number;
  await p.evaluate(`(() => { const S = window.__cla; S.rows = []; S.drv = { slamAt: ${sc.slamAt}, frames: 0, done: false }; S.shotsDone = {}; S.on = true; })()`);
  await padSet(p, 'p.axes[1] = -1'); await p.waitForTimeout(200); await padSet(p, 'p.buttons[7].pressed = true; p.buttons[7].value = 1');
  await waitFor(p, 6000, async () => (await p.evaluate('window.__cla.rows.at(-1)?.phase')) === 'cinematic');
  await padSet(p, 'p.buttons[7].pressed = false; p.buttons[7].value = 0; p.axes[1] = 0');
  await waitFor(p, 3000, async () => /resolve|judging/.test(String(await p.evaluate('window.__cla.rows.at(-1)?.phase'))));
  await waitFor(p, 12000, async () => /HOLD to run|Pick your PROP|RIVAL ROUND|FINAL ROUND/.test(await text(p)) && !/CONFER/.test(await text(p)));
  await p.evaluate('window.__cla.on = false');
  const marks = ((await p.evaluate('window.__cla.marks')) as { t: number; msg: string }[]).slice(m0);
  const R0 = (await p.evaluate('window.__cla.rows')) as Row[];
  if (process.env.DUMP) writeFileSync(`${OUT}/rows-${slug}.json`, JSON.stringify({ info, marks, rows: R0 }));
  const launch = R0.findIndex((r) => r.phase === 'cinematic');
  // the attempt: from 400 ms before the takeoff (the gather) through the resolve, the landing and the replay
  const R = launch < 0 ? [] : R0.filter((r) => r.t >= R0[launch].t - 400);
  R.forEach((r, i) => { r.dt = i ? r.t - R[i - 1].t : 16.7; });
  const k60 = (r: Row) => 16.7 / Math.max(16.7, r.dt ?? 16.7);   // a measure over one sampled frame, per 60 fps frame
  const contact = R.find((r) => r.jamContact && !r.replaying), replay = R.filter((r) => r.replaying);
  if (!R.length) { lines.push(`FAIL  never launched (${R0.length} rows, phases ${[...new Set(R0.map((r) => r.phase))].join(',')})`); return lines; }
  const beat = (r: Row) => `${r.replaying ? 'replay ' : ''}${r.phase}@${f2(r.clipTime)}${contact ? ` (${r.t >= contact.t ? '+' : ''}${Math.round(r.t - contact.t)} ms from CONTACT)` : ''}`;
  lines.push(`      ${contact ? 'MAKE' : 'MISS'} · ${R.length} sampled frames (${R.filter((r) => r.phase === 'cinematic' && !r.replaying).length} flight, ${R.filter((r) => r.phase === 'resolve' && !r.replaying).length} resolve, ${replay.length} replay) · ${marks.filter((m) => /DUNK-SLAM|iron contact|FEL-KIT/.test(m.msg)).map((m) => m.msg.slice(0, 110)).join(' | ')}`);
  const names = [...new Set(R.flatMap((r) => r.garments.map((g) => g.name)))];
  const all = (fn: (g: G, r: Row) => boolean) => R.every((r) => r.garments.every((g) => fn(g, r)));
  const worst = <K extends keyof G>(k: K, gname?: string) => { let best: { g: G; r: Row } | null = null; for (const r of R) for (const g of r.garments) if ((!gname || g.name === gname) && (!best || (g[k] as number) > (best.g[k] as number))) best = { g, r }; return best!; };
  // C1
  const bad1 = R.flatMap((r) => r.garments.filter((g) => !g.vis || !g.sameParent || !g.sameSkel || g.linked !== 22).map((g) => `${g.name}@${beat(r)} vis ${g.vis} parent ${g.sameParent} skel ${g.sameSkel} linked ${g.linked}`));
  const meshCounts = [...new Set(R.map((r) => r.meshCount))];
  say(bad1.length === 0 && info.garments.every((g) => g.weighted && g.linked === '22/22') && meshCounts.length === 1,
    `C1 skinned bind: ${names.length} garments × ${R.length} frames — all weighted ${info.garments.every((g) => g.weighted)}, all 22/22 bones linked to the body skeleton's nodes at the reference ${info.garments.every((g) => g.linked === '22/22')}, frames breaking bind/visibility/parent/skeleton ${bad1.length}${bad1.length ? ' ' + bad1.slice(0, 4).join(' ; ') : ''} · visible body+garment mesh count ${meshCounts.join('/')}`);
  // C2
  const slots = [...new Set(R.flatMap((r) => r.slots.map((x) => x.slot)))];
  const worstS = (k: 'pokes' | 'pokeMax', slot: string) => { let best: { x: Sl; r: Row } | null = null; for (const r of R) for (const x of r.slots) if (x.slot === slot && (!best || x[k] > best.x[k])) best = { x, r }; return best!; };
  const c2 = slots.map((n) => { const w = worstS('pokes', n), wm = worstS('pokeMax', n), we = (() => { let b: { x: Sl; r: Row } | null = null; for (const r of R) for (const x of r.slots) if (x.slot === n && (!b || x.exposed > b.x.exposed)) b = { x, r }; return b!; })(); const frames = R.filter((r) => r.slots.some((x) => x.slot === n && (x.pokes > 8 || (x.slot !== 'shoes' && x.pokeMax > 0.015) || x.exposed > 8))); return { n, w, wm, we, frames }; });
  say(c2.every((x) => x.frames.length === 0),
    `C2 no body clip (≤ 8 skin v that were under a top/short standing and now stand > 6 mm proud, none > 15 mm; ≤ 8 foot-skin v drawn inside a shoe; ≤ 8 hidden skin v slid out past the garment's edge): ${c2.map((x) => `${x.n}: worst ${x.w.x.pokes} v proud (${x.w.x.poke10} > 10 mm) @${beat(x.w.r)} [${Object.entries(x.w.x.pokeBones).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', ')}] · deepest ${mm(x.wm.x.pokeMax)} on ${x.wm.x.pokeBone || '—'} @${beat(x.wm.r)} · hidden skin exposed worst ${x.we.x.exposed} v @${beat(x.we.r)} [${Object.entries(x.we.x.exposedBones).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', ')}] · failing frames ${x.frames.length}/${R.length}${x.frames.length ? ` (flight ${x.frames.filter((r) => r.phase === 'cinematic' && !r.replaying).length}, around the CONTACT ±500 ms ${contact ? x.frames.filter((r) => Math.abs(r.t - contact.t) < 500 && !r.replaying).length : 0}, replay ${x.frames.filter((r) => r.replaying).length})` : ''}`).join(' ‖ ')}`);
  // C3
  const c3 = names.map((n) => { const w = worst('gap95', n), wm = worst('gapMax', n), wd = worst('p95', n); const culled = R.filter((r) => r.bodyActive && r.garments.some((g) => g.name === n && !g.active)); return { n, w, wm, wd, culled }; });
  say(all((g) => g.vis && g.gap95 <= 0.02 && g.gapMax <= 0.06) && c3.every((x) => x.culled.length === 0),
    `C3 no detach (every frame: the garment's gap to the nearest skin grows ≤ 2 cm at p95 and ≤ 6 cm at any vertex; never culled or hidden while the body draws): ${c3.map((x) => `${x.n}: gap growth p95 ${cm(x.w.g.gap95)} @${beat(x.w.r)} · max ${cm(x.wm.g.gapMax)} (${x.wm.g.gapBone}) @${beat(x.wm.r)} · not drawn while the body draws ${x.culled.length} frames · info: slide along the skin p95 ${cm(x.wd.g.p95)} max ${cm(x.wd.g.dMax)}`).join(' ‖ ')}`);
  // C4
  const popW = (n: string) => { let b: { v: number; g: G; r: Row } | null = null; for (const r of R) for (const g of r.garments) if (g.name === n && (!b || g.pop * k60(r) > b.v)) b = { v: g.pop * k60(r), g, r }; return b!; };
  const c4 = names.map((n) => ({ n, s: worst('spikes', n), r: worst('rMax', n), p: popW(n) }));
  const lW = R.reduce((a, r) => (r.limb.dev > a.limb.dev ? r : a), R[0]);
  const sW = R.reduce((a, r) => (r.snap.deg * k60(r) > a.snap.deg * k60(a) ? r : a), R[1] ?? R[0]);
  const bJ = R.reduce((a, r) => (r.body.jumps > a.body.jumps ? r : a), R[0]);
  say(c4.every((x) => x.p.v <= 0.04) && lW.limb.dev <= 0.03 && sW.snap.deg * k60(sW) <= 45,
    `C4 no stretch spikes (garment: one-frame slide vs its skin ≤ 4 cm per 60 fps frame [info: edges stretched 1.6× AND 1.5 cm past their weight-paired skin — pairs across the armpit, eye-checked]; body: limb segments within 3 % of standing, no bone turns > 45° in a 60 fps frame): limbs worst ${(lW.limb.dev * 100).toFixed(2)} % ${lW.limb.seg} @${beat(lW)} · bone snap worst ${(sW.snap.deg * k60(sW)).toFixed(1)}°/frame ${sW.snap.bone} @${beat(sW)} ‖ ${c4.map((x) => `${x.n}: stretched past the body ${x.s.g.spikes} edges @${beat(x.s.r)} (raw max ${f3(x.r.g.rMax)}× ${x.r.g.rBone}) · slide ${cm(x.p.v)}/frame (${x.p.g.popBone}) @${beat(x.p.r)}`).join(' ‖ ')} ‖ info, not graded: body skin edges changing 0.25× AND 1.5 cm in one sampled frame, worst ${bJ.body.jumps} @${beat(bJ)} (${bJ.body.jBone}) — the groin and armpit creases fold at the probe's ~30 fps`);
  lines.push(`      [${bootName}]`);
  return lines;
}

(async () => {
  const boots = BOOT_LIST.filter((b) => !BOOTS || new RegExp(BOOTS, 'i').test(b.name));
  const scens = SCENS.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const out: string[] = [`CLOTHING-ALONE probe · ${TAG} · port ${PORT} · shots ${SHOTS} · ${new Date().toISOString()}`];
  let errs: string[] = []; let k = 0;
  for (const bt of boots) {
    out.push(`\n# ${bt.name}  (?${bt.qs})`);
    let s: Awaited<ReturnType<typeof boot>> | null = null;
    try { s = await boot(bt.qs); } catch (e) { out.push(`FAIL  boot threw: ${String(e).slice(0, 200)}`); continue; }
    for (const sc of scens) {
      out.push(`\n## ${++k}. ${sc.name}`);
      try { out.push(...await attempt(s.p, sc, k, bt.name)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 300)}`); }
      console.log(out.slice(-7).join('\n'));
    }
    errs = errs.concat(s.errors); await s.close();
  }
  out.push(`\nconsole errors: ${errs.length}${errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : ''}`);
  out.push(`TOTAL PASS ${out.filter((l) => l.startsWith('PASS')).length} · FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`);
  writeFileSync(`${OUT}/report-${TAG}.md`, out.join('\n'));
  console.log(out.slice(-3).join('\n'));
})();
