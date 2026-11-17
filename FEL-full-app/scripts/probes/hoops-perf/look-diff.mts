// hoops-perf (2026-11-12): GATE 0 for the body merge — the Creator look, the shape morphs on the body and every garment, the
// code-built clothes, the kit garments and packs, rivals — each spawned through the REAL path (the kit-glitch rig's browser half),
// animated until the body merges, then the SAME frame drawn merged and with its parts (scripts/probes/hoops-perf/look-entry.ts).
//   OUT=<dir> [SUBJECTS=a,b] [TIERS=mobile,desktop] npx tsx scripts/probes/hoops-perf/look-diff.mts
// Writes <OUT>/look-diff.json and <OUT>/look-<subject>-<tier>-{merged,parts}.jpg. Run it under the gate (gate-run.sh).
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { SUBJECTS } from '../kit-glitch/matrix.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = resolve(process.env.OUT ?? 'look-diff');
const SITE = join(OUT, 'site');
mkdirSync(SITE, { recursive: true });
const W = Number(process.env.W ?? 360), H = Number(process.env.H ?? 480);
const DEFAULT = 'closet-male-default,closet-male-girth-max,closet-female-tank,closet-male-frame-big,game-male-hoodie,game-female-tee,rival-ace,rival-grit,pack-football-player';
const want = (process.env.SUBJECTS ?? DEFAULT).split(',').filter(Boolean);
const tiers = (process.env.TIERS ?? 'mobile,desktop').split(',');

await build({
  entryPoints: [join(ROOT, 'scripts/probes/hoops-perf/look-entry.ts')], bundle: true, outdir: SITE, entryNames: 'rig', format: 'esm', splitting: true, platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty', '.wasm': 'empty' },
});
writeFileSync(join(SITE, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000"><script type="module" src="/rig.js"></script></body></html>');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.env': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('null'); return; }
  const f = [join(SITE, p === '/' ? 'index.html' : p), join(ROOT, 'public', p)].find((x) => existsSync(x) && statSync(x).isFile());
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
});
const base: string = await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
const rows: Record<string, unknown>[] = [];
try {
  for (const tier of tiers) for (const id of want) {
    const s = SUBJECTS.find((x) => x.id === id);
    if (!s) { console.log(`  ${id}: no such subject`); continue; }
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const t0 = Date.now();
    try {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!(window as unknown as { __KG?: { ready: boolean }; __BM?: unknown }).__KG?.ready && !!(window as unknown as { __BM?: unknown }).__BM, undefined, { timeout: 60_000 });
      const call = (fn: string, ...a: unknown[]) => page.evaluate(([f, x]) => ((window as unknown as { __KG: Record<string, (...y: unknown[]) => unknown> }).__KG[f as string])(...(x as unknown[])), [fn, a] as const);
      await call('init', { tier, modeId: s.modeId, closet: s.closet, w: W, h: H });
      await call('spawn', s.spawn);
      await page.waitForTimeout(1500);
      const r = await Promise.race([page.evaluate(() => (window as unknown as { __BM: { mergeDiff(): Promise<Record<string, unknown>> } }).__BM.mergeDiff()), new Promise<never>((_, no) => setTimeout(() => no(new Error('timed out')), 300_000))]);
      for (const k of ['shotMerged', 'shotParts', 'shotDelta'] as const) { if (r[k]) writeFileSync(join(OUT, `look-${id}-${tier}-${k.slice(4).toLowerCase()}.jpg`), Buffer.from(String(r[k]).split(',')[1], 'base64')); delete r[k]; }
      rows.push({ subject: id, tier, ...r, errors: errs });
      const d = (x: unknown) => { const o = x as { px: number; maxStep: number } | undefined; return o ? `${o.px} px (max ${o.maxStep})` : '-'; };
      console.log(`  ${id} ${tier}: ${JSON.stringify(r.statsA)} ${JSON.stringify(r.merged)} · merged vs parts ${d(r.mergeVsParts)} · noise ${d(r.noiseMerged)} / ${d(r.noiseParts)} · control ${d(r.control)} · delta box ${JSON.stringify(r.deltaBox)} (${Math.round((Date.now() - t0) / 1000)} s)${r.error ? ' ERROR ' + r.error : ''}\n    ${JSON.stringify(r.detail).slice(0, 1500)}`);
    } catch (e) {
      rows.push({ subject: id, tier, failed: String((e as Error).message).slice(0, 200), errors: errs });
      console.log(`  ${id} ${tier}: FAILED ${String((e as Error).message).slice(0, 200)}`);
    } finally { await page.close().catch(() => undefined); }
    writeFileSync(join(OUT, 'look-diff.json'), JSON.stringify(rows, null, 1));
  }
} finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]); server.close(); rmSync(SITE, { recursive: true, force: true }); }
process.exit(0);   // a hung browser close must never keep the shared gate
