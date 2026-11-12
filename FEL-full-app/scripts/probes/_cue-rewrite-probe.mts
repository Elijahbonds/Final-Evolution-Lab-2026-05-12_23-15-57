// The movement words on the rig (CUE-REWRITE, 2026-10-27): every scene of scripts/probes/_cue-rewrite-entry.tsx in
// headless Chromium at a phone width (390). No server: the entry is bundled with esbuild, the app's Tailwind CSS compiled
// with its own CLI. Run it in the lane's tree for the after shots, and in a checkout of the lane's base for the before.
//
//   CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_cue-rewrite-probe.mts <outDir>
//
// Checked per scene: no sideways scroll, no page error, the scene rendered; printed: every line of text it shows.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.cue-rewrite-shots'));
mkdirSync(OUT, { recursive: true });
const SCENES = ['screen-results', 'mirror-steps', 'hinge-review', 'squat-coach', 'hinge-framing'];
const js = join(OUT, 'cue.js');
await build({
  entryPoints: [join(ROOT, 'scripts/probes/_cue-rewrite-entry.tsx')], bundle: true, outfile: js, format: 'iife', platform: 'browser',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error',
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development" } };' },
  loader: { '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.wasm': 'empty', '.json': 'json' },
  external: ['@mediapipe/tasks-vision', 'node:fs', 'fs', 'node:path', 'path'],
});
const css = join(OUT, 'cue.css');
execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', join(ROOT, 'tailwind.config.ts'), '-i', join(ROOT, 'app/globals.css'), '-o', css], { cwd: ROOT, stdio: 'ignore' });
const html = join(OUT, 'index.html');
writeFileSync(html, `<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(css, 'utf8')}</style></head><body style="background:#050505;color:#fff"><div id="root"></div><script src="cue.js"></script></body></html>`);

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const report: Record<string, unknown> = {};
const fails: string[] = [];
try {
  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`file://${html}#${scene}`);
    await page.waitForSelector('main', { timeout: 20_000 }).catch(() => fails.push(`${scene}: nothing rendered`));
    await page.waitForTimeout(300);
    const sw = await page.evaluate('document.documentElement.scrollWidth') as number;
    if (sw > 390) fails.push(`${scene}: sideways scroll ${sw}`);
    if (errors.length) fails.push(`${scene}: ${errors.join(' | ')}`);
    const text = await page.evaluate(`[...document.querySelectorAll('main p, main li, main h2, main span[data-band-word]')].map((e) => e.textContent.trim()).filter(Boolean)`) as string[];
    report[scene] = { scrollWidth: sw, errors, text };
    await page.screenshot({ path: join(OUT, `${scene}-390.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ report, fails }, null, 1));
console.log(JSON.stringify({ fails }, null, 1));
process.exit(fails.length ? 1 : 0);
