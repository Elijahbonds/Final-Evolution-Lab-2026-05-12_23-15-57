// hoops-perf: the bare mode bundle exactly as scripts/probes/hoops-gap/build.mjs builds it (production, minified), plus a source map, so
// the heap profile can name its allocation sites (file, line, function).
//   node scripts/probes/hoops-perf/build-heap.mjs <outDir>      → <outDir>/mode.js + mode.html
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const outDir = process.argv[2];
if (!outDir) { console.error('usage: node build-heap.mjs <outDir>'); process.exit(2); }
const require = createRequire(path.join(APP, 'package.json'));
const esbuild = require('esbuild');
fs.mkdirSync(outDir, { recursive: true });
await esbuild.build({
  absWorkingDir: APP, entryPoints: [path.join(APP, 'scripts/probes/hoops-gap/entry.mjs')], bundle: true, minify: true, sourcemap: 'external', sourcesContent: false, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
  loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' },
  logLevel: 'error', outfile: path.join(outDir, 'mode.js'),
});
fs.writeFileSync(path.join(outDir, 'mode.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{position:fixed;inset:0;width:100%;height:100%;touch-action:none;outline:none}</style></head><body><canvas id="c"></canvas><script src="/mode.js"></script></body></html>');
console.log('built mode bundle + map', (fs.statSync(path.join(outDir, 'mode.js')).size / 1e6).toFixed(1), 'MB');
