// THE READABILITY AUDIT (lane/readable, 2026-11-02; docs/READABLE.md). Owner: "We need to make sure people can read what
// they're looking at always."
//
// Every app/**/page.tsx (app/dev and app/api aside) rendered on the accessibility rig's stubbed server
// (scripts/readable/scenes.tsx), served over http from a random local port so public/ images load, and read in headless
// Chromium at four set-ups:
//
//   phone     390 × 844                         size, contrast (from pixels), clipping, overlap, sideways scroll
//   desktop   1280 × 800                        the same
//   zoom200   1280 × 800 at 200 % (640 × 400 CSS px, DPR 2)            clipping, overlap, sideways scroll
//   font150   390 × 844 with the root font at 150 % (iOS larger text)  clipping, overlap, sideways scroll
//
// CONTRAST IS READ FROM PIXELS, not from computed CSS: each viewport is shot twice, once as is and once with every glyph
// made transparent (scrims, panels and text shadows stay), so the second shot is exactly what is BEHIND the text. The ink
// pixels are where the two differ; the run's ratio is its colour against those background pixels (lib/readable/rules.ts
// pixelContrast). A photo, a gradient or a translucent panel is measured as drawn.
//
//   npx tsx scripts/readable/audit.mts <outDir> <label> --build-only            bundle now (no browser, no lock needed)
//   flock /home/user/wt/gate-queue.lock timeout 900 npx tsx scripts/readable/audit.mts <outDir> <label> [options]
//     --routes=/coach,/train       only these (default: every route; finished ones are skipped, so a run resumes)
//     --budget=780                 stop starting new routes after this many seconds (a lock hold is ≤ 15 min)
//     --configs=phone,desktop      a subset of the four
//     --plant                      the control scene only: exits 1 unless exactly the planted faults are flagged
//     --hud                        the HUD-over-frame scenes only
//     --redo                       re-read routes already on disk
//     --redo-before=<epoch ms>     re-read only the routes read before then
//     --inpage-only                rebuild the rig's page script (readable.js) in the frozen bundle, nothing else
//
// Writes <outDir>/<label>/routes/<route>.json (one per route), shots/<route>-<config>.jpg (the first screen, every
// failing run boxed in red), and, from scripts/readable/summary.mts, summary.json.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright-core';
import sharp from 'sharp';
import { chromiumExe } from '../probes/_chromium.mts';
import { buildRig } from '../a11y/rig.mts';
import * as rulesNs from '../../lib/readable/rules.ts';
import type { InkSample, Rect } from '../../lib/readable/rules.ts';
import type { Run, Cover, Collision } from './inpage.ts';

const rules = ((rulesNs as { default?: unknown }).default ?? rulesNs) as typeof rulesNs;
const { contrastMiss, pixelContrast, sizeMiss } = rules;

const ROOT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const pos = args.filter((a) => !a.startsWith('--'));
const OUT_ROOT = resolve(pos[0] ?? join(ROOT, '.readable'));
const LABEL = pos[1] ?? 'now';
const OUT = join(OUT_ROOT, LABEL);
const BUILD = join(OUT_ROOT, `.build-${LABEL}`);
const T0 = Date.now();
const BUDGET_S = Number(flag('budget') ?? 780);

// ── The routes ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function discoverRoutes(): { path: string; file: string; layouts: string[] }[] {
  const out: { path: string; file: string; layouts: string[] }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (name !== 'page.tsx') continue;
      const rel = relative(join(ROOT, 'app'), dir).split('\\').join('/');
      if (/^(api|dev)(\/|$)/.test(rel) || rel.split('/').some((s) => s.startsWith('_'))) continue;
      const segs = rel ? rel.split('/') : [];
      const layouts: string[] = [];
      for (let i = 1; i <= segs.length; i++) {
        const l = join(ROOT, 'app', ...segs.slice(0, i), 'layout.tsx');
        if (existsSync(l)) layouts.push(l);
      }
      const path = '/' + segs.filter((s) => !/^\(.*\)$/.test(s)).join('/');
      out.push({ path: path === '/' ? '/' : path, file: p, layouts });
    }
  };
  walk(join(ROOT, 'app'));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function bundle(): Promise<void> {
  mkdirSync(BUILD, { recursive: true });
  const routes = discoverRoutes();
  const entry = join(BUILD, 'entry.tsx');
  const lines = routes.map((r) => `  ${JSON.stringify(r.path)}: { path: ${JSON.stringify(r.path)}, load: () => import(${JSON.stringify(r.file)}), layouts: [${r.layouts.map((l) => `() => import(${JSON.stringify(l)})`).join(', ')}] },`);
  writeFileSync(entry, `import { boot } from ${JSON.stringify(join(ROOT, 'scripts/readable/scenes.tsx'))};\nvoid boot({\n${lines.join('\n')}\n});\n`);
  await buildRig(BUILD, { entry, fontBase: '/__fonts' });
  await build({
    entryPoints: [join(ROOT, 'scripts/readable/inpage.ts')], outfile: join(BUILD, 'readable.js'), bundle: true, format: 'iife',
    platform: 'browser', tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  });
  // app/layout.tsx also imports app/game-surface.css (the console stage, the HUD zoom); the a11y rig's page does not
  const html = join(BUILD, 'index.html');
  const surface = readFileSync(join(ROOT, 'app/game-surface.css'), 'utf8');
  writeFileSync(html, readFileSync(html, 'utf8')
    .replace('</style>', `\n${surface}\n</style>`)
    .replace('<script src="inpage.js"></script>', '<script src="readable.js"></script>'));
  writeFileSync(join(BUILD, 'routes.json'), JSON.stringify(routes.map((r) => r.path), null, 1));
  writeFileSync(join(BUILD, 'built.txt'), new Date().toISOString());
}

if (args.includes('--inpage-only')) {
  // the rig's own page script changed: rebuild readable.js in place, the app bundle stays frozen
  await build({ entryPoints: [join(ROOT, 'scripts/readable/inpage.ts')], outfile: join(BUILD, 'readable.js'), bundle: true, format: 'iife', platform: 'browser', tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error' });
  console.log(`inpage → ${BUILD}/readable.js`);
  process.exit(0);
}
if (args.includes('--build-only') || !existsSync(join(BUILD, 'index.html'))) {
  await bundle();
  console.log(`built → ${BUILD}`);
  if (args.includes('--build-only')) process.exit(0);
}

// ── Serving ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = p.startsWith('/__fonts/') ? join(ROOT, 'app/fonts', p.slice(9))
    : existsSync(join(BUILD, p)) && p !== '/' ? join(BUILD, p) : join(ROOT, 'public', p);
  if (!file.startsWith(ROOT) && !file.startsWith(BUILD)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ── Reading one page ─────────────────────────────────────────────────────────────────────────────────────────────────

interface Config { name: string; w: number; h: number; dpr: number; query: string; pixels: boolean; phone: boolean; hud?: 'phone' | 'tv' }
const CONFIGS: Config[] = [
  { name: 'phone', w: 390, h: 844, dpr: 1, query: '', pixels: true, phone: true },
  { name: 'desktop', w: 1280, h: 800, dpr: 1, query: '', pixels: true, phone: false },
  { name: 'zoom200', w: 640, h: 400, dpr: 2, query: '', pixels: false, phone: false },
  { name: 'font150', w: 390, h: 844, dpr: 1, query: 'rootfont=150', pixels: false, phone: true },
];

export interface Finding { rule: string; text: string; px?: number; ratio?: number; need?: number; detail?: string; key?: boolean; media?: boolean; path?: string }

type Raw = { data: Buffer; width: number; height: number; channels: number };
const raw = async (png: Buffer): Promise<Raw> => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
};

/** The ink samples of one run: where the two shots differ inside its glyph boxes, the background behind each. */
function samplesOf(A: Raw, B: Raw, rects: Rect[], dpr: number, needInk: boolean): InkSample[] {
  const ink: InkSample[] = [];
  const all: InkSample[] = [];
  const diffs: { d: number; s: InkSample }[] = [];
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.left * dpr)), x1 = Math.min(A.width - 1, Math.ceil(r.right * dpr));
    const y0 = Math.max(0, Math.floor(r.top * dpr)), y1 = Math.min(A.height - 1, Math.ceil(r.bottom * dpr));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * A.width + x) * A.channels;
        const bg = { r: B.data[i], g: B.data[i + 1], b: B.data[i + 2], a: 1 };
        const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
        const s: InkSample = { bg, ink: { r: A.data[i], g: A.data[i + 1], b: A.data[i + 2], a: 1 } };
        all.push(s);
        if (d > 30) { ink.push(s); diffs.push({ d, s }); }
      }
    }
  }
  if (needInk) {
    // no solid colour (gradient-clipped text, an SVG fill): the glyph's own pixels, from the strongest-differing 40 %
    diffs.sort((a, b) => b.d - a.d);
    return diffs.slice(0, Math.max(1, Math.ceil(diffs.length * 0.4))).map((x) => x.s);
  }
  // text whose colour is nearly its background barely differs from it: then every pixel in its box is "behind" it
  return ink.length >= 12 ? ink : all;
}

const visibleShare = (b: Rect, h: number) => {
  const ht = b.bottom - b.top;
  if (ht <= 0) return 0;
  return Math.max(0, Math.min(b.bottom, h) - Math.max(b.top, 0)) / ht;
};

async function readPage(page: Page, cfg: Config, shot: string | null): Promise<{ findings: Finding[]; runs: number; steps: number; hscroll: number }> {
  const findings: Finding[] = [];
  const evalJ = <T,>(js: string) => page.evaluate(js) as Promise<T>;
  await evalJ('window.scrollTo(0, 0)');
  await page.waitForTimeout(120);
  const all = await evalJ<Run[]>('window.__readable.collect()');
  // size and clipping: position-independent
  for (const r of all) {
    const miss = sizeMiss(r.px, { words: r.words, phone: cfg.phone, hud: r.hud ? cfg.hud ?? 'phone' : null });
    if (miss && (cfg.pixels || cfg.hud)) findings.push({ rule: miss, text: r.text, px: r.px, path: r.path, key: r.key });
    if (r.clip && (r.key || r.clip.how !== 'line-clamp')) findings.push({ rule: 'clipped', text: r.text, detail: `${r.clip.how} ${r.clip.px}px by ${r.clip.by}`, key: r.key, path: r.path });
  }
  const hscroll = await evalJ<number>('window.__readable.hScroll()');
  if (hscroll > 2) findings.push({ rule: 'hscroll', text: '(page)', detail: `${hscroll}px sideways: ${(await evalJ<string[]>('window.__readable.hScrollCulprits()')).join('; ')}` });
  const coverTop = await evalJ<Cover[]>("window.__readable.covered('top')");
  const seenCollide = new Set<string>();
  const addCollisions = (cs: Collision[]) => { for (const c of cs) { const k = `${c.a}|${c.b}`; if (!seenCollide.has(k)) { seenCollide.add(k); findings.push({ rule: 'overlap-text', text: c.a, detail: `under/over "${c.b}"` }); } } };
  addCollisions(await evalJ<Collision[]>('window.__readable.collisions()'));

  // contrast, viewport by viewport, from the two shots
  const boxes: { r: Rect; bad: boolean }[] = [];
  const done = new Set<number>();
  const H = cfg.h;
  const maxY = await evalJ<number>('Math.max(0, document.documentElement.scrollHeight - innerHeight)');
  const ys: number[] = [];
  for (let y = 0; ys.length < 8; y += Math.round(H * 0.8)) { ys.push(Math.min(y, maxY)); if (y >= maxY) break; }
  let steps = 0;
  for (const y of cfg.pixels || cfg.hud ? ys : []) {
    await evalJ(`window.scrollTo(0, ${y})`);
    await page.waitForTimeout(140);
    steps++;
    const runs = await evalJ<Run[]>('window.__readable.collect()');
    if (y !== 0) addCollisions(await evalJ<Collision[]>('window.__readable.collisions()'));
    const todo = runs.filter((r) => !done.has(r.id) && !r.occluded && (!r.fixed || y === 0) && visibleShare(r.box, H) > 0.95);
    if (!todo.length) continue;
    const A = await raw(await page.screenshot({ type: 'png' }));
    if (y === 0 && shot) await page.screenshot({ type: 'jpeg', quality: 70, path: shot });
    await evalJ('window.__readable.hideText(true)');
    await page.waitForTimeout(60);
    const B = await raw(await page.screenshot({ type: 'png' }));
    await evalJ('window.__readable.hideText(false)');
    for (const r of todo) {
      done.add(r.id);
      const s = samplesOf(A, B, r.rects, cfg.dpr, !r.fg);
      const ratio = pixelContrast(r.fg, s);
      const miss = contrastMiss(ratio, r.px, r.weight);
      const media = r.overMedia || r.hud;
      if (miss && !r.disabled) findings.push({ rule: media ? 'contrast-media' : miss, text: r.text, px: r.px, ratio: Math.round(ratio * 100) / 100, need: r.px >= 24 || (r.px >= 18.66 && r.weight >= 700) ? 3 : 4.5, key: r.key, media, path: r.path });
      else if (miss && r.disabled) findings.push({ rule: 'contrast-disabled', text: r.text, px: r.px, ratio: Math.round(ratio * 100) / 100, path: r.path });
      if (y === 0) boxes.push({ r: r.box, bad: !!miss || !!sizeMiss(r.px, { words: r.words, phone: cfg.phone, hud: r.hud ? cfg.hud ?? 'phone' : null }) || !!r.clip });
    }
  }
  if (maxY > 0) { await evalJ(`window.scrollTo(0, ${maxY})`); await page.waitForTimeout(140); }
  const coverBottom = await evalJ<Cover[]>("window.__readable.covered('bottom')");
  for (const c of [...coverTop, ...coverBottom]) findings.push({ rule: 'overlap-fixed', text: c.text, detail: `under ${c.by} (${c.side})` });
  if (!cfg.pixels && !cfg.hud && shot) { await evalJ('window.scrollTo(0, 0)'); await page.screenshot({ type: 'jpeg', quality: 70, path: shot }); }
  // box the failing runs on the first-screen shot
  if (shot && existsSync(shot) && boxes.some((b) => b.bad)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cfg.w * cfg.dpr}" height="${cfg.h * cfg.dpr}">${boxes.filter((b) => b.bad).map((b) => `<rect x="${b.r.left * cfg.dpr - 2}" y="${b.r.top * cfg.dpr - 2}" width="${(b.r.right - b.r.left) * cfg.dpr + 4}" height="${(b.r.bottom - b.r.top) * cfg.dpr + 4}" fill="none" stroke="#ff2a2a" stroke-width="2"/>`).join('')}</svg>`;
    const buf = await sharp(shot).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 70 }).toBuffer();
    writeFileSync(shot, buf);
  }
  return { findings, runs: all.length, steps, hscroll };
}

const slug = (p: string) => (p === '/' ? 'root' : p.slice(1).replace(/[\/\[\]\.]+/g, '_'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
mkdirSync(join(OUT, 'routes'), { recursive: true });
mkdirSync(join(OUT, 'shots'), { recursive: true });

async function open(url: string, cfg: Config): Promise<{ page: Page; errors: string[]; ok: boolean }> {
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.goto(url);
  const ok = await page.waitForFunction('document.body.dataset.readableReady || document.body.dataset.readableError', null, { timeout: 30000 }).then(() => true, () => false);
  const err = await page.evaluate('document.body.dataset.readableError || null').catch(() => null);
  if (err) errors.unshift(String(err).slice(0, 400));
  return { page, errors, ok: ok && !err };
}

// ── The control scene ────────────────────────────────────────────────────────────────────────────────────────────────
if (args.includes('--plant')) {
  const results: Record<string, Finding[]> = {};
  for (const cfg of CONFIGS.slice(0, 2)) {
    const { page, errors } = await open(`${ORIGIN}/index.html#__plant`, cfg);
    const r = await readPage(page, cfg, join(OUT, 'shots', `__plant-${cfg.name}.jpg`));
    results[cfg.name] = r.findings;
    if (errors.length) console.log('errors', errors);
    await page.context().close();
  }
  writeFileSync(join(OUT, 'plant.json'), JSON.stringify(results, null, 1));
  const want = ['tiny|Eleven pixel grey on white', 'contrast|Eleven pixel grey on white', 'clipped|Score 12,345 points', 'contrast-media|Bare white caption on the snow', 'overlap-text|*', 'overlap-fixed|The last line sits under the bar'];
  let pass = true;
  for (const [name, fs] of Object.entries(results)) {
    const got = fs.map((f) => `${f.rule}|${f.text}`);
    const missing = want.filter((w) => !got.some((g) => (w.endsWith('*') ? g.startsWith(w.slice(0, -1)) : g === w)));
    const extra = fs.filter((f) => !want.some((w) => (w.endsWith('*') ? `${f.rule}|`.startsWith(w.slice(0, -1)) : `${f.rule}|${f.text}` === w)));
    console.log(`${name}: ${fs.length} findings; missing ${JSON.stringify(missing)}; unexpected ${JSON.stringify(extra.map((f) => `${f.rule}|${f.text}|${f.detail ?? f.ratio ?? ''}`))}`);
    if (missing.length || extra.length) pass = false;
  }
  console.log(pass ? 'PLANT: the rig flags exactly the planted faults' : 'PLANT: MISMATCH');
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
}

// ── The HUD over real frames ─────────────────────────────────────────────────────────────────────────────────────────
export const HUD_FRAMES = ['white', 'grey', 'snowboard', 'venice-sky-day', 'dunk', 'baseball', 'surf', 'soccer', 'golf', 'tennis'];
if (args.includes('--hud')) {
  const out: Record<string, unknown> = {};
  const kinds = [['__hud', ''], ['__juice', ''], ['__juice', '&legacy=1']].filter(([k]) => !args.includes('--hud-only-tvhud') || k === '__hud');
  for (const frame of HUD_FRAMES) for (const [kind, extra] of kinds) {
    for (const cfg of [{ ...CONFIGS[0], name: 'hud-phone', hud: 'phone' as const }, { name: 'hud-tv', w: 1920, h: 1080, dpr: 1, query: 'tv=1', pixels: false, phone: false, hud: 'tv' as const }]) {
      const { page, errors } = await open(`${ORIGIN}/index.html#${kind}?frame=${frame}${extra}${cfg.query ? `&${cfg.query}` : ''}`, cfg);
      if (errors.length && kind !== '__hud') { await page.context().close(); continue; }
      await page.waitForTimeout(400);
      const tag = `${kind.slice(2)}${extra ? '-legacy' : ''}`;
      const r = await readPage(page, cfg, join(OUT, 'shots', `${tag}-${frame}-${cfg.name}.jpg`));
      out[`${tag}/${frame}/${cfg.name}`] = { ...r, errors };
      await page.context().close();
    }
  }
  writeFileSync(join(OUT, 'hud.json'), JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), ((v as { findings: Finding[] }).findings).map((f) => `${f.rule}:${f.text.slice(0, 24)}${f.ratio ? `@${f.ratio}` : ''}${f.px ? `/${f.px}px` : ''}`).join(' · ') || 'clean');
  await browser.close(); server.close();
  process.exit(0);
}

// ── Every route ──────────────────────────────────────────────────────────────────────────────────────────────────────
const allRoutes = JSON.parse(readFileSync(join(BUILD, 'routes.json'), 'utf8')) as string[];
const only = flag('routes')?.split(',').filter(Boolean);
const configs = (flag('configs')?.split(',') ?? CONFIGS.map((c) => c.name)).map((n) => CONFIGS.find((c) => c.name === n)!).filter(Boolean);
let did = 0;
for (const route of only ?? allRoutes) {
  const file = join(OUT, 'routes', `${slug(route)}.json`);
  // --redo-before=<epoch ms>: re-read a route last read before then (the rig's page script changed since)
  if (existsSync(file) && !args.includes('--redo') && Date.parse(JSON.parse(readFileSync(file, 'utf8')).when) >= Number(flag('redo-before') ?? 0)) continue;
  if ((Date.now() - T0) / 1000 > BUDGET_S) { console.log(`budget reached after ${did} routes; run again to continue`); break; }
  // --configs=<subset> re-reads only those set-ups and keeps the rest of the route's file
  const res: Record<string, unknown> = { ...(flag('configs') && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}), route, when: new Date().toISOString() };
  for (const cfg of configs) {
    const t = Date.now();
    let { page, errors, ok } = await open(`${ORIGIN}/index.html#${route}${cfg.query ? `?${cfg.query}` : ''}`, cfg);
    // a guest-only page (login, sign-up) redirects a signed-in visitor away: read it as a guest
    if (!ok && /redirect/.test(errors[0] ?? '')) {
      await page.context().close();
      ({ page, errors, ok } = await open(`${ORIGIN}/index.html#${route}?guest=1${cfg.query ? `&${cfg.query}` : ''}`, cfg));
      res.guest = true;
    }
    let r: Awaited<ReturnType<typeof readPage>> | null = null;
    if (ok) {
      try { r = await readPage(page, cfg, join(OUT, 'shots', `${slug(route)}-${cfg.name}.jpg`)); } catch (e) { errors.push(`read: ${String(e).slice(0, 200)}`); }
    }
    res[cfg.name] = { ok: !!r, errors: errors.slice(0, 4), ms: Date.now() - t, ...(r ?? {}) };
    await page.context().close();
    if (!ok) break;   // a page that does not render on the rig does not render at any width
  }
  writeFileSync(file, JSON.stringify(res, null, 1));
  did++;
  const p = res.phone as { ok: boolean; findings?: Finding[] } | undefined;
  console.log(`${route.padEnd(40)} ${p?.ok ? `${p.findings!.length} findings (phone)` : 'did not render'}`);
}
await browser.close();
server.close();
