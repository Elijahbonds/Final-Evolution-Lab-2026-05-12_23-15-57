// DUNK-VISUAL-POLISH — scene inspector. Dumps every visible mesh around the Venice dunk court with its world
// bounding box, material type and PBR numbers, so the "ugly black object on the right" and the floor can be
// named before anything is changed. Read-only: it drives no input, it only boots the mode and looks.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3004';
const OUT = process.env.OUT ?? '/tmp/dunk-visual-scene';
const EMAIL = 'playtest@fel.local';
const PASS = 'playtest-local-only';
fs.mkdirSync(OUT, { recursive: true });

async function dump(p: Page, tag: string) {
  const rows = await p.evaluate(() => {
    const scene: any = (window as any).__FEL_DEV__?.scene;
    if (!scene) return { error: 'no __FEL_DEV__.scene' } as any;
    const out: any[] = [];
    for (const m of scene.meshes) {
      try {
        if (!m.isEnabled?.() ) continue;
        if (m.isVisible === false) continue;
        const g = m.getTotalVertices?.() ?? 0;
        if (!g) continue;
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        const mn = bb.minimumWorld, mx = bb.maximumWorld;
        const mat: any = m.material;
        const chain: string[] = [];
        let par: any = m.parent;
        for (let i = 0; i < 6 && par; i++) { chain.push(par.name); par = par.parent; }
        out.push({
          n: m.name, cls: m.getClassName?.(), verts: g,
          min: [+mn.x.toFixed(2), +mn.y.toFixed(2), +mn.z.toFixed(2)],
          max: [+mx.x.toFixed(2), +mx.y.toFixed(2), +mx.z.toFixed(2)],
          vis: m.visibility, par: chain.join('<'),
          mat: mat ? {
            n: mat.name, cls: mat.getClassName?.(),
            met: mat.metallic, rough: mat.roughness,
            alb: mat.albedoColor ? [+mat.albedoColor.r.toFixed(2), +mat.albedoColor.g.toFixed(2), +mat.albedoColor.b.toFixed(2)] : undefined,
            dif: mat.diffuseColor ? [+mat.diffuseColor.r.toFixed(2), +mat.diffuseColor.g.toFixed(2), +mat.diffuseColor.b.toFixed(2)] : undefined,
            albTex: mat.albedoTexture?.name ?? mat.diffuseTexture?.name,
            emi: mat.emissiveColor ? [+mat.emissiveColor.r.toFixed(2), +mat.emissiveColor.g.toFixed(2), +mat.emissiveColor.b.toFixed(2)] : undefined,
            envI: mat.environmentIntensity,
          } : null,
        });
      } catch { /* skip */ }
    }
    const cam = scene.activeCamera;
    return {
      meshes: out.length,
      cam: cam ? { pos: [+cam.globalPosition.x.toFixed(2), +cam.globalPosition.y.toFixed(2), +cam.globalPosition.z.toFixed(2)] } : null,
      rows: out,
    } as any;
  });
  fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(rows, null, 1));
  console.log(tag, 'meshes', rows.meshes ?? rows.error);
  return rows;
}

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: chromiumExe(),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { const t = m.text(); if (/FEL-|DUNK-|VENICE|MISSING|error/i.test(t)) console.log('CON', t.slice(0, 200)); });

  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(800);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', EMAIL);
    await p.fill('input[type="password"]', PASS);
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2500);
  }
  await p.goto(`${BASE}/play/dunk?arena=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  console.log('after nav url=', p.url());
  await p.screenshot({ path: `${OUT}/nav.png` });
  console.log('body=', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
  await p.waitForSelector('canvas', { timeout: 180000 });
  await p.waitForFunction(() => /TAP TO START|FLIGHT NIGHT/i.test(document.body.innerText), { timeout: 180000 });
  await p.waitForTimeout(1500);
  const btn = p.getByRole('button', { name: /TAP TO START/i });
  if (await btn.count()) await btn.click({ force: true }).catch(() => {});
  await p.waitForTimeout(2500);
  await dump(p, 'scene');
  await p.screenshot({ path: `${OUT}/wide.png` });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
