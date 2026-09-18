// DOES THE PREVIEW SHOW THE BUILD, AND DOES IT KEEP SHOWING IT (2026-09-14).
//
// Two questions a unit test cannot answer. First: does a hero actually spawn in the editor pane, with a
// skeleton, or is the pane a black rectangle? Second, and the one this probe exists for:
//
//   TEN PRESSES OF ▶ ON HEIGHT MUST PRODUCE 110%, NOT 1.01^10.
//
// `applyIdentity` scales the root with scaleInPlace, which is cumulative and correct where it is called —
// once, at spawn. A creator re-applies on every keypress. The preview therefore sets the root absolutely
// from the scale the spawn arrived with, and this measures the actual root scaling off the live scene to
// prove it: each press must land on the value the row shows, with no drift.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = '/tmp/claude-501/creator';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await p.goto(`${BASE}/dev/creator`, { waitUntil: 'domcontentloaded', timeout: 120000 });
// the preview is a dynamic import of Babylon plus a GLB fetch; give it a real budget
await p.waitForFunction(`!!window.__FEL_CREATOR_PREVIEW__`, undefined, { timeout: 120000 }).catch(() => {});
await p.waitForTimeout(3000);

const spawn = await p.evaluate(`(() => {
  const h = window.__FEL_CREATOR_PREVIEW__;
  if (!h) return { ok: false };
  return {
    ok: true,
    meshes: h.spawned.meshes.length,
    bones: h.spawned.skeleton ? h.spawned.skeleton.bones.length : 0,
    rendering: h.scene.getEngine().getFps() > 1,
    rootY: +h.spawned.root.scaling.y.toFixed(4),
  };
})()`) as Record<string, unknown>;
console.log('[PREVIEW] spawned:', JSON.stringify(spawn));
await p.screenshot({ path: `${OUT}/10-preview.png` });

// open Vitals, focus Height, and press ▶ ten times, reading the rig after each one
await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Vitals'); b && b.click(); })()`);
await p.waitForTimeout(500);
await p.getByText('Height', { exact: false }).first().click().catch(() => {});
await p.waitForTimeout(300);

const readShown = async () => (await p.evaluate(`(() => {
  for (const el of document.querySelectorAll('div')) {
    const p0 = el.querySelector(':scope > div > div > p');
    const v = el.querySelector(':scope > div > div > span.fel-stat');
    if (p0 && v && (p0.textContent || '').toUpperCase() === 'HEIGHT') return v.textContent?.trim() ?? null;
  }
  return null;
})()`)) as string | null;
const readRig = async () => (await p.evaluate(`(() => {
  const h = window.__FEL_CREATOR_PREVIEW__;
  if (!h) return null;
  return { root: +(h.spawned.root.scaling.y / h.baseScale.y).toFixed(4) };
})()`)) as { root: number } | null;

const rows: string[] = [];
for (let i = 0; i < 10; i++) {
  await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='▶'); b && b.click(); })()`);
  await p.waitForTimeout(160);
  const shown = await readShown(); const rig = await readRig();
  rows.push(`${shown} → root ${rig?.root}`);
}
console.log('[PREVIEW] height presses:', rows.join(' · '));
const finalShown = await readShown(); const finalRig = await readRig();
const want = finalShown ? parseInt(finalShown, 10) / 100 : NaN;
const drift = finalRig ? Math.abs(finalRig.root - want) : NaN;
console.log(`[PREVIEW] after 10 presses the screen says ${finalShown} and the rig is ${finalRig?.root} · drift ${drift.toFixed(4)} · ${drift < 0.005 ? 'NO COMPOUNDING' : 'COMPOUNDED'}`);
await p.screenshot({ path: `${OUT}/11-preview-tall.png` });

// GEAR, ON THE ONE ITEM THAT CAN PROVE IT. The forged hero is a single Body mesh: no hair, no iris, no
// garments. Garments arrive as KIT PACKS, and only two items ship one (top_baseball, top_football), so
// the Gridiron Jersey is the only wearable whose selection is observable at all. Anything else would be
// the creator claiming a change the renderer has nothing to make.
await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Footwear / Gear'); b && b.click(); })()`);
await p.waitForTimeout(500);
await p.getByText('Top', { exact: true }).first().click().catch(() => {});
await p.waitForTimeout(250);
for (let i = 0; i < 3; i++) {
  await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='\u25b6'); b && b.click(); })()`);
  await p.waitForTimeout(200);
}
await p.waitForTimeout(3000);   // the pack is a network load
const kit = await p.evaluate(`(() => {
  const h = window.__FEL_CREATOR_PREVIEW__;
  const rows = [];
  for (const m of h.scene.meshes) {
    if (!/^Kit_/.test(m.name)) continue;
    const mat = m.material; const c = mat && (mat.albedoColor || mat.diffuseColor);
    rows.push({ mesh: m.name, hex: c ? c.toHexString() : null, verts: m.getTotalVertices() });
  }
  return rows;
})()`);
console.log('[PREVIEW] kit meshes after choosing the Gridiron Jersey:', JSON.stringify(kit));

// and a look change has to reach the same hero
await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Footwear / Gear'); b && b.click(); })()`);
await p.waitForTimeout(500);
await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='COLOURS'||x.textContent==='Colours'); b && b.click(); })()`);
await p.waitForTimeout(400);
await p.getByText('Jersey Colour', { exact: false }).first().click().catch(() => {});
await p.waitForTimeout(250);
for (let i = 0; i < 4; i++) {
  await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='▶'); b && b.click(); })()`);
  await p.waitForTimeout(150);
}
const tint = await p.evaluate(`(() => {
  const h = window.__FEL_CREATOR_PREVIEW__;
  if (!h) return null;
  const hit = [];
  for (const m of h.scene.meshes) {
    if (!/^Kit_|jersey|top|shirt|tee/i.test(m.name)) continue;
    const mat = m.material;
    const c = mat && (mat.albedoColor || mat.diffuseColor);
    if (c) hit.push({ mesh: m.name.slice(0, 28), hex: c.toHexString() });
  }
  return hit.slice(0, 4);
})()`);
console.log('[PREVIEW] jersey meshes after 4 colour steps:', JSON.stringify(tint));
await p.screenshot({ path: `${OUT}/12-preview-colour.png` });
console.log(`[PREVIEW] errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0, 2).join(' | ') : ''}`);
await b.close();
