// hoops-items / meter-webgpu — does the 3D shot meter draw under ?engine=webgpu, and is WebGL unchanged? (docs/PHONE-PERF-CHECK.md)
// Bundles ./meter-entry.mjs, serves it on PORT (default 3811) and opens it in Chromium: WebGL (the control: the GLSL meter), WebGPU with
// the WGSL twin (perf.meterWgslOn 1) and WebGPU with the knob off (0: the GLSL, as before). Per run: the engine, frames, whether the
// material became ready, any compile error, a fresh device's own compile of the WGSL the effect built, and a screenshot of the canvas.
// This box's WebGPU is SwiftShader's and loses its device within about a second (PHONE-PERF-CHECK "What the test machine found"), so
// a WebGPU run that crashes is the box; the compile check is what this box can say. A browser job: under gate-run.sh.
//   /home/user/wt/gate-run.sh 300 node scripts/probes/hoops-items/meter-webgpu.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const APP = path.resolve(HERE, '../../..');
const require = createRequire(path.join(APP, 'package.json'));
const out = path.resolve(process.argv[2] ?? '.'); fs.mkdirSync(out, { recursive: true });
await require('esbuild').build({ absWorkingDir: APP, entryPoints: [path.join(HERE, 'meter-entry.mjs')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error', outfile: path.join(out, 'meter.js') });
fs.writeFileSync(path.join(out, 'meter.html'), '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{width:480px;height:270px;display:block}</style><canvas id="c" width="480" height="270"></canvas><script src="meter.js"></script>');
const PORT = Number(process.env.PORT ?? 3811);
const srv = http.createServer((rq, rs) => { const f = path.join(out, decodeURIComponent(rq.url.split('?')[0])); if (!f.startsWith(out) || !fs.existsSync(f)) { rs.writeHead(404); rs.end(); return; } rs.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(rs); });
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const { chromium } = require('playwright-core');
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const res = [];
try {
  for (const [name, qs, args] of [['webgl', 'engine=webgl', []], ['webgpu-wgsl', 'engine=webgpu', ['--enable-unsafe-webgpu']], ['webgpu-knob-off', 'engine=webgpu&wgsl=0', ['--enable-unsafe-webgpu']]]) {
    const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', ...args] });
    const msgs = [];
    try {
      const p = await b.newPage({ viewport: { width: 480, height: 270 } });
      p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') msgs.push(m.text().slice(0, 200)); });
      p.on('pageerror', (e) => msgs.push('pageerror: ' + String(e).slice(0, 200)));
      await p.goto(`http://127.0.0.1:${PORT}/meter.html?${qs}&s=2`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const t0 = Date.now(); let r = { done: false };
      while (!r.done && Date.now() - t0 < 60_000) { await new Promise((s) => setTimeout(s, 500)); r = await p.evaluate(() => ({ ...window.__meter })).catch((e) => ({ done: true, error: 'page gone: ' + String(e).slice(0, 120) })); }
      const shot = path.join(out, `meter-${name}.jpg`);
      await p.screenshot({ path: shot, type: 'jpeg', quality: 85 }).catch(() => {});
      res.push({ name, ...r, wgsl: r.wgsl ? { vertexLen: r.wgsl.vertex.length, fragmentLen: r.wgsl.fragment.length } : null, console: [...new Set(msgs)].slice(0, 8), shot });
      if (r.wgsl) { fs.writeFileSync(path.join(out, `${name}.vertex.wgsl`), r.wgsl.vertex); fs.writeFileSync(path.join(out, `${name}.fragment.wgsl`), r.wgsl.fragment); }
    } catch (e) { res.push({ name, error: String(e).slice(0, 300), console: msgs.slice(0, 8) }); }
    await b.close();
  }
} finally { srv.close(); }
fs.writeFileSync(path.join(out, 'meter-webgpu.json'), JSON.stringify(res, null, 1));
for (const r of res) console.log(JSON.stringify(r));
