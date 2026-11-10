// READABLE (lane/readable-2, 2026-11-10; docs/READABLE.md section 1, Themes): does "reduce transparency" make the glass
// and the bars solid? Measured, not read from the stylesheet: the audit's frozen bundle (scripts/readable/audit.mts
// <outDir> <label> --build-only) is opened on a 390 px phone twice — as is, and with the browser reporting
// prefers-reduced-transparency: reduce (CDP Emulation.setEmulatedMedia) — and the COMPUTED background and backdrop-filter
// of the tab bar, the status rail, a toast's glass (.fel-glass) and a HUD panel (.fel-panel) are read back.
//
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/probes/readable/reduced-transparency.mts <outDir> <label> [route=/play]
//
// Writes <outDir>/<label>/reduced-transparency.json and two JPGs (rt-off.jpg, rt-on.jpg: the page scrolled so copy sits
// under both bars). Exits 1 unless, with the setting on, each surface has an opaque background and no backdrop-filter —
// and, as the control, the same surfaces are translucent or blurred with it off (a probe that cannot see the glass
// cannot say it went away).
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../../..');
const [outDir, label, route = '/play'] = process.argv.slice(2);
const OUT = join(resolve(outDir), label);
const BUILD = join(resolve(outDir), `.build-${label}`);
if (!existsSync(join(BUILD, 'index.html'))) { console.error(`no bundle at ${BUILD}: run audit.mts <outDir> <label> --build-only`); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = p.startsWith('/__fonts/') ? join(ROOT, 'app/fonts', p.slice(9)) : existsSync(join(BUILD, p)) && p !== '/' ? join(BUILD, p) : join(ROOT, 'public', p);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

interface Surface { name: string; found: boolean; background: string; alpha: number; backdrop: string }
const READ = `(() => {
  const mk = (cls) => { const d = document.createElement('div'); d.className = cls; d.dataset.rtProbe = '1'; d.textContent = 'probe'; d.style.cssText = 'position:fixed;left:8px;top:120px;padding:8px;z-index:99'; document.body.appendChild(d); return d; };
  document.querySelectorAll('[data-rt-probe]').forEach((n) => n.remove());
  const glass = mk('fel-glass'), panel = mk('fel-panel');
  panel.style.top = '170px';
  const bars = [...document.querySelectorAll('.fel-bar')];
  const one = (name, el) => {
    if (!el) return { name, found: false, background: '', alpha: NaN, backdrop: '' };
    const cs = getComputedStyle(el);
    const m = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor);
    const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean) : [];
    const alpha = parts.length >= 4 ? Number(parts[3]) : m ? 1 : (/color\\(/.test(cs.backgroundColor) ? (/\\/\\s*([\\d.]+)/.exec(cs.backgroundColor) ? Number(/\\/\\s*([\\d.]+)/.exec(cs.backgroundColor)[1]) : 1) : NaN);
    return { name, found: true, background: cs.backgroundColor, alpha, backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none' };
  };
  return [
    one('tab bar', bars.find((b) => getComputedStyle(b).position === 'fixed')),
    one('status rail', bars.find((b) => getComputedStyle(b).position === 'sticky')),
    one('toast glass (.fel-glass)', glass),
    one('HUD panel (.fel-panel)', panel),
  ];
})()`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
const out: Record<string, Surface[]> = {};
for (const mode of ['off', 'on'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (mode === 'on') await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await page.goto(`${ORIGIN}/index.html#${route}`);
  await page.waitForFunction('document.body.dataset.readableReady || document.body.dataset.readableError', null, { timeout: 30000 });
  const matches = await page.evaluate("matchMedia('(prefers-reduced-transparency: reduce)').matches");
  if (matches !== (mode === 'on')) { console.error(`the browser did not take the emulation (${mode}: matches=${matches})`); process.exit(2); }
  await page.evaluate('window.scrollTo(0, 260)');
  await page.waitForTimeout(300);
  out[mode] = (await page.evaluate(READ)) as Surface[];
  await page.screenshot({ type: 'jpeg', quality: 80, path: join(OUT, `rt-${mode}.jpg`) });
  await ctx.close();
}
await browser.close();
server.close();

let pass = true;
for (const [i, on] of out.on.entries()) {
  const off = out.off[i];
  const control = off.found && (off.alpha < 1 || off.backdrop !== 'none');
  const solid = on.found && on.alpha === 1 && on.backdrop === 'none';
  if (!control || !solid) pass = false;
  console.log(`${on.name.padEnd(26)} off: ${off.background} · ${off.backdrop}   →   on: ${on.background} · ${on.backdrop}   ${control ? '' : '[CONTROL: not glass with the setting off] '}${solid ? 'solid' : 'NOT SOLID'}`);
}
writeFileSync(join(OUT, 'reduced-transparency.json'), JSON.stringify({ route, ...out, pass }, null, 1));
console.log(pass ? 'REDUCED TRANSPARENCY: every surface is solid with the setting on (and glass with it off)' : 'REDUCED TRANSPARENCY: MISMATCH');
process.exit(pass ? 0 : 1);
