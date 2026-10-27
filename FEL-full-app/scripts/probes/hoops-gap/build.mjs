// hoops-audit rig build: node build.mjs <outDir> <tag> [--dev]
//   bundles ./entry.mjs (the real mode through runMode, no React / Next) from THIS app tree with esbuild into
//   <outDir>/<tag>.js + <outDir>/<tag>.html. --dev = NODE_ENV development (the hoops dev seams on, ./page.js needs them);
//   without it a minified production bundle (./perf.mjs). Never `next dev` / `next build` (round-7 lane rules).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const [outDir, tag] = process.argv.slice(2);
if (!outDir || !tag) { console.error('usage: node build.mjs <outDir> <tag> [--dev]'); process.exit(2); }
const dev = process.argv.includes('--dev');
const require = createRequire(path.join(APP, 'package.json'));
const esbuild = require('esbuild');
fs.mkdirSync(outDir, { recursive: true });
const env = dev ? '"development"' : '"production"';
await esbuild.build({
  absWorkingDir: APP, entryPoints: [path.join(HERE, process.env.ENTRY ?? 'entry.mjs')], bundle: true, minify: !dev, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': env },
  banner: { js: `window.process=window.process||{env:{NODE_ENV:${env}}};` },
  loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' },
  logLevel: 'error', outfile: path.join(outDir, `${tag}.js`),
});
fs.writeFileSync(path.join(outDir, `${tag}.html`), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{position:fixed;inset:0;width:100%;height:100%;touch-action:none;outline:none}</style></head><body><canvas id="c"></canvas><script src="/${tag}.js"></script></body></html>`);
console.log('built', tag, dev ? 'dev' : 'prod', (fs.statSync(path.join(outDir, `${tag}.js`)).size / 1e6).toFixed(1), 'MB');
