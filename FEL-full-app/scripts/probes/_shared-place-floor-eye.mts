// SHARED-PLACE-FLOOR eye — one frame per ENABLED mode on /dev/mode, plus the PLACE numbers a screenshot can't give:
// feet-to-floor gap under the hero, the floor that ray hit, and how much of the frame is one flat colour (void/melt).
// env: BASE (dev server) · MODES (comma list, default all ENABLED) · OUT · TAG · WAIT (ms after wake)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
import sharp from 'sharp';
import rulesMod from '../../lib/babylon/visual/placeRules';
const { placeVerdict } = rulesMod as unknown as typeof import('../../lib/babylon/visual/placeRules');

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const ALL = ['dunk','karate','football','skateboard','snowboard_slalom','surf','tennis','derby','penalty','golf','onevone','threevthree',
  'carnival','karate_vs','mixedcombat','dunkduel','sprint','showdown','duel','volleyball','dance','who_scene_it','freerun','threepoint',
  'bigair','aeroaces','velocitykart','brainbrawl'];
const MODES = (process.env.MODES ?? ALL.join(',')).split(',').filter(Boolean);
const TAG = process.env.TAG ?? 'base';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/shared-place-floor/${TAG}`;
const SUFFIX = process.env.SUFFIX ?? '';
const WAIT = Number(process.env.WAIT ?? 2500);
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const rows: unknown[] = [];
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error' && !/401|favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  const t0 = Date.now();
  try {
    await p.goto(`${BASE}/dev/mode/${mode}${process.env.QUERY ? `?${process.env.QUERY}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await p.waitForSelector('canvas', { timeout: 240000 });
    await p.waitForFunction(`!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.meshes.length > 20)`, null, { timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(6000);
    const s0 = p.locator('text=/^START$/').first();
    if (await s0.count()) await s0.click().catch(() => {});
    await p.keyboard.press('Space');
    await p.waitForTimeout(WAIT);
    const m = await p.evaluate(`(() => {
      const d = window.__FEL_DEV__; if (!d || !d.scene) return { err: 'no dev handle' };
      const s = d.scene; const h = d.hero && d.hero();
      const out = { meshes: s.meshes.length, active: s.getActiveMeshes().length, fog: s.fogMode ? +(s.fogDensity||0).toFixed(4) : 0 };
      if (h) {
        const node = h.root || h.mesh || h;
        const pos = node.getAbsolutePosition ? node.getAbsolutePosition() : node.position;
        if (pos) {
          out.hero = [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)];
          // a camera ANCHOR (the quiz / carnival hubs hand the harness a bare node) has no body to stand anywhere
          out.anchor = !(node.getChildMeshes && node.getChildMeshes().length > 0);
          const R = s.constructor; // Ray lives on BABYLON; build via scene.pickWithRay's expected shape
          const origin = pos.clone(); origin.y += 3;
          const dir = pos.clone(); dir.set(0, -1, 0);
          const ray = { origin, direction: dir, length: 40 };
          try {
            const Ray = Object.getPrototypeOf(s.createPickingRay(640, 360, null, s.activeCamera)).constructor;
            const r = new Ray(origin, dir, 40);
            const hit = s.pickWithRay(r, (mm) => mm.isEnabled() && mm.isVisible && mm.visibility > 0 && !(mm.thinInstanceCount > 0) && mm.getTotalVertices() > 3 && !/hero|shadow|blob|avatar|body|skin|rig|ball|coin|board|__root__/i.test(mm.name) && !(node.getChildMeshes && node.getChildMeshes().includes(mm)));
            out.floor = hit && hit.hit ? { name: hit.pickedMesh.name, gap: +(pos.y - hit.pickedPoint.y).toFixed(3) } : null;
          } catch (e) { out.floorErr = String(e).slice(0, 80); }
          // MID layer: distinct scenery objects (meshes + thin instances) whose world centre is 6–60 m from the hero,
          // excluding floors (flat & huge), bodies and HUD-ish billboards
          let mid = 0;
          const heroKids = new Set(node.getChildMeshes ? node.getChildMeshes() : []);
          for (const mm of s.meshes) {
            if (!mm.isEnabled() || !mm.isVisible || mm.visibility === 0 || heroKids.has(mm) || mm.getTotalVertices() < 4) continue;
            if (/ground|floor|surround|piste|water|sky|dome|backdrop|shadow|blob|coin|__root__/i.test(mm.name)) continue;
            if (mm.skeleton) continue;
            const tc = mm.thinInstanceCount || 0;
            if (tc > 0 && mm._thinInstanceDataStorage && mm._thinInstanceDataStorage.matrixData) {
              const md = mm._thinInstanceDataStorage.matrixData;
              for (let k = 0; k < tc; k++) { const x = md[k*16+12] - pos.x, z = md[k*16+14] - pos.z; const dd = Math.hypot(x, z); if (dd >= 6 && dd <= 60) mid++; }
              continue;
            }
            const c = mm.getBoundingInfo().boundingBox.centerWorld; const e = mm.getBoundingInfo().boundingBox.extendSizeWorld;
            if (e.x > 40 && e.z > 40 && e.y < 2) continue;
            const dd = Math.hypot(c.x - pos.x, c.z - pos.z); if (dd >= 6 && dd <= 60) mid++;
          }
          out.mid = mid;
          // facing: hero forward (world −z of the root? read the root's forward) vs camera→hero ground direction
          const cam = s.activeCamera;
          if (cam) { const fx = pos.x - cam.globalPosition.x, fz = pos.z - cam.globalPosition.z; const fl = Math.hypot(fx, fz) || 1;
            const wm = node.getWorldMatrix ? node.getWorldMatrix() : null;
            if (wm) { const m = wm.m; const ax = m[8], az = m[10]; const al = Math.hypot(ax, az) || 1; out.faceCam = +((ax*fx + az*fz)/(al*fl)).toFixed(2); } }
        }
      }
      return out;
    })()`).catch((e) => ({ err: String(e).slice(0, 120) }));
    // hide every DOM layer that is not the canvas (dev HUD json, perf chip, touch overlay) so the frame is the PLACE
    if (process.env.CLEAN !== '0') await p.evaluate(`(() => { const c = document.querySelector('canvas'); for (const el of document.body.querySelectorAll('*')) { if (el !== c && !el.contains(c)) el.style.visibility = 'hidden'; } })()`);
    await p.waitForTimeout(120);
    await p.screenshot({ path: `${OUT}/${mode}${SUFFIX}.png` });
    // flat-colour share of the lower 55% of the frame: bucket colours coarsely and report the biggest bucket
    const flatOld = null && await p.evaluate(`(() => {
      const c = document.querySelector('canvas'); if (!c) return null;
      const o = document.createElement('canvas'); o.width = 160; o.height = 90; const g = o.getContext('2d');
      try { g.drawImage(c, 0, 0, 160, 90); } catch { return null; }
      const px = g.getImageData(0, 40, 160, 50).data; const bins = new Map(); let n = 0;
      for (let i = 0; i < px.length; i += 4) { const k = (px[i] >> 4) + '-' + (px[i+1] >> 4) + '-' + (px[i+2] >> 4); bins.set(k, (bins.get(k) || 0) + 1); n++; }
      let best = 0, key = ''; for (const [k, v] of bins) if (v > best) { best = v; key = k; }
      return { topBin: key, share: +(best / n).toFixed(2), bins: bins.size };
    })()`).catch(() => null);
    // flat-colour share of the lower 55 % of the SAVED frame (canvas readback is blank without preserveDrawingBuffer)
    const { data, info } = await sharp(`${OUT}/${mode}${SUFFIX}.png`).resize(160, 90).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const bins = new Map<string, number>(); let n = 0;
    for (let y = 40; y < 90; y++) for (let x = 0; x < 160; x++) { const i = (y * info.width + x) * 3; const k = `${data[i] >> 4}-${data[i+1] >> 4}-${data[i+2] >> 4}`; bins.set(k, (bins.get(k) ?? 0) + 1); n++; }
    let best = 0; for (const v of bins.values()) best = Math.max(best, v);
    const flat = { share: +(best / n).toFixed(2), bins: bins.size };
    if (process.env.EVAL) console.log('EVAL', JSON.stringify(await p.evaluate(process.env.EVAL).catch((e) => String(e))));
    if (process.env.DRIVE === '1') {
      // a second frame from inside the play: hold forward, carve right, keep going
      await p.keyboard.down('ArrowUp'); await p.waitForTimeout(2200);
      await p.keyboard.down('ArrowRight'); await p.waitForTimeout(700); await p.keyboard.up('ArrowRight');
      await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${mode}${SUFFIX}-02-drive.png` }); await p.keyboard.up('ArrowUp');
    }
    const mm = m as { floor?: { gap: number } | null; mid?: number; anchor?: boolean };
    const verdict = placeVerdict({ floorGap: mm.anchor ? 0 : mm.floor ? mm.floor.gap : null, midProps: mm.mid ?? 0, spawnFacing: null, flatShare: flat.share });
    const row = { mode, ms: Date.now() - t0, ...(m as object), flat, place: verdict.pass ? 'PASS' : verdict.fails.join('; '), errs: errs.slice(0, 4) };
    rows.push(row); console.log(JSON.stringify(row));
  } catch (e) {
    const row = { mode, err: String(e).slice(0, 160), errs };
    rows.push(row); console.log(JSON.stringify(row));
    await p.screenshot({ path: `${OUT}/${mode}-ERR.png` }).catch(() => {});
  }
  await ctx.close();
}
fs.writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 1));
await b.close();
