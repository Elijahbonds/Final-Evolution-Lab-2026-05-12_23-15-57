// move-feel / phone-stick — the hoops MOVE stick on a phone, before (touch.floatStick 0) and after (1), measured and photographed
// (lane/move-feel-2). The real TouchOverlay (bundled with esbuild, the app's Tailwind compiled for it) on a stage the shape GameShell gives
// a 390 × 844 phone held upright (16:10 under the header) and an 844 × 390 one sideways; Chromium with touch. Per layout and state: the
// MOVE control's rect, the other deck controls' rects (overlap, inside the stage and the viewport, the smallest tap target), the thumb travel
// to full speed (px, and mm at 6.1 px a mm — assumption: a phone's 390 css px over 64 mm), and a scripted thumb: it lands 20 px off the
// stick's centre (what the stick sends on landing), then pushes 30 px and 72 px (what it sends). A browser job: run it under gate-run.sh.
//   node scripts/probes/move-feel/phone-stick.mjs <outDir>          → <outDir>/phone-stick.json, phone-stick.jpg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const APP = path.resolve(HERE, '../../..');
const require = createRequire(path.join(APP, 'package.json'));
const out = path.resolve(process.argv[2] ?? '.'); fs.mkdirSync(out, { recursive: true });
const esbuild = require('esbuild');
await esbuild.build({ absWorkingDir: APP, entryPoints: [path.join(HERE, 'phone-stick-entry.tsx')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', jsx: 'automatic',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(out, 'ps.js') });
const css = path.join(out, 'ps.css');
fs.writeFileSync(path.join(out, 'in.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
execFileSync(path.join(APP, 'node_modules/.bin/tailwindcss'), ['-c', path.join(APP, 'tailwind.config.ts'), '-i', path.join(out, 'in.css'), '-o', css, '--content', path.join(APP, 'lib/babylon/ui/**/*.tsx')], { cwd: APP, stdio: 'pipe' });
const frame = (() => { const d = path.join(out, '..', 'out', 'shots', 'strip-onevone-mf-jog'); try { return 'data:image/jpeg;base64,' + fs.readFileSync(path.join(d, '00.jpg')).toString('base64'); } catch { return ''; } })();
fs.writeFileSync(path.join(out, 'ps.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="ps.css">
<style>html,body{margin:0;height:100%;background:#0b0c10;overflow:hidden}#hdr{position:absolute;left:0;right:0;top:0;height:56px;background:#050505;color:#999;font:14px sans-serif;padding:18px}
#stage{position:absolute;overflow:hidden;background:#123 url(${frame}) center/cover}#deck{position:absolute;inset:0}</style>
<div id="hdr">FEL · 1v1 (the shell's header)</div><div id="stage"><div id="deck"></div></div><script src="ps.js"></script>`);
const { chromium } = require('playwright-core');
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const PX_PER_MM = 390 / 64;
const res = [];
for (const [w, h] of [[390, 844], [844, 390]]) for (const float of [0, 1]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`file://${path.join(out, 'ps.html')}?mode=onevone&float=${float}`); await p.waitForFunction(() => window.__ready); await p.waitForTimeout(300);
  const info = await p.evaluate(() => {
    const r = (el) => { const q = el.getBoundingClientRect(); return { x: +q.left.toFixed(1), y: +q.top.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1) }; };
    const move = document.querySelector('[data-float-stick]') || [...document.querySelectorAll('div')].find((d) => d.textContent === 'MOVE' && d.className.includes('h-24'));
    const stage = document.getElementById('stage').getBoundingClientRect();
    const others = [...document.querySelectorAll('[data-touch-deck] button, [data-touch-deck] [role="button"]')].filter((e) => !move.contains(e)).map((e) => ({ label: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 12), ...r(e) }));
    return { move: r(move), stage: { x: stage.left, y: stage.top, w: stage.width, h: stage.height }, others };
  });
  const m = info.move, ov = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
  info.overlapPx2 = info.others.reduce((s, o) => s + ov(m, o), 0);
  info.inStage = m.x >= info.stage.x - 0.5 && m.y >= info.stage.y - 0.5 && m.x + m.w <= info.stage.x + info.stage.w + 0.5 && m.y + m.h <= info.stage.y + info.stage.h + 0.5;
  info.smallestTapPx = Math.min(...info.others.map((o) => Math.min(o.w, o.h)), Math.min(m.w, m.h));
  // the scripted thumb: lands 20 px right of the control's centre (fixed) / anywhere in the zone (float), then 30 px and the full radius out
  const scale = float ? m.w / 184 : m.w / 96; const radius = (float ? 72 : 48) * scale;
  const cx = m.x + m.w / 2, cy = m.y + m.h * (float ? 0.55 : 0.5);
  const sent = async () => p.evaluate(() => { const s = window.__sent; const l = s[s.length - 1]; return l ? [+l.x.toFixed(2), +l.y.toFixed(2)] : null; });
  const target = float ? '[data-float-stick]' : 'div.h-24';
  const touch = async (type, x, y) => p.dispatchEvent(target, type, { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true });
  await touch('pointerdown', cx + 20, cy); const land = await sent();
  await touch('pointermove', cx + 20 + 30 * scale, cy); const push30 = await sent();
  await touch('pointermove', cx + 20 + radius, cy); const full = await sent();
  await p.waitForTimeout(100);
  const shot = path.join(out, `deck-${w}x${h}-float${float}.jpg`); await p.screenshot({ path: shot, type: 'jpeg', quality: 80 });
  await touch('pointerup', cx + 20 + radius, cy);
  res.push({ view: `${w}x${h}`, float, ...info, fullSpeedPx: +radius.toFixed(1), fullSpeedMm: +(radius / PX_PER_MM).toFixed(1), thumb: { landing20pxOff: land, push30px: push30, pushFullRadius: full }, shot });
  await ctx.close();
}
fs.writeFileSync(path.join(out, 'phone-stick.json'), JSON.stringify(res, null, 1));
// the sheet: before / after, portrait and sideways
const img = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`;
const cell = (r) => `<figure><img src="${img(r.shot)}" style="${r.view === '390x844' ? 'width:300px' : 'width:560px'}"><figcaption>${r.view === '390x844' ? 'phone upright' : 'phone sideways'} · ${r.float ? '<b>AFTER</b>: floating stick' : 'BEFORE: fixed stick'}<br>full speed ${r.fullSpeedPx} px (${r.fullSpeedMm} mm) from the centre · thumb lands 20 px off-centre → stick ${JSON.stringify(r.thumb.landing20pxOff)} · overlap with other controls ${r.overlapPx2} px²</figcaption></figure>`;
const page = await (await b.newContext({ viewport: { width: 1760, height: 900 } })).newPage();
await page.setContent(`<style>body{margin:0;padding:14px;background:#f4f4f6;font:15px sans-serif}figure{margin:6px;display:inline-block;vertical-align:top;max-width:580px}figcaption{margin-top:6px}</style><h2 style="margin:0 0 8px">The phone MOVE stick, before and after (1v1, the real touch deck; the thumb pressed at the full radius)</h2>${res.filter((r) => r.view === '390x844').map(cell).join('')}${res.filter((r) => r.view !== '390x844').map(cell).join('')}`);
await page.screenshot({ path: path.join(out, 'phone-stick.jpg'), type: 'jpeg', quality: 82, fullPage: true });
await b.close();
console.log(JSON.stringify(res.map(({ others, shot, ...r }) => r), null, 1));
