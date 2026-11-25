// DEPTH-LIGHT (lane L, 2026-11-25): the exploration rig's driver. Opens ./entry.mjs's static page (built by ../hoops-gap/build.mjs,
// served by ../hoops-gap/serve.mjs) per variant, plays 3 s and takes a picture (c), drives the stick and a button for 6 s and takes
// another (d), and measures the FEET POOL on each picture: the court's luminance just in front of each body's feet (0.2–0.4 m,
// the half toward the camera, which no leg covers) divided by its luminance 1.6–2.2 m out on the same side. 1.00 = nothing under
// the feet; lower = a darker pool. Real clock, SwiftShader, `?perf=off` (full render scale). Run it inside a gate hold.
//
//   npx tsx scripts/probes/depth-light/look.mts <outDir> <port> <bundleTag> <variant>...
//     variant = name|mode|query|profile      profile = portrait (390x844 touch DPR 2) | landscape | desktop (1280x720)
//   e.g. 'p1-before|onevone|feel={"look.phoneFeetPool":0}|portrait'
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const PROFILES = {
  portrait: { vw: 390, vh: 844, dpr: 2, touch: true },
  landscape: { vw: 844, vh: 390, dpr: 2, touch: true },
  desktop: { vw: 1280, vh: 720, dpr: 1, touch: false },
} as const;
const INIT = `(() => { const st = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a); })()`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** In the page: each body's foot point and the pool's sample points, as fractions of the canvas. */
const FEET = `(() => {
  const d = window.__FEL_DEV__; if (!d || !d.scene) return null;
  const s = d.scene, cam = s.activeCamera, eng = s.getEngine();
  const B = window.__BJS; if (!B || !cam) return null;
  const roots = new Set();
  for (const m of s.meshes) {
    if (!m.skeleton || !m.isEnabled() || !m.isVisible) continue;
    let r = m; while (r.parent) r = r.parent;
    roots.add(r);
  }
  const w = eng.getRenderWidth(), h = eng.getRenderHeight();
  const vp = cam.viewport.toGlobal(w, h);
  const vm = s.getTransformMatrix();
  const P = (x, y, z) => { const v = B.Vector3.Project(new B.Vector3(x, y, z), B.Matrix.Identity(), vm, vp); return [v.x / w, v.y / h, v.z]; };
  const out = [];
  for (const r of roots) {
    const p = r.getAbsolutePosition();
    if (r.scaling && r.scaling.x < 0.25) continue;
    const c = cam.globalPosition;
    let dx = c.x - p.x, dz = c.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const ring = (r0, r1) => { const pts = []; for (let a = -70; a <= 70; a += 10) { const t = a * Math.PI / 180, ca = Math.cos(t), sa = Math.sin(t); const ux = dx * ca - dz * sa, uz = dx * sa + dz * ca; for (let k = 0; k < 3; k++) { const rr = r0 + (r1 - r0) * k / 2; pts.push(P(p.x + ux * rr, p.y + 0.01, p.z + uz * rr)); } } return pts; };
    out.push({ name: r.name, at: [p.x, p.y, p.z], foot: P(p.x, p.y, p.z), near: ring(0.2, 0.4), far: ring(1.6, 2.2) });
  }
  return out;
})()`;

interface Foot { name: string; at: number[]; foot: number[]; near: number[][]; far: number[][] }
async function poolContrast(file: string, feet: Foot[] | null) {
  if (!feet?.length) return null;
  const img = sharp(file); const meta = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = meta.width!, H = meta.height!, ch = info.channels;
  const lum = (fx: number, fy: number): number | null => {
    const x = Math.round(fx * W), y = Math.round(fy * H);
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return null;
    let s = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = ((y + j) * W + (x + i)) * ch; s += 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]; }
    return s / 9;
  };
  const mean = (pts: number[][]) => { const v = pts.filter((p) => p[2] > 0 && p[2] < 1).map((p) => lum(p[0], p[1])).filter((x): x is number => x !== null); return v.length >= 8 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return feet.map((f) => { const n = mean(f.near), r = mean(f.far); return { name: f.name, near: n && Math.round(n), far: r && Math.round(r), ratio: n !== null && r ? Math.round((n / r) * 1000) / 1000 : null }; });
}

async function drive(page: Page, ms: number) {
  const end = Date.now() + ms; let i = 0;
  while (Date.now() < end) {
    const a = (i % 4) * Math.PI / 2;
    await page.evaluate(`window.__bus && window.__bus.emit({ t: 'stick', side: 'L', x: ${Math.cos(a).toFixed(2)}, y: ${Math.sin(a).toFixed(2)} })`).catch(() => {});
    await sleep(700);
    await page.evaluate(`window.__bus && (window.__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }), window.__bus.emit({ t: 'button', btn: 'A', pressed: true }), window.__bus.emit({ t: 'button', btn: 'A', pressed: false }))`).catch(() => {});
    await sleep(500); i++;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, port, tag, ...variants] = process.argv.slice(2);
  if (!variants.length) { console.error('usage: look.mts <outDir> <port> <bundleTag> name|mode|query|profile ...'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const v of variants) {
    const [name, mode, query = '', profile = 'portrait'] = v.split('|');
    const pr = PROFILES[profile as keyof typeof PROFILES];
    const ctx = await browser.newContext({ viewport: { width: pr.vw, height: pr.vh }, deviceScaleFactor: pr.dpr, isMobile: pr.touch, hasTouch: pr.touch });
    const page = await ctx.newPage();
    const errs: string[] = [], lines: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    page.on('console', (m) => { const s = m.text(); if (/\[FEL-(TIER|SHADOW|SKY|PROBE|MIRROR|LIGHT|BODY|FIT)\]/.test(s) && lines.length < 30) lines.push(s.slice(0, 240)); });
    await page.addInitScript(INIT);
    const t0 = Date.now();
    const qs = `mode=${mode}&perf=off${query ? '&' + query.split('&').map((kv) => { const [k, ...r] = kv.split('='); return `${k}=${encodeURIComponent(r.join('='))}`; }).join('&') : ''}`;
    await page.goto(`http://127.0.0.1:${port}/${tag}.html?${qs}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const ok = await page.waitForFunction(`window.__phase === 'playing' || !!window.__err`, undefined, { timeout: 300000, polling: 1000 }).then(() => true).catch(() => false);
    const res: Record<string, unknown> = { name, mode, query, profile, ok, err: await page.evaluate('window.__err || null').catch(() => null), loadS: Math.round((Date.now() - t0) / 1000) };
    if (ok && !res.err) {
      await sleep(3000);
      const fc = join(out, `${name}-${profile}-${mode}-c.jpg`);
      const feetC = await page.evaluate(FEET).catch(() => null) as Foot[] | null;
      await page.screenshot({ path: fc, type: 'jpeg', quality: 85, timeout: 120000 }).catch(() => {});
      res.poolC = await poolContrast(fc, feetC);
      await drive(page, 6000);
      const fd = join(out, `${name}-${profile}-${mode}-d.jpg`);
      const feetD = await page.evaluate(FEET).catch(() => null) as Foot[] | null;
      await page.screenshot({ path: fd, type: 'jpeg', quality: 85, timeout: 120000 }).catch(() => {});
      res.poolD = await poolContrast(fd, feetD);
      res.shadow = await page.evaluate(`(() => { const c = window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.felShadowCache; return c ? c.stats() : null; })()`).catch(() => null);
    }
    res.errors = errs; res.lines = lines; res.wallS = Math.round((Date.now() - t0) / 1000);
    writeFileSync(join(out, `${name}-${profile}-${mode}.json`), JSON.stringify(res, null, 1));
    const pools = [res.poolC, res.poolD].map((p) => (p as { ratio: number | null }[] | null)?.map((x) => x.ratio).join('/') ?? '-').join(' ');
    console.log(`${name} ${profile} ${mode} ok ${ok} load ${res.loadS}s pool(c d) ${pools} err ${errs.length}${res.err ? ' ' + res.err : ''}`);
    await ctx.close();
  }
  await browser.close();
}
