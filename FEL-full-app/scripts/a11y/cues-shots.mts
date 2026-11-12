// Colour-blind-safe cues on the rig (A11-03): the real HUD pieces (scripts/a11y/cues-entry.tsx) under each colour-vision
// setting, each shot twice — as drawn, and as a player with that deficiency sees it (the page put through the same
// Machado 2009 matrix lib/a11y/colorVision.ts tests with, as an SVG feColorMatrix in linear RGB). The proof is the pair:
// "off as a deuteranope sees it" next to "deuteranopia as a deuteranope sees it".
//
//   CHROMIUM_EXE=… npx tsx scripts/a11y/cues-shots.mts <outDir>
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../probes/_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.a11y-cues'));
const BUILD = join(OUT, '.build');
mkdirSync(BUILD, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'scripts/a11y/cues-entry.tsx')], bundle: true, outfile: join(BUILD, 'cues.js'), format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
});
const cssFile = join(BUILD, 'app.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', cssFile], { cwd: ROOT, stdio: 'ignore' });

const M: Record<string, number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
};
const filters = Object.entries(M).map(([k, m]) => `<filter id="sim-${k}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${m.slice(0, 3).join(' ')} 0 0 ${m.slice(3, 6).join(' ')} 0 0 ${m.slice(6, 9).join(' ')} 0 0 0 0 0 1 0"/></filter>`).join('');
const html = join(BUILD, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta charset="utf-8"><style>${readFileSync(cssFile, 'utf8')}</style></head><body style="margin:0;background:#050505"><svg width="0" height="0" style="position:absolute">${filters}</svg><div id="root"></div><script src="cues.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
const shots: string[] = [];
for (const setting of ['off', 'deuteranopia', 'protanopia', 'tritanopia']) {
  for (const seen of ['as-drawn', 'deuteranopia', 'protanopia', 'tritanopia']) {
    // the useful pairs: every setting as drawn, and each deficiency seeing the default and its own setting
    if (seen !== 'as-drawn' && setting !== 'off' && setting !== seen) continue;
    const page = await browser.newPage({ viewport: { width: 560, height: 420 }, deviceScaleFactor: 2 });
    await page.goto(`file://${html}#${setting}`);
    await page.waitForFunction('document.body.dataset.ready');
    await page.waitForTimeout(300);
    if (seen !== 'as-drawn') await page.evaluate(`document.getElementById('root').style.filter = 'url(#sim-${seen})'`);
    const f = join(OUT, `hud-${setting}--seen-${seen}.png`);
    await page.screenshot({ path: f });
    shots.push(f);
    await page.close();
  }
}
await browser.close();
console.log(shots.map((s) => s.split('/').pop()).join('\n'));
