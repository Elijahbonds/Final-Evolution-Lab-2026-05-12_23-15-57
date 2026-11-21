// hoops-items / dpad — the touch deck's d-pad arrows as DRAWN on a phone, before (touch.dpadTapOn 0) and after (1): the real TouchOverlay
// (esbuild, the app's Tailwind compiled for it) on the stage GameShell gives a 390 × 844 phone upright and an 844 × 390 one sideways,
// Chromium with touch. Per mode, layout and state: each arrow's drawn rect (after the deck's fit and compact scales), the smallest,
// overlaps with every other deck control, whether every control is inside the stage, the MOVE control's drawn size (the d-pad must not
// shrink the stick), and a tap in the middle of each arrow (what the bus got). A browser job: run it under gate-run.sh.
//   /home/user/wt/gate-run.sh 300 node scripts/probes/hoops-items/dpad.mjs <outDir>     → <outDir>/dpad.json, dpad.jpg
// Control: the before state must reproduce move-feel-2's measurement (24 px arrows drawn 23.3 upright, 20.4 sideways on 1v1).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const APP = path.resolve(HERE, '../../..');
const require = createRequire(path.join(APP, 'package.json'));
const out = path.resolve(process.argv[2] ?? '.'); fs.mkdirSync(out, { recursive: true });
const esbuild = require('esbuild');
await esbuild.build({ absWorkingDir: APP, entryPoints: [path.join(HERE, 'dpad-entry.tsx')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', jsx: 'automatic',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(out, 'dp.js') });
const css = path.join(out, 'dp.css');
fs.writeFileSync(path.join(out, 'in.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
execFileSync(path.join(APP, 'node_modules/.bin/tailwindcss'), ['-c', path.join(APP, 'tailwind.config.ts'), '-i', path.join(out, 'in.css'), '-o', css, '--content', path.join(APP, 'lib/babylon/ui/**/*.tsx')], { cwd: APP, stdio: 'pipe' });
fs.writeFileSync(path.join(out, 'dp.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="dp.css">
<style>html,body{margin:0;height:100%;background:#0b0c10;overflow:hidden}#hdr{position:absolute;left:0;right:0;top:0;height:56px;background:#050505;color:#999;font:14px sans-serif;padding:18px}
#stage{position:absolute;overflow:hidden;background:linear-gradient(#2a3b55,#3b2a1a)}#deck{position:absolute;inset:0}</style>
<div id="hdr">FEL · the shell's header</div><div id="stage"><div id="deck"></div></div><script src="dp.js"></script>`);
const { chromium } = require('playwright-core');
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const MODES = (process.env.MODES ?? 'onevone,threevthree,sprint,karate').split(',');
const res = [];
for (const mode of MODES) for (const [w, h] of [[390, 844], [844, 390]]) for (const dpad of [0, 1]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`file://${path.join(out, 'dp.html')}?mode=${mode}&dpad=${dpad}`); await p.waitForFunction(() => window.__ready); await p.waitForTimeout(400);
  const info = await p.evaluate(() => {
    const r = (el) => { const q = el.getBoundingClientRect(); return { x: +q.left.toFixed(1), y: +q.top.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1) }; };
    const glyph = { '▲': 'up', '▼': 'down', '◀': 'left', '▶': 'right' };
    const all = [...document.querySelectorAll('[data-touch-deck] button, [data-touch-deck] [data-float-stick], [data-touch-deck] div.h-24.w-24.rounded-full')];
    const arrows = all.filter((e) => e.tagName === 'BUTTON' && glyph[(e.textContent || '').trim()]).map((e) => ({ dir: glyph[e.textContent.trim()], ...r(e) }));
    const others = all.filter((e) => !(e.tagName === 'BUTTON' && glyph[(e.textContent || '').trim()])).map((e) => ({ label: (e.textContent || e.getAttribute('aria-label') || (e.hasAttribute('data-float-stick') ? 'MOVE(float)' : '')).trim().slice(0, 14), ...r(e) }));
    const move = others.find((o) => /MOVE/.test(o.label)) || null;
    const st = document.getElementById('stage').getBoundingClientRect();
    return { arrows, others, move, stage: { x: st.left, y: st.top, w: st.width, h: st.height } };
  });
  const ov = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
  const inside = (a, s) => a.x >= s.x - 0.5 && a.y >= s.y - 0.5 && a.x + a.w <= s.x + s.w + 0.5 && a.y + a.h <= s.y + s.h + 0.5;
  info.smallestArrowPx = Math.min(...info.arrows.map((a) => Math.min(a.w, a.h)));
  info.arrowOverlapPx2 = +info.arrows.reduce((s, a) => s + info.others.reduce((t, o) => t + ov(a, o), 0), 0).toFixed(1);
  info.arrowsOverlapEachOther = info.arrows.some((a, i) => info.arrows.some((c, j) => j > i && ov(a, c) > 0.5));
  info.allInStage = [...info.arrows, ...info.others].every((a) => inside(a, info.stage));
  info.smallestOtherPx = Math.min(...info.others.map((o) => Math.min(o.w, o.h)));
  // a tap in the middle of each arrow: the bus must get that direction, down then up
  const taps = {};
  for (const a of info.arrows) {
    await p.evaluate(() => { window.__sent.length = 0; });
    await p.touchscreen.tap(a.x + a.w / 2, a.y + a.h / 2); await p.waitForTimeout(60);
    taps[a.dir] = await p.evaluate(() => window.__sent.map((e) => `${e.dir}:${e.pressed ? 'down' : 'up'}`).join(','));
  }
  info.taps = taps; info.tapsOk = info.arrows.every((a) => taps[a.dir] === `${a.dir}:down,${a.dir}:up`);
  const shot = path.join(out, `deck-${mode}-${w}x${h}-dpad${dpad}.jpg`); await p.screenshot({ path: shot, type: 'jpeg', quality: 80 });
  res.push({ mode, view: `${w}x${h}`, dpad, ...info, shot });
  await ctx.close();
}
fs.writeFileSync(path.join(out, 'dpad.json'), JSON.stringify(res, null, 1));
// the sheet: 1v1, before / after, upright and sideways
const img = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`;
const sheetRows = res.filter((r) => r.mode === (MODES.includes('onevone') ? 'onevone' : MODES[0]));
const cell = (r) => `<figure><img src="${img(r.shot)}" style="${r.view === '390x844' ? 'width:260px' : 'width:560px'}"><figcaption>${r.view === '390x844' ? 'upright' : 'sideways'} · ${r.dpad ? '<b>AFTER</b>' : 'BEFORE'}: smallest arrow ${r.smallestArrowPx} px as drawn; the move stick ${r.move ? `${r.move.w}×${r.move.h}` : '-'} px</figcaption></figure>`;
const page = await (await b.newContext({ viewport: { width: 1700, height: 900 } })).newPage();
await page.setContent(`<style>body{margin:0;padding:14px;background:#f4f4f6;font:15px sans-serif}figure{margin:6px;display:inline-block;vertical-align:top;max-width:580px}figcaption{margin-top:6px}</style><h2 style="margin:0 0 8px">The d-pad arrows on a phone, before and after (touch.dpadTapOn; the tap rule is 44 px)</h2>${sheetRows.map(cell).join('')}`);
await page.screenshot({ path: path.join(out, 'dpad.jpg'), type: 'jpeg', quality: 82, fullPage: true });
await b.close();
for (const r of res) console.log(`${r.mode.padEnd(11)} ${r.view.padEnd(8)} dpad ${r.dpad}: arrows ${r.arrows.map((a) => `${a.dir} ${a.w}×${a.h}`).join(', ')} | smallest ${r.smallestArrowPx} | overlap ${r.arrowOverlapPx2} px² | in stage ${r.allInStage} | move ${r.move ? `${r.move.w}×${r.move.h}` : '-'} | smallest other ${r.smallestOtherPx} | taps ${r.tapsOk ? 'ok' : JSON.stringify(r.taps)}`);
