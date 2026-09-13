// GROUND AUDIT — is any of this world's floor drawn twice?
//
// Owner, 2026-09-12: "make sure the ground isnt redundant".
//
// A redundant floor is cheap to create and invisible in a screenshot, which is why it wants a measurement
// rather than an eye: two coplanar slabs z-fight from some angles and not others, and a painted sea
// underneath an opaque beach costs fill rate while looking perfect.
//
// This reads the live scene and reports, for every ground-like mesh (big, flat, horizontal within the
// venue's own pitch): its world footprint, and every PAIR whose footprints overlap. An overlap is not
// automatically a defect — a seam needs a few metres of it — so the report prints the overlapping AREA as a
// fraction of the smaller slab, and the bar is: no pair shares more than a seam.
//
// env: BASE MODE VENUE
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'skateboard';
const VENUE = process.env.VENUE ?? '';
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
p.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errors++; });
p.on('pageerror', () => { errors++; });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}${VENUE ? `?venue=${VENUE}` : ''}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }

const report = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const slabs = [];
  for (const m of s.meshes) {
    if (!m.isEnabled() || m.getTotalVertices() === 0) continue;
    const bb = m.getBoundingInfo().boundingBox;
    const e = bb.extendSizeWorld;
    const w = e.x * 2, d = e.z * 2;
    // THICKNESS IS A LOCAL MEASUREMENT. The snow piste is a plane pitched 0.22 rad over 298 m, so its WORLD
    // bounding box is 65 m tall — by a world-space flatness test the piste is not flat, and the probe then
    // reported the entire slalom run as 'no ground at all' with every spectator floating. Measure the slab's
    // own y extent in its own frame.
    const le = bb.extendSize, sc = m.scaling;
    const h = le.y * 2 * Math.abs(sc.y);
    // GROUND is a large, flat, PICKABLE plane the game treats as a surface. Every one of these worlds builds
    // its floors with CreateGround (4 verts), so the vertex cap is what separates a floor from the scenery —
    // and it is what this probe needed: the first run reported 'tree_palmTall 109 x 47 m' and 'fence-1x4
    // 75 x 73 m' as giant redundant slabs, because a thin-instance / merged master's bounding box spans every
    // instance it carries. Those are a palm line and a fence, not two floors.
    if (w < 10 || d < 10) continue;
    if (h > Math.min(w, d) * 0.35) continue;
    if (!m.isPickable) continue;
    if (m.thinInstanceCount > 0) continue;
    if (m.getTotalVertices() > 256) continue;
    const c = bb.centerWorld;
    slabs.push({
      name: m.name, w: +w.toFixed(1), d: +d.toFixed(1), y: +c.y.toFixed(2),
      x0: +(c.x - e.x).toFixed(1), x1: +(c.x + e.x).toFixed(1),
      z0: +(c.z - e.z).toFixed(1), z1: +(c.z + e.z).toFixed(1),
      area: Math.round(w * d), pickable: !!m.isPickable, visible: m.isVisible,
    });
  }
  const overlaps = [];
  for (let i = 0; i < slabs.length; i++) for (let j = i + 1; j < slabs.length; j++) {
    const a = slabs[i], c = slabs[j];
    const ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
    const oz = Math.min(a.z1, c.z1) - Math.max(a.z0, c.z0);
    if (ox <= 0 || oz <= 0) continue;
    // Two slabs at clearly different HEIGHTS are layers, not redundancy: the wave face rides 1.3 m above the
    // water on purpose, and a deck over a floor is a deck. Redundancy is two floors at the SAME height, which
    // is also the only case that z-fights. (First run of this probe called the wave face redundant with the
    // sea it is a wave ON, which is how a rule gets written.)
    if (Math.abs(a.y - c.y) > 0.5) continue;
    const shared = ox * oz;
    const smaller = Math.min(a.area, c.area);
    overlaps.push({ a: a.name, b: c.name, shared: Math.round(shared),
      ofSmaller: +(shared / smaller).toFixed(2), dy: +Math.abs(a.y - c.y).toFixed(2),
      ox: +ox.toFixed(1), oz: +oz.toFixed(1) });
  }
  overlaps.sort((p, q) => q.ofSmaller - p.ofSmaller);

  // PROPS OVER NOTHING. The other half of the same question: a world can have exactly the right amount of
  // ground and still stand its furniture off the edge of it. Anything low (a prop meant to rest on a surface)
  // whose footprint lies outside EVERY slab is standing on the void.
  const floating = [];
  for (const m of s.meshes) {
    if (!m.isEnabled() || m.getTotalVertices() === 0) continue;
    const bb = m.getBoundingInfo().boundingBox;
    const e = bb.extendSizeWorld, c = bb.centerWorld;
    if (e.x * 2 >= 10 && e.z * 2 >= 10) continue;            // that is a slab, not a prop
    if (c.y > 14 || c.y < -80) continue;                      // banners/sky and the long drop are not props
    const over = slabs.some((sl) => c.x >= sl.x0 - 1 && c.x <= sl.x1 + 1 && c.z >= sl.z0 - 1 && c.z <= sl.z1 + 1);
    if (!over) floating.push({ name: m.name, x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1) });
  }
  return { slabs, overlaps, floating, totalArea: slabs.reduce((t, x) => t + x.area, 0) };
})()`);

console.log(`\n== ${MODE}${VENUE ? ' · ' + VENUE : ''} — ${report.slabs.length} ground slabs, ${report.totalArea} m² total`);
for (const s of report.slabs) {
  console.log(`   ${s.name.padEnd(14)} ${String(s.w).padStart(6)} x ${String(s.d).padStart(6)} @ y ${String(s.y).padStart(7)}  x[${s.x0}..${s.x1}] z[${s.z0}..${s.z1}]  ${s.area} m²${s.pickable ? ' pickable' : ''}`);
}
if (!report.overlaps.length) console.log('   OVERLAPS: none — every piece of this floor is covered exactly once');
for (const o of report.overlaps) {
  const verdict = o.ofSmaller > 0.5 ? 'REDUNDANT' : o.ofSmaller > 0.2 ? 'check' : 'seam';
  console.log(`   ${verdict.padEnd(10)} ${o.a} / ${o.b}: ${o.shared} m² shared (${(o.ofSmaller * 100).toFixed(0)}% of the smaller), ${o.ox} x ${o.oz} m, dy ${o.dy}`);
}
if (!report.floating.length) console.log('   FLOATING: none — every prop stands on something');
else {
  console.log(`   FLOATING: ${report.floating.length} props stand over no ground at all`);
  const byName = new Map();
  for (const f of report.floating) {
    const key = f.name.replace(/\(Clone\)|_primitive\d+|_\d+$/g, '');
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(`(${f.x}, ${f.y}, ${f.z})`);
  }
  for (const [k, at] of byName) console.log(`     ${k.padEnd(26)} ${at.slice(0, 4).join(' ')}${at.length > 4 ? ` +${at.length - 4} more` : ''}`);
}
console.log(`   errors ${errors}`);
await b.close();
