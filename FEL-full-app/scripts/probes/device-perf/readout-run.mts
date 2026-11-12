// device-perf (2026-11-12): the owner's perf readout on the rig, and the WebGPU trial against WebGL, per hoops mode.
//
//   PAGE=http://127.0.0.1:3761/mode.html MODES=onevone,threevthree ENGINES=webgl,webgpu SECONDS=20 OUT=<dir> \
//     npx tsx scripts/probes/device-perf/readout-run.mts
//   (scripts/probes/device-perf/run.sh wraps the static server and the shared gate.)
//
// The bare mode bundle (./entry.mjs: the real mode through runMode, no React) as a phone-sized page (390×844, isMobile, touch),
// ?owner=1 (the server's yes stood in), ?engine=<e>, ?readout=1 (the overlay opened as the owner's tap opens it). READY, START,
// SECONDS of live play on the REAL clock (no virtual time: this compares two engines' CPU cost per frame on the same box), then:
//   <OUT>/<mode>-<engine>.json   the readout's own sample (frame p50 / p95, JS work per frame p50 / p95, draws, meshes, textures,
//                                heap, READY), the engine that actually ran and why, and every console warning / error / page error
//   <OUT>/<mode>-<engine>.jpg    the page with the overlay, as the owner sees it
// SwiftShader rasterises on this box's CPU, so the frame RATE here is not a phone's; the JS work per frame (the CPU side of the draw
// calls, which is where WebGPU is meant to win) and the draw counts are what compare.
// CHROME_ARGS: the WebGPU launch flags (./webgpu-avail.mts finds a set that gives an adapter on this box).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';

const PAGE = process.env.PAGE ?? 'http://127.0.0.1:3761/mode.html';
const MODES = (process.env.MODES ?? 'onevone,threevthree').split(',').filter(Boolean);
const ENGINES = (process.env.ENGINES ?? 'webgl,webgpu').split(',').filter(Boolean);
const SECONDS = Number(process.env.SECONDS ?? 20);
const OUT = process.env.OUT ?? '/tmp/device-perf';
const DPR = Number(process.env.DPR ?? 2);
const ARGS = (process.env.CHROME_ARGS ?? '--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader').split(' ').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

// the harness's 20 s load watchdog is a phone-on-a-network guard; software GL on a shared box can take longer to build a venue
const INIT = `(() => { const st = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a); })()`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const summary: Record<string, unknown>[] = [];

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS });
try {
  for (const mode of MODES) {
    for (const eng of ENGINES) {
      const tag = `${mode}-${eng}`;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
      await ctx.addInitScript(INIT);
      const p = await ctx.newPage();
      const msgs: string[] = [];
      p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error' || /WEBGPU|WebGPU|\[FEL\]/.test(m.text())) msgs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
      p.on('pageerror', (e) => msgs.push(`pageerror: ${String(e).slice(0, 300)}`));
      // the anonymous perf stats (perfStats.ts → reportDiag → lib/analytics.ts → POST /api/analytics): what leaves the page
      const diag: unknown[] = [];
      p.on('request', (r) => {
        if (!r.url().includes('/api/analytics')) return;
        try { for (const e of (JSON.parse(r.postData() ?? '{}').events ?? [])) if (e?.name === 'game_diag') diag.push(e); } catch { diag.push({ raw: (r.postData() ?? '').slice(0, 300) }); }
      });
      const t0 = Date.now();
      let phase = '';
      let sample: unknown = null, choice: unknown = null, err: unknown = null, overlay = '';
      try {
        await p.goto(`${PAGE}?mode=${mode}&owner=1&engine=${eng}&readout=1`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
        for (;;) {
          phase = await p.evaluate(() => (window as any).__phase ?? '');
          err = await p.evaluate(() => (window as any).__err ?? null);
          if (phase === 'ready' || phase === 'error' || err || Date.now() - t0 > 360_000) break;
          await sleep(1000);
        }
        const readyS = (Date.now() - t0) / 1000;
        if (phase === 'ready') {
          await p.evaluate(() => { const b = (window as any).__bus; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); });
          const tp = Date.now();
          while ((await p.evaluate(() => (window as any).__phase)) !== 'playing' && Date.now() - tp < 90_000) await sleep(500);
          // our own sampler beside the overlay's: the same code the overlay paints from, attached at the start of play
          await p.evaluate(() => { const R = (window as any).__readout; (window as any).__s = R.attachSampler(R.readoutSource()); });
          await sleep(SECONDS * 1000);
        }
        phase = await p.evaluate(() => (window as any).__phase ?? '');
        choice = await p.evaluate(() => { const R = (window as any).__readout; const s = R.readoutSource(); return s ? (window as any).__engineChoice(s.engine) : null; });
        sample = await p.evaluate(() => (window as any).__s?.sample() ?? null);
        overlay = await p.evaluate(() => (document.querySelector('[data-fel-perf-readout]') as HTMLElement | null)?.innerText ?? '');
        await p.screenshot({ path: path.join(OUT, `${tag}.jpg`), type: 'jpeg', quality: 72 });
        // flush the analytics queue the way a phone does when the tab goes away (pagehide → sendBeacon)
        await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        await sleep(1500);
        const row = { tag, mode, asked: eng, phase, err, readyWallS: readyS, choice, sample, overlay, diag, console: [...new Set(msgs)].slice(0, 60) };
        fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(row, null, 2));
        summary.push(row);
        const s = sample as any;
        console.log(`${tag.padEnd(22)} phase=${phase} engine=${(choice as any)?.backend ?? '-'} frames=${s?.frames ?? '-'} frame50=${s?.frameP50?.toFixed?.(1) ?? '-'} frame95=${s?.frameP95?.toFixed?.(1) ?? '-'} cpu50=${s?.cpuP50?.toFixed?.(1) ?? '-'} cpu95=${s?.cpuP95?.toFixed?.(1) ?? '-'} draws=${s?.draws ?? '-'}/${s?.drawsMax ?? '-'} meshes=${s?.activeMeshes ?? '-'} texMB=${s?.textureMB?.toFixed?.(0) ?? '-'} msgs=${msgs.length} diag=${diag.map((d: any) => d?.props?.kind ?? '?').join(',')}`);
      } catch (e) {
        console.log(`${tag}: ${String(e).slice(0, 300)}`);
        summary.push({ tag, error: String(e).slice(0, 300), console: [...new Set(msgs)].slice(0, 60) });
      } finally {
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
}
