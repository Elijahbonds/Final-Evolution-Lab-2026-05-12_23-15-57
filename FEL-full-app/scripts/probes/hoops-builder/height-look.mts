// hoops-builder phase B: BEFORE / AFTER of the playing height on screen — a 6'0" Guard and a 6'8" Big as the 1v1 draws its hero.
// Before = today (and every rating-free run): both on the standard frame. After = a casual run: 96 % and 104 %.
// The browser half is height-entry.ts (the real spawn, identity and applyProportions), bundled with esbuild and served with public/
// into headless Chromium on SwiftShader GL (the kit-glitch rig's way). Prints each body's top (m) and writes two JPGs.
//   /home/user/wt/gate-run.sh 600 npx tsx scripts/probes/hoops-builder/height-look.mts <outDir>
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = resolve(process.argv[2] ?? 'height-look');
const SITE = join(OUT, 'site');
mkdirSync(SITE, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'scripts/probes/hoops-builder/height-entry.ts')], bundle: true, outdir: SITE, entryNames: 'rig', format: 'esm', splitting: true, platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "production" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.glb': 'empty', '.wasm': 'empty' },
});
const W = 720, H = 760;
const label = (t: string, x: string) => `<div style="position:absolute;top:14px;${x};color:#fff;font:700 22px system-ui;text-shadow:0 1px 3px #000">${t}</div>`;
const page = (title: string, l: string, r: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000">
<div style="position:relative;width:${W}px;height:${H}px"><div id="stage"></div>${label(title, 'left:0;right:0;text-align:center')}
${label(l, 'left:24px;top:52px')}${label(r, 'right:24px;top:52px;text-align:right')}
<div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#ddd;font:500 16px system-ui">white line: the top of the standard 6'4" body</div></div>
<script type="module" src="/rig.js"></script></body></html>`;
writeFileSync(join(SITE, 'before.html'), page('BEFORE (today; every rating-free run)', "Guard 6'0\"<br>drawn 100%", "Big 6'8\"<br>drawn 100%"));
writeFileSync(join(SITE, 'after.html'), page('AFTER (a casual run)', "Guard 6'0\"<br>drawn 96%", "Big 6'8\"<br>drawn 104%"));
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.env': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('null'); return; }
  const f = [join(SITE, p), join(ROOT, 'public', p)].find((x) => existsSync(x) && statSync(x).isFile());
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
});
const base: string = await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const report: Record<string, unknown> = {};
try {
  for (const [name, rated] of [['before', false], ['after', true]] as const) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = []; p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    await p.goto(`${base}/${name}.html`);
    await p.waitForFunction(() => !!(window as unknown as { __HL?: { ready: boolean } }).__HL?.ready, undefined, { timeout: 60_000 });
    const hl = (fn: string, ...a: unknown[]) => p.evaluate(([f, x]) => ((window as unknown as { __HL: Record<string, (...y: unknown[]) => unknown> }).__HL[f as string])(...(x as unknown[])), [fn, a] as const);
    await hl('init', W, H);
    const guard = await hl('spawn', -0.6, '#2563EB', 72, rated);
    const big = await hl('spawn', 0.6, '#B91C1C', 80, rated);
    await p.waitForTimeout(2500);
    report[name] = { scale: { guard, big }, topM: await hl('heights'), errors };
    await p.screenshot({ path: join(OUT, `height-${name}.jpg`), type: 'jpeg', quality: 82 });
    await p.close();
  }
} finally { await b.close(); server.close(); rmSync(SITE, { recursive: true, force: true }); }
writeFileSync(join(OUT, 'height-look.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
