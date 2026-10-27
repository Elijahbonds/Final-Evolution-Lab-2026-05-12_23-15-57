// PREMIUM-UI: the screens' shots and the "cheap" numbers (lane/premium-ui, 2026-10-27; docs/PREMIUM-UI.md).
//
// The owner said the app "still feels cheap" and named four causes: too much text, flat and empty, inconsistent, no
// motion. Each is measured here, per screen and width, on the real page modules (scripts/premium-ui/entry.tsx) bundled
// by the accessibility rig (scripts/a11y/rig.mts) and served over http from a random local port so public/ images load:
//
//   words      words of visible text above the fold (and on the whole page)
//   sizes      distinct font sizes above the fold (and on the whole page); the font families actually rendered
//   buttons    distinct button looks (shape, size, weight, case, fill kind — not hue) on the whole page
//   cards      distinct card looks (radius, border, fill, shadow, padding) on the whole page
//   empty      % of the first screen that is flat near-black with nothing on it (measured from the screenshot's pixels)
//   imagery    images, canvases and photo backgrounds on the first screen, and their share of it
//   motion     elements animating at load, and interactive elements with a transition or press response
//   cls / fcp  layout shift over the load, and first contentful paint on the phone with the CPU throttled 4x
//
//   npx tsx scripts/premium-ui/shots.mts <outDir> <label> --build-only        bundle now (no browser, no lock needed)
//   ... --no-font-vars   bundle without next/font's variables, as a probe rig has none (counts serif text: P2)
//   flock /home/user/wt/gate-queue.lock npx tsx scripts/premium-ui/shots.mts <outDir> <label> [<label> …] [--scenes=play,train] [--scenes-<label>=…]
// The bundle lives in <outDir>/.build-<label>, so a "before" frozen with --build-only is shot later unchanged, however
// long the gate queue is and whatever the tree looks like by then; an existing bundle is reused (--rebuild to redo it).
//
// Writes <outDir>/<label>/<scene>-<phone|desktop>.png (the first screen), -full.png, and metrics.json.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { chromiumExe } from '../probes/_chromium.mts';
import { buildRig } from '../a11y/rig.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const pos = args.filter((a) => !a.startsWith('--'));
const OUT_ROOT = resolve(pos[0] ?? join(ROOT, '.premium-ui'));
// One or more labels: several frozen bundles are shot in ONE run — one lock hold, one browser (coordinator, 2026-10-27)
const LABELS = pos.length > 1 ? pos.slice(1) : ['now'];
let LABEL = LABELS[0];
let OUT = join(OUT_ROOT, LABEL);
let BUILD = join(OUT_ROOT, `.build-${LABEL}`);
const BUILD_ONLY = args.includes('--build-only');
const REBUILD = args.includes('--rebuild') || BUILD_ONLY;

export const SCENES = ['landing', 'play', 'train', 'profile', 'learn', 'coach', 'todaydrill', 'screenresults', 'devui', 'endscreen', 'endloss', 'playbook', 'education'] as const;
/** --scenes-<label>=a,b for one label, --scenes=a,b for all, else every scene */
const scenesFor = (label: string) => ((flag(`scenes-${label}`) ?? flag('scenes'))?.split(',') ?? [...SCENES]).filter(Boolean);
const WIDTHS = [{ w: 390, h: 844, name: 'phone' }, { w: 1280, h: 800, name: 'desktop' }];

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.glb': 'model/gltf-binary',
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
// fonts are served from a fixed path on whichever port the shoot gets, so a bundle built earlier still finds them
const FONT_BASE = '/__fonts';
for (const label of LABELS) {
  const dir = join(OUT_ROOT, `.build-${label}`);
  if (REBUILD || !existsSync(join(dir, 'index.html'))) {
    await buildRig(dir, { entry: join(ROOT, 'scripts/premium-ui/entry.tsx'), fontBase: FONT_BASE, noFontVars: args.includes('--no-font-vars') });
    writeFileSync(join(dir, 'built.txt'), new Date().toISOString());
    console.log(`built → ${dir}`);
  }
}
if (BUILD_ONLY) process.exit(0);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// The page side: the text, type, button, card, imagery and motion counts. A string, so tsx never transforms it.
const MEASURE = `(() => {
  const vh = innerHeight;
  const shown = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; if (e.getAttribute('aria-hidden') === 'true' && e.tagName !== 'svg') {} }
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const words = { fold: 0, all: 0 }; const sizesFold = new Set(), sizesAll = new Set(), fams = new Set(); let serif = 0;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.textContent.trim(); const el = n.parentElement; if (!t || !el || el.closest('script,style,noscript')) continue;
    if (!shown(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); const c = t.split(/\\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;
    if (/^(serif|"?Times)/i.test(cs.fontFamily.trim())) serif++;
    words.all += c; sizesAll.add(cs.fontSize); fams.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
    if (r.top < vh && r.bottom > 0) { words.fold += c; sizesFold.add(cs.fontSize); }
  }
  const alpha = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return 0; const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };
  const fillKind = (cs) => cs.backgroundImage !== 'none' ? 'grad' : alpha(cs.backgroundColor) >= 0.6 ? 'solid' : alpha(cs.backgroundColor) > 0 ? 'tint' : 'none';
  const btnSig = new Set(), cardSig = new Set(); let btnN = 0, cardN = 0;
  for (const el of document.querySelectorAll('a,button,[role=button],[role=tab]')) {
    if (!shown(el)) continue; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const bw = parseFloat(cs.borderTopWidth); const fill = fillKind(cs);
    if (fill === 'none' && !bw) continue;                         // a text link, not a button
    if (r.width > 360 && r.height > 90) continue;                 // a card that is a link, counted below
    btnN++; btnSig.add([Math.min(parseFloat(cs.borderTopLeftRadius), 999), cs.fontSize, cs.fontWeight, cs.textTransform, fill, bw ? 'b' : '-', Math.round(r.height / 4) * 4].join('|'));
  }
  for (const el of document.querySelectorAll('div,li,a,section,article,aside')) {
    if (!shown(el)) continue; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 56) continue; const rad = parseFloat(cs.borderTopLeftRadius); if (rad < 6) continue;
    const bw = parseFloat(cs.borderTopWidth); const fill = fillKind(cs); const sh = cs.boxShadow !== 'none';
    if (!bw && fill === 'none' && !sh) continue;
    cardN++; cardSig.add([rad, bw ? 'b' : '-', fill, sh ? 's' : '-', cs.paddingTop].join('|'));
  }
  let imgN = 0, imgArea = 0; const vw = innerWidth;
  for (const el of document.querySelectorAll('img,canvas,video,picture,[style*="background-image"],[class*="bg-[url"]')) {
    if (!shown(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 40) continue;
    if (el.tagName === 'IMG' && !(el.complete && el.naturalWidth)) continue;
    const top = Math.max(0, r.top), bot = Math.min(vh, r.bottom), left = Math.max(0, r.left), right = Math.min(vw, r.right);
    if (bot <= top || right <= left) continue; imgN++; imgArea += (bot - top) * (right - left);
  }
  let anim = 0, trans = 0, press = 0;
  for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el);
    if (cs.animationName !== 'none' && cs.animationPlayState === 'running') anim++;
    if (el.matches('a,button,[role=button]')) { if (cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) trans++; } }
  for (const el of document.querySelectorAll('[data-fel-press], .fel-press')) press++;
  const faces = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '') + ' ' + f.weight);
  const shift = (window.__cls || 0); const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
  return { serif, words, sizesFold: [...sizesFold].sort(), sizesAll: [...sizesAll].sort(), families: [...fams], faces,
    buttons: { n: btnN, styles: btnSig.size }, cards: { n: cardN, styles: cardSig.size }, imagery: { n: imgN, pct: Math.round(100 * imgArea / (vw * vh)) },
    motion: { animating: anim, transitions: trans, press }, cls: Math.round(shift * 1000) / 1000, fcp: fcp && Math.round(fcp), longTasks: window.__long || 0 };
})()`;

const INIT = `window.__cls = 0; window.__long = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { window.__long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}`;

/** % of the first screen that is flat near-black with nothing on it: 10 px blocks with no detail and no light. */
async function emptyPct(png: string): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = 10; let empty = 0, total = 0;
  for (let by = 0; by + B <= info.height; by += B) for (let bx = 0; bx + B <= info.width; bx += B) {
    let lo = 255, hi = 0, sum = 0;
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
      const i = (y * info.width + x) * 3; const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      lo = Math.min(lo, l); hi = Math.max(hi, l); sum += l;
    }
    total++; if (hi - lo < 6 && sum / (B * B) < 22) empty++;
  }
  return Math.round(100 * empty / total);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
for (const label of LABELS) {
LABEL = label;
OUT = join(OUT_ROOT, label);
BUILD = join(OUT_ROOT, `.build-${label}`);
mkdirSync(OUT, { recursive: true });
console.log(`— ${label}`);
const report: Record<string, Record<string, unknown>> = {};
for (const s of scenesFor(label)) {
  report[s] = {};
  for (const vp of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: vp.name === 'phone', hasTouch: vp.name === 'phone' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.addInitScript(INIT);
    if (vp.name === 'phone') { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
    await page.goto(`${ORIGIN}/index.html#${s}`);
    await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 60000 });
    const err = await page.evaluate('document.body.dataset.a11yError || null');
    if (err) errors.push(String(err).slice(0, 400));
    await page.waitForTimeout(600);
    const fold = join(OUT, `${s}-${vp.name}.png`);
    await page.screenshot({ path: fold });
    await page.screenshot({ path: join(OUT, `${s}-${vp.name}-full.png`), fullPage: true });
    const m = await page.evaluate(MEASURE) as Record<string, unknown>;
    // the accessibility audit's static scan (scripts/a11y/inpage.ts is in the rig): names, contrast, targets, landmarks
    const scan = await page.evaluate('window.__a11y ? window.__a11y.staticScan() : null').catch(() => null) as { violations: { severity: string; rule: string }[] } | null;
    const a11y = scan ? { critical: scan.violations.filter((v) => v.severity === 'critical').length, serious: scan.violations.filter((v) => v.severity === 'serious').length, total: scan.violations.length, rules: [...new Set(scan.violations.map((v) => v.rule))] } : null;
    report[s][vp.name] = { ...m, a11y, empty: await emptyPct(fold), errors };
    await ctx.close();
    const mm = m as { serif: number; words: { fold: number }; sizesFold: string[]; sizesAll: string[]; buttons: { styles: number }; cards: { styles: number }; imagery: { n: number; pct: number }; motion: { animating: number }; fcp: number; cls: number };
    console.log(`${s.padEnd(13)} ${vp.name.padEnd(7)} words ${String(mm.words.fold).padStart(3)}  sizes ${mm.sizesFold.length}/${mm.sizesAll.length}  btn ${mm.buttons.styles}  card ${mm.cards.styles}  empty ${String((report[s][vp.name] as { empty: number }).empty).padStart(2)}%  img ${mm.imagery.n}/${mm.imagery.pct}%  anim ${mm.motion.animating}  fcp ${mm.fcp}  cls ${mm.cls}  serif ${mm.serif}  a11y ${a11y ? `${a11y.critical}c/${a11y.serious}s/${a11y.total}` : '-'}${errors.length ? `  ERR ${errors[0].slice(0, 90)}` : ''}`);
  }
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ label: LABEL, when: new Date().toISOString(), scenes: report }, null, 1));
console.log(`→ ${join(OUT, 'metrics.json')}`);
}
await browser.close();
server.close();
