// DUNK-VISUAL-POLISH — scan surgery survey. The Venice court is ONE baked mesh (Mesh_0, 66 k verts) that carries the
// floor AND whatever vertical junk the photogrammetry caught. This histograms its world vertices so the standing
// clutter can be named by (x, z) box before mapSurgery flattens it, and samples the floor's baked colour.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3004';
const OUT = process.env.OUT ?? '/tmp/dunk-visual-scan';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: chromiumExe(),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p: Page = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(800);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', 'playtest@fel.local');
    await p.fill('input[type="password"]', 'playtest-local-only');
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2500);
  }
  await p.goto(`${BASE}/play/dunk?arena=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 180000 });
  await p.waitForFunction(() => /FLIGHT NIGHT/i.test(document.body.innerText), { timeout: 180000 });
  await p.waitForTimeout(3000);

  const res = await p.evaluate(() => {
    const BAB = (window as any).__FEL_DEV__?.scene;
    if (!BAB) return { error: 'no scene' };
    let mesh: any = null; const seen: string[] = [];
    for (const m of BAB.meshes as any[]) {
      const v = m.getTotalVertices ? m.getTotalVertices() : 0;
      if (v < 100) continue;
      let par: any = m.parent, under = false;
      for (let i = 0; i < 8 && par; i++) { if (String(par.name).indexOf('nexus_venue_map_') === 0) { under = true; break; } par = par.parent; }
      if (!under) continue;
      seen.push(m.name + ':' + v);
      if (!mesh || v > mesh.getTotalVertices()) mesh = m;
    }
    if (!mesh) return { error: 'no map mesh', seen };
    const pos = mesh.getVerticesData('position');
    const wm = mesh.computeWorldMatrix(true);
    const cells: Record<string, { n: number; ymax: number }> = {};
    let above = 0, total = 0;
    const CELL = 2;   // 2 m grid
    const V = (window as any).BABYLON?.Vector3;
    for (let i = 0; i < pos.length; i += 3) {
      // manual transform (no BABYLON global in the bundle)
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      const m = wm.m;
      const wx = x * m[0] + y * m[4] + z * m[8] + m[12];
      const wy = x * m[1] + y * m[5] + z * m[9] + m[13];
      const wz = x * m[2] + y * m[6] + z * m[10] + m[14];
      total++;
      if (wy > 0.25) {
        above++;
        const k = `${Math.floor(wx / CELL) * CELL},${Math.floor(wz / CELL) * CELL}`;
        const c = cells[k] ?? (cells[k] = { n: 0, ymax: 0 });
        c.n++; if (wy > c.ymax) c.ymax = wy;
      }
    }
    void V;
    const mat: any = mesh.material;
    return {
      picked: mesh.name, pickedVerts: mesh.getTotalVertices(), seen, total, above,
      cells: Object.entries(cells).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n),
      mat: mat ? { n: mat.name, cls: mat.getClassName?.(), met: mat.metallic, rough: mat.roughness, envI: mat.environmentIntensity, emiI: mat.emissiveIntensity, tex: mat.albedoTexture?.name, texSize: mat.albedoTexture?.getSize?.() } : null,
    };
  });
  fs.writeFileSync(`${OUT}/scan.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ total: (res as any).total, above: (res as any).above, mat: (res as any).mat }, null, 1));
  console.log('top cells (x,z → verts above 0.25 m, max height):');
  for (const c of ((res as any).cells ?? []).slice(0, 40)) console.log(` ${c.k}  n=${c.n}  ymax=${c.ymax.toFixed(2)}`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
