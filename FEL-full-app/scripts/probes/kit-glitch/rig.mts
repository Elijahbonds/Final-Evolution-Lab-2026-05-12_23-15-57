// KIT-GLITCH rig (owner 2026-11-12: "the clothes look glitched out sometimes" — in the Closet, in games, on rivals; skin through
// cloth, flicker or stripes, cloth torn at the joints in moves, wrong / missing / floating pieces). No Next server: the
// browser half (rig-entry.ts: the real spawn, kit, mask and identity code) is bundled with esbuild and served with public/
// into headless Chromium on SwiftShader GL, and the capture matrix is driven from here.
//
//   OUT=<dir> npx tsx scripts/probes/kit-glitch/rig.mts matrix           the whole matrix → <OUT>/matrix.json (+ worst shots)
//   OUT=<dir> SUBJECTS=closet-male,rival-ace TIERS=desktop POSES=run,squat npx tsx scripts/probes/kit-glitch/rig.mts matrix
//   OUT=<dir> npx tsx scripts/probes/kit-glitch/rig.mts sheet <before.json> <after.json>   before/after contact sheet (JPG)
//
// Each cell (subject × tier × pose × camera) records: poke (key-green skin pixels inside a garment's silhouette, per slot),
// flips (interior class flips under a 0.4 mm camera nudge: depth fights), and per shown mesh the edge stretch past ×2, the
// influencer count, the binding to the body's bones and the distance off the skin. rig-entry.ts says how each is measured.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { SUBJECTS, POSES, CAMS, type Subject } from './matrix.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = process.env.OUT ?? join(ROOT, '.kit-glitch-rig');
const SITE = join(OUT, 'site');
mkdirSync(SITE, { recursive: true });
const job = process.argv[2] ?? 'matrix';
const W = Number(process.env.W ?? 360), H = Number(process.env.H ?? 480);

async function bundle(): Promise<void> {
  await build({
    entryPoints: [join(ROOT, 'scripts/probes/kit-glitch/rig-entry.ts')], bundle: true, outdir: SITE, entryNames: 'rig', format: 'esm', splitting: true, platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
    banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty', '.wasm': 'empty' },
  });
  writeFileSync(join(SITE, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000"><script type="module" src="/rig.js"></script></body></html>');
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.env': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm' };
function serve(): Promise<{ url: string; close(): void }> {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    // the closet / hero-body reads answer "guest": the rig applies its own identity
    if (p.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('null'); return; }
    const f = [join(SITE, p === '/' ? 'index.html' : p), join(ROOT, 'public', p)].find((x) => existsSync(x) && statSync(x).isFile());
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => { const a = server.address() as { port: number }; ok({ url: `http://127.0.0.1:${a.port}`, close: () => server.close() }); }));
}
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

type KG = { [k: string]: (...a: unknown[]) => unknown };
const kg = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => ((window as unknown as { __KG: KG }).__KG[f as string] as (...x: unknown[]) => unknown)(...(a as unknown[])), [fn, args] as const);

export interface Cell { subject: string; tier: string; pose: string; clip: string | null; cam: string; screen: Record<string, unknown>; cpu?: unknown; shot?: string; pokeShot?: string }

async function runSubject(page: Page, base: string, s: Subject, tier: string, poses: typeof POSES, cams: typeof CAMS, out: Cell[], shots: boolean): Promise<void> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __KG?: { ready: boolean } }).__KG?.ready, undefined, { timeout: 60_000 });
  await kg(page, 'init', { tier, modeId: s.modeId, closet: s.closet, w: W, h: H });
  const t0 = Date.now();
  await kg(page, 'spawn', s.spawn);
  // the mask and the shoe's late fold land after the first rendered frames
  await page.waitForTimeout(1200);
  const clips = (await kg(page, 'clipNames')) as string[];
  for (const p of poses) {
    const clip = p.clips.map((c) => clips.find((n) => n === c)).find(Boolean) ?? p.clips.map((c) => clips.find((n) => n.includes(c))).find(Boolean) ?? null;
    if (!clip) { out.push({ subject: s.id, tier, pose: p.id, clip: null, cam: '-', screen: { missingClip: p.clips.join('|') } }); continue; }
    await kg(page, 'unfreeze');
    const used = (await kg(page, 'pose', clip, p.frac)) as string | null;
    const cy = (await kg(page, 'bodyCenterY')) as number;
    let cpu: unknown = null;
    for (const c of cams) {
      await kg(page, 'setCam', c.dist, c.yaw, c.pitch, cy + c.dy);
      const screen = (await kg(page, 'measureScreen')) as Record<string, unknown>;
      const cell: Cell = { subject: s.id, tier, pose: p.id, clip: used, cam: c.id, screen };
      if (!cpu) { cpu = await kg(page, 'measureCpu'); cell.cpu = cpu; }
      if (shots) { cell.shot = (await kg(page, 'shot')) as string; cell.pokeShot = (await kg(page, 'pokeImage')) as string; }
      out.push(cell);
    }
  }
  const errs = (await kg(page, 'errors')) as string[];
  if (errs.length) out.push({ subject: s.id, tier, pose: '-', clip: null, cam: '-', screen: { errors: errs.slice(0, 12) } });
  console.log(`  ${s.id} ${tier}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

async function matrix(): Promise<void> {
  await bundle();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: GL_ARGS });
  const want = (process.env.SUBJECTS ?? '').split(',').filter(Boolean);
  const tiers = (process.env.TIERS ?? 'desktop,mobile').split(',');
  const poseIds = (process.env.POSES ?? '').split(',').filter(Boolean);
  const camIds = (process.env.CAMS ?? '').split(',').filter(Boolean);
  const shots = process.env.SHOTS === '1';
  const subjects = SUBJECTS.filter((s) => !want.length || want.some((w) => s.id === w || (w.endsWith('*') && s.id.startsWith(w.slice(0, -1)))));
  const poses = POSES.filter((p) => !poseIds.length || poseIds.includes(p.id));
  const cams = CAMS.filter((c) => !camIds.length || camIds.includes(c.id));
  const cells: Cell[] = [];
  const name = process.env.NAME ?? 'matrix';
  try {
    for (const tier of tiers) for (const s of subjects) {
      if (s.tiers && !s.tiers.includes(tier)) continue;
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('pageerror', (e) => cells.push({ subject: s.id, tier, pose: '-', clip: null, cam: '-', screen: { pageerror: String(e).slice(0, 300) } }));
      try { await runSubject(page, srv.url, s, tier, s.rivalPoses && !poseIds.length ? poses.filter((p) => s.rivalPoses!.includes(p.id)) : poses, s.cams && !camIds.length ? cams.filter((c) => s.cams!.includes(c.id)) : cams, cells, shots); }
      catch (e) { cells.push({ subject: s.id, tier, pose: '-', clip: null, cam: '-', screen: { failed: String((e as Error).message ?? e).slice(0, 300) } }); console.log(`  ${s.id} ${tier}: FAILED ${String(e).slice(0, 200)}`); }
      await page.close();
      writeFileSync(join(OUT, `${name}.json`), JSON.stringify(cells));
    }
  } finally { await browser.close(); srv.close(); }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(cells));
  console.log(summary(cells));
}

/** Totals per symptom, per subject group and tier. */
export function summary(cells: Cell[]): string {
  const g = new Map<string, { n: number; poke: number; pokeCells: number; flips: number; flipCells: number; garmentPx: number }>();
  for (const c of cells) {
    const sc = c.screen as { poke?: number; flipsGarment?: number; garmentPx?: number };
    if (sc.poke == null) continue;
    const k = `${c.subject.split('-')[0]} ${c.tier}`;
    const r = g.get(k) ?? { n: 0, poke: 0, pokeCells: 0, flips: 0, flipCells: 0, garmentPx: 0 }; g.set(k, r);
    r.n++; r.poke += sc.poke; r.garmentPx += sc.garmentPx ?? 0; if (sc.poke >= 20) r.pokeCells++; r.flips += sc.flipsGarment ?? 0; if ((sc.flipsGarment ?? 0) >= 10) r.flipCells++;
  }
  const lines = ['group            cells  poke-px  poke%   cells≥20  flips  cells≥10'];
  for (const [k, r] of g) lines.push(`${k.padEnd(16)} ${String(r.n).padStart(5)} ${String(r.poke).padStart(8)} ${(100 * r.poke / Math.max(1, r.garmentPx)).toFixed(3).padStart(6)} ${String(r.pokeCells).padStart(9)} ${String(r.flips).padStart(6)} ${String(r.flipCells).padStart(9)}`);
  return lines.join('\n');
}

/** diag <subject> <tier> <pose> [fn…]: one subject in one pose, the named __KG functions' answers printed (default: gaps). */
async function diag(): Promise<void> {
  const [id, tier = 'desktop', poseId = 'idle', ...fns] = process.argv.slice(3);
  await bundle();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: GL_ARGS });
  try {
    const s = SUBJECTS.find((x) => x.id === id)!;
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => { if (process.env.VERBOSE) console.log('  [page]', m.text().slice(0, 200)); });
    await page.goto(`${srv.url}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as unknown as { __KG?: { ready: boolean } }).__KG?.ready, undefined, { timeout: 60_000 });
    await kg(page, 'init', { tier, modeId: s.modeId, closet: s.closet, w: W, h: H });
    await kg(page, 'spawn', s.spawn);
    await page.waitForTimeout(1200);
    const p = POSES.find((x) => x.id === poseId)!;
    const clips = (await kg(page, 'clipNames')) as string[];
    const clip = p.clips.find((c) => clips.includes(c)) ?? p.clips.map((c) => clips.find((n) => n.includes(c))).find(Boolean);
    console.log('clip', await kg(page, 'pose', clip, p.frac));
    // each arg: a __KG function name, `js:<code>` (run in the page with scene / bodies), `cam:d,yaw,pitch,dy`, or `shot:<name>`
    const cy = (await kg(page, 'bodyCenterY')) as number;
    for (const f of fns.length ? fns : ['gaps']) {
      if (f.startsWith('js:')) console.log(f.slice(0, 60), JSON.stringify(await kg(page, 'run', f.slice(3))));
      else if (f.startsWith('cam:')) { const [d, y, pi, dy] = f.slice(4).split(',').map(Number); await kg(page, 'setCam', d, y, pi, cy + (dy || 0)); }
      else if (f.startsWith('shot:')) { const u = (await kg(page, 'shot')) as string; writeFileSync(join(OUT, `${f.slice(5)}.jpg`), Buffer.from(u.split(',')[1], 'base64')); console.log('wrote', join(OUT, `${f.slice(5)}.jpg`)); }
      else if (f.startsWith('poke:')) { await kg(page, 'measureScreen'); const u = (await kg(page, 'pokeImage')) as string; writeFileSync(join(OUT, `${f.slice(5)}.jpg`), Buffer.from(u.split(',')[1], 'base64')); }
      else console.log(f, JSON.stringify(await kg(page, f), null, process.env.COMPACT ? 0 : 1));
    }
  } finally { await browser.close(); srv.close(); }
}

if (job === 'matrix') await matrix();
else if (job === 'diag') await diag();
else if (job === 'summary') console.log(summary(JSON.parse(readFileSync(process.argv[3], 'utf8'))));
